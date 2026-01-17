"""RAG handler with provider abstraction for LLM generation."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional, List, Dict, Generator, Tuple, Union

from backend.db.vector_store import get_vector_store, VectorStore
from backend.search.retriever import search_documents, get_context_for_query, get_context_and_sources_for_query, search_files_by_name
from backend.providers import get_llm_provider, get_config
from backend.providers.llm.base import BaseLLMProvider, Message


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


FOLDER_REFERENCE_PATTERNS = [
    r'\b(?:folder|directory)\s+(?:named?|called)\s+["\']?([a-zA-Z][\w\-\.]+)["\']?',
    r'\b(?:in|from|within|inside)\s+(?:the\s+)?["\']?([a-zA-Z][\w\s\-\.]*?)["\']?\s+(?:folder|directory|dir)\b',
    r'\b(?:search|look|find)\s+(?:in|within|inside)\s+["\']?([a-zA-Z][\w\s\-\.]*?)["\']?\s',
    r'\b(?:in|from|within|inside)\s+(?:the\s+)?(?:folder|directory|dir)\s+(?!named|called)["\']?([a-zA-Z][\w\s\-\.]*?)["\']?(?:\s|$)',
]

CONTEXTUAL_FOLDER_PATTERNS = [
    r'\b(?:in\s+)?(?:that|this|the\s+same)\s+(?:folder|directory)\b',
    r'\bwhat\s+else\s+(?:is|are)\s+(?:in\s+)?there\b',
    r'\bmore\s+(?:from|in)\s+(?:that|this)\s+(?:folder|directory)?\b',
]

FOLDER_EXTRACTION_PROMPT = """Extract the folder name the user is referring to from the conversation.

Previous messages:
{history}

Current query: {query}

If you can determine which folder the user is referring to, respond with ONLY the folder name (no path, no explanation).
If no folder can be determined, respond with exactly: NONE"""


def extract_folder_reference(
    query: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """
    Extract folder name from query using regex patterns.
    Falls back to LLM for contextual references like 'that folder'.
    """
    query_lower = query.lower()

    for pattern in FOLDER_REFERENCE_PATTERNS:
        match = re.search(pattern, query_lower)
        if match:
            folder_name = match.group(1).strip()
            if folder_name and len(folder_name) >= 2:
                return folder_name

    if any(re.search(p, query_lower) for p in CONTEXTUAL_FOLDER_PATTERNS):
        return _extract_folder_from_context(query, conversation_history)

    return None


def _extract_folder_from_context(
    query: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Optional[str]:
    """Use LLM to extract folder reference from conversation context."""
    if not conversation_history:
        return None

    history_text = "\n".join(
        f"{msg['role']}: {msg['content']}"
        for msg in conversation_history[-6:]
    )

    provider = get_provider()
    messages = [
        Message(
            role="system",
            content="You extract folder names from conversations. Respond with only the folder name or NONE."
        ),
        Message(
            role="user",
            content=FOLDER_EXTRACTION_PROMPT.format(history=history_text, query=query)
        )
    ]

    response = provider.generate(messages, stream=False)
    folder_name = response.strip()

    if folder_name.upper() == "NONE" or not folder_name:
        return None
    return folder_name


def _normalize_for_matching(text: str) -> str:
    """Normalize text for folder matching (lowercase, remove separators)."""
    return text.lower().replace(" ", "").replace("-", "").replace("_", "")


def resolve_folder_to_file_paths(
    folder_name: str,
    vector_store: Optional[VectorStore] = None,
) -> List[str]:
    """
    Map folder name to list of indexed file paths.

    Args:
        folder_name: User-provided folder name (e.g., "ProjectA", "Documents")
        vector_store: VectorStore instance

    Returns:
        List of matching file paths (empty if no matches)
    """
    if vector_store is None:
        vector_store = get_vector_store()

    all_files = vector_store.get_indexed_files()
    folder_normalized = _normalize_for_matching(folder_name)

    matching_files = []
    for file_path in all_files:
        path_parts = Path(file_path).parts
        for part in path_parts:
            part_normalized = _normalize_for_matching(part)
            if folder_normalized in part_normalized or part_normalized in folder_normalized:
                matching_files.append(file_path)
                break

    return matching_files


RAG_SYSTEM_PROMPT = """You are a helpful assistant that answers questions based on the user's own local files.

CRITICAL INSTRUCTIONS:
1. Use ONLY the information provided in the document excerpts below - do not use external knowledge
2. When the user mentions a company or file name, prioritize documents from that source
   - Match names flexibly: "elililly" = "Eli Lilly" = "EliLilly_Protocol", "ucb" = "UCB"
3. Do NOT include source citations in your response - sources are displayed separately in the UI
4. If information exists in the provided documents, you MUST use it - do not claim it's missing
5. Only say "not found" if you've thoroughly checked ALL provided documents and the information truly does not exist
6. When multiple documents are provided, answer from the most relevant one based on the user's query

Keep responses concise and well-formatted using markdown."""

RAG_USER_PROMPT_TEMPLATE = """Based on the following document excerpts from my files:

{context}

---

Please answer this question: {query}"""

FILE_LISTING_PROMPT_TEMPLATE = """The user asked for files matching: {query}

I found {count} files matching your search:

{file_list}

