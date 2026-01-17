from __future__ import annotations

import pytest

from backend.chat.rag_handler import (
    extract_folder_reference,
    resolve_folder_to_file_paths,
    _normalize_for_matching,
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
