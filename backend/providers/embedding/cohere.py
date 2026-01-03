"""Cohere embedding provider implementation."""

from __future__ import annotations

from typing import List

from backend.providers.embedding.base import BaseEmbeddingProvider
from backend.providers.config import is_proxy_mode_enabled
from backend.providers.proxy_client import proxy_embeddings


COHERE_EMBEDDING_MODELS = [
    "embed-v4.0",
    "embed-english-v3.0",
    "embed-multilingual-v3.0",
    "embed-english-light-v3.0",
    "embed-multilingual-light-v3.0",
]

MODEL_DIMENSIONS = {
    "embed-v4.0": 1536,
    "embed-english-v3.0": 1024,
    "embed-multilingual-v3.0": 1024,
    "embed-english-light-v3.0": 384,
    "embed-multilingual-light-v3.0": 384,
}


class CohereEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider using Cohere API."""

    def __init__(self, api_key: str, model: str = "embed-v4.0"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load Cohere client."""
        if self._client is None:
            import cohere
            self._client = cohere.ClientV2(api_key=self._api_key)
        return self._client

    @property
    def name(self) -> str:
        return "cohere"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return MODEL_DIMENSIONS.get(self._model, 1536)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        if is_proxy_mode_enabled():
            return proxy_embeddings(
                texts=texts,
                model=self._model,
                provider="cohere",
                input_type="document",
            )

        client = self._get_client()

        batch_size = 96
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embed(
                texts=batch,
                model=self._model,
                input_type="search_document",
                embedding_types=["float"],
            )
            embeddings = response.embeddings.float_
            all_embeddings.extend(embeddings)

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        if is_proxy_mode_enabled():
            result = proxy_embeddings(
                texts=[text],
                model=self._model,
                provider="cohere",
                input_type="query",
            )
            return result[0] if result else []

        client = self._get_client()
        response = client.embed(
            texts=[text],
            model=self._model,
            input_type="search_query",
            embedding_types=["float"],
        )
        return response.embeddings.float_[0]

    def is_available(self) -> bool:
        """Check if API key is configured."""
        return bool(self._api_key)

    def list_models(self) -> List[str]:
        """List available Cohere embedding models."""
        return COHERE_EMBEDDING_MODELS.copy()
