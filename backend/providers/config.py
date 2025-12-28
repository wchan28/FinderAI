"""Configuration management for AI providers."""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

BUNDLED_KEY_PROVIDERS = {"openai", "cohere"}

_bundled_keys_cache: dict[str, str] | None = None


def _load_bundled_keys() -> dict[str, str]:
    """Load bundled API keys from JSON file (for owner-provided services)."""
    global _bundled_keys_cache
    if _bundled_keys_cache is not None:
        return _bundled_keys_cache

    bundled_path = Path(__file__).parent / ".bundled_keys.json"
    if bundled_path.exists():
        try:
            _bundled_keys_cache = json.loads(bundled_path.read_text())
            return _bundled_keys_cache
        except (json.JSONDecodeError, OSError):
            pass

    _bundled_keys_cache = {}
    return _bundled_keys_cache

DEFAULT_LLM_PROVIDER = "openai"
DEFAULT_LLM_MODEL = "gpt-5.1"
DEFAULT_EMBEDDING_PROVIDER = "voyage"
DEFAULT_EMBEDDING_MODEL = "voyage-3-large"
DEFAULT_RERANKING_PROVIDER = "cohere"
DEFAULT_RERANKING_MODEL = "rerank-v4.0-fast"


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
    initial_results: int = 50
    rerank_to: int = 10

    openai_api_key: Optional[str] = field(default=None, repr=False)
    google_api_key: Optional[str] = field(default=None, repr=False)
    cohere_api_key: Optional[str] = field(default=None, repr=False)
    voyage_api_key: Optional[str] = field(default=None, repr=False)


class ConfigStore:
    """SQLite-based configuration storage."""

    def __init__(self, db_path: str = "./data/metadata.db"):
        db_file = Path(db_path)
        db_file.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
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
        initial_results=int(store.get("initial_results", "50")),
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
    """Get API key from environment, secure storage, or bundled keys."""
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

    if provider in BUNDLED_KEY_PROVIDERS:
        bundled_keys = _load_bundled_keys()
        return bundled_keys.get(f"{provider.upper()}_API_KEY")

    return None


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
