from __future__ import annotations

import json
import asyncio
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from queue import Queue
from threading import Thread, Event

from backend.indexer.index_manager import index_folder, reindex_files
from backend.db.vector_store import VectorStore
from backend.db.metadata_store import MetadataStore
from backend.providers.config import _get_config_store
from backend.search.bm25_index import get_bm25_index

router = APIRouter()

_cancel_event: Event | None = None


@router.post("/clear-index")
async def clear_index():
    """Clear all indexed data."""
    vector_store = VectorStore()
    metadata_store = MetadataStore()
    bm25_index = get_bm25_index()

    vector_store.clear()
    metadata_store.clear()
    metadata_store.clear_indexing_results()
    bm25_index.clear()

    store = _get_config_store()
    store.delete("indexed_folder")

    return {"status": "cleared"}


class IndexRequest(BaseModel):
    folder: str
    max_chunks: int = 50
    force: bool = False


class ReindexRequest(BaseModel):
    max_chunks: int = 50


@router.post("/index/cancel")
async def cancel_index():
    """Cancel the current indexing operation."""
    global _cancel_event
    if _cancel_event is not None:
        _cancel_event.set()
        return {"status": "cancelling"}
    return {"status": "no_indexing_in_progress"}


async def generate_index_stream(folder: str, max_chunks: int, force: bool):
    """Generate SSE stream for indexing progress."""
    global _cancel_event

    if not Path(folder).exists():
        yield f"data: {json.dumps({'type': 'error', 'content': f'Folder does not exist: {folder}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    absolute_folder = str(Path(folder).resolve())
    store = _get_config_store()
    store.set("indexed_folder", absolute_folder)

    message_queue: Queue = Queue()
    _cancel_event = Event()
    cancel_event = _cancel_event

    def progress_callback(msg: str):
        message_queue.put(msg)

    def run_indexing():
        try:
            stats = index_folder(
                folder,
                progress_callback=progress_callback,
                force_reindex=force,
                max_chunks_per_file=max_chunks,
                cancel_event=cancel_event
            )
            metadata_store = MetadataStore()
            metadata_store.save_indexing_results(stats)
            if stats.get("cancelled"):
                message_queue.put(("CANCELLED", stats))
            else:
                message_queue.put(("STATS", stats))
        except Exception as e:
            message_queue.put(("ERROR", str(e)))
        finally:
            message_queue.put(("DONE", None))

    thread = Thread(target=run_indexing)
    thread.start()

    try:
        while True:
            await asyncio.sleep(0.05)

            while not message_queue.empty():
                item = message_queue.get()

                if isinstance(item, tuple):
                    msg_type, data = item
                    if msg_type == "DONE":
                        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
                        thread.join()
                        return
                    elif msg_type == "STATS":
                        yield f"data: {json.dumps({'type': 'stats', 'content': data})}\n\n"
                    elif msg_type == "CANCELLED":
                        yield f"data: {json.dumps({'type': 'cancelled', 'content': data})}\n\n"
                    elif msg_type == "ERROR":
                        yield f"data: {json.dumps({'type': 'error', 'content': data})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'progress', 'content': item})}\n\n"
    finally:
        _cancel_event = None


@router.post("/index")
async def index(request: IndexRequest):
    """Index a folder with streaming progress updates."""
    return StreamingResponse(
        generate_index_stream(request.folder, request.max_chunks, request.force),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def generate_reindex_stream(max_chunks: int):
    """Generate SSE stream for reindexing all currently indexed files."""
    global _cancel_event

    metadata_store = MetadataStore()
    all_files = metadata_store.get_all_files()
    file_paths = [f["file_path"] for f in all_files]

    if not file_paths:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No files currently indexed'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    message_queue: Queue = Queue()
    _cancel_event = Event()
    cancel_event = _cancel_event

    def progress_callback(msg: str):
        message_queue.put(msg)

    def run_reindexing():
        try:
            stats = reindex_files(
                file_paths,
                progress_callback=progress_callback,
                max_chunks_per_file=max_chunks,
                cancel_event=cancel_event
            )
            reindex_metadata_store = MetadataStore()
            reindex_metadata_store.save_indexing_results(stats)
            if stats.get("cancelled"):
                message_queue.put(("CANCELLED", stats))
            else:
                message_queue.put(("STATS", stats))
        except Exception as e:
            message_queue.put(("ERROR", str(e)))
        finally:
            message_queue.put(("DONE", None))

    thread = Thread(target=run_reindexing)
    thread.start()

    try:
        while True:
            await asyncio.sleep(0.05)

            while not message_queue.empty():
                item = message_queue.get()

                if isinstance(item, tuple):
                    msg_type, data = item
                    if msg_type == "DONE":
                        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
                        thread.join()
                        return
                    elif msg_type == "STATS":
                        yield f"data: {json.dumps({'type': 'stats', 'content': data})}\n\n"
                    elif msg_type == "CANCELLED":
                        yield f"data: {json.dumps({'type': 'cancelled', 'content': data})}\n\n"
                    elif msg_type == "ERROR":
                        yield f"data: {json.dumps({'type': 'error', 'content': data})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'progress', 'content': item})}\n\n"
    finally:
        _cancel_event = None


@router.post("/reindex")
async def reindex(request: ReindexRequest):
    """Reindex all currently indexed files with streaming progress updates."""
    return StreamingResponse(
        generate_reindex_stream(request.max_chunks),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
