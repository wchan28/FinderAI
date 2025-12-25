"""Base class for reranking providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class RerankResult:
    """Result from reranking."""

    text: str
    score: float
    metadata: Dict[str, Any]
    original_index: int


class BaseRerankingProvider(ABC):
    """Abstract base class for reranking providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the provider name."""
        pass

    @abstractmethod
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int = 10,
    ) -> List[RerankResult]:
        """
        Rerank documents based on relevance to query.

        Args:
            query: The search query
            documents: List of documents with 'text' and optional metadata
            top_n: Number of top results to return

        Returns:
            List of RerankResult sorted by relevance (highest first)
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the provider is available and configured."""
        pass
