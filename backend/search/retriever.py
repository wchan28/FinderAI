"""Document retrieval with hybrid search and reranking."""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from backend.db.vector_store import VectorStore
from backend.indexer.embedder import generate_embedding
from backend.providers import get_config, get_reranking_provider
from backend.providers.reranking.base import BaseRerankingProvider


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
    "elililly": ["elililly", "lilly"],
    "lilly": ["elililly", "lilly"],
    "ucb": ["ucb"],
    "incyte": ["incyte"],
}

PROTOCOL_KEYWORDS = ["protocol", "study protocol"]


def reciprocal_rank_fusion(
    ranked_lists: List[List[Tuple[str, float]]],
    k: int = 60,
) -> List[Tuple[str, float]]:
    """
    Combine multiple ranked lists using Reciprocal Rank Fusion.

    RRF_score(d) = sum(1 / (k + rank_i(d))) for all lists i

    Args:
        ranked_lists: List of ranked lists, each containing (doc_id, score) tuples
        k: RRF constant (default 60)

    Returns:
        Combined ranked list sorted by RRF score
    """
    doc_scores: Dict[str, float] = {}

    for ranked_list in ranked_lists:
        for rank, (doc_id, _) in enumerate(ranked_list, start=1):
            if doc_id not in doc_scores:
                doc_scores[doc_id] = 0.0
            doc_scores[doc_id] += 1.0 / (k + rank)

    sorted_docs = sorted(doc_scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_docs


def normalize_scores(results: List[Tuple[str, float]]) -> List[Tuple[str, float]]:
    """Min-max normalize scores to [0, 1] range."""
    if not results:
        return []

    scores = [s for _, s in results]
    min_s, max_s = min(scores), max(scores)

    if max_s == min_s:
        return [(doc_id, 1.0) for doc_id, _ in results]

    return [
        (doc_id, (score - min_s) / (max_s - min_s))
        for doc_id, score in results
    ]


def hybrid_search(
    query: str,
    vector_store: VectorStore,
    n_results: int = 50,
    file_paths: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Hybrid search combining vector similarity and BM25.

    Args:
        query: Search query
        vector_store: Vector store instance
        n_results: Number of results to return
        file_paths: Optional list of file paths to filter results

    Returns:
        List of search results with text and metadata
    """
    config = get_config()

    query_embedding = generate_embedding(query)
    if file_paths:
        vector_results = vector_store.search_with_filter(
            query_embedding,
            n_results=n_results * 2,
            file_paths=file_paths,
        )
    else:
        vector_results = vector_store.search(query_embedding, n_results=n_results * 2)

    vector_ranked = [(r["id"], 1 - r["distance"]) for r in vector_results]

    if config.hybrid_search_enabled:
        try:
            from backend.search.bm25_index import get_bm25_index
            bm25_index = get_bm25_index()

            if bm25_index.count() > 0:
                bm25_results = bm25_index.search(query, n_results=n_results * 2)

                if file_paths:
                    file_paths_set = set(file_paths)
                    bm25_results = [
                        (doc_id, score) for doc_id, score in bm25_results
                        if any(fp in doc_id for fp in file_paths_set)
                    ]

                bm25_ranked = normalize_scores(bm25_results)

                fused = reciprocal_rank_fusion([vector_ranked, bm25_ranked])

                top_ids = [doc_id for doc_id, _ in fused[:n_results]]
                id_to_rank = {doc_id: i for i, doc_id in enumerate(top_ids)}

                results_by_id = {r["id"]: r for r in vector_results}
                final_results = []
                for doc_id in top_ids:
                    if doc_id in results_by_id:
                        final_results.append(results_by_id[doc_id])

                return final_results
        except ImportError:
            pass

    return vector_results[:n_results]


def rerank_results(
    query: str,
    results: List[Dict],
    reranker: Optional[BaseRerankingProvider] = None,
    top_n: int = 10,
) -> List[Dict]:
    """
    Rerank search results using the configured reranking provider.

    Args:
        query: Search query
        results: List of search results
        reranker: Optional reranking provider (uses config if not provided)
        top_n: Number of results to return

    Returns:
        Reranked results
    """
    if not results:
        return []

    if reranker is None:
        reranker = get_reranking_provider()

    if reranker.name == "none":
        return results[:top_n]

    docs = [
        {
            "text": r.get("text", r.get("documents", [""])[0] if isinstance(r.get("documents"), list) else ""),
            **{k: v for k, v in r.items() if k != "text"},
        }
        for r in results
    ]

    reranked = reranker.rerank(query, docs, top_n=top_n)

    final_results = []
    for rr in reranked:
        result = {
            "text": rr.text,
            "rerank_score": rr.score,
            **rr.metadata,
        }
        final_results.append(result)

    return final_results


def _extract_exact_filename(query: str, indexed_files: List[str]) -> Optional[str]:
    """Extract exact filename if explicitly mentioned in query."""
    query_lower = query.lower()

    for file_path in indexed_files:
        file_name = Path(file_path).name.lower()
        file_name_no_ext = Path(file_path).stem.lower()

        if file_name in query_lower or file_name_no_ext in query_lower:
            return file_path

        normalized_name = file_name.replace("_", "").replace(" ", "").replace("-", "")
        normalized_query = query_lower.replace("_", "").replace(" ", "").replace("-", "")
        if normalized_name in normalized_query:
            return file_path

    return None


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
    """Normalize path for matching."""
    return path.lower().replace(" ", "").replace("-", "").replace("_", "")


def search_files_by_name(
    query: str,
    vector_store: Optional[VectorStore] = None
) -> List[Dict]:
    """Search indexed files by name/path pattern."""
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


def _format_search_results(results: List[Dict]) -> List[Dict]:
    """Format raw search results into the expected output format."""
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


def search_documents(
    query: str,
    vector_store: Optional[VectorStore] = None,
    n_results: int = 10,
    use_reranking: bool = True,
) -> List[Dict]:
    """
    Search indexed documents for content matching the query.

    Uses hybrid search (vector + BM25) and optional reranking.
    """
    if vector_store is None:
        vector_store = VectorStore()

    config = get_config()
    indexed_files = vector_store.get_indexed_files()

    exact_file = _extract_exact_filename(query, indexed_files)
    if exact_file:
        results = hybrid_search(
            query,
            vector_store,
            n_results=config.initial_results,
            file_paths=[exact_file],
        )
        formatted = _format_search_results(results)

        if use_reranking:
            return rerank_results(query, formatted, top_n=n_results)
        return formatted[:n_results]

    file_hints, is_protocol_query = _extract_file_hints(query)
    if file_hints:
        hint_matching_files = _get_hint_matching_files(
            vector_store, file_hints, is_protocol_query
        )
        if hint_matching_files:
            results = hybrid_search(
                query,
                vector_store,
                n_results=config.initial_results,
                file_paths=list(hint_matching_files),
            )
            formatted = _format_search_results(results)

            if use_reranking:
                return rerank_results(query, formatted, top_n=n_results)
            return formatted[:n_results]

    results = hybrid_search(
        query,
        vector_store,
        n_results=config.initial_results,
    )
    formatted = _format_search_results(results)

    if use_reranking:
        return rerank_results(query, formatted, top_n=n_results)
    return formatted[:n_results]


def _merge_and_dedupe(
    semantic_results: List[Dict],
    keyword_results: List[Dict]
) -> List[Dict]:
    """Merge results, prioritizing keyword matches first."""
    seen_ids = set()
    merged = []

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

    for r in semantic_results:
        result_id = f"{r['file_path']}::{r['slide_number']}"
        if result_id not in seen_ids:
            seen_ids.add(result_id)
            merged.append(r)

    return merged


def _get_hint_matching_files(
    vector_store: VectorStore,
    file_hints: List[str],
    is_protocol_query: bool
) -> set[str]:
    """Get files matching the file hints."""
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
    """Expand results to include adjacent pages from the same file."""
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
                    chunk['relevance_score'] = 0.9
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
    Uses hybrid search and reranking for better results.
    """
    if vector_store is None:
        vector_store = VectorStore()

    query_lower = query.lower()
    config = get_config()

    matching_section_count = sum(1 for kw in SECTION_KEYWORDS if kw in query_lower)
    if matching_section_count > 1:
        n_results = max(n_results, matching_section_count * 5)

    file_hints, is_protocol_query = _extract_file_hints(query)
    results = search_documents(query, vector_store, n_results=config.rerank_to, use_reranking=True)

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
            and search_term.lower() in r['text'].lower()
        ]
        results = _merge_and_dedupe(results, filtered_keyword_results)

    if matching_keywords and relevant_files:
        results = _expand_to_adjacent_pages(results, vector_store, relevant_files)

    if 'inclusion' in query_lower and 'exclusion' not in query_lower:
        results = [
            r for r in results
            if 'exclusion criteria' not in r.get('text', '').lower()
            or 'inclusion criteria' in r.get('text', '').lower()
        ]
    elif 'exclusion' in query_lower and 'inclusion' not in query_lower:
        results = [
            r for r in results
            if 'inclusion criteria' not in r.get('text', '').lower()
            or 'exclusion criteria' in r.get('text', '').lower()
        ]

    results = results[:n_results]

    if not results:
        return "No relevant documents found."

    results.sort(key=lambda r: (
        -r.get('relevance_score', r.get('rerank_score', 0)),
        r.get('file_path', ''),
        r.get('slide_number', 0),
        r.get('chunk_index', 0)
    ))

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
    """Get unique files that match a query, with best matching excerpt from each."""
    results = search_documents(query, vector_store, n_results)

    seen_files = {}
    for r in results:
        file_path = r["file_path"]
        if file_path not in seen_files:
            seen_files[file_path] = r

    return list(seen_files.values())
