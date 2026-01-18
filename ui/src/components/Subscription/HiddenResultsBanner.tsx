import { Eye, Zap } from "lucide-react";
import type { HiddenResults } from "../../api/client";

type HiddenResultsBannerProps = {
  hiddenResults: HiddenResults;
  onUpgrade?: () => void;
};

export function HiddenResultsBanner({
  hiddenResults,
  onUpgrade,
}: HiddenResultsBannerProps) {
  if (hiddenResults.count === 0) {
    return null;
  }

  const extensionLabels: Record<string, string> = {
    ".pptx": "PowerPoint",
    ".xlsx": "Excel",
  };

  const formattedExtensions = hiddenResults.extensions
    .map((ext) => extensionLabels[ext] || ext)
    .join(" and ");

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-600" />
        <span className="text-sm text-blue-800 flex-1">
          {hiddenResults.count} {formattedExtensions} result
          {hiddenResults.count !== 1 ? "s" : ""} found but hidden.{" "}
          <button
            onClick={onUpgrade}
            className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
          >
            <Zap className="w-3 h-3" />
            Upgrade to Pro
          </button>{" "}
          to see them.
        </span>
      </div>
    </div>
  );
}
