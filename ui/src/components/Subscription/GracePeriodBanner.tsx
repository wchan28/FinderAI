import { AlertTriangle, Clock, Zap } from "lucide-react";
import { useSubscription } from "../../providers/SubscriptionProvider";
import { useState } from "react";

type GracePeriodBannerProps = {
  onUpgrade?: () => void;
};

export function GracePeriodBanner({ onUpgrade }: GracePeriodBannerProps) {
  const { tier, is_beta_user, isLoading, grace_period, usage } =
    useSubscription();
  const [showFileList, setShowFileList] = useState(false);

  if (isLoading || is_beta_user || tier !== "free") {
    return null;
  }

  const { in_grace_period, days_remaining, files_to_archive_count } =
    grace_period;

  if (in_grace_period && files_to_archive_count > 0) {
    return (
      <div className="border-b bg-orange-50 border-orange-200">
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">
                {days_remaining} day{days_remaining !== 1 ? "s" : ""} to keep
                your indexed files
              </p>
              <p className="text-sm text-orange-700 mt-1">
                Your Pro trial has ended. You have{" "}
                {usage.indexed_files.toLocaleString()} files indexed, but the
                free tier allows 500. In {days_remaining} day
                {days_remaining !== 1 ? "s" : ""},{" "}
                {files_to_archive_count.toLocaleString()} files will be
                archived.
              </p>
              {grace_period.files_to_archive.length > 0 && (
                <button
                  onClick={() => setShowFileList(!showFileList)}
                  className="text-sm text-orange-600 hover:text-orange-800 underline mt-2"
                >
                  {showFileList
                    ? "Hide files to archive"
                    : "Show files to archive"}
                </button>
              )}
              {showFileList && grace_period.files_to_archive.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto bg-white/50 rounded p-2 text-xs text-orange-700">
                  {grace_period.files_to_archive.slice(0, 50).map((path, i) => (
                    <div key={i} className="truncate py-0.5">
                      {path.split("/").pop()}
                    </div>
                  ))}
                  {grace_period.files_to_archive.length > 50 && (
                    <div className="text-orange-600 mt-1">
                      ...and {grace_period.files_to_archive.length - 50} more
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-700 transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Zap className="w-4 h-4" />
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!in_grace_period && usage.archived_files > 0) {
    return (
      <div className="border-b bg-amber-50 border-amber-200">
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {usage.archived_files.toLocaleString()} files archived
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Upgrade to Pro to instantly restore all your archived files - no
                re-indexing needed.
              </p>
            </div>
            <button
              onClick={onUpgrade}
              className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Zap className="w-4 h-4" />
              Restore Files
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
