import { Crown, Sparkles, FileText, Search, Zap } from "lucide-react";
import { useSubscription } from "../../providers/SubscriptionProvider";

type AccountTabProps = {
  onUpgrade: () => void;
};

export function AccountTab({ onUpgrade }: AccountTabProps) {
  const {
    tier,
    is_trial,
    trial_days_remaining,
    is_beta_user,
    limits,
    usage,
    allowed_file_types,
    isLoading,
  } = useSubscription();

  const getPlanInfo = () => {
    if (is_beta_user) {
      return {
        name: "Pro (Beta)",
        description: "You have permanent Pro access as a beta tester",
        icon: Crown,
        color: "purple",
        bgColor: "bg-purple-50",
        textColor: "text-purple-700",
        borderColor: "border-purple-200",
      };
    }
    if (tier === "pro" && is_trial) {
      return {
        name: "Pro Trial",
        description: `${trial_days_remaining} day${trial_days_remaining === 1 ? "" : "s"} remaining in your trial`,
        icon: Sparkles,
        color: "blue",
        bgColor: "bg-blue-50",
        textColor: "text-blue-700",
        borderColor: "border-blue-200",
      };
    }
    if (tier === "pro") {
      return {
        name: "Pro",
        description: "Full access to all features",
        icon: Crown,
        color: "purple",
        bgColor: "bg-purple-50",
        textColor: "text-purple-700",
        borderColor: "border-purple-200",
      };
    }
    return {
      name: "Free",
      description: "Basic access with limited features",
      icon: null,
      color: "gray",
      bgColor: "bg-gray-50",
      textColor: "text-gray-700",
      borderColor: "border-gray-200",
    };
  };

  const formatLimit = (value: number) => {
    if (value === -1) return "Unlimited";
    return value.toLocaleString();
  };

  const getUsagePercentage = (current: number, limit: number) => {
    if (limit === -1) return 0;
    return Math.min(100, Math.round((current / limit) * 100));
  };

  const handleUpgradeClick = () => {
    onUpgrade();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const planInfo = getPlanInfo();
  const PlanIcon = planInfo.icon;
  const showUpgradeButton = tier === "free" || (is_trial && !is_beta_user);

  return (
    <div className="space-y-6">
      <div
        className={`p-4 rounded-lg border ${planInfo.bgColor} ${planInfo.borderColor}`}
      >
        <div className="flex items-center gap-3">
          {PlanIcon && (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                planInfo.color === "purple" ? "bg-purple-100" : "bg-blue-100"
              }`}
            >
              <PlanIcon
                className={`w-5 h-5 ${
                  planInfo.color === "purple"
                    ? "text-purple-600"
                    : "text-blue-600"
                }`}
              />
            </div>
          )}
          {!PlanIcon && (
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100">
              <span className="text-gray-500 text-sm font-medium">F</span>
            </div>
          )}
          <div>
            <h3 className={`font-semibold ${planInfo.textColor}`}>
              {planInfo.name}
            </h3>
            <p className="text-sm text-gray-600">{planInfo.description}</p>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Usage</h4>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 text-gray-600">
                <FileText className="w-4 h-4" />
                Indexed Files
              </span>
              <span className="text-gray-900 font-medium">
                {usage.indexed_files.toLocaleString()} /{" "}
                {formatLimit(limits.max_indexed_files)}
              </span>
            </div>
            {limits.max_indexed_files !== -1 && (
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    getUsagePercentage(
                      usage.indexed_files,
                      limits.max_indexed_files,
                    ) >= 90
                      ? "bg-red-500"
                      : getUsagePercentage(
                            usage.indexed_files,
                            limits.max_indexed_files,
                          ) >= 70
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                  style={{
                    width: `${getUsagePercentage(usage.indexed_files, limits.max_indexed_files)}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="flex items-center gap-2 text-gray-600">
                <Search className="w-4 h-4" />
                Searches This Month
              </span>
              <span className="text-gray-900 font-medium">
                {usage.searches_this_month.toLocaleString()} /{" "}
                {formatLimit(limits.max_searches_per_month)}
              </span>
            </div>
            {limits.max_searches_per_month !== -1 && (
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    getUsagePercentage(
                      usage.searches_this_month,
                      limits.max_searches_per_month,
                    ) >= 90
                      ? "bg-red-500"
                      : getUsagePercentage(
                            usage.searches_this_month,
                            limits.max_searches_per_month,
                          ) >= 70
                        ? "bg-amber-500"
                        : "bg-blue-500"
                  }`}
                  style={{
                    width: `${getUsagePercentage(usage.searches_this_month, limits.max_searches_per_month)}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Plan Details</h4>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Max Files</span>
            <span className="text-gray-900">
              {formatLimit(limits.max_indexed_files)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Max Searches / Month</span>
            <span className="text-gray-900">
              {formatLimit(limits.max_searches_per_month)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Conversation History</span>
            <span className="text-gray-900">
              {limits.conversation_history_days === -1
                ? "Unlimited"
                : `${limits.conversation_history_days} days`}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">File Types</span>
            <span className="text-gray-900">
              {allowed_file_types.join(", ")}
            </span>
          </div>
        </div>
      </div>

      {showUpgradeButton && (
        <button
          onClick={handleUpgradeClick}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Upgrade to Pro
        </button>
      )}
    </div>
  );
}
