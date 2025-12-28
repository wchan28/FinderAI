from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Optional, Dict, List


class MetadataStore:
    """SQLite store for tracking indexed files and their hashes."""

    def __init__(self, db_path: str = "./data/metadata.db"):
        db_file = Path(db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)

        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self) -> None:
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS indexed_files (
                file_path TEXT PRIMARY KEY,
                file_hash TEXT NOT NULL,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                chunk_count INTEGER DEFAULT 0
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS indexing_results (
                id INTEGER PRIMARY KEY,
                total_files INTEGER,
                indexed_files INTEGER,
                skipped_unchanged INTEGER,
                skipped_limits INTEGER,
                total_chunks INTEGER,
                total_time REAL,
                total_embed_time REAL,
                errors TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS skipped_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT,
                file_name TEXT,
                reason TEXT,
                chunks_would_be INTEGER,
                category TEXT
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS indexing_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_path TEXT NOT NULL,
                max_chunks INTEGER DEFAULT 50,
                force_reindex INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                files_total INTEGER DEFAULT 0,
                files_processed INTEGER DEFAULT 0,
                started_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS indexing_job_files (
                job_id INTEGER,
                file_path TEXT,
                status TEXT DEFAULT 'pending',
                PRIMARY KEY (job_id, file_path),
                FOREIGN KEY (job_id) REFERENCES indexing_jobs(id) ON DELETE CASCADE
            )
        """)
        self._migrate_skipped_files_table(cursor)
        self.conn.commit()

    def _migrate_skipped_files_table(self, cursor) -> None:
        """Add file_path column to skipped_files if it doesn't exist."""
        cursor.execute("PRAGMA table_info(skipped_files)")
        columns = [row[1] for row in cursor.fetchall()]
        if "file_path" not in columns:
            cursor.execute("ALTER TABLE skipped_files ADD COLUMN file_path TEXT")

    def get_file_hash(self, file_path: str) -> Optional[str]:
        """Get the stored hash for a file path."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT file_hash FROM indexed_files WHERE file_path = ?",
            (file_path,)
        )
        row = cursor.fetchone()
        return row["file_hash"] if row else None

    def set_file_hash(self, file_path: str, file_hash: str, chunk_count: int = 0) -> None:
        """Store or update the hash for a file path."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO indexed_files (file_path, file_hash, chunk_count, indexed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(file_path) DO UPDATE SET
                file_hash = excluded.file_hash,
                chunk_count = excluded.chunk_count,
                indexed_at = CURRENT_TIMESTAMP
        """, (file_path, file_hash, chunk_count))
        self.conn.commit()

    def remove_file(self, file_path: str) -> None:
        """Remove a file from the metadata store."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexed_files WHERE file_path = ?", (file_path,))
        self.conn.commit()

    def get_all_files(self) -> List[Dict]:
        """Get all indexed files with their metadata."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM indexed_files")
        return [dict(row) for row in cursor.fetchall()]

    def clear(self) -> None:
        """Clear all indexed files from the metadata store."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexed_files")
        self.conn.commit()

    def save_indexing_results(self, stats: Dict) -> None:
        """Save indexing results, replacing any previous results."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexing_results")
        cursor.execute("DELETE FROM skipped_files")

        cursor.execute("""
            INSERT INTO indexing_results (
                id, total_files, indexed_files, skipped_unchanged, skipped_limits,
                total_chunks, total_time, total_embed_time, errors
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            stats.get("total_files", 0),
            stats.get("indexed_files", 0),
            stats.get("skipped_unchanged", 0),
            stats.get("skipped_limits", 0),
            stats.get("total_chunks", 0),
            stats.get("total_time", 0.0),
            stats.get("total_embed_time", 0.0),
            json.dumps(stats.get("errors", [])),
        ))

        skipped_by_reason = stats.get("skipped_by_reason", {})
        for category, files in skipped_by_reason.items():
            for f in files:
                cursor.execute("""
                    INSERT INTO skipped_files (file_path, file_name, reason, chunks_would_be, category)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    f.get("file_path"),
                    f.get("file_name"),
                    f.get("reason"),
                    f.get("chunks_would_be"),
                    category,
                ))

        self.conn.commit()

    def get_indexing_results(self) -> Optional[Dict]:
        """Get the most recent indexing results."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM indexing_results WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return None

        cursor.execute("SELECT * FROM skipped_files")
        skipped_rows = cursor.fetchall()

        skipped_by_reason: Dict[str, List[Dict]] = {
            "scanned_image": [],
            "empty_file": [],
            "file_too_large": [],
            "unsupported_type": [],
            "chunk_limit_exceeded": [],
        }
        skipped_files: List[Dict] = []

        for sf in skipped_rows:
            entry: Dict = {
                "file_name": sf["file_name"],
                "reason": sf["reason"],
            }
            if sf["file_path"] is not None:
                entry["file_path"] = sf["file_path"]
            if sf["chunks_would_be"] is not None:
                entry["chunks_would_be"] = sf["chunks_would_be"]

            category = sf["category"]
            if category in skipped_by_reason:
                skipped_by_reason[category].append(entry)

            if category == "chunk_limit_exceeded":
                skipped_files.append(entry)

        return {
            "total_files": row["total_files"],
            "indexed_files": row["indexed_files"],
            "skipped_unchanged": row["skipped_unchanged"],
            "skipped_limits": row["skipped_limits"],
            "total_chunks": row["total_chunks"],
            "total_time": row["total_time"],
            "errors": json.loads(row["errors"]) if row["errors"] else [],
            "skipped_files": skipped_files,
            "skipped_by_reason": skipped_by_reason,
        }

    def clear_indexing_results(self) -> None:
        """Clear saved indexing results."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexing_results")
        cursor.execute("DELETE FROM skipped_files")
        self.conn.commit()

    def get_skipped_file_paths(self, category: str = "chunk_limit_exceeded") -> List[str]:
        """Get file paths for skipped files in a category."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT file_path FROM skipped_files WHERE category = ? AND file_path IS NOT NULL",
            (category,)
        )
        return [row["file_path"] for row in cursor.fetchall()]

    def get_active_indexing_job(self) -> Optional[Dict]:
        """Get current active or paused indexing job."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM indexing_jobs
            WHERE status IN ('pending', 'running', 'paused')
            ORDER BY id DESC LIMIT 1
        """)
        row = cursor.fetchone()
        return dict(row) if row else None

    def create_indexing_job(
        self, folder_path: str, max_chunks: int, force_reindex: bool, files_total: int
    ) -> int:
        """Create a new indexing job, returns job_id."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexing_jobs WHERE status IN ('pending', 'running', 'paused')")
        cursor.execute("DELETE FROM indexing_job_files WHERE job_id NOT IN (SELECT id FROM indexing_jobs)")
        cursor.execute("""
            INSERT INTO indexing_jobs (folder_path, max_chunks, force_reindex, status, files_total, started_at)
            VALUES (?, ?, ?, 'running', ?, CURRENT_TIMESTAMP)
        """, (folder_path, max_chunks, 1 if force_reindex else 0, files_total))
        self.conn.commit()
        return cursor.lastrowid

    def add_job_files(self, job_id: int, file_paths: List[str]) -> None:
        """Add files to an indexing job."""
        cursor = self.conn.cursor()
        cursor.executemany(
            "INSERT OR IGNORE INTO indexing_job_files (job_id, file_path, status) VALUES (?, ?, 'pending')",
            [(job_id, fp) for fp in file_paths]
        )
        self.conn.commit()

    def update_job_file_status(self, job_id: int, file_path: str, status: str) -> None:
        """Update status of a file in an indexing job."""
        cursor = self.conn.cursor()
        cursor.execute(
            "UPDATE indexing_job_files SET status = ? WHERE job_id = ? AND file_path = ?",
            (status, job_id, file_path)
        )
        self.conn.commit()

    def update_indexing_job_progress(self, job_id: int, files_processed: int) -> None:
        """Update progress for an indexing job."""
        cursor = self.conn.cursor()
        cursor.execute("""
            UPDATE indexing_jobs
            SET files_processed = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (files_processed, job_id))
        self.conn.commit()

    def update_job_status(self, job_id: int, status: str) -> None:
        """Update status of an indexing job."""
        cursor = self.conn.cursor()
        if status in ('completed', 'cancelled'):
            cursor.execute("""
                UPDATE indexing_jobs
                SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, job_id))
        else:
            cursor.execute("""
                UPDATE indexing_jobs
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (status, job_id))
        self.conn.commit()

    def get_pending_files_for_job(self, job_id: int) -> List[str]:
        """Get files that haven't been processed yet for this job."""
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT file_path FROM indexing_job_files WHERE job_id = ? AND status = 'pending'",
            (job_id,)
        )
        return [row["file_path"] for row in cursor.fetchall()]

    def complete_indexing_job(self, job_id: int, status: str = "completed") -> None:
        """Mark job as completed or cancelled."""
        self.update_job_status(job_id, status)

    def discard_indexing_job(self, job_id: int) -> None:
        """Discard an indexing job and its files."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM indexing_job_files WHERE job_id = ?", (job_id,))
        cursor.execute("DELETE FROM indexing_jobs WHERE id = ?", (job_id,))
        self.conn.commit()

    def close(self) -> None:
        """Close the database connection."""
        self.conn.close()


def compute_file_hash(file_path: str) -> str:
    """Compute MD5 hash of a file's contents."""
    hasher = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
