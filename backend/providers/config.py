"""Configuration management for AI providers."""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Supabase Edge Function proxy URL for secure API key handling
# This routes LLM/embedding/rerank calls through Supabase where keys are stored securely
SUPABASE_PROXY_URL = os.environ.get(
    "SUPABASE_PROXY_URL",
    "https://lxcwfylurqxlggmktkgb.supabase.co/functions/v1"
)

# Enable proxy mode by default (keys stored on Supabase, not bundled in app)
USE_PROXY_MODE = os.environ.get("USE_PROXY_MODE", "true").lower() == "true"


def is_proxy_mode_enabled() -> bool:
    """Check if proxy mode is enabled for secure API key handling."""
    return USE_PROXY_MODE


def get_proxy_url() -> str:
    """Get the Supabase Edge Function proxy URL."""
    return SUPABASE_PROXY_URL

DEFAULT_LLM_PROVIDER = "openai"
DEFAULT_LLM_MODEL = "gpt-5.1"
DEFAULT_EMBEDDING_PROVIDER = "voyage"
DEFAULT_EMBEDDING_MODEL = "voyage-3-large"
DEFAULT_RERANKING_PROVIDER = "cohere"
DEFAULT_RERANKING_MODEL = "rerank-v4.0-fast"
DEFAULT_INITIAL_RESULTS = 100


def get_scaled_initial_results(chunk_count: int, base: int = DEFAULT_INITIAL_RESULTS) -> int:
    """
    Scale initial_results based on corpus size to maintain search quality.

    At small corpus sizes, a fixed number of results provides good coverage.
    As corpus grows, we need more candidates for the reranker to find relevant chunks.

    Scaling tiers:
    - < 1,000 chunks: use base (default 100)
    - 1,000 - 5,000 chunks: 150
    - 5,000 - 10,000 chunks: 200
    - > 10,000 chunks: 250 (capped to balance quality vs reranking cost)
    """
    if chunk_count < 1000:
        return base
    elif chunk_count < 5000:
        return max(base, 150)
    elif chunk_count < 10000:
        return max(base, 200)
    else:
        return max(base, 250)


@dataclass
class ProviderConfig:
    """Configuration for AI providers."""

    llm_provider: str = DEFAULT_LLM_PROVIDER
    llm_model: str = DEFAULT_LLM_MODEL
    embedding_provider: str = DEFAULT_EMBEDDING_PROVIDER
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    reranking_provider: str = DEFAULT_RERANKING_PROVIDER
    reranking_model: str = DEFAULT_RERANKING_MODEL
    hybrid_search_enabled: bool = True
    initial_results: int = DEFAULT_INITIAL_RESULTS
    rerank_to: int = 10

    openai_api_key: Optional[str] = field(default=None, repr=False)
    google_api_key: Optional[str] = field(default=None, repr=False)
    cohere_api_key: Optional[str] = field(default=None, repr=False)
    voyage_api_key: Optional[str] = field(default=None, repr=False)


