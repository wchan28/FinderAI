from __future__ import annotations

import hashlib
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
        self.conn.commit()

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
