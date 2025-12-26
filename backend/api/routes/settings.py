"""Settings API routes."""

from __future__ import annotations

from typing import Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.providers.config import (
    get_config,
    save_config,
    save_api_key,
    delete_api_key,
    ProviderConfig,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_LLM_MODEL,
    DEFAULT_EMBEDDING_PROVIDER,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_RERANKING_PROVIDER,
    DEFAULT_RERANKING_MODEL,
)
from backend.providers.llm.openai import OPENAI_MODELS
from backend.providers.llm.google import GOOGLE_MODELS
from backend.providers.embedding.openai import OPENAI_EMBEDDING_MODELS
from backend.providers.embedding.cohere import COHERE_EMBEDDING_MODELS
from backend.providers.embedding.voyage import VOYAGE_EMBEDDING_MODELS
from backend.providers.reranking.cohere import COHERE_RERANK_MODELS
from backend.indexer.embedder import reset_provider as reset_embedding_provider


router = APIRouter(tags=["settings"])


class SettingsResponse(BaseModel):
    """Settings response model."""

    llm_provider: str
    llm_model: str
    embedding_provider: str
    embedding_model: str
    reranking_provider: str
    reranking_model: str
    hybrid_search_enabled: bool
    initial_results: int
    rerank_to: int
    has_openai_key: bool
    has_google_key: bool
    has_cohere_key: bool
    has_voyage_key: bool


class SettingsUpdateRequest(BaseModel):
    """Settings update request model."""

    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    reranking_provider: Optional[str] = None
    reranking_model: Optional[str] = None
    hybrid_search_enabled: Optional[bool] = None
    initial_results: Optional[int] = None
    rerank_to: Optional[int] = None


class APIKeyRequest(BaseModel):
    """API key save request model."""

    provider: str
    api_key: str


class ProviderModelsResponse(BaseModel):
    """Available models for providers."""

    llm_providers: dict
    embedding_providers: dict
    reranking_providers: List[str]


@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    """Get current settings."""
    config = get_config()
    return SettingsResponse(
        llm_provider=config.llm_provider,
        llm_model=config.llm_model,
        embedding_provider=config.embedding_provider,
        embedding_model=config.embedding_model,
        reranking_provider=config.reranking_provider,
        reranking_model=config.reranking_model,
        hybrid_search_enabled=config.hybrid_search_enabled,
        initial_results=config.initial_results,
        rerank_to=config.rerank_to,
        has_openai_key=bool(config.openai_api_key),
        has_google_key=bool(config.google_api_key),
        has_cohere_key=bool(config.cohere_api_key),
        has_voyage_key=bool(config.voyage_api_key),
    )


@router.post("/settings", response_model=SettingsResponse)
async def update_settings(request: SettingsUpdateRequest):
    """Update settings."""
    config = get_config()

    embedding_model_changed = False

    if request.llm_provider is not None:
        config.llm_provider = request.llm_provider
    if request.llm_model is not None:
        config.llm_model = request.llm_model
    if request.embedding_provider is not None:
        if config.embedding_provider != request.embedding_provider:
            embedding_model_changed = True
        config.embedding_provider = request.embedding_provider
    if request.embedding_model is not None:
        if config.embedding_model != request.embedding_model:
            embedding_model_changed = True
        config.embedding_model = request.embedding_model
    if request.reranking_provider is not None:
        config.reranking_provider = request.reranking_provider
    if request.reranking_model is not None:
        config.reranking_model = request.reranking_model
    if request.hybrid_search_enabled is not None:
        config.hybrid_search_enabled = request.hybrid_search_enabled
    if request.initial_results is not None:
        config.initial_results = request.initial_results
    if request.rerank_to is not None:
        config.rerank_to = request.rerank_to

    save_config(config)

    reset_embedding_provider()

    return SettingsResponse(
        llm_provider=config.llm_provider,
        llm_model=config.llm_model,
        embedding_provider=config.embedding_provider,
        embedding_model=config.embedding_model,
        reranking_provider=config.reranking_provider,
        reranking_model=config.reranking_model,
        hybrid_search_enabled=config.hybrid_search_enabled,
        initial_results=config.initial_results,
        rerank_to=config.rerank_to,
        has_openai_key=bool(config.openai_api_key),
        has_google_key=bool(config.google_api_key),
        has_cohere_key=bool(config.cohere_api_key),
        has_voyage_key=bool(config.voyage_api_key),
    )


@router.post("/settings/api-key")
async def save_api_key_endpoint(request: APIKeyRequest):
    """Save an API key."""
    valid_providers = ["openai", "google", "cohere", "voyage"]
    if request.provider not in valid_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider. Must be one of: {valid_providers}"
        )

    save_api_key(request.provider, request.api_key)

    reset_embedding_provider()

    return {"status": "ok", "provider": request.provider}


@router.delete("/settings/api-key/{provider}")
async def delete_api_key_endpoint(provider: str):
    """Delete an API key."""
    valid_providers = ["openai", "google", "cohere", "voyage"]
    if provider not in valid_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider. Must be one of: {valid_providers}"
        )

    delete_api_key(provider)

    reset_embedding_provider()

    return {"status": "ok", "provider": provider}


@router.get("/settings/providers", response_model=ProviderModelsResponse)
async def get_available_providers():
    """Get available providers and their models."""
    try:
        import ollama
        ollama_response = ollama.list()
        ollama_models = [
            m.get("name", "") for m in ollama_response.get("models", [])
            if m.get("name") and "embed" not in m.get("name", "").lower()
        ]
    except Exception:
        ollama_models = []

    return ProviderModelsResponse(
        llm_providers={
            "openai": OPENAI_MODELS,
            "google": GOOGLE_MODELS,
            "ollama": ollama_models,
        },
        embedding_providers={
            "voyage": VOYAGE_EMBEDDING_MODELS,
            "cohere": COHERE_EMBEDDING_MODELS,
            "openai": OPENAI_EMBEDDING_MODELS,
        },
        reranking_providers=COHERE_RERANK_MODELS + ["cross_encoder", "llm", "none"],
    )
