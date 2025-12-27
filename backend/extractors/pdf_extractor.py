from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Union, TypedDict


from pypdf import PdfReader


class ExtractionResult(TypedDict):
    content: List[Dict]
    skip_reason: str | None


def extract_text_from_pdf(file_path: Union[str, Path]) -> ExtractionResult:
    """
    Extract text from a PDF file.

    Returns a dict with:
    - content: list of page dicts [{"page_number": 1, "text": "..."}, ...]
    - skip_reason: None if successful, or a reason string if skipped
    """
    file_path = Path(file_path)
    reader = PdfReader(file_path)

    if len(reader.pages) == 0:
        return {"content": [], "skip_reason": "empty file"}

    pages_content = []
    pages_with_images = 0

    for page_index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text()

        if page.images:
            pages_with_images += 1

        if page_text and page_text.strip():
            pages_content.append({
                "page_number": page_index,
                "text": page_text.strip()
            })

    if not pages_content:
        if pages_with_images > 0:
            return {"content": [], "skip_reason": "scanned image"}
        return {"content": [], "skip_reason": "empty file"}

    return {"content": pages_content, "skip_reason": None}


def extract_full_text_from_pdf(file_path: Union[str, Path]) -> str:
    """
    Extract all text from a PDF file as a single string.
    Includes page markers for context.
    """
    result = extract_text_from_pdf(file_path)
    pages = result["content"]

    full_text_parts = []
    for page in pages:
        full_text_parts.append(f"[Page {page['page_number']}]\n{page['text']}")

    return "\n\n".join(full_text_parts)
