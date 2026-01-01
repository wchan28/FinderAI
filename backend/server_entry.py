#!/usr/bin/env python3
"""Entry point for bundled FinderAI server.

This module serves as the main entry point when the backend is bundled
with PyInstaller. It handles path setup for frozen executables and
starts the FastAPI server via uvicorn.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def setup_paths() -> None:
    """Configure Python path for frozen executable."""
    if getattr(sys, "frozen", False):
        base_path = Path(sys._MEIPASS)
    else:
        base_path = Path(__file__).parent

    if str(base_path) not in sys.path:
        sys.path.insert(0, str(base_path))

    os.chdir(base_path)


def main() -> None:
    """Start the FastAPI server."""
    setup_paths()

    import uvicorn

    from backend.api.server import app

    uvicorn.run(app, host="127.0.0.1", port=8000)


if __name__ == "__main__":
    main()
