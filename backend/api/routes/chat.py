from __future__ import annotations

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.db.vector_store import VectorStore
from backend.chat.rag_handler import get_answer, is_file_listing_query
from backend.search.retriever import search_documents, search_files_by_name

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    n_context_results: int = 10
    model: str = "llama3.1:8b"


async def generate_chat_stream(message: str, n_context_results: int, model: str):
    """Generate SSE stream for chat response."""
    vector_store = VectorStore()

    if vector_store.count() == 0:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No documents indexed. Please index a folder first.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    sources = []

    if is_file_listing_query(message):
        file_matches = search_files_by_name(message, vector_store)
        for m in file_matches:
            sources.append({
                "file_name": m["file_name"],
                "file_path": m["file_path"],
                "slide_number": 0,
                "relevance_score": 1.0
            })

    results = search_documents(message, vector_store, n_results=n_context_results)
    seen_files = {s["file_path"] for s in sources}
    for r in results:
        if r["file_path"] not in seen_files:
            sources.append({
                "file_name": r["file_name"],
                "file_path": r["file_path"],
                "slide_number": r["slide_number"],
                "relevance_score": r["relevance_score"]
            })
            seen_files.add(r["file_path"])

    yield f"data: {json.dumps({'type': 'sources', 'content': sources})}\n\n"

    for chunk in get_answer(message, vector_store, n_context_results=n_context_results, stream=True, model=model):
        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest):
    """Stream chat response using RAG."""
    return StreamingResponse(
        generate_chat_stream(request.message, request.n_context_results, request.model),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
