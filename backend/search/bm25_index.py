"""BM25 index for keyword-based search."""

from __future__ import annotations

import pickle
import re
from pathlib import Path
from typing import List, Tuple, Optional

from rank_bm25 import BM25Okapi


class BM25Index:
    """BM25 index for keyword-based document retrieval."""

    def __init__(self, persist_path: str = "./data/bm25_index.pkl"):
        self._persist_path = Path(persist_path)
        self._persist_path.parent.mkdir(parents=True, exist_ok=True)

        self._documents: List[List[str]] = []
        self._doc_ids: List[str] = []
        self._doc_texts: List[str] = []
        self._bm25: Optional[BM25Okapi] = None

        self._load()

    def _tokenize(self, text: str) -> List[str]:
        """Tokenize text for BM25."""
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        tokens = text.split()
        return [t for t in tokens if len(t) >= 2]

    def add_documents(
        self,
        doc_ids: List[str],
        texts: List[str],
    ) -> None:
        """Add documents to the index."""
        for doc_id, text in zip(doc_ids, texts):
            if doc_id not in self._doc_ids:
                tokenized = self._tokenize(text)
                self._documents.append(tokenized)
                self._doc_ids.append(doc_id)
                self._doc_texts.append(text)

        if self._documents:
            self._bm25 = BM25Okapi(self._documents)
        self._save()

    def remove_documents(self, doc_ids: List[str]) -> None:
        """Remove documents from the index."""
        ids_to_remove = set(doc_ids)
        new_documents = []
        new_doc_ids = []
        new_doc_texts = []

        for i, doc_id in enumerate(self._doc_ids):
            if doc_id not in ids_to_remove:
                new_documents.append(self._documents[i])
                new_doc_ids.append(doc_id)
                new_doc_texts.append(self._doc_texts[i])

        self._documents = new_documents
        self._doc_ids = new_doc_ids
        self._doc_texts = new_doc_texts

        if self._documents:
            self._bm25 = BM25Okapi(self._documents)
        else:
            self._bm25 = None

        self._save()

    def search(
        self,
        query: str,
        n_results: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Search for documents matching the query.

        Returns list of (doc_id, score) tuples sorted by score descending.
        """
        if not self._bm25 or not self._documents:
            return []

        tokenized_query = self._tokenize(query)
        if not tokenized_query:
            return []

        scores = self._bm25.get_scores(tokenized_query)

        scored_docs = list(zip(self._doc_ids, scores))
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        return scored_docs[:n_results]

    def get_document_text(self, doc_id: str) -> Optional[str]:
        """Get the original text for a document ID."""
        try:
            idx = self._doc_ids.index(doc_id)
            return self._doc_texts[idx]
        except ValueError:
            return None

    def clear(self) -> None:
        """Clear all documents from the index."""
        self._documents = []
        self._doc_ids = []
        self._doc_texts = []
        self._bm25 = None
        self._save()

    def count(self) -> int:
        """Return the number of documents in the index."""
        return len(self._doc_ids)

    def _save(self) -> None:
        """Save the index to disk."""
        data = {
            "documents": self._documents,
            "doc_ids": self._doc_ids,
            "doc_texts": self._doc_texts,
        }
        with open(self._persist_path, "wb") as f:
            pickle.dump(data, f)

    def _load(self) -> None:
        """Load the index from disk."""
        if not self._persist_path.exists():
            return

        try:
            with open(self._persist_path, "rb") as f:
                data = pickle.load(f)

            self._documents = data.get("documents", [])
            self._doc_ids = data.get("doc_ids", [])
            self._doc_texts = data.get("doc_texts", [])

            if self._documents:
                self._bm25 = BM25Okapi(self._documents)
        except Exception:
            pass


_bm25_index: Optional[BM25Index] = None


def get_bm25_index() -> BM25Index:
    """Get or create the global BM25 index."""
    global _bm25_index
    if _bm25_index is None:
        _bm25_index = BM25Index()
    return _bm25_index


def reset_bm25_index() -> None:
    """Reset the global BM25 index."""
    global _bm25_index
    _bm25_index = None