{additional_context}"""


def get_provider(model: Optional[str] = None) -> BaseLLMProvider:
    """Get the LLM provider (always fresh from config)."""
    config = get_config()
    return get_llm_provider(config, model=model)


def _build_messages_with_history(
    system_prompt: str,
    user_prompt: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> List[Message]:
    """Build the messages array for the LLM with conversation history."""
    messages = [Message(role="system", content=system_prompt)]
    if conversation_history:
        for msg in conversation_history:
            messages.append(Message(role=msg["role"], content=msg["content"]))
    messages.append(Message(role="user", content=user_prompt))
    return messages


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
    n_results: int = 100,
    file_paths: Optional[List[str]] = None,
) -> List[Dict]:
    """Search for files whose content matches the query topic."""
    results = search_documents(query, vector_store, n_results, file_paths=file_paths)
    seen_files = {}
    for r in results:
        file_path = r["file_path"]
        if file_path not in seen_files:
            seen_files[file_path] = {
                "file_path": file_path,
                "file_name": r["file_name"],
                "relevance_score": r.get("relevance_score", r.get("rerank_score", 0.5))
            }
    return sorted(seen_files.values(), key=lambda x: x["relevance_score"], reverse=True)


def get_answer(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5,
    stream: bool = False,
    model: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> str | Generator[str, None, None]:
    """
    Get an answer to a query using RAG.

    Args:
        query: The user's question
        vector_store: Optional VectorStore instance
        n_context_results: Number of context chunks to retrieve
        stream: If True, return a generator that yields response chunks
        model: Optional model name to override config
        conversation_history: Optional list of prior messages for multi-turn context

    Returns:
        The LLM's response (or generator if streaming)
    """
    if vector_store is None:
        vector_store = get_vector_store()

    folder_filter_paths = None
    folder_name = extract_folder_reference(query, conversation_history)
    if folder_name:
        matching_paths = resolve_folder_to_file_paths(folder_name, vector_store)
        if matching_paths:
            folder_filter_paths = matching_paths

    if is_file_content_query(query):
        file_matches = search_files_by_content(query, vector_store, file_paths=folder_filter_paths)
        if file_matches:
            response = _format_file_listing_response(file_matches, query, by_content=True)
            if stream:
                return iter([response])
            else:
                return response

    if is_file_listing_query(query):
        file_matches = search_files_by_name(query, vector_store)
        if folder_filter_paths:
            folder_paths_set = set(folder_filter_paths)
            file_matches = [m for m in file_matches if m["file_path"] in folder_paths_set]
        if file_matches:
            response = _format_file_listing_response(file_matches, query)
            if stream:
                return iter([response])
            else:
                return response

    context = get_context_for_query(query, vector_store, n_context_results, folder_filter_paths)

    user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
        context=context,
        query=query
    )

    provider = get_provider(model)

    messages = _build_messages_with_history(
        RAG_SYSTEM_PROMPT, user_prompt, conversation_history
    )

    return provider.generate(messages, stream=stream)


def get_answer_with_sources(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5,
    stream: bool = False,
    model: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[Union[str, Generator[str, None, None]], List[Dict]]:
    """
    Get an answer to a query using RAG, along with the sources used.

    This ensures the sources shown to the user match the context sent to the LLM.

    Args:
        query: The user's question
        vector_store: Optional VectorStore instance
        n_context_results: Number of context chunks to retrieve
        stream: If True, return a generator that yields response chunks
        model: Optional model name to override config
        conversation_history: Optional list of prior messages for multi-turn context

    Returns:
        Tuple of (LLM response or generator, list of source dicts)
    """
    if vector_store is None:
        vector_store = get_vector_store()

    folder_filter_paths = None
    folder_name = extract_folder_reference(query, conversation_history)
    if folder_name:
        matching_paths = resolve_folder_to_file_paths(folder_name, vector_store)
        if matching_paths:
            folder_filter_paths = matching_paths

    if is_file_content_query(query):
        file_matches = search_files_by_content(query, vector_store, file_paths=folder_filter_paths)
        if file_matches:
            response = _format_file_listing_response(file_matches, query, by_content=True)
            sources = [
                {
                    "file_name": m["file_name"],
                    "file_path": m["file_path"],
                    "slide_number": 0,
                    "relevance_score": m["relevance_score"]
                }
                for m in file_matches
            ]
            if stream:
                return iter([response]), sources
            return response, sources

    if is_file_listing_query(query):
        file_matches = search_files_by_name(query, vector_store)
        if folder_filter_paths:
            folder_paths_set = set(folder_filter_paths)
            file_matches = [m for m in file_matches if m["file_path"] in folder_paths_set]
        if file_matches:
            response = _format_file_listing_response(file_matches, query)
            sources = [
                {
                    "file_name": m["file_name"],
                    "file_path": m["file_path"],
                    "slide_number": 0,
                    "relevance_score": 1.0
                }
                for m in file_matches
            ]
            if stream:
                return iter([response]), sources
            return response, sources

    context, source_results = get_context_and_sources_for_query(query, vector_store, n_context_results, folder_filter_paths)

    sources = []
    seen_files = set()
    for r in source_results:
        if r["file_path"] not in seen_files:
            sources.append({
                "file_name": r["file_name"],
                "file_path": r["file_path"],
                "slide_number": r.get("slide_number", 0),
                "relevance_score": r.get("relevance_score", r.get("rerank_score", 0.5))
            })
            seen_files.add(r["file_path"])

    user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
        context=context,
        query=query
    )

    provider = get_provider(model)

    messages = _build_messages_with_history(
        RAG_SYSTEM_PROMPT, user_prompt, conversation_history
    )

    return provider.generate(messages, stream=stream), sources


def chat(
    vector_store: Optional[VectorStore] = None,
    n_context_results: int = 5
) -> None:
    """Interactive chat loop."""
    if vector_store is None:
        vector_store = get_vector_store()

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
