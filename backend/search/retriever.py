from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Optional

from backend.db.vector_store import VectorStore
from backend.indexer.embedder import generate_embedding


def search_documents(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 5
) -> List[Dict]:
    """
    Search indexed documents for content matching the query.

    Returns list of results with text, file info, and relevance score.
    """
    if vector_store is None:
        vector_store = VectorStore()

    query_embedding = generate_embedding(query)

    results = vector_store.search(query_embedding, n_results=n_results)

    formatted_results = []
    for r in results:
        file_path = r["metadata"]["file_path"]
        formatted_results.append({
            "text": r["text"],
            "file_path": file_path,
            "file_name": Path(file_path).name,
            "slide_number": r["metadata"]["slide_number"],
            "relevance_score": 1 - r["distance"]
        })

    return formatted_results


def get_context_for_query(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 5
) -> str:
    """
    Get formatted context string for RAG prompt.
    """
    results = search_documents(query, vector_store, n_results)

    if not results:
        return "No relevant documents found."

    context_parts = []
    for i, r in enumerate(results, 1):
        context_parts.append(
            f"[Document {i}]\n"
            f"Source: {r['file_name']} (Slide {r['slide_number']})\n"
            f"Content: {r['text']}\n"
        )

    return "\n---\n".join(context_parts)


def get_unique_files_for_query(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 10
) -> List[Dict]:
    """
    Get unique files that match a query, with best matching excerpt from each.
    """
    results = search_documents(query, vector_store, n_results)

    seen_files = {}
    for r in results:
        file_path = r["file_path"]
        if file_path not in seen_files:
            seen_files[file_path] = r

    return list(seen_files.values())
