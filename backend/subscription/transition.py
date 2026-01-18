"""Subscription transition handling - grace period and archive logic."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from backend.db.metadata_store import MetadataStore
from backend.subscription.manager import get_subscription_state
from backend.subscription.state import FREE_TIER_LIMITS, PRO_TIER_LIMITS


@dataclass
class ArchiveStatus:
    total_indexed_files: int
    active_file_count: int
    archived_file_count: int
    files_to_archive_count: int
    archived_file_paths: List[str]
    pro_only_file_count: int


def get_archive_status(user_email: Optional[str] = None) -> ArchiveStatus:
    """Get current archive status based on subscription state."""
    state = get_subscription_state(user_email)
    metadata_store = MetadataStore()

    active_count = metadata_store.get_active_file_count()
    archived_count = metadata_store.get_archived_file_count()
    total_count = active_count + archived_count

    max_files = FREE_TIER_LIMITS["max_indexed_files"]
    files_to_archive = max(0, active_count - max_files) if state.tier.value == "free" else 0

    archived_files = metadata_store.get_archived_files()
    archived_paths = [f["file_path"] for f in archived_files]

    pro_only_extensions = set(PRO_TIER_LIMITS["allowed_file_types"]) - set(
        FREE_TIER_LIMITS["allowed_file_types"]
    )
    pro_only_files = metadata_store.get_files_by_extensions(list(pro_only_extensions))

    return ArchiveStatus(
        total_indexed_files=total_count,
        active_file_count=active_count,
        archived_file_count=archived_count,
        files_to_archive_count=files_to_archive,
        archived_file_paths=archived_paths,
        pro_only_file_count=len(pro_only_files),
    )


def archive_excess_files(user_email: Optional[str] = None) -> int:
    """
    Archive files exceeding free tier limit. Keeps most recent files.
    Returns count of files archived.
    """
    state = get_subscription_state(user_email)

    if state.tier.value != "free" or state.in_grace_period:
        return 0

    metadata_store = MetadataStore()
    active_count = metadata_store.get_active_file_count()
    max_files = FREE_TIER_LIMITS["max_indexed_files"]
    excess_count = active_count - max_files

    if excess_count <= 0:
        return 0

    oldest_files = metadata_store.get_oldest_files(excess_count)
    return metadata_store.archive_files(oldest_files)


def archive_pro_only_files(user_email: Optional[str] = None) -> int:
    """
    Archive files with Pro-only extensions (pptx, xlsx).
    Returns count of files archived.
    """
    state = get_subscription_state(user_email)

    if state.tier.value != "free" or state.in_grace_period:
        return 0

    metadata_store = MetadataStore()
    pro_only_extensions = set(PRO_TIER_LIMITS["allowed_file_types"]) - set(
        FREE_TIER_LIMITS["allowed_file_types"]
    )
    pro_only_files = metadata_store.get_files_by_extensions(list(pro_only_extensions))

    return metadata_store.archive_files(pro_only_files)


def enforce_archive_if_needed(user_email: Optional[str] = None) -> int:
    """
    Check if grace period has ended and enforce archiving if needed.
    Returns total count of files archived.
    """
    state = get_subscription_state(user_email)

    if state.tier.value != "free" or state.in_grace_period:
        return 0

    archived_count = archive_excess_files(user_email)
    archived_count += archive_pro_only_files(user_email)

    return archived_count


def restore_all_archived_files() -> int:
    """
    Restore all archived files. Called when user upgrades to Pro.
    Returns count of files restored.
    """
    metadata_store = MetadataStore()
    return metadata_store.restore_archived_files()


def get_files_to_be_archived(user_email: Optional[str] = None) -> List[str]:
    """
    Get list of file paths that will be archived after grace period ends.
    Useful for showing user what files they'll lose access to.
    """
    state = get_subscription_state(user_email)

    if state.tier.value != "free":
        return []

    metadata_store = MetadataStore()
    result = []

    active_count = metadata_store.get_active_file_count()
    max_files = FREE_TIER_LIMITS["max_indexed_files"]
    excess_count = active_count - max_files

    if excess_count > 0:
        result.extend(metadata_store.get_oldest_files(excess_count))

    pro_only_extensions = set(PRO_TIER_LIMITS["allowed_file_types"]) - set(
        FREE_TIER_LIMITS["allowed_file_types"]
    )
    pro_only_files = metadata_store.get_files_by_extensions(list(pro_only_extensions))
    for f in pro_only_files:
        if f not in result:
            result.append(f)

    return result


def get_hidden_file_extensions() -> List[str]:
    """Get list of file extensions that are hidden on free tier."""
    return list(
        set(PRO_TIER_LIMITS["allowed_file_types"])
        - set(FREE_TIER_LIMITS["allowed_file_types"])
    )
