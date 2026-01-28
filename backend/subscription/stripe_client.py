"""Stripe client wrapper for subscription management."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

import stripe


@lru_cache(maxsize=1)
def _init_stripe() -> None:
    """Initialize Stripe API key lazily."""
    stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")


def _get_price_ids() -> tuple[Optional[str], Optional[str]]:
    """Get price IDs lazily."""
    return (
        os.environ.get("STRIPE_PRICE_ID_MONTHLY"),
        os.environ.get("STRIPE_PRICE_ID_ANNUAL"),
    )


def get_price_id(billing_period: str) -> Optional[str]:
    """Get the Stripe price ID for the given billing period."""
    _init_stripe()
    monthly, annual = _get_price_ids()
    if billing_period == "monthly":
        return monthly
    elif billing_period == "annual":
        return annual
    return None


def create_checkout_session(
    customer_email: str,
    clerk_user_id: str,
    price_id: str,
    success_url: str,
    cancel_url: str,
) -> str:
    """Create a Stripe Checkout session and return the URL."""
    _init_stripe()
    customers = stripe.Customer.list(email=customer_email, limit=1)

    if customers.data:
        customer = customers.data[0]
    else:
        customer = stripe.Customer.create(
            email=customer_email,
            metadata={"clerk_user_id": clerk_user_id},
        )

    session = stripe.checkout.Session.create(
        customer=customer.id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        allow_promotion_codes=True,
        billing_address_collection="auto",
        metadata={"clerk_user_id": clerk_user_id},
    )

    return session.url


def get_subscription_status(customer_email: str) -> dict:
    """Get subscription status for a customer."""
    _init_stripe()
    customers = stripe.Customer.list(email=customer_email, limit=1)

    if not customers.data:
        return {"status": "none", "customer_id": None}

    customer = customers.data[0]
    subscriptions = stripe.Subscription.list(customer=customer.id, limit=1)

    if not subscriptions.data:
        return {"status": "none", "customer_id": customer.id}

    sub = subscriptions.data[0]
    items_data = sub.get("items", {}).get("data", [])
    sub_item = items_data[0] if items_data else None

    return {
        "status": sub.status,
        "customer_id": customer.id,
        "subscription_id": sub.id,
        "current_period_end": sub_item.get("current_period_end") if sub_item else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "plan_interval": sub_item["price"]["recurring"]["interval"] if sub_item else None,
    }


def has_active_subscription(customer_email: str) -> bool:
    """Check if customer has an active Stripe subscription."""
    _init_stripe()
    if not stripe.api_key:
        return False

    try:
        status = get_subscription_status(customer_email)
        return status.get("status") in ("active", "trialing")
    except Exception:
        return False


def create_customer_portal_session(customer_id: str, return_url: str) -> str:
    """Create a customer portal session for managing subscription."""
    _init_stripe()
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=return_url,
    )
    return session.url
