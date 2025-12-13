from __future__ import annotations

import json
import asyncio
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from queue import Queue
from threading import Thread

from backend.indexer.index_manager import index_folder
from backend.db.vector_store import VectorStore
from backend.db.metadata_store import MetadataStore

router = APIRouter()


class IndexRequest(BaseModel):
    folder: str
    max_chunks: int = 50
    force: bool = False


async def generate_index_stream(folder: str, max_chunks: int, force: bool):
    """Generate SSE stream for indexing progress."""
    if not Path(folder).exists():
        yield f"data: {json.dumps({'type': 'error', 'content': f'Folder does not exist: {folder}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    message_queue: Queue = Queue()

    def progress_callback(msg: str):
        message_queue.put(msg)

    def run_indexing():
        try:
            stats = index_folder(
                folder,
                progress_callback=progress_callback,
                force_reindex=force,
                max_chunks_per_file=max_chunks
            )
            message_queue.put(("STATS", stats))
        except Exception as e:
            message_queue.put(("ERROR", str(e)))
        finally:
            message_queue.put(("DONE", None))

    thread = Thread(target=run_indexing)
    thread.start()

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
                elif msg_type == "ERROR":
                    yield f"data: {json.dumps({'type': 'error', 'content': data})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'progress', 'content': item})}\n\n"


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
