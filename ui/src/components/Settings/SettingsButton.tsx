import { Settings } from "lucide-react";

type SettingsButtonProps = {
  onClick: () => void;
  fileCount?: number;
};

export function SettingsButton({ onClick, fileCount }: SettingsButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full shadow-lg hover:shadow-xl hover:bg-gray-50 transition-all"
      title="Settings & Indexing"
    >
      <Settings className="w-5 h-5 text-gray-600" />
      {fileCount !== undefined && fileCount > 0 && (
        <span className="text-xs text-gray-500">{fileCount} files</span>
      )}
    </button>
  );
}
