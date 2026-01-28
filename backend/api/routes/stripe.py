"""Stripe API routes for subscription management."""

from __future__ import annotations

import os
import traceback
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.subscription.stripe_client import (
    create_checkout_session,
    get_subscription_status,
    create_customer_portal_session,
    get_price_id,
)

router = APIRouter(prefix="/stripe", tags=["stripe"])


class CreateCheckoutRequest(BaseModel):
    billing_period: str
    success_url: str
    cancel_url: str


class CreateCheckoutResponse(BaseModel):
    checkout_url: str


class SubscriptionStatusResponse(BaseModel):
    status: str
    customer_id: Optional[str]
    subscription_id: Optional[str]
    current_period_end: Optional[int]
    cancel_at_period_end: Optional[bool]
    plan_interval: Optional[str]


class CustomerPortalResponse(BaseModel):
    portal_url: str


def _extract_user_info(request: Request) -> tuple[str, str]:
    """Extract user email and ID from request headers."""
    user_email = request.headers.get("X-User-Email")
    user_id = request.headers.get("X-User-Id")

    if not user_email:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                import jwt

                token = auth_header.replace("Bearer ", "")
                payload = jwt.decode(token, options={"verify_signature": False})
                user_email = payload.get("email") or payload.get(
                    "primary_email_address"
                )
                user_id = payload.get("sub")
            except Exception:
                pass

    if not user_email:
        raise HTTPException(status_code=401, detail="User email required")

    return user_email, user_id or "anonymous"


@router.post("/checkout", response_model=CreateCheckoutResponse)
async def create_checkout(request: Request, body: CreateCheckoutRequest):
    """Create a Stripe Checkout session for subscription."""
    try:
        user_email, user_id = _extract_user_info(request)

        price_id = get_price_id(body.billing_period)

        if not price_id:
            print(
                f"Stripe config issue - STRIPE_SECRET_KEY: "
                f"{bool(os.environ.get('STRIPE_SECRET_KEY'))}"
            )
            print(
                f"STRIPE_PRICE_ID_MONTHLY: {os.environ.get('STRIPE_PRICE_ID_MONTHLY')}"
            )
            print(
                f"STRIPE_PRICE_ID_ANNUAL: {os.environ.get('STRIPE_PRICE_ID_ANNUAL')}"
            )
            raise HTTPException(status_code=500, detail="Stripe prices not configured")

        checkout_url = create_checkout_session(
            customer_email=user_email,
            clerk_user_id=user_id,
            price_id=price_id,
            success_url=body.success_url,
            cancel_url=body.cancel_url,
        )

        return CreateCheckoutResponse(checkout_url=checkout_url)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Stripe checkout error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscription", response_model=SubscriptionStatusResponse)
async def get_subscription(request: Request):
    """Get current subscription status from Stripe."""
    user_email, _ = _extract_user_info(request)

    status = get_subscription_status(user_email)
    return SubscriptionStatusResponse(**status)


@router.post("/portal", response_model=CustomerPortalResponse)
async def create_portal(request: Request):
    """Create a customer portal session."""
    user_email, _ = _extract_user_info(request)

    status = get_subscription_status(user_email)
    if not status.get("customer_id"):
        raise HTTPException(status_code=404, detail="No Stripe customer found")

    portal_url = create_customer_portal_session(
        customer_id=status["customer_id"],
        return_url="docora://settings",
    )

    return CustomerPortalResponse(portal_url=portal_url)
