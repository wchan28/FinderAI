from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional

from backend.db.vector_store import get_vector_store
from backend.db.metadata_store import MetadataStore
from backend.subscription.manager import get_subscription_state
from backend.subscription.usage import (
    get_search_count,
    get_indexed_file_count,
    get_archived_file_count,
)
from backend.subscription.transition import get_files_to_be_archived

router = APIRouter()


class FileInfo(BaseModel):
    file_path: str
    file_name: str
    chunk_count: int
    indexed_at: str


class StatusResponse(BaseModel):
    total_chunks: int
    indexed_files: int
    files: List[FileInfo]


class HealthResponse(BaseModel):
    status: str
    embedding_ready: bool
    llm_ready: bool
    needs_setup: bool


class ModelInfo(BaseModel):
    name: str
    label: str
    size: str


class ModelsResponse(BaseModel):
    models: List[ModelInfo]


@router.get("/status", response_model=StatusResponse)
async def get_status():
    """Get indexing status and list of indexed files."""
    vector_store = get_vector_store()
    metadata_store = MetadataStore()

    files = metadata_store.get_all_files()
    file_infos = [
        FileInfo(
            file_path=f["file_path"],
            file_name=f["file_path"].split("/")[-1],
            chunk_count=f["chunk_count"],
            indexed_at=str(f["indexed_at"])
        )
        for f in files
    ]

    return StatusResponse(
        total_chunks=vector_store.count(),
        indexed_files=len(files),
        files=file_infos
    )


class SkippedFileInfo(BaseModel):
    file_name: str
    reason: str
    chunks_would_be: Optional[int] = None


class SkippedByReasonInfo(BaseModel):
    scanned_image: List[SkippedFileInfo]
    empty_file: List[SkippedFileInfo]
    file_too_large: List[SkippedFileInfo]
    unsupported_type: List[SkippedFileInfo]
    chunk_limit_exceeded: List[SkippedFileInfo]


class IndexingResultsResponse(BaseModel):
    has_results: bool = True
    total_files: int
    indexed_files: int
    skipped_unchanged: int
    skipped_limits: int
    total_chunks: int
    total_time: float
    errors: List[str]
    skipped_files: List[SkippedFileInfo]
    skipped_by_reason: SkippedByReasonInfo


class NoResultsResponse(BaseModel):
    has_results: bool = False


@router.get("/indexing-results")
async def get_indexing_results():
    """Get the most recent indexing results."""
    metadata_store = MetadataStore()
    results = metadata_store.get_indexing_results()

    if not results:
        return NoResultsResponse()

    return IndexingResultsResponse(**results)


def _format_size(size_bytes: int) -> str:
    """Format bytes to human readable size."""
    if size_bytes >= 1e9:
        return f"{size_bytes / 1e9:.1f}GB"
    elif size_bytes >= 1e6:
        return f"{size_bytes / 1e6:.0f}MB"
    return f"{size_bytes}B"


def _format_model_label(name: str, size_bytes: int) -> str:
    """Create a display label for a model."""
    size_str = _format_size(size_bytes)
    return f"{name} - {size_str}"


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if backend and providers are ready."""
    from backend.providers.config import get_config

    config = get_config()

    embedding_ready = bool(config.voyage_api_key)
    llm_ready = bool(config.openai_api_key)
    needs_setup = not embedding_ready

    return HealthResponse(
        status="ok",
        embedding_ready=embedding_ready,
        llm_ready=llm_ready,
        needs_setup=needs_setup,
    )


OLLAMA_EMBEDDING_MODELS = {"nomic-embed-text", "mxbai-embed-large", "all-minilm"}


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """Get list of available Ollama models for chat (excludes embedding models)."""
    try:
        import ollama

        models_response = ollama.list()

        chat_models = []
        for m in models_response.models:
            name = m.model
            base_name = name.split(":")[0]

            if base_name in OLLAMA_EMBEDDING_MODELS:
                continue

            size_bytes = m.size
            chat_models.append(ModelInfo(
                name=name,
                label=_format_model_label(name, size_bytes),
                size=_format_size(size_bytes)
            ))

        chat_models.sort(key=lambda x: x.name)
        return ModelsResponse(models=chat_models)

    except Exception:
        return ModelsResponse(models=[])


class SubscriptionLimits(BaseModel):
    max_indexed_files: int
    max_searches_per_month: int
    conversation_history_days: int


class SubscriptionUsage(BaseModel):
    indexed_files: int
    searches_this_month: int
    archived_files: int


class GracePeriodInfo(BaseModel):
    in_grace_period: bool
    days_remaining: int
    archive_deadline: Optional[str]
    files_to_archive_count: int
    files_to_archive: List[str]


class SubscriptionResponse(BaseModel):
    tier: str
    is_trial: bool
    trial_days_remaining: Optional[int]
    is_beta_user: bool
    limits: SubscriptionLimits
    usage: SubscriptionUsage
    allowed_file_types: List[str]
    grace_period: GracePeriodInfo


def _extract_email_from_clerk_token(auth_header: Optional[str]) -> Optional[str]:
    """Extract user email from Clerk JWT token."""
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    try:
        import jwt

        token = auth_header.replace("Bearer ", "")
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload.get("email") or payload.get("primary_email_address")
    except Exception:
        return None


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(request: Request):
    """Get current subscription state and usage."""
    user_email = request.headers.get("X-User-Email")

    if not user_email:
        auth_header = request.headers.get("Authorization")
        user_email = _extract_email_from_clerk_token(auth_header)

    state = get_subscription_state(user_email)

    trial_days_remaining = None
    if state.is_trial and state.trial_end_date:
        remaining = (state.trial_end_date - datetime.utcnow()).days
        trial_days_remaining = max(0, remaining)

    files_to_archive = get_files_to_be_archived(user_email) if state.tier.value == "free" else []

    return SubscriptionResponse(
        tier=state.tier.value,
        is_trial=state.is_trial,
        trial_days_remaining=trial_days_remaining,
        is_beta_user=state.is_beta_user,
        limits=SubscriptionLimits(
            max_indexed_files=state.max_indexed_files,
            max_searches_per_month=state.max_searches_per_month,
            conversation_history_days=state.conversation_history_days,
        ),
        usage=SubscriptionUsage(
            indexed_files=get_indexed_file_count(),
            searches_this_month=get_search_count(),
            archived_files=get_archived_file_count(),
        ),
        allowed_file_types=list(state.allowed_file_types),
        grace_period=GracePeriodInfo(
            in_grace_period=state.in_grace_period,
            days_remaining=state.grace_period_days_remaining,
            archive_deadline=state.archive_deadline.isoformat() if state.archive_deadline else None,
            files_to_archive_count=len(files_to_archive),
            files_to_archive=files_to_archive,
        ),
    )
