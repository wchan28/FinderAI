"""LLM-based reranking provider implementation."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, TYPE_CHECKING

from backend.providers.reranking.base import BaseRerankingProvider, RerankResult

if TYPE_CHECKING:
    from backend.providers.llm.base import BaseLLMProvider


LLM_RERANK_PROMPT = """Rate the relevance of each document to the query on a scale of 0-10.
Higher scores mean more relevant to answering the query.

Query: {query}

Documents:
{documents}

Return ONLY a JSON array of scores in order, like: [8, 3, 7, 5, ...]
Do not include any other text, just the JSON array."""


class LLMRerankingProvider(BaseRerankingProvider):
    """Reranking provider using an LLM to score document relevance."""

    def __init__(self, llm_provider: "BaseLLMProvider"):
        self._llm = llm_provider

    @property
    def name(self) -> str:
        return "llm"

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int = 10,
    ) -> List[RerankResult]:
        if not documents:
            return []

        max_docs = 20
        docs_to_rank = documents[:max_docs]

        doc_text = "\n\n".join(
            f"[{i+1}] {doc.get('text', '')[:500]}..."
            for i, doc in enumerate(docs_to_rank)
        )

        prompt = LLM_RERANK_PROMPT.format(query=query, documents=doc_text)

        from backend.providers.llm.base import Message
        response = self._llm.generate([Message(role="user", content=prompt)])

        scores = self._parse_scores(response, len(docs_to_rank))

        scored_docs = list(zip(docs_to_rank, scores, range(len(docs_to_rank))))
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        results = []
        for doc, score, orig_idx in scored_docs[:top_n]:
            results.append(RerankResult(
                text=doc.get("text", ""),
                score=score / 10.0,
                metadata={k: v for k, v in doc.items() if k != "text"},
                original_index=orig_idx,
            ))

        return results

    def _parse_scores(self, response: str, expected_count: int) -> List[float]:
        """Parse scores from LLM response."""
        try:
            json_match = re.search(r'\[[\d\s,\.]+\]', response)
            if json_match:
                scores = json.loads(json_match.group())
                if len(scores) >= expected_count:
                    return [float(s) for s in scores[:expected_count]]
        except (json.JSONDecodeError, ValueError):
            pass

        return [5.0] * expected_count

    def is_available(self) -> bool:
        """Check if the underlying LLM is available."""
        return self._llm.is_available()
