#!/usr/bin/env python3
"""
FinderAI - Search your local files with natural language.

Usage:
    python main.py index <folder>     Index all PowerPoint files in a folder
    python main.py search <query>     Search indexed files
    python main.py chat               Interactive chat mode
    python main.py status             Show indexing status
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.indexer.index_manager import index_folder
from backend.search.retriever import search_documents, get_unique_files_for_query
from backend.chat.rag_handler import chat, get_answer
from backend.db.vector_store import VectorStore
from backend.db.metadata_store import MetadataStore


def cmd_index(args: argparse.Namespace) -> None:
    """Index files in a folder."""
    folder = args.folder

    if not Path(folder).exists():
        print(f"Error: Folder '{folder}' does not exist")
        sys.exit(1)

    print(f"Indexing files in: {folder}")
    print("-" * 40)

    def progress(msg: str) -> None:
        print(msg, flush=True)

    stats = index_folder(
        folder,
        progress_callback=progress,
        force_reindex=args.force,
        max_chunks_per_file=args.max_chunks
    )

    print("-" * 40)
    print(f"Indexing complete!")
    print(f"  Files indexed: {stats['indexed_files']}")
    print(f"  Files skipped (unchanged): {stats['skipped_unchanged']}")
    print(f"  Files skipped (size/chunk limits): {stats['skipped_limits']}")
    print(f"  Total chunks created: {stats['total_chunks']}")
    print(f"  Total time: {stats['total_time']:.1f}s")

    if stats["indexed_files"] > 0 and stats["total_time"] > 0:
        avg_time_per_file = stats["total_time"] / stats["indexed_files"]
        print(f"\n  Avg time per file: {avg_time_per_file:.1f}s")
        print(f"  Estimated time for 10,000 files: {avg_time_per_file * 10000 / 3600:.1f} hours")

    if stats["errors"]:
        print(f"\nErrors ({len(stats['errors'])}):")
        for err in stats["errors"]:
            print(f"  - {err}")


def cmd_search(args: argparse.Namespace) -> None:
    """Search indexed files."""
    query = args.query
    n_results = args.num

    print(f"Searching for: {query}")
    print("-" * 40)

    results = get_unique_files_for_query(query, n_results=n_results)

    if not results:
        print("No matching documents found.")
        print("Make sure you have indexed some files first: python main.py index <folder>")
        return

    print(f"Found {len(results)} matching files:\n")

    for i, r in enumerate(results, 1):
        print(f"{i}. {r['file_name']}")
        print(f"   Slide {r['slide_number']} | Relevance: {r['relevance_score']:.2%}")
        preview = r['text'][:200].replace('\n', ' ')
        print(f"   Preview: {preview}...")
        print()


def cmd_chat(args: argparse.Namespace) -> None:
    """Interactive chat mode."""
    vector_store = VectorStore()

    if vector_store.count() == 0:
        print("No documents indexed yet!")
        print("First index some files: python main.py index <folder>")
        sys.exit(1)

    chat(vector_store=vector_store)


def cmd_ask(args: argparse.Namespace) -> None:
    """Ask a single question."""
    query = args.query

    vector_store = VectorStore()

    if vector_store.count() == 0:
        print("No documents indexed yet!")
        print("First index some files: python main.py index <folder>")
        sys.exit(1)

    print(f"Question: {query}")
    print("-" * 40)
    print()

    for chunk in get_answer(query, vector_store, stream=True):
        print(chunk, end="", flush=True)
    print()


def cmd_status(args: argparse.Namespace) -> None:
    """Show indexing status."""
    vector_store = VectorStore()
    metadata_store = MetadataStore()

    print("FinderAI Status")
    print("-" * 40)
    print(f"Total chunks in index: {vector_store.count()}")

    files = metadata_store.get_all_files()
    print(f"Total files indexed: {len(files)}")

    if files:
        print("\nIndexed files:")
        for f in files:
            print(f"  - {Path(f['file_path']).name} ({f['chunk_count']} chunks)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="FinderAI - Search your local files with natural language",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    index_parser = subparsers.add_parser("index", help="Index files in a folder")
    index_parser.add_argument("folder", help="Folder path to index")
    index_parser.add_argument("-f", "--force", action="store_true",
                             help="Force re-index all files")
    index_parser.add_argument("--max-chunks", type=int, default=50,
                             help="Max chunks per file (default: 50). Increase for larger files.")
    index_parser.set_defaults(func=cmd_index)

    search_parser = subparsers.add_parser("search", help="Search indexed files")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("-n", "--num", type=int, default=5,
                              help="Number of results (default: 5)")
    search_parser.set_defaults(func=cmd_search)

    chat_parser = subparsers.add_parser("chat", help="Interactive chat mode")
    chat_parser.set_defaults(func=cmd_chat)

    ask_parser = subparsers.add_parser("ask", help="Ask a single question")
    ask_parser.add_argument("query", help="Question to ask")
    ask_parser.set_defaults(func=cmd_ask)

    status_parser = subparsers.add_parser("status", help="Show indexing status")
    status_parser.set_defaults(func=cmd_status)

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
