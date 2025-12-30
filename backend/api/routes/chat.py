from __future__ import annotations

import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.db.vector_store import VectorStore
from backend.chat.rag_handler import get_answer_with_sources

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    n_context_results: int = 10


async def generate_chat_stream(message: str, n_context_results: int):
    """Generate SSE stream for chat response."""
    vector_store = VectorStore()

    if vector_store.count() == 0:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No documents indexed. Please index a folder first.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    response_generator, sources = get_answer_with_sources(
        message, vector_store, n_context_results=n_context_results, stream=True
    )

    yield f"data: {json.dumps({'type': 'sources', 'content': sources})}\n\n"

    for chunk in response_generator:
        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest):
    """Stream chat response using RAG."""
    return StreamingResponse(
        generate_chat_stream(request.message, request.n_context_results),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
