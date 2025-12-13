from __future__ import annotations

from typing import List

import ollama


EMBEDDING_MODEL = "nomic-embed-text"


def generate_embedding(text: str, model: str = EMBEDDING_MODEL) -> List[float]:
    """
    Generate an embedding for a single piece of text using Ollama.
    """
    response = ollama.embed(model=model, input=text)
    return response["embeddings"][0]


def generate_embeddings(texts: List[str], model: str = EMBEDDING_MODEL) -> List[List[float]]:
    """
    Generate embeddings for multiple texts using Ollama.
    Ollama's embed endpoint supports batch embedding.
    """
    if not texts:
        return []

    response = ollama.embed(model=model, input=texts)
    return response["embeddings"]
