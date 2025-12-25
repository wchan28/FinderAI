"""Ollama embedding provider implementation."""

from __future__ import annotations

from typing import List

from backend.providers.embedding.base import BaseEmbeddingProvider


OLLAMA_EMBEDDING_MODELS = [
    "nomic-embed-text",
    "mxbai-embed-large",
    "all-minilm",
    "snowflake-arctic-embed",
]

MODEL_DIMENSIONS = {
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
    "snowflake-arctic-embed": 1024,
}


class OllamaEmbeddingProvider(BaseEmbeddingProvider):
    """Embedding provider using local Ollama models."""

    def __init__(self, model: str = "nomic-embed-text"):
        self._model = model
        self._ollama = None
        self._model_checked = False

    def _get_ollama(self):
        """Lazy-load ollama module."""
        if self._ollama is None:
            import ollama
            self._ollama = ollama
        return self._ollama

    def _ensure_model_available(self) -> None:
        """Ensure the embedding model is available, pulling if needed."""
        if self._model_checked:
            return

        ollama = self._get_ollama()
        models_response = ollama.list()
        models = models_response.get("models", [])
        model_names = [m.get("name", "").split(":")[0] for m in models]

        if self._model.split(":")[0] not in model_names:
            ollama.pull(self._model)

        self._model_checked = True

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        base_model = self._model.split(":")[0]
        return MODEL_DIMENSIONS.get(base_model, 768)

    def embed(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        self._ensure_model_available()
        ollama = self._get_ollama()
        response = ollama.embed(model=self._model, input=texts)
        return response["embeddings"]

    def embed_query(self, text: str) -> List[float]:
        self._ensure_model_available()
        ollama = self._get_ollama()
        response = ollama.embed(model=self._model, input=text)
        return response["embeddings"][0]

    def is_available(self) -> bool:
        """Check if Ollama is running."""
        try:
            ollama = self._get_ollama()
            ollama.list()
            return True
        except Exception:
            return False

    def list_models(self) -> List[str]:
        """List available Ollama embedding models."""
        return OLLAMA_EMBEDDING_MODELS.copy()
