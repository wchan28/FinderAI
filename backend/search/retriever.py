from __future__ import annotations

import re
from pathlib import Path
from typing import List, Dict, Optional

from backend.db.vector_store import VectorStore
from backend.indexer.embedder import generate_embedding


SECTION_KEYWORDS = {
    "exclusion": "Exclusion Criteria",
    "inclusion": "Inclusion Criteria",
    "contraindication": "Contraindication",
    "adverse": "Adverse Event",
    "endpoint": "Endpoint",
    "dosing": "Dosing",
    "schedule": "Schedule",
}

FILE_HINTS = {
    "eli lilly": ["elililly", "lilly"],
    "lilly": ["elililly", "lilly"],
    "ucb": ["ucb"],
    "incyte": ["incyte"],
}

PROTOCOL_KEYWORDS = ["protocol", "study protocol"]


def _extract_file_hints(query: str) -> tuple[List[str], bool]:
    """Extract file hints and whether user is asking for a protocol document."""
    query_lower = query.lower()
    hints = []
    is_protocol_query = any(kw in query_lower for kw in PROTOCOL_KEYWORDS)

    for name, patterns in FILE_HINTS.items():
        if name in query_lower:
            for p in patterns:
                if p not in hints:
                    hints.append(p)

    return hints, is_protocol_query


def _filter_results_by_file_hint(
    results: List[Dict],
    hints: List[str],
    is_protocol_query: bool = False,
    min_results: int = 3
) -> List[Dict]:
    """Filter results to prioritize files matching hints."""
    if not hints:
        return results

    matching = []
    non_matching = []

    for r in results:
        file_path_lower = r['file_path'].lower().replace(" ", "").replace("_", "")
        if any(hint in file_path_lower for hint in hints):
            matching.append(r)
        else:
            non_matching.append(r)

    if is_protocol_query and matching:
        protocol_matches = [r for r in matching if "protocol" in r['file_path'].lower()]
        if protocol_matches:
            matching = protocol_matches

    if len(matching) >= min_results:
        return matching
    return matching + non_matching[:min_results - len(matching)]


def _extract_search_terms(query: str) -> List[str]:
    """Extract search terms from query, handling camelCase/PascalCase."""
    terms = []
    for word in query.split():
        if len(word) <= 2:
            continue
        terms.append(word.lower())
        camel_split = re.sub(r'([a-z])([A-Z])', r'\1 \2', word).split()
        for t in camel_split:
            t_lower = t.lower()
            if len(t_lower) >= 2 and t_lower not in terms:
                terms.append(t_lower)
    return terms


def _normalize_path(path: str) -> str:
    """Normalize path for matching by removing spaces and lowercasing."""
    return path.lower().replace(" ", "").replace("-", "").replace("_", "")


def search_files_by_name(
    query: str,
    vector_store: Optional[VectorStore] = None
) -> List[Dict]:
    """
    Search indexed files by name/path pattern.

    Returns list of files whose path contains any query term.
    Handles camelCase like "incyteHS" -> searches for "incyte" and "hs".
    Also handles concatenated terms like "incytehs" matching "Incyte HS".
    """
    if vector_store is None:
        vector_store = VectorStore()

    all_files = vector_store.get_indexed_files()
    query_terms = _extract_search_terms(query)
    skip_terms = {'give', 'all', 'files', 'file', 'show', 'list', 'find', 'get', 'the', 'and', 'for'}
    query_terms = [t for t in query_terms if t not in skip_terms]

    matches = []
    for file_path in all_files:
        path_lower = file_path.lower()
        path_normalized = _normalize_path(file_path)
        if any(term in path_lower or term in path_normalized for term in query_terms):
            matches.append({
                "file_path": file_path,
                "file_name": Path(file_path).name
            })

    return matches


def search_documents(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 10
) -> List[Dict]:
    """
    Search indexed documents for content matching the query.

    Returns list of results with text, file info, and relevance score.
    If query mentions a specific file/protocol name, results are filtered
    to prioritize matching files.
    """
    if vector_store is None:
        vector_store = VectorStore()

    file_hints, is_protocol_query = _extract_file_hints(query)
    search_n = n_results * 3 if file_hints else n_results

    query_embedding = generate_embedding(query)
    results = vector_store.search(query_embedding, n_results=search_n)

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

    if file_hints:
        formatted_results = _filter_results_by_file_hint(
            formatted_results, file_hints, is_protocol_query, min_results=n_results
        )

    return formatted_results[:n_results]


