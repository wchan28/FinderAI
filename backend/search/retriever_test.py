from __future__ import annotations

import pytest

from backend.search.retriever import (
    _extract_file_hints,
    _filter_results_by_file_hint,
    _get_hint_matching_files,
    _expand_to_adjacent_pages,
    PROTOCOL_KEYWORDS,
    FILE_HINTS,
    SECTION_KEYWORDS,
)


class TestExtractFileHints:
    def test_returns_hints_and_protocol_flag_tuple(self):
        result = _extract_file_hints("eli lilly protocol")
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_extracts_eli_lilly_hints(self):
        hints, is_protocol = _extract_file_hints("eli lilly protocol")
        assert "elililly" in hints
        assert "lilly" in hints

    def test_detects_protocol_keyword(self):
        _, is_protocol = _extract_file_hints("eli lilly protocol")
        assert is_protocol is True

    def test_no_protocol_keyword_when_not_mentioned(self):
        _, is_protocol = _extract_file_hints("eli lilly all visits")
        assert is_protocol is False

    def test_extracts_ucb_hints(self):
        hints, _ = _extract_file_hints("ucb study")
        assert "ucb" in hints

    def test_extracts_incyte_hints(self):
        hints, _ = _extract_file_hints("incyte protocol")
        assert "incyte" in hints

    def test_empty_hints_for_unknown_company(self):
        hints, _ = _extract_file_hints("some random query")
        assert hints == []

    def test_case_insensitive_matching(self):
        hints, is_protocol = _extract_file_hints("ELI LILLY PROTOCOL")
        assert "elililly" in hints
        assert is_protocol is True


class TestFilterResultsByFileHint:
    @pytest.fixture
    def sample_results(self):
        return [
            {"file_path": "/path/EliLilly_Protocol.pdf", "text": "content1"},
            {"file_path": "/path/elililly_allothervisits_edited_final.pdf", "text": "content2"},
            {"file_path": "/path/UCB_Protocol.pdf", "text": "content3"},
            {"file_path": "/path/random_document.pdf", "text": "content4"},
        ]

    def test_returns_all_results_when_no_hints(self, sample_results):
        result = _filter_results_by_file_hint(sample_results, hints=[])
        assert len(result) == 4

    def test_filters_to_matching_files(self, sample_results):
        result = _filter_results_by_file_hint(
            sample_results, hints=["elililly", "lilly"], min_results=2
        )
        assert all("lilly" in r["file_path"].lower() for r in result[:2])

    def test_prioritizes_protocol_files_when_protocol_query(self, sample_results):
        result = _filter_results_by_file_hint(
            sample_results,
            hints=["elililly", "lilly"],
            is_protocol_query=True,
            min_results=1
        )
        assert "protocol" in result[0]["file_path"].lower()
        assert "elililly" in result[0]["file_path"].lower().replace("_", "")

    def test_includes_non_protocol_lilly_files_when_not_protocol_query(self, sample_results):
        result = _filter_results_by_file_hint(
            sample_results,
            hints=["elililly", "lilly"],
            is_protocol_query=False,
            min_results=2
        )
        file_names = [r["file_path"] for r in result]
        lilly_files = [f for f in file_names if "lilly" in f.lower()]
        assert len(lilly_files) == 2

    def test_falls_back_to_non_matching_if_not_enough_results(self, sample_results):
        limited_results = [sample_results[2], sample_results[3]]
        result = _filter_results_by_file_hint(
            limited_results,
            hints=["elililly", "lilly"],
            min_results=2
        )
        assert len(result) == 2


class TestProtocolKeywordsConstant:
    def test_protocol_keywords_includes_protocol(self):
        assert "protocol" in PROTOCOL_KEYWORDS

    def test_protocol_keywords_includes_study_protocol(self):
        assert "study protocol" in PROTOCOL_KEYWORDS


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
