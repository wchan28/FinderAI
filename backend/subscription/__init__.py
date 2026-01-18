"""Subscription and trial management for FinderAI."""

from backend.subscription.state import SubscriptionTier, SubscriptionState
from backend.subscription.manager import get_subscription_state
from backend.subscription.usage import (
    get_search_count,
    increment_search_count,
    get_indexed_file_count,
)

__all__ = [
    "SubscriptionTier",
    "SubscriptionState",
    "get_subscription_state",
    "get_search_count",
    "increment_search_count",
    "get_indexed_file_count",
]
