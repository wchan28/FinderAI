from __future__ import annotations

from typing import List, Dict


CHUNK_SIZE = 800
CHUNK_OVERLAP = 200


def chunk_text(
    text: str,
    file_path: str,
    location_number: int = 0,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP
) -> List[Dict]:
    """
    Split text into overlapping chunks for embedding.

    Returns a list of chunk dicts:
    [
        {
            "text": "chunk content...",
            "file_path": "/path/to/file.pptx",
            "slide_number": 1,
            "chunk_index": 0
        },
    ]
    """
    if not text.strip():
        return []

    words = text.split()
    total_words = len(words)

    if total_words <= chunk_size:
        return [{
            "text": text,
            "file_path": file_path,
            "slide_number": location_number,
            "chunk_index": 0
        }]

    chunks = []
    start = 0
    chunk_index = 0

    while start < total_words:
        end = min(start + chunk_size, total_words)

        chunk_words = words[start:end]
        chunk_text_content = " ".join(chunk_words)

        chunks.append({
            "text": chunk_text_content,
            "file_path": file_path,
            "slide_number": location_number,
            "chunk_index": chunk_index
        })

        if end >= total_words:
            break

        start = end - chunk_overlap
        chunk_index += 1

    return chunks


def chunk_document(
    content: List[Dict],
    file_path: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP
) -> List[Dict]:
    """
    Chunk an entire document (list of pages/slides) into chunks.

    Args:
        content: List of dicts with 'text' and either 'slide_number' or 'page_number'
        file_path: Path to the source file
        chunk_size: Maximum words per chunk
        chunk_overlap: Words to overlap between chunks

    Returns:
        List of chunk dicts with metadata
    """
    all_chunks = []

    for item in content:
        location_number = item.get("slide_number") or item.get("page_number", 0)
        item_chunks = chunk_text(
            text=item["text"],
            file_path=file_path,
            location_number=location_number,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap
        )
        all_chunks.extend(item_chunks)

    return all_chunks
