"""Subscription state management and beta user handling."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from backend.providers.config import _get_config_store
from backend.subscription.state import (
    SubscriptionTier,
    SubscriptionState,
    FREE_TIER_LIMITS,
    PRO_TIER_LIMITS,
    TRIAL_DURATION_DAYS,
    GRACE_PERIOD_DAYS,
)

BETA_EMAILS: frozenset[str] = frozenset({
    "warrenchan28@gmail.com",
    "rubio110899@gmail.com",
    "emacias@revealinstitute.com",
    "enelson@revealinstitute.com",
    "ccockerell@dermpath.com",
    "elisenicole.nelson@gmail.com",
    "maxchan26@gmail.com",
    "ideen.modarres@gmail.com",
})


def get_subscription_state(user_email: Optional[str] = None) -> SubscriptionState:
    """
    Determine current subscription state.

    Priority:
    1. Beta user (email allowlist) -> permanent Pro
    2. Active Stripe subscription -> Pro
    3. Within trial period -> Pro (trial)
    4. Trial expired within grace period -> Free (with grace period info)
    5. Trial expired past grace period -> Free (archive enforced)
    """
    if _check_beta_status(user_email):
        return _create_pro_state(is_beta_user=True)

    if user_email and _check_stripe_subscription(user_email):
        return _create_pro_state(is_trial=False, is_beta_user=False)

    store = _get_config_store()
    trial_start = store.get("trial_start_date")

    if trial_start is None:
        trial_start = datetime.utcnow().isoformat()
        store.set("trial_start_date", trial_start)

    trial_start_dt = datetime.fromisoformat(trial_start)
    trial_end_dt = trial_start_dt + timedelta(days=TRIAL_DURATION_DAYS)
    now = datetime.utcnow()

    if now < trial_end_dt:
        return _create_pro_state(is_trial=True, trial_end_date=trial_end_dt)

    archive_deadline = trial_end_dt + timedelta(days=GRACE_PERIOD_DAYS)
    in_grace_period = now < archive_deadline
    grace_period_days_remaining = max(0, (archive_deadline - now).days) if in_grace_period else 0

    return _create_free_state(
        in_grace_period=in_grace_period,
        grace_period_days_remaining=grace_period_days_remaining,
        archive_deadline=archive_deadline,
    )


def _check_beta_status(user_email: Optional[str]) -> bool:
    """Check if user email is on beta allowlist."""
    if not user_email:
        return False

    store = _get_config_store()
    cached_beta = store.get("is_beta_user")
    if cached_beta == "true":
        return True

    is_beta = user_email.lower() in {e.lower() for e in BETA_EMAILS}
    if is_beta:
        store.set("is_beta_user", "true")

    return is_beta


def _create_pro_state(
    is_trial: bool = False,
    trial_end_date: Optional[datetime] = None,
    is_beta_user: bool = False,
) -> SubscriptionState:
    return SubscriptionState(
        tier=SubscriptionTier.PRO,
        is_trial=is_trial,
        trial_end_date=trial_end_date,
        is_beta_user=is_beta_user,
        **PRO_TIER_LIMITS,
    )


def _check_stripe_subscription(user_email: str) -> bool:
    """Check if user has an active Stripe subscription."""
    try:
        from backend.subscription.stripe_client import has_active_subscription

        return has_active_subscription(user_email)
    except Exception:
        return False


def _create_free_state(
    in_grace_period: bool = False,
    grace_period_days_remaining: int = 0,
    archive_deadline: Optional[datetime] = None,
) -> SubscriptionState:
    return SubscriptionState(
        tier=SubscriptionTier.FREE,
        is_trial=False,
        trial_end_date=None,
        is_beta_user=False,
        in_grace_period=in_grace_period,
        grace_period_days_remaining=grace_period_days_remaining,
        archive_deadline=archive_deadline,
        **FREE_TIER_LIMITS,
    )
