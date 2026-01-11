import { useState, useEffect } from "react";
import { RefreshCw, X } from "lucide-react";

export function UpdateIndicator() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.electronAPI?.getUpdateStatus().then((status) => {
      if (status.updateReady) {
        setUpdateVersion(status.version);
      }
    });

    const cleanup = window.electronAPI?.onUpdateReady((version) => {
      setUpdateVersion(version);
      setDismissed(false);
    });

    return cleanup;
  }, []);

  if (!updateVersion || dismissed) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
      <RefreshCw className="w-3 h-3" />
      <span>v{updateVersion} ready</span>
      <button
        onClick={() => window.electronAPI?.restartToUpdate()}
        className="underline hover:no-underline"
      >
        Restart
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 hover:bg-blue-100 rounded"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
