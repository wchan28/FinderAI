"""OpenAI embedding provider implementation."""

from __future__ import annotations

from typing import List

from backend.providers.embedding.base import BaseEmbeddingProvider


OPENAI_EMBEDDING_MODELS = [
    "text-embedding-3-large",
    "text-embedding-3-small",
    "text-embedding-ada-002",
]

MODEL_DIMENSIONS = {
    "text-embedding-3-large": 3072,
    "text-embedding-3-small": 1536,
    "text-embedding-ada-002": 1536,
}


class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider using OpenAI API."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-large"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load OpenAI client."""
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=self._api_key)
        return self._client

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return MODEL_DIMENSIONS.get(self._model, 3072)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        client = self._get_client()

        batch_size = 100
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(
                model=self._model,
                input=batch,
            )
            embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(embeddings)

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        client = self._get_client()
        response = client.embeddings.create(
            model=self._model,
            input=text,
        )
        return response.data[0].embedding

    def is_available(self) -> bool:
        """Check if API key is configured."""
        return bool(self._api_key)

    def list_models(self) -> List[str]:
        """List available OpenAI embedding models."""
        return OPENAI_EMBEDDING_MODELS.copy()
