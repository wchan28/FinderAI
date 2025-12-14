from __future__ import annotations

from typing import List

import ollama


EMBEDDING_MODEL = "nomic-embed-text"

_model_checked = False


def ensure_model_available(model: str = EMBEDDING_MODEL) -> None:
    """Ensure the embedding model is available in Ollama, pulling if needed."""
    global _model_checked
    if _model_checked:
        return

    models_response = ollama.list()
    models = models_response.get("models", [])
    model_names = [m.get("name", "").split(":")[0] for m in models]

    if model not in model_names:
        ollama.pull(model)

    _model_checked = True


def generate_embedding(text: str, model: str = EMBEDDING_MODEL) -> List[float]:
    """Generate an embedding for a single piece of text using Ollama."""
    ensure_model_available(model)
    response = ollama.embed(model=model, input=text)
    return response["embeddings"][0]


def generate_embeddings(texts: List[str], model: str = EMBEDDING_MODEL) -> List[List[float]]:
    """Generate embeddings for multiple texts using Ollama."""
    if not texts:
        return []

    ensure_model_available(model)
    response = ollama.embed(model=model, input=texts)
    return response["embeddings"]
