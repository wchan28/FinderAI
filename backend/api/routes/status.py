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
    ollama: bool
    embedding_model: bool


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


EMBEDDING_MODELS = {"nomic-embed-text", "mxbai-embed-large", "all-minilm"}


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
    """Check if backend and Ollama are ready."""
    ollama_ok = False
    embedding_model_ok = False
    try:
        import ollama
        from backend.indexer.embedder import EMBEDDING_MODEL

        models_response = ollama.list()
        ollama_ok = True

        model_names = [m.model.split(":")[0] for m in models_response.models]
        embedding_model_ok = EMBEDDING_MODEL in model_names
    except Exception:
        pass

    return HealthResponse(status="ok", ollama=ollama_ok, embedding_model=embedding_model_ok)


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """Get list of available Ollama models for chat."""
    try:
        import ollama

        models_response = ollama.list()

        chat_models = []
        for m in models_response.models:
            name = m.model
            base_name = name.split(":")[0]

            if base_name in EMBEDDING_MODELS:
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
