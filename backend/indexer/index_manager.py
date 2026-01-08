from __future__ import annotations

import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
from pathlib import Path
from typing import List, Callable, Optional

from backend.extractors.pptx_extractor import extract_text_from_pptx
from backend.extractors.pdf_extractor import extract_text_from_pdf
from backend.extractors.docx_extractor import extract_text_from_docx
from backend.extractors.xlsx_extractor import extract_text_from_xlsx
from backend.indexer.chunker import chunk_document, get_chunk_params
from backend.indexer.embedder import generate_embeddings, get_embedding_dimension
from backend.db.vector_store import VectorStore
from backend.db.metadata_store import MetadataStore, compute_file_hash
from backend.search.bm25_index import get_bm25_index


SUPPORTED_EXTENSIONS = {".pptx", ".pdf", ".docx", ".xlsx"}

MAX_CHUNKS_PER_FILE = 50
MAX_FILE_SIZE_MB = 50
PARALLEL_WORKERS = 3

EXTRACTORS = {
    ".pptx": extract_text_from_pptx,
    ".pdf": extract_text_from_pdf,
    ".docx": extract_text_from_docx,
    ".xlsx": extract_text_from_xlsx,
}


def _categorize_skip_reason(skip_reason: str) -> str:
    """Map a skip reason string to a category key."""
    if skip_reason == "scanned image":
        return "scanned_image"
    if skip_reason == "empty file" or skip_reason == "no chunks generated" or skip_reason == "no extractable content":
        return "empty_file"
    if skip_reason.startswith("file too large"):
        return "file_too_large"
    if skip_reason.startswith("unsupported type"):
        return "unsupported_type"
    if skip_reason.startswith("too many chunks"):
        return "chunk_limit_exceeded"
    return "empty_file"


def scan_folder(folder_path: str, extensions: set = SUPPORTED_EXTENSIONS) -> List[str]:
    """Recursively scan a folder for supported files."""
    folder = Path(folder_path)
    files = []

    for ext in extensions:
        for f in folder.rglob(f"*{ext}"):
            if not f.name.startswith("~$"):
                files.append(f)

    return [str(f) for f in files]


