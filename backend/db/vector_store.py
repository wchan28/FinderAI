from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Optional

import chromadb
from chromadb.config import Settings


class VectorStore:
    """ChromaDB wrapper for storing and searching document embeddings."""

    def __init__(self, persist_dir: str = "./data/chroma_db"):
        persist_path = Path(persist_dir)
        persist_path.mkdir(parents=True, exist_ok=True)

        self.client = chromadb.PersistentClient(
            path=str(persist_path),
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
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

    def search_by_text(self, search_text: str, limit: int = 5) -> List[Dict]:
        """
        Search for chunks containing specific text.

        Args:
            search_text: Text to search for in document content
            limit: Maximum number of results to return

        Returns:
            List of matching chunks with text and metadata
        """
        results = self.collection.get(
            where_document={"$contains": search_text},
            include=["documents", "metadatas"],
            limit=limit
        )

        search_results = []
        if results["ids"]:
            for i, doc_id in enumerate(results["ids"]):
                search_results.append({
                    "id": doc_id,
                    "text": results["documents"][i],
                    "metadata": results["metadatas"][i],
                    "distance": 0.0
                })

        return search_results

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
