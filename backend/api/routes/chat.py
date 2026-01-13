from __future__ import annotations

import json
from typing import List, Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.db.vector_store import get_vector_store
from backend.chat.rag_handler import get_answer_with_sources

router = APIRouter()


class ConversationMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    n_context_results: int = 10
    conversation_history: Optional[List[ConversationMessage]] = None


async def generate_chat_stream(
    message: str,
    n_context_results: int,
    conversation_history: Optional[List[ConversationMessage]] = None,
):
    """Generate SSE stream for chat response."""
    vector_store = get_vector_store()

    if vector_store.count() == 0:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No documents indexed. Please index a folder first.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    history = [{"role": m.role, "content": m.content} for m in (conversation_history or [])]

    response_generator, sources = get_answer_with_sources(
        message,
        vector_store,
        n_context_results=n_context_results,
        stream=True,
        conversation_history=history,
    )

    yield f"data: {json.dumps({'type': 'sources', 'content': sources})}\n\n"

    for chunk in response_generator:
        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest):
    """Stream chat response using RAG."""
    return StreamingResponse(
        generate_chat_stream(
            request.message,
            request.n_context_results,
            request.conversation_history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