class ConfigStore:
    """SQLite-based configuration storage."""

    def __init__(self, db_path: str = None):
        if db_path is None:
            from backend.db.metadata_store import DEFAULT_DB_PATH
            db_path = DEFAULT_DB_PATH
        db_file = Path(db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(
            db_path,
            check_same_thread=False,
            timeout=30.0,
            isolation_level=None  # Autocommit mode - prevents nested transaction issues
        )
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._init_tables()

    def _init_tables(self) -> None:
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get a setting value by key."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default

    def set(self, key: str, value: str) -> None:
        """Set a setting value."""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        """, (key, value))
        self.conn.commit()

    def delete(self, key: str) -> None:
        """Delete a setting."""
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM settings WHERE key = ?", (key,))
        self.conn.commit()

    def get_all(self) -> dict[str, str]:
        """Get all settings."""
        cursor = self.conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        return {row["key"]: row["value"] for row in cursor.fetchall()}

    def close(self) -> None:
        """Close the database connection."""
        self.conn.close()


_config_store: Optional[ConfigStore] = None


def _get_config_store() -> ConfigStore:
    """Get or create the global config store."""
    global _config_store
    if _config_store is None:
        _config_store = ConfigStore()
    return _config_store


def get_config() -> ProviderConfig:
    """Load configuration from database and environment."""
    store = _get_config_store()

    config = ProviderConfig(
        llm_provider=store.get("llm_provider", DEFAULT_LLM_PROVIDER),
        llm_model=store.get("llm_model", DEFAULT_LLM_MODEL),
        embedding_provider=store.get("embedding_provider", DEFAULT_EMBEDDING_PROVIDER),
        embedding_model=store.get("embedding_model", DEFAULT_EMBEDDING_MODEL),
        reranking_provider=store.get("reranking_provider", DEFAULT_RERANKING_PROVIDER),
        reranking_model=store.get("reranking_model", DEFAULT_RERANKING_MODEL),
        hybrid_search_enabled=store.get("hybrid_search_enabled", "true").lower() == "true",
        initial_results=int(store.get("initial_results", str(DEFAULT_INITIAL_RESULTS))),
        rerank_to=int(store.get("rerank_to", "10")),
    )

    config.openai_api_key = _get_api_key("openai")
    config.google_api_key = _get_api_key("google")
    config.cohere_api_key = _get_api_key("cohere")
    config.voyage_api_key = _get_api_key("voyage")

    return config


def save_config(config: ProviderConfig) -> None:
    """Save configuration to database."""
    store = _get_config_store()
    store.set("llm_provider", config.llm_provider)
    store.set("llm_model", config.llm_model)
    store.set("embedding_provider", config.embedding_provider)
    store.set("embedding_model", config.embedding_model)
    store.set("reranking_provider", config.reranking_provider)
    store.set("reranking_model", config.reranking_model)
    store.set("hybrid_search_enabled", str(config.hybrid_search_enabled).lower())
    store.set("initial_results", str(config.initial_results))
    store.set("rerank_to", str(config.rerank_to))


def _get_api_key(provider: str) -> Optional[str]:
    """Get API key from environment or secure storage.

    In proxy mode, returns a placeholder since actual keys are on Supabase.
    """
    # In proxy mode, we don't need local API keys - they're on Supabase
    # Note: voyage is NOT included - each user must provide their own Voyage API key
    if is_proxy_mode_enabled() and provider in {"openai", "cohere"}:
        return "PROXY_MODE"

    env_var = f"{provider.upper()}_API_KEY"
    key = os.environ.get(env_var)
    if key:
        return key

    try:
        import keyring
        key = keyring.get_password("finderai", f"{provider}_api_key")
        if key:
            return key
    except (ImportError, Exception):
        pass

    store = _get_config_store()
    key = store.get(f"{provider}_api_key")
    if key:
        return key

    return None


# Clerk token storage for proxy authentication
_clerk_token: Optional[str] = None


def set_clerk_token(token: str) -> None:
    """Set the Clerk auth token for proxy requests."""
    global _clerk_token
    _clerk_token = token


def get_clerk_token() -> Optional[str]:
    """Get the Clerk auth token for proxy requests."""
    return _clerk_token


def save_api_key(provider: str, api_key: str) -> None:
    """Save API key to secure storage."""
    try:
        import keyring
        keyring.set_password("finderai", f"{provider}_api_key", api_key)
        return
    except (ImportError, Exception):
        pass

    store = _get_config_store()
    store.set(f"{provider}_api_key", api_key)


def delete_api_key(provider: str) -> None:
    """Delete API key from secure storage."""
    try:
        import keyring
        keyring.delete_password("finderai", f"{provider}_api_key")
        return
    except (ImportError, Exception):
        pass

    store = _get_config_store()
    store.delete(f"{provider}_api_key")
