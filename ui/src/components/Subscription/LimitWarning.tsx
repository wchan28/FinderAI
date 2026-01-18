import { AlertTriangle, Zap } from "lucide-react";

type LimitWarningProps = {
  type: "files" | "searches";
  current: number;
  limit: number;
  onUpgrade: () => void;
};

export function LimitWarning({
  type,
  current,
  limit,
  onUpgrade,
}: LimitWarningProps) {
  const percentage = (current / limit) * 100;

  if (percentage < 80) return null;

  const isAtLimit = current >= limit;
  const label = type === "files" ? "File" : "Search";
  const labelPlural = type === "files" ? "files" : "searches";

  return (
    <div
      className={`p-3 rounded-lg ${
        isAtLimit
          ? "bg-red-50 border border-red-200"
          : "bg-amber-50 border border-amber-200"
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`w-4 h-4 mt-0.5 ${isAtLimit ? "text-red-500" : "text-amber-500"}`}
        />
        <div className="flex-1">
          <p
            className={`text-sm font-medium ${isAtLimit ? "text-red-800" : "text-amber-800"}`}
          >
            {isAtLimit ? `${label} limit reached` : `Approaching ${type} limit`}
          </p>
          <p
            className={`text-xs mt-0.5 ${isAtLimit ? "text-red-600" : "text-amber-600"}`}
          >
            {current} of {limit} {labelPlural} used
          </p>
        </div>
        <button
          onClick={onUpgrade}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium hover:bg-blue-600 flex items-center gap-1 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Upgrade
        </button>
      </div>
    </div>
  );
}
