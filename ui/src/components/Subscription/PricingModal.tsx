import { useState, useEffect, useCallback } from "react";
import {
  X,
  Check,
  Sparkles,
  Zap,
  Loader2,
  CreditCard,
  Lock,
} from "lucide-react";
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
  "Natural language search",
  "200 searchable files",
  "50 searches per month",
  "PDF & Word document support",
  "AI chat with your documents",
  "Source attribution",
  "Local-first privacy",
];

const PRO_FEATURES = [
  "Unlimited searchable files",
  "Unlimited searches",
  "All file types supported",
  "Priority support",
  "Early access to new features",
];

const ORIGINAL_MONTHLY_PRICE = 15;
const ORIGINAL_ANNUAL_PRICE = 140;
const MONTHLY_PRICE = 9;
const ANNUAL_PRICE = 84;
const ANNUAL_MONTHLY_EQUIVALENT = Math.round(ANNUAL_PRICE / 12);
const MONTHLY_SAVINGS_PERCENT = Math.round(
  (1 - MONTHLY_PRICE / ORIGINAL_MONTHLY_PRICE) * 100,
);
const ANNUAL_SAVINGS_PERCENT = Math.round(
  (1 - ANNUAL_PRICE / ORIGINAL_ANNUAL_PRICE) * 100,
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
            <div className="px-6 py-6 grid md:grid-cols-2 gap-6">
              {/* Free Tier */}
              <div className="border border-gray-200 rounded-xl p-6 lg:p-8 h-full">
                <h3 className="text-lg font-semibold text-gray-900">Free</h3>
                <div className="mt-4 mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">$0</span>
                    <span className="text-gray-500">forever</span>
                  </div>
                </div>

                <button
                  disabled
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-gray-500 cursor-not-allowed mb-4"
                >
                  {tier === "free" && !is_trial ? "Current Plan" : "Free Tier"}
                </button>

                <div className="border-t border-gray-200 pt-6">
                  <p className="text-sm font-medium text-gray-900 mb-4">
                    Includes:
                  </p>
                  <ul className="space-y-2.5">
                    {FREE_FEATURES.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2.5 text-sm text-gray-700"
                      >
                        <Check
                          className="w-4 h-4 text-indigo-500 flex-shrink-0"
                          strokeWidth={2.5}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Pro Tier */}
              <div className="relative rounded-xl border-2 border-indigo-500 bg-white shadow-lg h-full overflow-hidden">
                {/* Launch Pricing Banner */}
                <div className="bg-indigo-500 text-white py-2 px-4">
                  <p className="text-center text-sm font-medium flex items-center justify-center gap-2">
                    <Zap className="w-3.5 h-3.5" />
                    Launch Pricing
                    <span className="text-white/70">·</span>
                    <Lock className="w-3 h-3" />
                    Lock in this rate forever
                  </p>
                </div>

                <div className="p-6 lg:p-8">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        Pro
                      </h3>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                      {billingPeriod === "monthly"
                        ? MONTHLY_SAVINGS_PERCENT
                        : ANNUAL_SAVINGS_PERCENT}
                      % off
                    </span>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg text-gray-400 line-through">
                        $
                        {billingPeriod === "monthly"
                          ? ORIGINAL_MONTHLY_PRICE
                          : ORIGINAL_ANNUAL_PRICE}
                      </span>
                      <span className="text-4xl font-bold text-gray-900">
                        $
                        {billingPeriod === "monthly"
                          ? MONTHLY_PRICE
                          : ANNUAL_PRICE}
                      </span>
                      <span className="text-gray-500">
                        /{billingPeriod === "monthly" ? "mo" : "yr"}
                      </span>
                    </div>
                    {billingPeriod === "annual" && (
                      <p className="text-sm text-gray-500 mt-1">
                        ${ANNUAL_MONTHLY_EQUIVALENT}/month, billed annually
                      </p>
                    )}
                  </div>

                  {/* Billing Toggle */}
                  <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg mb-6">
                    <button
                      onClick={() => setBillingPeriod("monthly")}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                        billingPeriod === "monthly"
                          ? "bg-white shadow-sm text-gray-900"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingPeriod("annual")}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                        billingPeriod === "annual"
                          ? "bg-white shadow-sm text-gray-900"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Annual
                    </button>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={handleUpgrade}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mb-4"
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
                    <p className="text-sm text-red-600 text-center mb-4">
                      {error}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 text-center mb-6">
                    Cancel anytime · Powered by Stripe
                  </p>

                  {/* Features */}
                  <div className="border-t border-gray-200 pt-6">
                    <p className="text-sm font-medium text-gray-900 mb-4">
                      Everything in Free, plus:
                    </p>
                    <ul className="space-y-2.5">
                      {PRO_FEATURES.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-center gap-2.5 text-sm text-gray-700"
                        >
                          <Check
                            className="w-4 h-4 text-indigo-500 flex-shrink-0"
                            strokeWidth={2.5}
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <p className="text-xs text-gray-500 text-center">
                Your files never leave your device. All plans include our
                local-first privacy guarantee.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
