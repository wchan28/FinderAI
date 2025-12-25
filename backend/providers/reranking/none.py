"""No-op reranking provider (pass-through)."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.providers.reranking.base import BaseRerankingProvider, RerankResult


class NoopRerankingProvider(BaseRerankingProvider):
    """No-op reranking provider that returns documents as-is."""

    @property
    def name(self) -> str:
        return "none"

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int = 10,
    ) -> List[RerankResult]:
        """Return documents unchanged, truncated to top_n."""
        results = []
        for i, doc in enumerate(documents[:top_n]):
            results.append(RerankResult(
                text=doc.get("text", ""),
                score=doc.get("relevance_score", 1.0 - i * 0.01),
                metadata={k: v for k, v in doc.items() if k != "text"},
                original_index=i,
            ))
        return results

    def is_available(self) -> bool:
        """Always available."""
        return True
