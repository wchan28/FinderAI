from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Union

from pypdf import PdfReader


def extract_text_from_pdf(file_path: Union[str, Path]) -> List[Dict]:
    """
    Extract text from a PDF file.

    Returns a list of dicts, one per page:
    [
        {"page_number": 1, "text": "page content..."},
        {"page_number": 2, "text": "page content..."},
    ]
    """
    file_path = Path(file_path)
    reader = PdfReader(file_path)

    pages_content = []

    for page_index, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text()

        if page_text and page_text.strip():
            pages_content.append({
                "page_number": page_index,
                "text": page_text.strip()
            })

    return pages_content


def extract_full_text_from_pdf(file_path: Union[str, Path]) -> str:
    """
    Extract all text from a PDF file as a single string.
    Includes page markers for context.
    """
    pages = extract_text_from_pdf(file_path)

    full_text_parts = []
    for page in pages:
        full_text_parts.append(f"[Page {page['page_number']}]\n{page['text']}")

    return "\n\n".join(full_text_parts)
