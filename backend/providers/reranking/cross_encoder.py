"""Cross-encoder reranking provider implementation."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.providers.reranking.base import BaseRerankingProvider, RerankResult


class CrossEncoderRerankingProvider(BaseRerankingProvider):
    """Reranking provider using local cross-encoder model."""

    def __init__(self, model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
        self._model_name = model
        self._model = None

    def _get_model(self):
        """Lazy-load cross-encoder model."""
        if self._model is None:
            from sentence_transformers import CrossEncoder
            self._model = CrossEncoder(self._model_name)
        return self._model

    @property
    def name(self) -> str:
        return "cross_encoder"

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int = 10,
    ) -> List[RerankResult]:
        if not documents:
            return []

        model = self._get_model()

        pairs = [(query, doc.get("text", "")) for doc in documents]

        batch_size = 32
        all_scores = []
        for i in range(0, len(pairs), batch_size):
            batch = pairs[i:i + batch_size]
            scores = model.predict(batch)
            all_scores.extend(scores)

        scored_docs = list(zip(documents, all_scores, range(len(documents))))
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        results = []
        for doc, score, orig_idx in scored_docs[:top_n]:
            results.append(RerankResult(
                text=doc.get("text", ""),
                score=float(score),
                metadata={k: v for k, v in doc.items() if k != "text"},
                original_index=orig_idx,
            ))

        return results

    def is_available(self) -> bool:
        """Check if sentence-transformers is available."""
        try:
            from sentence_transformers import CrossEncoder
            return True
        except ImportError:
            return False
