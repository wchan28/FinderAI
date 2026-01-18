"""Usage tracking for subscription limits."""

from __future__ import annotations

from datetime import datetime

from backend.providers.config import _get_config_store


def _get_current_month_key() -> str:
    """Get key for current month's usage tracking."""
    return datetime.utcnow().strftime("%Y-%m")


def get_search_count() -> int:
    """Get number of searches performed this month."""
    store = _get_config_store()
    month_key = _get_current_month_key()
    count = store.get(f"search_count_{month_key}")
    return int(count) if count else 0


def increment_search_count() -> int:
    """Increment and return new search count for this month."""
    store = _get_config_store()
    month_key = _get_current_month_key()
    current = get_search_count()
    new_count = current + 1
    store.set(f"search_count_{month_key}", str(new_count))
    return new_count


def get_indexed_file_count() -> int:
    """Get count of currently indexed files (excludes archived)."""
    from backend.db.metadata_store import MetadataStore

    metadata_store = MetadataStore()
    return metadata_store.get_active_file_count()


def get_archived_file_count() -> int:
    """Get count of archived indexed files."""
    from backend.db.metadata_store import MetadataStore

    metadata_store = MetadataStore()
    return metadata_store.get_archived_file_count()


def get_total_indexed_file_count() -> int:
    """Get count of all indexed files (including archived)."""
    from backend.db.metadata_store import MetadataStore

    metadata_store = MetadataStore()
    return len(metadata_store.get_all_files(include_archived=True))
