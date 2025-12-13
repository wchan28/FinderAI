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


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if backend and Ollama are ready."""
    ollama_ok = False
    try:
        import ollama
        ollama.list()
        ollama_ok = True
    except Exception:
        pass

    return HealthResponse(status="ok", ollama=ollama_ok)
