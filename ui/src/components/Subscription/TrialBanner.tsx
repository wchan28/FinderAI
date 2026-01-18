import { Sparkles, Clock, AlertTriangle } from "lucide-react";
import { useSubscription } from "../../providers/SubscriptionProvider";

const FREE_FILE_LIMIT = 500;

export function TrialBanner() {
  const {
    tier,
    is_trial,
    trial_days_remaining,
    is_beta_user,
    isLoading,
    usage,
  } = useSubscription();

  if (isLoading) {
    return null;
  }

  if (is_beta_user || (tier === "pro" && !is_trial)) {
    return null;
  }

  if (is_trial && trial_days_remaining !== null) {
    const isUrgent = trial_days_remaining <= 3;
    const excessFiles = usage.indexed_files - FREE_FILE_LIMIT;
    const hasExcessFiles = excessFiles > 0;

    return (
      <div className="border-b">
        <div
          className={`px-4 py-2 flex items-center justify-between text-sm ${
            isUrgent
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>
              {trial_days_remaining === 0
                ? "Your Pro trial ends today!"
                : `${trial_days_remaining} day${trial_days_remaining === 1 ? "" : "s"} left in your Pro trial`}
            </span>
          </div>
          <button className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 transition-colors">
            Upgrade to Pro
          </button>
        </div>
        {hasExcessFiles && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                You have {usage.indexed_files.toLocaleString()} files indexed.
                On the free tier, only {FREE_FILE_LIMIT} files remain indexed
                after your trial ends. Upgrade to Pro to keep all files.
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tier === "free") {
    return (
      <div className="px-4 py-2 border-b bg-gray-50 border-gray-200 text-gray-700 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Free tier - Limited to 500 files and 50 searches/month</span>
        </div>
        <button className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 transition-colors">
          Upgrade to Pro
        </button>
      </div>
    );
  }

  return null;
}
