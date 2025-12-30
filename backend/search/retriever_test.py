from __future__ import annotations

import pytest

from backend.search.retriever import (
    _expand_to_adjacent_pages,
    SECTION_KEYWORDS,
)


class TestSectionKeywords:
    def test_includes_exclusion(self):
        assert "exclusion" in SECTION_KEYWORDS
        assert SECTION_KEYWORDS["exclusion"] == "Exclusion Criteria"

    def test_includes_inclusion(self):
        assert "inclusion" in SECTION_KEYWORDS
        assert SECTION_KEYWORDS["inclusion"] == "Inclusion Criteria"


class TestExpandToAdjacentPages:
    def test_returns_original_results_when_no_relevant_files(self):
        results = [
            {"file_path": "/path/file.pdf", "slide_number": 5, "text": "content"}
        ]
        relevant_files = set()

        class MockVectorStore:
            def get_chunks_by_file_and_page(self, file_path, page_number):
                return []

        expanded = _expand_to_adjacent_pages(results, MockVectorStore(), relevant_files)
        assert len(expanded) == 1

    def test_expands_to_adjacent_pages_within_range(self):
        results = [
            {"file_path": "/path/file.pdf", "slide_number": 27, "text": "content"}
        ]
        relevant_files = {"/path/file.pdf"}

        class MockVectorStore:
            def get_chunks_by_file_and_page(self, file_path, page_number):
                if page_number in [25, 26, 28, 29]:
                    return [{
                        "id": f"{file_path}::slide{page_number}",
                        "text": f"page {page_number} content",
                        "metadata": {"file_path": file_path, "slide_number": page_number},
                        "file_path": file_path,
                        "file_name": "file.pdf",
                        "slide_number": page_number,
                        "relevance_score": 1.0
                    }]
                return []

        expanded = _expand_to_adjacent_pages(results, MockVectorStore(), relevant_files)
        assert len(expanded) == 5
        page_numbers = {r.get("slide_number") for r in expanded}
        assert page_numbers == {25, 26, 27, 28, 29}

    def test_does_not_duplicate_existing_pages(self):
        results = [
            {"file_path": "/path/file.pdf", "slide_number": 26, "text": "page 26"},
            {"file_path": "/path/file.pdf", "slide_number": 27, "text": "page 27"},
        ]
        relevant_files = {"/path/file.pdf"}

        class MockVectorStore:
            def get_chunks_by_file_and_page(self, file_path, page_number):
                return [{
                    "id": f"{file_path}::slide{page_number}",
                    "text": f"page {page_number}",
                    "metadata": {"file_path": file_path, "slide_number": page_number},
                    "file_path": file_path,
                    "file_name": "file.pdf",
                    "slide_number": page_number,
                    "relevance_score": 1.0
                }]

        expanded = _expand_to_adjacent_pages(results, MockVectorStore(), relevant_files)
        page_numbers = [r.get("slide_number") for r in expanded]
        assert page_numbers.count(26) == 1
        assert page_numbers.count(27) == 1
