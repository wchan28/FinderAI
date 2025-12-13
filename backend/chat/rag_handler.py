from __future__ import annotations

from typing import Optional, List, Dict, Generator

import ollama

from backend.db.vector_store import VectorStore
from backend.search.retriever import search_documents, get_context_for_query


LLM_MODEL = "llama3.2:3b"

RAG_SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on the user's local files.
You have access to document excerpts from the user's files. Use ONLY the information provided in the context to answer questions.
Always cite which file(s) your answer comes from.
If the information is not in the provided documents, clearly say so - do not make up information."""

RAG_USER_PROMPT_TEMPLATE = """Based on the following document excerpts from my files:

{context}

---

Please answer this question: {query}

Remember to cite the source file(s) in your answer."""


def get_answer(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5,
    stream: bool = False
) -> str | Generator[str, None, None]:
    """
    Get an answer to a query using RAG.

    Args:
        query: The user's question
        vector_store: Optional VectorStore instance
        n_context_results: Number of context chunks to retrieve
        stream: If True, return a generator that yields response chunks

    Returns:
        The LLM's response (or generator if streaming)
    """
    if vector_store is None:
        vector_store = VectorStore()

    context = get_context_for_query(query, vector_store, n_context_results)

    user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
        context=context,
        query=query
    )

    if stream:
        return _stream_response(user_prompt)
    else:
        return _get_full_response(user_prompt)


def _get_full_response(user_prompt: str) -> str:
    """Get complete response from LLM."""
    response = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": RAG_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
    )
    return response["message"]["content"]


def _stream_response(user_prompt: str) -> Generator[str, None, None]:
    """Stream response from LLM."""
    stream = ollama.chat(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": RAG_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        stream=True
    )

    for chunk in stream:
        if "message" in chunk and "content" in chunk["message"]:
            yield chunk["message"]["content"]


def chat(
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5
) -> None:
    """
    Interactive chat loop.
    """
    if vector_store is None:
        vector_store = VectorStore()

    print("\nFinder AI - Chat with your documents")
    print("Type 'quit' or 'exit' to end the conversation")
    print("-" * 40)

    while True:
        try:
            query = input("\nYou: ").strip()

            if not query:
                continue

            if query.lower() in ("quit", "exit", "q"):
                print("Goodbye!")
                break

            print("\nAssistant: ", end="", flush=True)

            for chunk in get_answer(query, vector_store, n_context_results, stream=True):
                print(chunk, end="", flush=True)

            print()

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}")
