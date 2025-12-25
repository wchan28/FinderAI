"""Voyage AI embedding provider implementation."""

from __future__ import annotations

from typing import List

from backend.providers.embedding.base import BaseEmbeddingProvider


VOYAGE_EMBEDDING_MODELS = [
    "voyage-3-large",
    "voyage-3.5",
    "voyage-3.5-lite",
    "voyage-code-3",
    "voyage-finance-2",
    "voyage-law-2",
    "voyage-multilingual-2",
]

MODEL_DIMENSIONS = {
    "voyage-3-large": 1024,
    "voyage-3.5": 1024,
    "voyage-3.5-lite": 512,
    "voyage-code-3": 1024,
    "voyage-finance-2": 1024,
    "voyage-law-2": 1024,
    "voyage-multilingual-2": 1024,
}


class VoyageEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider using Voyage AI API."""

    def __init__(self, api_key: str, model: str = "voyage-3-large"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load Voyage AI client."""
        if self._client is None:
            import voyageai
            self._client = voyageai.Client(api_key=self._api_key)
        return self._client

    @property
    def name(self) -> str:
        return "voyage"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return MODEL_DIMENSIONS.get(self._model, 1024)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        client = self._get_client()

        batch_size = 128
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embed(
                batch,
                model=self._model,
                input_type="document",
            )
            all_embeddings.extend(response.embeddings)

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        client = self._get_client()
        response = client.embed(
            [text],
            model=self._model,
            input_type="query",
        )
        return response.embeddings[0]

    def is_available(self) -> bool:
        """Check if API key is configured."""
        return bool(self._api_key)

    def list_models(self) -> List[str]:
        """List available Voyage AI embedding models."""
        return VOYAGE_EMBEDDING_MODELS.copy()
