from __future__ import annotations

import pytest

from backend.chat.rag_handler import (
    extract_folder_reference,
    resolve_folder_to_file_paths,
    _normalize_for_matching,
    is_new_topic_query,
    should_use_previous_sources,
    _merge_prioritizing_previous,
)


class TestNormalizeForMatching:
    def test_lowercase_conversion(self):
        assert _normalize_for_matching("ProjectA") == "projecta"

    def test_removes_spaces(self):
        assert _normalize_for_matching("My Folder") == "myfolder"

    def test_removes_dashes(self):
        assert _normalize_for_matching("project-alpha") == "projectalpha"

    def test_removes_underscores(self):
        assert _normalize_for_matching("project_beta") == "projectbeta"

    def test_combined_normalization(self):
        assert _normalize_for_matching("My Project-Name_Test") == "myprojectnametest"


class TestExtractFolderReference:
    @pytest.mark.parametrize("query,expected", [
        ("search for files in the ProjectA folder", "projecta"),
        ("find docs in Documents folder", "documents"),
        ("look inside the Reports directory", "reports"),
        ("what files are in folder named MyData", "mydata"),
        ("search within the Analysis dir", "analysis"),
    ])
    def test_explicit_folder_patterns(self, query, expected):
        result = extract_folder_reference(query)
        assert result is not None
        assert result.lower() == expected

    @pytest.mark.parametrize("query", [
        "what is the capital of France",
        "list all files",
        "search for budget documents",
        "find files named report.pdf",
    ])
    def test_no_folder_reference(self, query):
        result = extract_folder_reference(query)
        assert result is None

    def test_extracts_folder_with_quotes(self):
        result = extract_folder_reference('search in "Project Alpha" folder')
        assert result is not None

    def test_extracts_multiword_folder_name(self):
        result = extract_folder_reference("find files in My Documents folder")
        assert result is not None
        assert "my" in result.lower()


class TestResolveFolderToFilePaths:
    def test_returns_matching_files(self):
        class MockVectorStore:
            def get_indexed_files(self):
                return [
                    "/Users/test/ProjectA/file1.pdf",
                    "/Users/test/ProjectA/sub/file2.pdf",
                    "/Users/test/ProjectB/file3.pdf",
                    "/Users/test/Documents/file4.pdf",
                ]

        result = resolve_folder_to_file_paths("ProjectA", MockVectorStore())
        assert len(result) == 2
        assert all("ProjectA" in path for path in result)

    def test_case_insensitive_matching(self):
        class MockVectorStore:
            def get_indexed_files(self):
                return [
                    "/Users/test/projecta/file1.pdf",
                    "/Users/test/PROJECTA/file2.pdf",
                    "/Users/test/ProjectA/file3.pdf",
                ]

        result = resolve_folder_to_file_paths("projecta", MockVectorStore())
        assert len(result) == 3

    def test_returns_empty_list_when_no_match(self):
        class MockVectorStore:
            def get_indexed_files(self):
                return [
                    "/Users/test/Documents/file1.pdf",
                    "/Users/test/Reports/file2.pdf",
                ]

        result = resolve_folder_to_file_paths("NonexistentFolder", MockVectorStore())
        assert len(result) == 0

    def test_matches_folder_anywhere_in_path(self):
        class MockVectorStore:
            def get_indexed_files(self):
                return [
                    "/Users/test/work/ProjectA/src/file1.pdf",
                    "/Users/test/ProjectA/docs/file2.pdf",
                    "/Users/test/archive/old/ProjectA/file3.pdf",
                ]

        result = resolve_folder_to_file_paths("ProjectA", MockVectorStore())
        assert len(result) == 3

    def test_handles_folder_name_with_separators(self):
        class MockVectorStore:
            def get_indexed_files(self):
                return [
                    "/Users/test/my-project/file1.pdf",
                    "/Users/test/my_project/file2.pdf",
                    "/Users/test/MyProject/file3.pdf",
                ]

        result = resolve_folder_to_file_paths("my project", MockVectorStore())
        assert len(result) == 3


