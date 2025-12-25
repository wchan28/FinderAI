"""Cohere reranking provider implementation."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.providers.reranking.base import BaseRerankingProvider, RerankResult


COHERE_RERANK_MODELS = [
    "rerank-v4.0",
    "rerank-v4.0-fast",
    "rerank-v3.5",
    "rerank-english-v3.0",
    "rerank-multilingual-v3.0",
]


class CohereRerankingProvider(BaseRerankingProvider):
    """Reranking provider using Cohere Rerank API."""

    def __init__(self, api_key: str, model: str = "rerank-v4.0"):
        self._api_key = api_key
        self._model = model
        self._client = None

    def _get_client(self):
        """Lazy-load Cohere client."""
        if self._client is None:
            import cohere
            self._client = cohere.ClientV2(api_key=self._api_key)
        return self._client

    @property
    def name(self) -> str:
        return "cohere"

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int = 10,
    ) -> List[RerankResult]:
        if not documents:
            return []

        client = self._get_client()

        texts = [doc.get("text", "") for doc in documents]

        response = client.rerank(
            query=query,
            documents=texts,
            model=self._model,
            top_n=min(top_n, len(documents)),
        )

        results = []
        for item in response.results:
            original_doc = documents[item.index]
            results.append(RerankResult(
                text=original_doc.get("text", ""),
                score=item.relevance_score,
                metadata={k: v for k, v in original_doc.items() if k != "text"},
                original_index=item.index,
            ))

        return results

    def is_available(self) -> bool:
        """Check if API key is configured."""
        return bool(self._api_key)
