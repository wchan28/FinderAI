#!/usr/bin/env python3
"""
Test script for simulating trial → free tier transition.

Usage:
    # Simulate trial expired (in grace period - 5 days remaining)
    python scripts/test_trial_transition.py --days-ago 16

    # Simulate trial expired and grace period ended (files should be archived)
    python scripts/test_trial_transition.py --days-ago 25

    # Reset to fresh trial (starts today)
    python scripts/test_trial_transition.py --reset

    # Check current state
    python scripts/test_trial_transition.py --status
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.providers.config import _get_config_store
from backend.subscription.manager import get_subscription_state, BETA_EMAILS
from backend.subscription.state import TRIAL_DURATION_DAYS, GRACE_PERIOD_DAYS
from backend.subscription.usage import get_indexed_file_count, get_archived_file_count


def get_current_status(user_email: Optional[str] = None):
    """Print current subscription status."""
    store = _get_config_store()
    trial_start = store.get("trial_start_date")
    is_beta_cached = store.get("is_beta_user")

    print("\n=== Current Database State ===")
    print(f"trial_start_date: {trial_start}")
    print(f"is_beta_user (cached): {is_beta_cached}")

    if trial_start:
        trial_start_dt = datetime.fromisoformat(trial_start)
        trial_end_dt = trial_start_dt + timedelta(days=TRIAL_DURATION_DAYS)
        grace_end_dt = trial_end_dt + timedelta(days=GRACE_PERIOD_DAYS)
        now = datetime.utcnow()

        print(f"\n=== Timeline ===")
        print(f"Trial started: {trial_start_dt.date()}")
        print(f"Trial ends: {trial_end_dt.date()}")
        print(f"Grace period ends: {grace_end_dt.date()}")
        print(f"Today: {now.date()}")

        if now < trial_end_dt:
            days_left = (trial_end_dt - now).days
            print(f"Status: IN TRIAL ({days_left} days remaining)")
        elif now < grace_end_dt:
            days_left = (grace_end_dt - now).days
            print(f"Status: IN GRACE PERIOD ({days_left} days remaining)")
        else:
            days_past = (now - grace_end_dt).days
            print(f"Status: PAST GRACE PERIOD ({days_past} days ago)")

    print(f"\n=== File Counts ===")
    print(f"Indexed files: {get_indexed_file_count()}")
    print(f"Archived files: {get_archived_file_count()}")

    print(f"\n=== Subscription State (for email: {user_email or 'None'}) ===")
    state = get_subscription_state(user_email)
    print(f"Tier: {state.tier.value}")
    print(f"Is trial: {state.is_trial}")
    print(f"Is beta user: {state.is_beta_user}")
    print(f"In grace period: {state.in_grace_period}")
    print(f"Grace period days remaining: {state.grace_period_days_remaining}")
    if state.archive_deadline:
        print(f"Archive deadline: {state.archive_deadline.date()}")

    if user_email and user_email.lower() in {e.lower() for e in BETA_EMAILS}:
        print(f"\n⚠️  Note: {user_email} is in BETA_EMAILS list (permanent Pro)")


def set_trial_start(days_ago: int):
    """Set trial start date to N days ago."""
    store = _get_config_store()
    new_start = datetime.utcnow() - timedelta(days=days_ago)
    store.set("trial_start_date", new_start.isoformat())

    # Clear beta user cache so it re-evaluates
    store.delete("is_beta_user")

    print(f"\n✓ Set trial_start_date to {days_ago} days ago ({new_start.date()})")
    print(f"✓ Cleared is_beta_user cache")


def reset_trial():
    """Reset to fresh trial starting today."""
    store = _get_config_store()
    new_start = datetime.utcnow()
    store.set("trial_start_date", new_start.isoformat())
    store.delete("is_beta_user")

    print(f"\n✓ Reset trial to start today ({new_start.date()})")
    print(f"✓ Cleared is_beta_user cache")


def main():
    parser = argparse.ArgumentParser(description="Test trial → free transition")
    parser.add_argument("--days-ago", type=int, help="Set trial start date N days ago")
    parser.add_argument("--reset", action="store_true", help="Reset to fresh trial")
    parser.add_argument("--status", action="store_true", help="Show current status")
    parser.add_argument("--email", type=str, help="Test with specific email")

    args = parser.parse_args()

    if args.days_ago:
        set_trial_start(args.days_ago)
        get_current_status(args.email)
    elif args.reset:
        reset_trial()
        get_current_status(args.email)
    elif args.status or not any([args.days_ago, args.reset]):
        get_current_status(args.email)

    print("\n=== Test Scenarios ===")
    print("  --days-ago 10   → Mid-trial (4 days left)")
    print("  --days-ago 14   → Trial just ended (grace period starts)")
    print("  --days-ago 16   → In grace period (5 days remaining)")
    print("  --days-ago 21   → Grace period ends today")
    print("  --days-ago 25   → Past grace period (files should archive)")
    print("  --reset         → Fresh trial starting today")
    print("  --email EMAIL   → Test with specific email address")


if __name__ == "__main__":
    main()
