from __future__ import annotations

import re
from typing import Optional, List, Dict, Generator

import ollama

from backend.db.vector_store import VectorStore
from backend.search.retriever import search_documents, get_context_for_query, search_files_by_name


DEFAULT_LLM_MODEL = "llama3.1:8b"

FILE_LISTING_PATTERNS = [
    r'\bfiles?\b.*\b(named?|called)\b',
    r'\bwhat\b.*\bfiles?\b.*\b(named?|called)\b',
    r'\bwhich\b.*\bfiles?\b.*\b(named?|called)\b',
]

FILE_CONTENT_PATTERNS = [
    r'\bfiles?\b.*\b(talk|about|mention|discuss|contain|related|cover)\b',
    r'\b(talk|about|mention|discuss|related)\b.*\bfiles?\b',
    r'\b(list|show|give|find|get)\b.*\bfiles?\b.*\b(about|on|for|related|mention)\b',
    r'\b(list|show|give|find|get)\b.*\bfiles?\b',
]


def is_file_content_query(query: str) -> bool:
    """Check if query is asking for files about a topic (content-based search)."""
    query_lower = query.lower()
    return any(re.search(pattern, query_lower) for pattern in FILE_CONTENT_PATTERNS)


def is_file_listing_query(query: str) -> bool:
    """Check if query is asking to list files by name."""
    query_lower = query.lower()
    return any(re.search(pattern, query_lower) for pattern in FILE_LISTING_PATTERNS)

RAG_SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on the user's own local files.

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the document excerpts below - do not use external knowledge
2. When the user mentions a company or file name, prioritize documents from that source
   - Match names flexibly: "elililly" = "Eli Lilly" = "EliLilly_Protocol", "ucb" = "UCB"
3. ALWAYS cite which file(s) your answer comes from using the exact filename
4. If information exists in the provided documents, you MUST use it - do not claim it's missing
5. Only say "not found" if you've thoroughly checked ALL provided documents and the information truly does not exist
6. When multiple documents are provided, answer from the most relevant one based on the user's query

Keep responses concise and well-formatted using markdown."""

RAG_USER_PROMPT_TEMPLATE = """Based on the following document excerpts from my files:

{context}

---

Please answer this question: {query}

Remember to cite the source file(s) in your answer."""

FILE_LISTING_PROMPT_TEMPLATE = """The user asked for files matching: {query}

I found {count} files matching your search:

{file_list}

{additional_context}"""


def _format_file_listing_response(file_matches: List[Dict], query: str, by_content: bool = False) -> str:
    """Format a clean response for file listing queries."""
    if not file_matches:
        return "No files found matching your search."

    if by_content:
        file_list = "\n".join(
            f"- **{m['file_name']}** ({m['relevance_score']:.0%} relevant)"
            for m in file_matches
        )
        return f"Found **{len(file_matches)} files** related to your search:\n\n{file_list}"
    else:
        file_list = "\n".join(f"- **{m['file_name']}**" for m in file_matches)
        return f"Found **{len(file_matches)} files** matching your search:\n\n{file_list}"


def search_files_by_content(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 20
) -> List[Dict]:
    """Search for files whose content matches the query topic."""
    results = search_documents(query, vector_store, n_results)
    seen_files = {}
    for r in results:
        file_path = r["file_path"]
        if file_path not in seen_files:
            seen_files[file_path] = {
                "file_path": file_path,
                "file_name": r["file_name"],
                "relevance_score": r["relevance_score"]
            }
    return sorted(seen_files.values(), key=lambda x: x["relevance_score"], reverse=True)


def get_answer(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5,
    stream: bool = False,
    model: str = DEFAULT_LLM_MODEL
) -> str | Generator[str, None, None]:
    """
    Get an answer to a query using RAG.

    Args:
        query: The user's question
        vector_store: Optional VectorStore instance
        n_context_results: Number of context chunks to retrieve
        stream: If True, return a generator that yields response chunks
        model: The LLM model to use for generation

    Returns:
        The LLM's response (or generator if streaming)
    """
    if vector_store is None:
        vector_store = VectorStore()

    if is_file_content_query(query):
        file_matches = search_files_by_content(query, vector_store)
        if file_matches:
            response = _format_file_listing_response(file_matches, query, by_content=True)
            if stream:
                return iter([response])
            else:
                return response

    if is_file_listing_query(query):
        file_matches = search_files_by_name(query, vector_store)
        if file_matches:
            response = _format_file_listing_response(file_matches, query)
            if stream:
                return iter([response])
            else:
                return response

    context = get_context_for_query(query, vector_store, n_context_results)

    user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
        context=context,
        query=query
    )

    if stream:
        return _stream_response(user_prompt, model)
    else:
        return _get_full_response(user_prompt, model)


def _get_full_response(user_prompt: str, model: str = DEFAULT_LLM_MODEL) -> str:
    """Get complete response from LLM."""
    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": RAG_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
    )
    return response["message"]["content"]


def _stream_response(user_prompt: str, model: str = DEFAULT_LLM_MODEL) -> Generator[str, None, None]:
    """Stream response from LLM."""
    stream = ollama.chat(
        model=model,
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
