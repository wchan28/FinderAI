# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec file for FinderAI backend server.

This spec bundles the FastAPI backend with all dependencies into a
standalone executable that can run without Python installed.

Usage:
    pyinstaller finderai_server.spec --clean
"""

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect hidden imports for packages that use dynamic imports
hiddenimports = [
    # Uvicorn internals
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # FastAPI and Starlette
    "fastapi",
    "starlette.responses",
    "starlette.routing",
    "starlette.middleware",
    "starlette.middleware.cors",
    # Pydantic
    "pydantic",
    "pydantic_core",
    "pydantic.deprecated.decorator",
    # ChromaDB
    "chromadb",
    "chromadb.config",
    "chromadb.api",
    "chromadb.api.segment",
    "chromadb.db",
    "chromadb.db.impl",
    "chromadb.db.impl.sqlite",
    "chromadb.segment",
    "chromadb.segment.impl",
    "chromadb.telemetry",
    "chromadb.telemetry.posthog",
    "hnswlib",
    "sqlite3",
    # Document extractors
    "pptx",
    "pptx.util",
    "docx",
    "openpyxl",
    "pypdf",
    # API providers
    "openai",
    "cohere",
    "voyageai",
    "google.generativeai",
    "ollama",
    # PIL/Pillow (required by python-pptx for image handling)
    "PIL",
    "PIL.Image",
    # Others
    "keyring",
    "keyring.backends",
    "dotenv",
    "rank_bm25",
    "httpx",
    "httpcore",
    "anyio",
    "sniffio",
    "certifi",
    "h11",
    # ONNX Runtime (required by ChromaDB 0.5+ for default embedding function)
    "onnxruntime",
    "onnxruntime.capi",
    "onnxruntime.capi._pybind_state",
    # jaraco modules (required by keyring and pkg_resources)
    "jaraco",
    "jaraco.text",
    "jaraco.functools",
    "jaraco.context",
    "jaraco.classes",
    # pkg_resources and dependencies
    "pkg_resources",
    "pkg_resources.extern",
    "platformdirs",
    "packaging",
    "packaging.version",
    "packaging.specifiers",
    "packaging.requirements",
    # Backend modules
    "backend",
    "backend.api",
    "backend.api.server",
    "backend.chat",
    "backend.db",
    "backend.extractors",
    "backend.indexer",
    "backend.providers",
    "backend.search",
]

# Add all submodules for complex packages
hiddenimports += collect_submodules("chromadb")
hiddenimports += collect_submodules("pydantic")
hiddenimports += collect_submodules("starlette")
hiddenimports += collect_submodules("onnxruntime")
hiddenimports += collect_submodules("jaraco")

# Collect data files needed at runtime
datas = []
datas += collect_data_files("chromadb")
datas += collect_data_files("pydantic")

# Add backend package
datas += [
    ("api", "backend/api"),
    ("chat", "backend/chat"),
    ("db", "backend/db"),
    ("extractors", "backend/extractors"),
    ("indexer", "backend/indexer"),
    ("providers", "backend/providers"),
    ("search", "backend/search"),
]

# Exclude heavy packages we don't need
excludes = [
    "sentence_transformers",
    "transformers",
    "torch",
    "torchvision",
    "torchaudio",
    "tensorflow",
    "keras",
    "numpy.testing",
    "scipy",
    "matplotlib",
    "cv2",
    "sklearn",
    "pandas",
    "jupyter",
    "notebook",
    "IPython",
    "pytest",
    "setuptools",
    "pip",
    "wheel",
    "tkinter",
]

a = Analysis(
    ["server_entry.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="finderai-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="finderai-server",
)
