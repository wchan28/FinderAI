from __future__ import annotations

import shutil
from pathlib import Path
from typing import List, Dict, Optional

import chromadb
from chromadb.config import Settings

_vector_store_instance: Optional["VectorStore"] = None


def get_vector_store() -> "VectorStore":
    """Get or create a singleton VectorStore instance."""
    global _vector_store_instance
    if _vector_store_instance is None or _vector_store_instance._closed:
        _vector_store_instance = VectorStore()
    return _vector_store_instance


def reset_vector_store() -> None:
    """Reset the singleton instance (for testing or after clearing data)."""
    global _vector_store_instance
    if _vector_store_instance is not None:
        _vector_store_instance.close()
        _vector_store_instance = None


class VectorStore:
    """ChromaDB wrapper for storing and searching document embeddings."""

    def __init__(self, persist_dir: str = None, expected_dimension: Optional[int] = None, auto_reset: bool = True):
        self._closed = False
        if persist_dir is None:
            from backend.db.metadata_store import get_data_dir
            persist_dir = str(get_data_dir() / "chroma_db")
        self._persist_path = Path(persist_dir)
        self._persist_path.mkdir(parents=True, exist_ok=True)

        self._init_client_with_recovery(expected_dimension, auto_reset)

    def _init_client_with_recovery(self, expected_dimension: Optional[int], auto_reset: bool) -> None:
        """Initialize ChromaDB client with automatic corruption recovery."""
        try:
            self._init_client(expected_dimension, auto_reset)
        except RuntimeError as e:
            if "Component not running" in str(e) or "not running" in str(e).lower():
                print(f"ChromaDB corruption detected, resetting database: {e}")
                self._reset_corrupted_database()
                self._init_client(expected_dimension, auto_reset)
            else:
                raise

    def _init_client(self, expected_dimension: Optional[int], auto_reset: bool) -> None:
        """Initialize the ChromaDB client and collection."""
        self.client = chromadb.PersistentClient(
            path=str(self._persist_path),
            settings=Settings(anonymized_telemetry=False)
        )

        # Auto-detect expected dimension from current embedding provider
        if expected_dimension is None and auto_reset:
            try:
                from backend.indexer.embedder import get_embedding_dimension
                expected_dimension = get_embedding_dimension()
            except Exception:
                pass

        # Check for dimension mismatch and reset if needed
        if expected_dimension is not None:
            self._check_and_reset_for_dimension(expected_dimension)

        self.collection = self.client.get_or_create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )

    def _reset_corrupted_database(self) -> None:
        """Delete and recreate corrupted ChromaDB database directory."""
        if self._persist_path.exists():
            shutil.rmtree(self._persist_path, ignore_errors=True)
        self._persist_path.mkdir(parents=True, exist_ok=True)

    def _check_and_reset_for_dimension(self, expected_dimension: int) -> None:
        """Check if existing collection has different dimensions and reset if needed."""
        try:
            existing = self.client.get_collection("documents")
            if existing.count() > 0:
                # Try to get embeddings to check dimension
                sample = existing.get(limit=1, include=["embeddings"])
                if sample["embeddings"] and len(sample["embeddings"]) > 0:
                    actual_dim = len(sample["embeddings"][0])
                    if actual_dim != expected_dimension:
                        print(f"Embedding dimension changed ({actual_dim} -> {expected_dimension}). Resetting collection...")
                        self.client.delete_collection("documents")
        except Exception:
            pass

    def reset_collection(self) -> None:
        """Delete and recreate the collection (for embedding dimension changes)."""
        try:
            self.client.delete_collection("documents")
        except Exception:
            pass
        self.collection = self.client.create_collection(
            name="documents",
            metadata={"hnsw:space": "cosine"}
        )

    def add_chunks(
        self,
        chunks: List[Dict],
        embeddings: List[List[float]]
    ) -> None:
        """
        Add chunks with their embeddings to the vector store.

        Args:
            chunks: List of chunk dicts with text, file_path, slide_number, chunk_index
            embeddings: List of embedding vectors
        """
        if not chunks or not embeddings:
            return

        ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            chunk_id = f"{chunk['file_path']}::slide{chunk['slide_number']}::chunk{chunk['chunk_index']}"
            ids.append(chunk_id)
            documents.append(chunk["text"])
            metadatas.append({
                "file_path": chunk["file_path"],
                "slide_number": chunk["slide_number"],
                "chunk_index": chunk["chunk_index"]
            })

        self.collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )

    def search(
        self,
        query_embedding: List[float],
        n_results: int = 5
    ) -> List[Dict]:
        """
        Search for similar chunks using a query embedding.

        Returns list of results with text, metadata, and distance.
        """
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["documents", "metadatas", "distances"]
        )

        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                search_results.append({
                    "id": doc_id,
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "distance": results["distances"][0][i]
                })

        return search_results

    def search_with_filter(
        self,
        query_embedding: List[float],
        n_results: int = 5,
        file_paths: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Search for similar chunks with optional file path filtering.

        Pre-filters by file_path BEFORE semantic search for better relevance
        when user specifies a particular document.
        """
        where_filter = None
        if file_paths:
            if len(file_paths) == 1:
                where_filter = {"file_path": file_paths[0]}
            else:
                where_filter = {"file_path": {"$in": file_paths}}

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where_filter,
            include=["documents", "metadatas", "distances"]
        )

        search_results = []
        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                search_results.append({
                    "id": doc_id,
                    "text": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "distance": results["distances"][0][i]
                })

        return search_results

    def delete_by_file(self, file_path: str) -> None:
        """Delete all chunks associated with a file path."""
        results = self.collection.get(
            where={"file_path": file_path},
            include=[]
        )

        if results["ids"]:
            self.collection.delete(ids=results["ids"])

    def get_indexed_files(self) -> List[str]:
        """Get list of all unique file paths in the index."""
        results = self.collection.get(include=["metadatas"])

        file_paths = set()
        if results["metadatas"]:
            for metadata in results["metadatas"]:
                if metadata and "file_path" in metadata:
                    file_paths.add(metadata["file_path"])

        return list(file_paths)

    def count(self) -> int:
        """Return the total number of chunks in the collection."""
        return self.collection.count()

    def clear(self) -> None:
        """Clear all data from the vector store."""
        self.reset_collection()

    def search_by_text(self, search_text: str, limit: int = 5) -> List[Dict]:
        """
        Search for chunks containing specific text (case-insensitive).

        Tries multiple case variants since ChromaDB $contains is case-sensitive.
        """
        seen_ids = set()
        search_results = []

        variants = [
            search_text,
            search_text.lower(),
            search_text.upper(),
            search_text.title(),
        ]

        for variant in variants:
            results = self.collection.get(
                where_document={"$contains": variant},
                include=["documents", "metadatas"],
                limit=limit
            )

            if results["ids"]:
                for i, doc_id in enumerate(results["ids"]):
                    if doc_id not in seen_ids:
                        seen_ids.add(doc_id)
                        search_results.append({
                            "id": doc_id,
                            "text": results["documents"][i],
                            "metadata": results["metadatas"][i],
                            "distance": 0.0
                        })

            if len(search_results) >= limit:
                break

        return search_results[:limit]

    def get_chunks_by_file_and_page(
        self,
        file_path: str,
        page_number: int
    ) -> List[Dict]:
        """
        Get all chunks from a specific file and page/slide number.

        Args:
            file_path: Path to the file
            page_number: Page or slide number

        Returns:
            List of chunks with text and metadata
        """
        results = self.collection.get(
            where={
                "$and": [
                    {"file_path": file_path},
                    {"slide_number": page_number}
                ]
            },
            include=["documents", "metadatas"]
        )

        chunks = []
        if results["ids"]:
            for i, doc_id in enumerate(results["ids"]):
                chunks.append({
                    "id": doc_id,
                    "text": results["documents"][i],
                    "metadata": results["metadatas"][i],
                    "file_path": file_path,
                    "file_name": Path(file_path).name,
                    "slide_number": page_number,
                    "relevance_score": 1.0
                })

        return chunks

    def close(self) -> None:
        """Properly close ChromaDB connection to prevent SIGABRT crashes."""
        if self._closed:
            return
        self._closed = True
        if hasattr(self, 'client') and self.client is not None:
            try:
                # ChromaDB PersistentClient uses sqlite3 internally
                # Force cleanup of any pending operations
                if hasattr(self.client, '_system'):
                    self.client._system.stop()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False
