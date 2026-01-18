"""Subscription state definitions and tier limits."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional


class SubscriptionTier(str, Enum):
    FREE = "free"
    PRO = "pro"


@dataclass
class SubscriptionState:
    tier: SubscriptionTier
    is_trial: bool
    trial_end_date: Optional[datetime]
    is_beta_user: bool
    max_indexed_files: int
    max_searches_per_month: int
    conversation_history_days: int
    allowed_file_types: frozenset[str]
    in_grace_period: bool = False
    grace_period_days_remaining: int = 0
    archive_deadline: Optional[datetime] = None
    files_to_archive_count: int = 0
    archived_files_count: int = 0


TRIAL_DURATION_DAYS = 14
GRACE_PERIOD_DAYS = 7

FREE_TIER_LIMITS = {
    "max_indexed_files": 500,
    "max_searches_per_month": 50,
    "conversation_history_days": 7,
    "allowed_file_types": frozenset({".pdf", ".docx"}),
}

PRO_TIER_LIMITS = {
    "max_indexed_files": -1,
    "max_searches_per_month": -1,
    "conversation_history_days": -1,
    "allowed_file_types": frozenset({".pdf", ".docx", ".pptx", ".xlsx"}),
}