def index_file(
    file_path: str,
    vector_store: VectorStore,
    metadata_store: MetadataStore,
    progress_callback: Optional[Callable[[str], None]] = None,
    max_chunks_per_file: int = MAX_CHUNKS_PER_FILE
) -> dict:
    """
    Index a single file.

    Returns dict with indexing stats including timing.
    """
    result = {
        "chunks": 0,
        "skipped": False,
        "skip_reason": None,
        "extract_time": 0.0,
        "embed_time": 0.0,
        "store_time": 0.0,
        "total_time": 0.0,
    }

    start_total = time.time()
    file_ext = Path(file_path).suffix.lower()
    file_size_mb = Path(file_path).stat().st_size / (1024 * 1024)

    if file_ext not in EXTRACTORS:
        if progress_callback:
            progress_callback(f"  Unsupported file type: {file_ext}")
        result["skipped"] = True
        result["skip_reason"] = f"unsupported type: {file_ext}"
        return result

    if file_size_mb > MAX_FILE_SIZE_MB:
        if progress_callback:
            progress_callback(f"  SKIPPED: File too large ({file_size_mb:.1f}MB > {MAX_FILE_SIZE_MB}MB limit)")
        result["skipped"] = True
        result["skip_reason"] = f"file too large: {file_size_mb:.1f}MB"
        return result

    if progress_callback:
        progress_callback(f"Extracting text from {Path(file_path).name} ({file_size_mb:.2f}MB)...")

    start_extract = time.time()
    extractor = EXTRACTORS[file_ext]
    content = extractor(file_path)
    result["extract_time"] = time.time() - start_extract

    if not content:
        if progress_callback:
            progress_callback(f"  No text found in {Path(file_path).name}")
        result["total_time"] = time.time() - start_total
        return result

    unit_names = {".pdf": "pages", ".pptx": "slides", ".docx": "sections", ".xlsx": "sheets"}
    unit_name = unit_names.get(file_ext, "sections")
    if progress_callback:
        progress_callback(f"  Found {len(content)} {unit_name} with text (extract: {result['extract_time']:.1f}s)")

    chunk_size, chunk_overlap = get_chunk_params(file_path)
    chunks = chunk_document(content, file_path, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    if not chunks:
        result["total_time"] = time.time() - start_total
        return result

    if len(chunks) > max_chunks_per_file:
        if progress_callback:
            progress_callback(f"  SKIPPED: Too many chunks ({len(chunks)} > {max_chunks_per_file} limit)")
        result["skipped"] = True
        result["skip_reason"] = f"too many chunks: {len(chunks)} > {max_chunks_per_file}"
        result["total_time"] = time.time() - start_total
        return result

    if progress_callback:
        progress_callback(f"  Generating embeddings for {len(chunks)} chunks...")

    start_embed = time.time()
    texts = [c["text"] for c in chunks]
    embeddings = generate_embeddings(texts)
    result["embed_time"] = time.time() - start_embed

    if progress_callback:
        progress_callback(f"  Embeddings done ({result['embed_time']:.1f}s, {len(chunks)/result['embed_time']:.1f} chunks/sec)")

    if progress_callback:
        progress_callback(f"  Storing in vector database...")

    start_store = time.time()
    vector_store.add_chunks(chunks, embeddings)
    result["store_time"] = time.time() - start_store

    file_hash = compute_file_hash(file_path)
    metadata_store.set_file_hash(file_path, file_hash, len(chunks))

    result["chunks"] = len(chunks)
    result["total_time"] = time.time() - start_total

    if progress_callback:
        progress_callback(f"  Total time: {result['total_time']:.1f}s")

    return result


def _process_single_file(
    file_path: str,
    vector_store: VectorStore,
    metadata_store: MetadataStore,
    db_lock: threading.Lock,
    force_reindex: bool = False,
    max_chunks_per_file: int = MAX_CHUNKS_PER_FILE
) -> dict:
    """
    Process a single file for indexing (thread-safe).

    Returns dict with result info for aggregation.
    """
    result = {
        "file_path": file_path,
        "file_name": Path(file_path).name,
        "action": None,
        "chunks": 0,
        "skipped": False,
        "skip_reason": None,
        "extract_time": 0.0,
        "embed_time": 0.0,
        "store_time": 0.0,
        "total_time": 0.0,
        "error": None,
    }

    start_total = time.time()

    try:
        current_hash = compute_file_hash(file_path)

        with db_lock:
            stored_hash = metadata_store.get_file_hash(file_path)

        if not force_reindex and stored_hash == current_hash:
            result["action"] = "skipped_unchanged"
            result["total_time"] = time.time() - start_total
            return result

        if stored_hash is not None:
            result["action"] = "reindex"
            with db_lock:
                vector_store.delete_by_file(file_path)
        else:
            result["action"] = "index"

        file_ext = Path(file_path).suffix.lower()
        file_size_mb = Path(file_path).stat().st_size / (1024 * 1024)

        if file_ext not in EXTRACTORS:
            result["skipped"] = True
            result["skip_reason"] = f"unsupported type: {file_ext}"
            result["total_time"] = time.time() - start_total
            return result

        if file_size_mb > MAX_FILE_SIZE_MB:
            result["skipped"] = True
            result["skip_reason"] = f"file too large: {file_size_mb:.1f}MB"
            result["total_time"] = time.time() - start_total
            return result

        start_extract = time.time()
        extractor = EXTRACTORS[file_ext]
        extraction_result = extractor(file_path)
        result["extract_time"] = time.time() - start_extract

        if file_ext == ".pdf" and isinstance(extraction_result, dict):
            content = extraction_result.get("content", [])
            skip_reason = extraction_result.get("skip_reason")
        else:
            content = extraction_result
            skip_reason = None

        if not content:
            result["skipped"] = True
            result["skip_reason"] = skip_reason or "no extractable content"
            result["total_time"] = time.time() - start_total
            return result

        chunk_size, chunk_overlap = get_chunk_params(file_path)
        chunks = chunk_document(content, file_path, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

        if not chunks:
            result["skipped"] = True
            result["skip_reason"] = "no chunks generated"
            result["total_time"] = time.time() - start_total
            return result

        if len(chunks) > max_chunks_per_file:
            result["skipped"] = True
            result["skip_reason"] = f"too many chunks: {len(chunks)} > {max_chunks_per_file}"
            result["chunks_would_be"] = len(chunks)
            result["total_time"] = time.time() - start_total
            return result

        start_embed = time.time()
        texts = [c["text"] for c in chunks]
        embeddings = generate_embeddings(texts)
        result["embed_time"] = time.time() - start_embed

        start_store = time.time()
        with db_lock:
            vector_store.add_chunks(chunks, embeddings)
            metadata_store.set_file_hash(file_path, current_hash, len(chunks))

            bm25_index = get_bm25_index()
            chunk_ids = [
                f"{c['file_path']}::slide{c['slide_number']}::chunk{c['chunk_index']}"
                for c in chunks
            ]
            bm25_index.add_documents(chunk_ids, texts)
        result["store_time"] = time.time() - start_store

        result["chunks"] = len(chunks)

    except Exception as e:
        result["error"] = str(e)

    result["total_time"] = time.time() - start_total
    return result


def index_folder(
    folder_path: str,
    vector_store: Optional[VectorStore] = None,
    metadata_store: Optional[MetadataStore] = None,
    progress_callback: Optional[Callable[[str], None]] = None,
    force_reindex: bool = False,
    parallel_workers: int = PARALLEL_WORKERS,
    max_chunks_per_file: int = MAX_CHUNKS_PER_FILE,
    cancel_event: Optional[threading.Event] = None,
    job_id: Optional[int] = None
) -> dict:
    """
    Index all supported files in a folder using parallel processing.

    Args:
        folder_path: Path to the folder to index
        vector_store: Optional existing VectorStore instance
        metadata_store: Optional existing MetadataStore instance
        progress_callback: Optional callback for progress updates
        force_reindex: If True, reindex all files even if unchanged
        parallel_workers: Number of parallel workers (default: 3)
        max_chunks_per_file: Max chunks per file before skipping (default: 50)
        cancel_event: Optional threading.Event to signal cancellation
        job_id: Optional existing job ID to resume

    Returns:
        Dict with indexing statistics (includes 'cancelled' bool if stopped early)
    """
    if vector_store is None:
        expected_dim = get_embedding_dimension()
        vector_store = VectorStore(expected_dimension=expected_dim)
    if metadata_store is None:
        metadata_store = MetadataStore()

    is_resuming = False

    if job_id is None:
        existing_job = metadata_store.get_active_indexing_job()
        if existing_job and existing_job["folder_path"] == folder_path and existing_job["status"] == "paused":
            job_id = existing_job["id"]
            files = metadata_store.get_pending_files_for_job(job_id)
            is_resuming = True
            metadata_store.update_job_status(job_id, "running")
            if progress_callback:
                progress_callback(f"Resuming indexing: {len(files)} files remaining")
        else:
            files = scan_folder(folder_path)
            job_id = metadata_store.create_indexing_job(folder_path, max_chunks_per_file, force_reindex, len(files))
            metadata_store.add_job_files(job_id, files)
    else:
        files = metadata_store.get_pending_files_for_job(job_id)
        is_resuming = True
        metadata_store.update_job_status(job_id, "running")

    if progress_callback and not is_resuming:
        progress_callback(f"Found {len(files)} files to process (workers: {parallel_workers}, max chunks: {max_chunks_per_file})")

    stats = {
        "total_files": len(files),
        "indexed_files": 0,
        "skipped_unchanged": 0,
        "skipped_limits": 0,
        "total_chunks": 0,
        "total_time": 0.0,
        "total_embed_time": 0.0,
        "file_times": [],
        "errors": [],
        "skipped_files": [],
        "skipped_by_reason": {
            "scanned_image": [],
            "empty_file": [],
            "file_too_large": [],
            "unsupported_type": [],
            "chunk_limit_exceeded": [],
        },
        "cancelled": False
    }

    folder_start = time.time()
    db_lock = threading.Lock()
    completed_count = 0

    with ThreadPoolExecutor(max_workers=parallel_workers) as executor:
        futures: dict[Future, str] = {}
        for file_path in files:
            if cancel_event and cancel_event.is_set():
                break
            futures[executor.submit(
                _process_single_file,
                file_path,
                vector_store,
                metadata_store,
                db_lock,
                force_reindex,
                max_chunks_per_file
            )] = file_path

        for future in as_completed(futures):
            if cancel_event and cancel_event.is_set():
                stats["cancelled"] = True
                stats["paused"] = True
                if progress_callback:
                    progress_callback("Indexing paused")
                executor.shutdown(wait=True, cancel_futures=False)
                if job_id is not None:
                    metadata_store.update_job_status(job_id, "paused")
                    metadata_store.update_indexing_job_progress(job_id, completed_count)
                break

            completed_count += 1
            result = future.result()
            file_path = result["file_path"]

            file_status = "completed" if not result.get("error") else "error"
            if result.get("skipped"):
                file_status = "skipped"
            if job_id is not None:
                metadata_store.update_job_file_status(job_id, file_path, file_status)
                if completed_count % 10 == 0:
                    metadata_store.update_indexing_job_progress(job_id, completed_count)

            if result["action"] == "skipped_unchanged":
                stats["skipped_unchanged"] += 1
                if progress_callback:
                    progress_callback(f"[{completed_count}/{len(files)}] Skipped (unchanged): {result['file_name']}")
            elif result["error"]:
                stats["errors"].append(f"Error indexing {result['file_path']}: {result['error']}")
                if progress_callback:
                    progress_callback(f"[{completed_count}/{len(files)}] ERROR: {result['file_name']} - {result['error']}")
            elif result["skipped"]:
                stats["skipped_limits"] += 1
                stats["file_times"].append({
                    "file": result["file_name"],
                    "skipped": True,
                    "reason": result["skip_reason"]
                })

                skip_reason = result["skip_reason"]
                category = _categorize_skip_reason(skip_reason)
                skipped_entry = {
                    "file_path": result["file_path"],
                    "file_name": result["file_name"],
                    "reason": skip_reason,
                }
                if result.get("chunks_would_be"):
                    skipped_entry["chunks_would_be"] = result["chunks_would_be"]

                stats["skipped_by_reason"][category].append(skipped_entry)

                if category == "chunk_limit_exceeded":
                    stats["skipped_files"].append(skipped_entry)

                if progress_callback:
                    progress_callback(f"[{completed_count}/{len(files)}] Skipped ({skip_reason}): {result['file_name']}")
            else:
                stats["indexed_files"] += 1
                stats["total_chunks"] += result["chunks"]
                stats["total_embed_time"] += result["embed_time"]
                stats["file_times"].append({
                    "file": result["file_name"],
                    "chunks": result["chunks"],
                    "total_time": result["total_time"],
                    "embed_time": result["embed_time"],
                    "extract_time": result["extract_time"],
                })
                if progress_callback:
                    rate = result["chunks"] / result["embed_time"] if result["embed_time"] > 0 else 0
                    progress_callback(
                        f"[{completed_count}/{len(files)}] Indexed: {result['file_name']} "
                        f"({result['chunks']} chunks, {result['total_time']:.1f}s, {rate:.1f} c/s)"
                    )

    stats["total_time"] = time.time() - folder_start
    stats["job_id"] = job_id

    if job_id is not None and not stats.get("paused"):
        metadata_store.complete_indexing_job(job_id, "completed")
        metadata_store.update_indexing_job_progress(job_id, completed_count)

    if progress_callback and stats["indexed_files"] > 0:
        sorted_times = sorted(
            [f for f in stats["file_times"] if not f.get("skipped")],
            key=lambda x: x.get("total_time", 0),
            reverse=True
        )
        progress_callback("\n" + "=" * 50)
        progress_callback("TIMING SUMMARY")
        progress_callback("=" * 50)
        progress_callback(f"Total time: {stats['total_time']:.1f}s")
        progress_callback(f"Total embed time: {stats['total_embed_time']:.1f}s")
        if stats["total_chunks"] > 0 and stats["total_embed_time"] > 0:
            progress_callback(f"Avg embed rate: {stats['total_chunks']/stats['total_embed_time']:.1f} chunks/sec")
        progress_callback(f"\nTop 10 slowest files:")
        for f in sorted_times[:10]:
            progress_callback(f"  {f['file']}: {f['total_time']:.1f}s ({f['chunks']} chunks, embed: {f['embed_time']:.1f}s)")

    return stats


def reindex_files(
    file_paths: List[str],
    vector_store: Optional[VectorStore] = None,
    metadata_store: Optional[MetadataStore] = None,
    progress_callback: Optional[Callable[[str], None]] = None,
    parallel_workers: int = PARALLEL_WORKERS,
    max_chunks_per_file: int = MAX_CHUNKS_PER_FILE,
    cancel_event: Optional[threading.Event] = None
) -> dict:
    """
    Reindex specific files (force reindex).

    Args:
        file_paths: List of file paths to reindex
        vector_store: Optional existing VectorStore instance
        metadata_store: Optional existing MetadataStore instance
        progress_callback: Optional callback for progress updates
        parallel_workers: Number of parallel workers (default: 3)
        max_chunks_per_file: Max chunks per file before skipping (default: 50)
        cancel_event: Optional threading.Event to signal cancellation

    Returns:
        Dict with indexing statistics (includes 'cancelled' bool if stopped early)
    """
    if vector_store is None:
        expected_dim = get_embedding_dimension()
        vector_store = VectorStore(expected_dimension=expected_dim)
    if metadata_store is None:
        metadata_store = MetadataStore()

    existing_files = [f for f in file_paths if Path(f).exists()]
    missing_files = [f for f in file_paths if not Path(f).exists()]

    if progress_callback:
        progress_callback(f"Reindexing {len(existing_files)} files (workers: {parallel_workers}, max chunks: {max_chunks_per_file})")
        if missing_files:
            progress_callback(f"Warning: {len(missing_files)} files no longer exist and will be removed from index")

    for missing_file in missing_files:
        vector_store.delete_by_file(missing_file)
        metadata_store.remove_file(missing_file)
        if progress_callback:
            progress_callback(f"Removed missing file from index: {Path(missing_file).name}")

    stats = {
        "total_files": len(existing_files),
        "indexed_files": 0,
        "skipped_unchanged": 0,
        "skipped_limits": 0,
        "total_chunks": 0,
        "total_time": 0.0,
        "total_embed_time": 0.0,
        "file_times": [],
        "errors": [],
        "removed_missing": len(missing_files),
        "skipped_files": [],
        "skipped_by_reason": {
            "scanned_image": [],
            "empty_file": [],
            "file_too_large": [],
            "unsupported_type": [],
            "chunk_limit_exceeded": [],
        },
        "cancelled": False
    }

    if not existing_files:
        return stats

    folder_start = time.time()
    db_lock = threading.Lock()
    completed_count = 0

    with ThreadPoolExecutor(max_workers=parallel_workers) as executor:
        futures: dict[Future, str] = {}
        for file_path in existing_files:
            if cancel_event and cancel_event.is_set():
                break
            futures[executor.submit(
                _process_single_file,
                file_path,
                vector_store,
                metadata_store,
                db_lock,
                True,
                max_chunks_per_file
            )] = file_path

        for future in as_completed(futures):
            if cancel_event and cancel_event.is_set():
                stats["cancelled"] = True
                if progress_callback:
                    progress_callback("Reindexing cancelled by user")
                executor.shutdown(wait=True, cancel_futures=False)
                break

            completed_count += 1
            result = future.result()

            if result["error"]:
                stats["errors"].append(f"Error indexing {result['file_path']}: {result['error']}")
                if progress_callback:
                    progress_callback(f"[{completed_count}/{len(existing_files)}] ERROR: {result['file_name']} - {result['error']}")
            elif result["skipped"]:
                stats["skipped_limits"] += 1
                stats["file_times"].append({
                    "file": result["file_name"],
                    "skipped": True,
                    "reason": result["skip_reason"]
                })

                skip_reason = result["skip_reason"]
                category = _categorize_skip_reason(skip_reason)
                skipped_entry = {
                    "file_path": result["file_path"],
                    "file_name": result["file_name"],
                    "reason": skip_reason,
                }
                if result.get("chunks_would_be"):
                    skipped_entry["chunks_would_be"] = result["chunks_would_be"]

                stats["skipped_by_reason"][category].append(skipped_entry)

                if category == "chunk_limit_exceeded":
                    stats["skipped_files"].append(skipped_entry)

                if progress_callback:
                    progress_callback(f"[{completed_count}/{len(existing_files)}] Skipped ({skip_reason}): {result['file_name']}")
            else:
                stats["indexed_files"] += 1
                stats["total_chunks"] += result["chunks"]
                stats["total_embed_time"] += result["embed_time"]
                stats["file_times"].append({
                    "file": result["file_name"],
                    "chunks": result["chunks"],
                    "total_time": result["total_time"],
                    "embed_time": result["embed_time"],
                    "extract_time": result["extract_time"],
                })
                if progress_callback:
                    rate = result["chunks"] / result["embed_time"] if result["embed_time"] > 0 else 0
                    progress_callback(
                        f"[{completed_count}/{len(existing_files)}] Reindexed: {result['file_name']} "
                        f"({result['chunks']} chunks, {result['total_time']:.1f}s, {rate:.1f} c/s)"
                    )

    stats["total_time"] = time.time() - folder_start

    if progress_callback and stats["indexed_files"] > 0:
        progress_callback("\n" + "=" * 50)
        progress_callback("REINDEX COMPLETE")
        progress_callback("=" * 50)
        progress_callback(f"Total time: {stats['total_time']:.1f}s")
        progress_callback(f"Files reindexed: {stats['indexed_files']}")
        progress_callback(f"Total chunks: {stats['total_chunks']}")

    return stats
