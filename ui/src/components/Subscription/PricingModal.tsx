import { useState, useEffect, useCallback } from "react";
import { X, Check, Sparkles, Zap, Loader2, CreditCard } from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  createCheckoutSession,
  createCustomerPortalSession,
} from "../../api/client";
import type { BillingPeriod } from "../../api/client";
import { useSubscription } from "../../providers/SubscriptionProvider";
import { CLERK_ENABLED } from "../../lib/clerk";

type PricingModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const FREE_FEATURES = [
  { text: "500 indexed files", included: true },
  { text: "50 searches/month", included: true },
  { text: "PDF & DOCX support", included: true },
  { text: "7-day chat history", included: true },
  { text: "Unlimited files", included: false },
  { text: "Unlimited searches", included: false },
  { text: "PowerPoint & Excel", included: false },
  { text: "Unlimited history", included: false },
];

const PRO_FEATURES = [
  { text: "Unlimited indexed files", included: true },
  { text: "Unlimited searches", included: true },
  { text: "PDF, DOCX, PPTX, XLSX", included: true },
  { text: "Unlimited chat history", included: true },
  { text: "Priority support", included: true },
  { text: "Early access to features", included: true },
];

const MONTHLY_PRICE = 9;
const ANNUAL_PRICE = 84;
const ANNUAL_MONTHLY_EQUIVALENT = ANNUAL_PRICE / 12;
const SAVINGS_PERCENT = Math.round(
  (1 - ANNUAL_MONTHLY_EQUIVALENT / MONTHLY_PRICE) * 100,
);

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tier, is_trial, is_beta_user } = useSubscription();
  const { user } = CLERK_ENABLED ? useUser() : { user: null };
  const { getToken } = CLERK_ENABLED
    ? useAuth()
    : { getToken: async () => null };

  const isPaidPro = tier === "pro" && !is_trial && !is_beta_user;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const handleUpgrade = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken?.();
      const userEmail = user?.primaryEmailAddress?.emailAddress;

      const successUrl = "docora://checkout/success";
      const cancelUrl = "docora://checkout/cancel";

      const checkoutUrl = await createCheckoutSession(
        billingPeriod,
        successUrl,
        cancelUrl,
        token ?? undefined,
        userEmail,
      );

      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(checkoutUrl);
      } else {
        window.location.href = checkoutUrl;
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsManaging(true);
    setError(null);

    try {
      const token = await getToken?.();
      const userEmail = user?.primaryEmailAddress?.emailAddress;

      const portalUrl = await createCustomerPortalSession(
        token ?? undefined,
        userEmail,
      );

      if (window.electronAPI?.openExternal) {
        await window.electronAPI.openExternal(portalUrl);
      } else {
        window.location.href = portalUrl;
      }

      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to open subscription portal",
      );
    } finally {
      setIsManaging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {isPaidPro ? "Manage Subscription" : "Upgrade to Docora Pro"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {isPaidPro ? (
          <div className="p-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                You're on Docora Pro
              </h3>
              <p className="text-gray-600 mb-6">
                Enjoy unlimited files, searches, and all premium features.
              </p>
              <button
                onClick={handleManageSubscription}
                disabled={isManaging}
                className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                {isManaging ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Manage Subscription
                  </>
                )}
              </button>
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-center py-6">
              <div className="bg-gray-100 rounded-lg p-1 flex">
                <button
                  onClick={() => setBillingPeriod("monthly")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    billingPeriod === "monthly"
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod("annual")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    billingPeriod === "annual"
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Annual
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    Save {SAVINGS_PERCENT}%
                  </span>
                </button>
              </div>
            </div>

            <div className="px-6 pb-6 grid md:grid-cols-2 gap-6">
              <div className="border border-gray-200 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900">Free</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">$0</span>
                  <span className="text-gray-500 ml-2">/month</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  Perfect for getting started
                </p>

                <ul className="mt-6 space-y-3">
                  {FREE_FEATURES.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      {feature.included ? (
                        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-green-600" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <X className="w-3 h-3 text-gray-400" />
                        </div>
                      )}
                      <span
                        className={
                          feature.included
                            ? "text-gray-700"
                            : "text-gray-400 line-through"
                        }
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled
                  className="mt-6 w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed"
                >
                  {tier === "free" && !is_trial ? "Current Plan" : "Free Tier"}
                </button>
              </div>

              <div className="relative border-2 border-blue-500 rounded-xl p-6 bg-blue-50/30">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  Pro
                </h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">
                    $
                    {billingPeriod === "monthly" ? MONTHLY_PRICE : ANNUAL_PRICE}
                  </span>
                  <span className="text-gray-500 ml-2">
                    /{billingPeriod === "monthly" ? "month" : "year"}
                  </span>
                </div>
                {billingPeriod === "annual" && (
                  <p className="mt-1 text-sm text-green-600">
                    ${ANNUAL_MONTHLY_EQUIVALENT.toFixed(0)}/month billed
                    annually
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-600">
                  For power users who need more
                </p>

                <ul className="mt-6 space-y-3">
                  {PRO_FEATURES.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-600" />
                      </div>
                      <span className="text-gray-700">{feature.text}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={handleUpgrade}
                  disabled={isLoading}
                  className="mt-6 w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Upgrade to Pro
                    </>
                  )}
                </button>

                {error && (
                  <p className="mt-3 text-sm text-red-600 text-center">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <p className="text-xs text-gray-500 text-center">
                Secure payment powered by Stripe. Cancel anytime.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