class TestIsNewTopicQuery:
    @pytest.mark.parametrize("query", [
        "search in the budget folder",
        "find files in Documents directory",
        "look in all files",
        "search every document",
        "search in the spreadsheets",
        "find files named report",
        "what files contain this",
        "list all the files",
        "give me all the files",
        "show files in the pdfs",
        "search across all documents",
    ])
    def test_detects_new_topic_queries(self, query):
        assert is_new_topic_query(query) is True

    @pytest.mark.parametrize("query", [
        "what is the revenue section",
        "tell me more about that",
        "what about exclusion criteria",
        "explain the methodology",
        "who is the principal investigator",
        "when does phase 2 start",
        "summarize the key findings",
    ])
    def test_followup_queries_not_detected_as_new_topic(self, query):
        assert is_new_topic_query(query) is False


class TestShouldUsePreviousSources:
    def test_returns_false_when_no_previous_sources(self):
        assert should_use_previous_sources("what is in this document", []) is False
        assert should_use_previous_sources("what is in this document", None) is False

    def test_returns_false_for_new_topic_with_previous_sources(self):
        previous = ["/path/to/file1.pdf", "/path/to/file2.pdf"]
        assert should_use_previous_sources("search in all files", previous) is False
        assert should_use_previous_sources("find files named report", previous) is False

    def test_returns_true_for_followup_with_previous_sources(self):
        previous = ["/path/to/file1.pdf", "/path/to/file2.pdf"]
        assert should_use_previous_sources("what is the revenue section", previous) is True
        assert should_use_previous_sources("explain the methodology", previous) is True
        assert should_use_previous_sources("summarize this", previous) is True


class TestMergePrioritizingPrevious:
    def test_prioritizes_previous_results(self):
        previous_results = [
            {"file_path": "/a/file1.pdf", "slide_number": 1, "text": "a1", "file_name": "file1.pdf"},
        ]
        full_results = [
            {"file_path": "/b/file2.pdf", "slide_number": 1, "text": "b1", "file_name": "file2.pdf"},
            {"file_path": "/a/file1.pdf", "slide_number": 2, "text": "a2", "file_name": "file1.pdf"},
            {"file_path": "/c/file3.pdf", "slide_number": 1, "text": "c1", "file_name": "file3.pdf"},
        ]
        previous_files = ["/a/file1.pdf"]

        merged = _merge_prioritizing_previous(previous_results, full_results, previous_files, 10)

        assert merged[0]["file_path"] == "/a/file1.pdf"
        assert merged[0]["slide_number"] == 1
        assert merged[1]["file_path"] == "/a/file1.pdf"
        assert merged[1]["slide_number"] == 2

    def test_deduplicates_results(self):
        previous_results = [
            {"file_path": "/a/file1.pdf", "slide_number": 1, "text": "a1", "file_name": "file1.pdf"},
        ]
        full_results = [
            {"file_path": "/a/file1.pdf", "slide_number": 1, "text": "a1", "file_name": "file1.pdf"},
            {"file_path": "/b/file2.pdf", "slide_number": 1, "text": "b1", "file_name": "file2.pdf"},
        ]
        previous_files = ["/a/file1.pdf"]

        merged = _merge_prioritizing_previous(previous_results, full_results, previous_files, 10)

        file_slide_pairs = [(r["file_path"], r["slide_number"]) for r in merged]
        assert len(file_slide_pairs) == len(set(file_slide_pairs))

    def test_respects_n_results_limit(self):
        previous_results = [
            {"file_path": f"/a/file{i}.pdf", "slide_number": 1, "text": f"a{i}", "file_name": f"file{i}.pdf"}
            for i in range(5)
        ]
        full_results = [
            {"file_path": f"/b/file{i}.pdf", "slide_number": 1, "text": f"b{i}", "file_name": f"file{i}.pdf"}
            for i in range(5)
        ]
        previous_files = [f"/a/file{i}.pdf" for i in range(5)]

        merged = _merge_prioritizing_previous(previous_results, full_results, previous_files, 3)

        assert len(merged) == 3
