from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

from backend.db.vector_store import VectorStore
from backend.db.metadata_store import MetadataStore

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
    vector_store = VectorStore()
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

    embedding_ready = False
    llm_ready = False

    if config.embedding_provider == "voyage":
        embedding_ready = bool(config.voyage_api_key)
    elif config.embedding_provider == "cohere":
        embedding_ready = bool(config.cohere_api_key)
    elif config.embedding_provider == "openai":
        embedding_ready = bool(config.openai_api_key)

    if config.llm_provider == "openai":
        llm_ready = bool(config.openai_api_key)
    elif config.llm_provider == "google":
        llm_ready = bool(config.google_api_key)
    elif config.llm_provider == "ollama":
        try:
            import ollama
            ollama.list()
            llm_ready = True
        except Exception:
            llm_ready = False

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
