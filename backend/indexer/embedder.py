"""Embedding generation using provider abstraction."""

from __future__ import annotations

from typing import List, Optional

from backend.providers import get_embedding_provider, get_config
from backend.providers.embedding.base import BaseEmbeddingProvider


_embedding_provider: Optional[BaseEmbeddingProvider] = None


def get_provider() -> BaseEmbeddingProvider:
    """Get or create the global embedding provider."""
    global _embedding_provider
    if _embedding_provider is None:
        _embedding_provider = get_embedding_provider()
    return _embedding_provider


def set_provider(provider: BaseEmbeddingProvider) -> None:
    """Set the global embedding provider."""
    global _embedding_provider
    _embedding_provider = provider


def reset_provider() -> None:
    """Reset the global embedding provider (forces reload from config)."""
    global _embedding_provider
    _embedding_provider = None


def generate_embedding(text: str) -> List[float]:
    """Generate an embedding for a single piece of text."""
    provider = get_provider()
    return provider.embed_query(text)


def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts."""
    if not texts:
        return []
    provider = get_provider()
    return provider.embed(texts)


def get_embedding_dimension() -> int:
    """Get the dimension of the current embedding model."""
    provider = get_provider()
    return provider.dimension


def get_embedding_model_name() -> str:
    """Get the name of the current embedding model."""
    provider = get_provider()
    return f"{provider.name}/{provider.model}"