def _merge_and_dedupe(
    semantic_results: List[Dict],
    keyword_results: List[Dict]
) -> List[Dict]:
    """Merge semantic and keyword results, removing duplicates."""
    seen_ids = set()
    merged = []

    for r in semantic_results:
        result_id = f"{r['file_path']}::{r['slide_number']}"
        if result_id not in seen_ids:
            seen_ids.add(result_id)
            merged.append(r)

    for r in keyword_results:
        file_path = r["metadata"]["file_path"]
        slide_number = r["metadata"]["slide_number"]
        result_id = f"{file_path}::{slide_number}"
        if result_id not in seen_ids:
            seen_ids.add(result_id)
            merged.append({
                "text": r["text"],
                "file_path": file_path,
                "file_name": Path(file_path).name,
                "slide_number": slide_number,
                "relevance_score": 1.0
            })

    return merged


def _get_hint_matching_files(
    vector_store: VectorStore,
    file_hints: List[str],
    is_protocol_query: bool
) -> set[str]:
    """Get files matching the file hints, prioritizing protocol files if requested."""
    all_files = vector_store.get_indexed_files()
    hint_matching_files = set()

    for f in all_files:
        path_lower = f.lower().replace(" ", "").replace("_", "")
        if any(hint in path_lower for hint in file_hints):
            if is_protocol_query:
                if "protocol" in f.lower():
                    hint_matching_files.add(f)
            else:
                hint_matching_files.add(f)

    return hint_matching_files


def _expand_to_adjacent_pages(
    results: List[Dict],
    vector_store: VectorStore,
    relevant_files: set[str],
    expansion_range: int = 2
) -> List[Dict]:
    """
    Expand results to include adjacent pages from the same file.

    This helps capture content that spans multiple pages, like inclusion/exclusion
    criteria sections that may span pages 26-28.
    """
    expanded = list(results)
    seen_ids = set()

    for r in results:
        file_path = r.get('file_path') or r.get('metadata', {}).get('file_path')
        page_num = r.get('slide_number') or r.get('metadata', {}).get('slide_number', 0)
        seen_ids.add(f"{file_path}::{page_num}")

    for r in results:
        file_path = r.get('file_path') or r.get('metadata', {}).get('file_path')
        if file_path not in relevant_files:
            continue

        page_num = r.get('slide_number') or r.get('metadata', {}).get('slide_number', 0)

        for offset in range(-expansion_range, expansion_range + 1):
            if offset == 0:
                continue
            adjacent_page = page_num + offset
            if adjacent_page < 1:
                continue

            chunk_id = f"{file_path}::{adjacent_page}"
            if chunk_id in seen_ids:
                continue

            adjacent_chunks = vector_store.get_chunks_by_file_and_page(file_path, adjacent_page)
            for chunk in adjacent_chunks:
                if chunk_id not in seen_ids:
                    seen_ids.add(chunk_id)
                    expanded.append(chunk)

    return expanded


def get_context_for_query(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 10
) -> str:
    """
    Get formatted context string for RAG prompt.

    Combines semantic search with keyword-based search for section headers.
    When file hints are present, keyword search is expanded to ALL files
    matching the hints, not just files from semantic search results.
    Also expands to adjacent pages to capture content spanning multiple pages.
    """
    if vector_store is None:
        vector_store = VectorStore()

    query_lower = query.lower()

    matching_section_count = sum(1 for kw in SECTION_KEYWORDS if kw in query_lower)
    if matching_section_count > 1:
        n_results = max(n_results, matching_section_count * 5)

    file_hints, is_protocol_query = _extract_file_hints(query)
    results = search_documents(query, vector_store, n_results)

    if file_hints:
        hint_matching_files = _get_hint_matching_files(
            vector_store, file_hints, is_protocol_query
        )
        relevant_files = hint_matching_files if hint_matching_files else {r['file_path'] for r in results}
    else:
        relevant_files = {r['file_path'] for r in results}

    matching_keywords = [
        (keyword, search_term)
        for keyword, search_term in SECTION_KEYWORDS.items()
        if keyword in query_lower
    ]

    for keyword, search_term in matching_keywords:
        keyword_results = vector_store.search_by_text(search_term, limit=20)
        filtered_keyword_results = [
            r for r in keyword_results
            if r['metadata']['file_path'] in relevant_files
        ]
        results = _merge_and_dedupe(results, filtered_keyword_results)

    if matching_keywords and relevant_files:
        results = _expand_to_adjacent_pages(results, vector_store, relevant_files)

    if not results:
        return "No relevant documents found."

    results.sort(key=lambda r: (r.get('file_path', ''), r.get('slide_number', 0), r.get('chunk_index', 0)))

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
