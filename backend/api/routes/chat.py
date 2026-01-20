from __future__ import annotations

import json
from typing import List, Optional
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.db.vector_store import get_vector_store
from backend.chat.rag_handler import get_answer_with_sources
from backend.subscription.manager import get_subscription_state
from backend.subscription.usage import get_search_count, increment_search_count
from backend.subscription.state import FREE_TIER_LIMITS, PRO_TIER_LIMITS, SubscriptionState

router = APIRouter()


class ConversationMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    n_context_results: int = 10
    conversation_history: Optional[List[ConversationMessage]] = None
    previous_sources: Optional[List[str]] = None


def _extract_email_from_clerk_token(auth_header: Optional[str]) -> Optional[str]:
    """Extract user email from Clerk JWT token."""
    if not auth_header:
        return None

    try:
        import jwt

        token = auth_header
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload.get("email") or payload.get("primary_email_address")
    except Exception:
        return None


async def generate_search_limit_error(limit: int):
    """Generate SSE stream for search limit error."""
    yield f"data: {json.dumps({'type': 'error', 'content': f'Monthly search limit ({limit}) reached. Upgrade to Pro for unlimited searches.'})}\n\n"
    yield f"data: {json.dumps({'type': 'search_limit_reached', 'content': {'limit': limit}})}\n\n"
    yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"


def _get_pro_only_extensions() -> set:
    """Get file extensions that are Pro-only (not available on free tier)."""
    return set(PRO_TIER_LIMITS["allowed_file_types"]) - set(FREE_TIER_LIMITS["allowed_file_types"])


def _filter_sources_for_tier(sources: List[dict], state: SubscriptionState) -> tuple:
    """
    Filter sources based on subscription tier.
    Returns (filtered_sources, hidden_count, hidden_extensions).
    """
    if state.tier.value == "pro":
        return sources, 0, []

    pro_only_extensions = _get_pro_only_extensions()
    filtered_sources = []
    hidden_count = 0
    hidden_extensions_set = set()

    for source in sources:
        file_path = source.get("file_path", "")
        file_ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""

        if file_ext in pro_only_extensions:
            hidden_count += 1
            hidden_extensions_set.add(file_ext)
        else:
            filtered_sources.append(source)

    return filtered_sources, hidden_count, list(hidden_extensions_set)


async def generate_chat_stream(
    message: str,
    n_context_results: int,
    conversation_history: Optional[List[ConversationMessage]] = None,
    subscription_state: Optional[SubscriptionState] = None,
    previous_sources: Optional[List[str]] = None,
):
    """Generate SSE stream for chat response."""
    vector_store = get_vector_store()

    if vector_store.count() == 0:
        yield f"data: {json.dumps({'type': 'error', 'content': 'No documents indexed. Please index a folder first.'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    history = [{"role": m.role, "content": m.content} for m in (conversation_history or [])]

    try:
        response_generator, sources = get_answer_with_sources(
            message,
            vector_store,
            n_context_results=n_context_results,
            stream=True,
            conversation_history=history,
            previous_source_files=previous_sources,
        )
    except Exception as e:
        yield f"data: {json.dumps({'type': 'sources', 'content': []})}\n\n"
        yield f"data: {json.dumps({'type': 'error', 'content': f'Failed to search documents: {str(e)}'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"
        return

    filtered_sources = sources
    hidden_results_count = 0
    hidden_extensions = []

    if subscription_state:
        filtered_sources, hidden_results_count, hidden_extensions = _filter_sources_for_tier(
            sources, subscription_state
        )

    yield f"data: {json.dumps({'type': 'sources', 'content': filtered_sources})}\n\n"

    if hidden_results_count > 0:
        yield f"data: {json.dumps({'type': 'hidden_results', 'content': {'count': hidden_results_count, 'extensions': hidden_extensions}})}\n\n"

    try:
        for chunk in response_generator:
            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'content': f'Failed to generate response: {str(e)}'})}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"


@router.post("/chat")
async def chat(request: ChatRequest, http_request: Request):
    """Stream chat response using RAG with subscription limit check."""
    clerk_token = http_request.headers.get("x-clerk-auth-token")
    user_email = _extract_email_from_clerk_token(clerk_token)

    state = get_subscription_state(user_email)

    if state.max_searches_per_month > 0:
        current_searches = get_search_count()
        if current_searches >= state.max_searches_per_month:
            return StreamingResponse(
                generate_search_limit_error(state.max_searches_per_month),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no"
                }
            )

    increment_search_count()

    return StreamingResponse(
        generate_chat_stream(
            request.message,
            request.n_context_results,
            request.conversation_history,
            subscription_state=state,
            previous_sources=request.previous_sources,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
