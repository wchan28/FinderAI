import { useState, useEffect } from "react";
import {
  Database,
  FileText,
  Sliders,
  Trash2,
  ChevronDown,
  ChevronRight,
  Info,
  Square,
  Play,
  X,
} from "lucide-react";
import { Modal } from "../common/Modal";
import { FolderPicker } from "./FolderPicker";
import { ProgressBar } from "../Indexing/ProgressBar";
import { ProviderSettings } from "./ProviderSettings";
import { useIndexing } from "../../hooks/useIndexing";
import { getSettings } from "../../api/client";
import type { SkippedByReason, SkippedFile } from "../../api/client";

const SHOW_PROVIDER_SETTINGS = false;

type Tab = "indexing" | "providers";

type SettingsPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  onRunSetup?: () => void;
};

function getOtherSkippedCount(
  skippedByReason: SkippedByReason | undefined,
): number {
  if (!skippedByReason) return 0;
  return (
    skippedByReason.scanned_image.length +
    skippedByReason.empty_file.length +
    skippedByReason.file_too_large.length +
    skippedByReason.unsupported_type.length
  );
}

type SkipCategory = {
  key: keyof Omit<SkippedByReason, "chunk_limit_exceeded">;
  label: string;
  files: SkippedFile[];
};

function getSkipCategories(skippedByReason: SkippedByReason): SkipCategory[] {
  const categories: SkipCategory[] = [];

  if (skippedByReason.scanned_image.length > 0) {
    categories.push({
      key: "scanned_image",
      label: "scanned images (no searchable text)",
      files: skippedByReason.scanned_image,
    });
  }
  if (skippedByReason.empty_file.length > 0) {
    categories.push({
      key: "empty_file",
      label: "empty files (no content)",
      files: skippedByReason.empty_file,
    });
  }
  if (skippedByReason.file_too_large.length > 0) {
    categories.push({
      key: "file_too_large",
      label: "files too large (>50MB)",
      files: skippedByReason.file_too_large,
    });
  }
  if (skippedByReason.unsupported_type.length > 0) {
    categories.push({
      key: "unsupported_type",
      label: "unsupported file types",
      files: skippedByReason.unsupported_type,
    });
  }

  return categories;
}

export function SettingsPanel({
  isOpen,
  onClose,
  onRunSetup,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("indexing");
  const [folder, setFolder] = useState("");
  const [maxChunks, setMaxChunks] = useState(50);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
  const {
    isIndexing,
    isClearing,
    progress,
    stats,
    status,
    error,
    incompleteJob,
    startIndexing,
    stopIndexing,
    resumeIndexing,
    discardJob,
    indexSkippedFiles,
    clearIndex,
    refreshStatus,
  } = useIndexing();

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
      getSettings()
        .then((settings) => {
          if (settings.indexed_folder) {
            setFolder(settings.indexed_folder);
          }
        })
        .catch(console.error);
    }
  }, [isOpen, refreshStatus]);

  const handleIndex = () => {
    if (folder) {
      startIndexing(folder, maxChunks);
    }
  };

  const handleStop = () => {
    stopIndexing();
  };

  const handleIndexSkipped = () => {
    indexSkippedFiles(maxChunks);
  };

  const handleResume = () => {
    resumeIndexing();
  };

  const handleDiscard = () => {
    if (
      window.confirm(
        "Are you sure you want to discard this incomplete indexing job? You will need to start indexing again.",
      )
    ) {
      discardJob();
    }
  };

  const handleClearIndex = () => {
    if (
      window.confirm(
        "Are you sure you want to clear all indexed data? You will need to re-index your files.",
      )
    ) {
      clearIndex();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings & Indexing">
      <div className="space-y-4">
        <div className="flex border-b border-gray-200 -mt-2 -mx-6 px-6">
          <button
            onClick={() => setActiveTab("indexing")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "indexing"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Indexing
            </span>
          </button>
          {SHOW_PROVIDER_SETTINGS && (
            <button
              onClick={() => setActiveTab("providers")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "providers"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                AI Providers
              </span>
            </button>
          )}
        </div>

        {SHOW_PROVIDER_SETTINGS && activeTab === "providers" && (
          <ProviderSettings onRunSetup={onRunSetup} />
        )}

        {activeTab === "indexing" && (
          <>
            {incompleteJob && !isIndexing && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">
                      Incomplete indexing job found
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {incompleteJob.files_processed} of{" "}
                      {incompleteJob.files_total} files processed (
                      {incompleteJob.progress_percent}%)
                    </p>
                    <p
                      className="text-xs text-blue-500 mt-0.5 truncate"
                      title={incompleteJob.folder}
                    >
                      {incompleteJob.folder}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleResume}
                      className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                    <button
                      onClick={handleDiscard}
                      className="px-2 py-1.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300 transition-colors"
                      title="Discard this job"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Folder to Index
              </label>
              <FolderPicker
                value={folder}
                onSelect={setFolder}
                disabled={isIndexing || isClearing}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Chunks per File: {maxChunks}
              </label>
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={maxChunks}
                onChange={(e) => setMaxChunks(Number(e.target.value))}
                disabled={isIndexing || isClearing}
                className="w-full"
              />
              <p className="text-xs text-gray-400 mt-1">
                Higher = more content indexed, but slower. Start with 50,
                increase if needed.
              </p>
            </div>

            <div className="flex gap-2">
              {isIndexing ? (
                <button
                  onClick={handleStop}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop Indexing
                </button>
              ) : (
                <button
                  onClick={handleIndex}
                  disabled={!folder}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  Index Folder
                </button>
              )}
              <button
                onClick={handleClearIndex}
                disabled={isIndexing || isClearing || !status?.indexed_files}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                {error}
              </div>
            )}

            <ProgressBar messages={progress} isActive={isIndexing} />

            {stats && !isIndexing && (
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg">
                <p className="font-medium">Indexing Complete</p>
                <p>Files indexed: {stats.indexed_files}</p>
                <p>Chunks created: {stats.total_chunks}</p>
                <p>Time: {stats.total_time.toFixed(1)}s</p>
              </div>
            )}

            {stats && !isIndexing && stats.skipped_files?.length > 0 && (
              <div className="p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
                <p className="font-medium mb-2">
                  {stats.skipped_files.length} file(s) skipped (exceeded chunk
                  limit)
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {stats.skipped_files.map((file, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate">{file.file_name}</span>
                      <span className="text-amber-600 ml-2 whitespace-nowrap">
                        {file.chunks_would_be} chunks needed
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-amber-600">
                    Set Max Chunks to{" "}
                    {Math.max(
                      ...stats.skipped_files.map((f) => f.chunks_would_be || 0),
                    )}
                    + to index all
                  </p>
                  <button
                    onClick={handleIndexSkipped}
                    className="px-3 py-1.5 bg-amber-500 text-white text-xs rounded hover:bg-amber-600 transition-colors flex items-center gap-1"
                  >
                    <Database className="w-3 h-3" />
                    Index These Files
                  </button>
                </div>
              </div>
            )}

            {stats &&
              !isIndexing &&
              getOtherSkippedCount(stats.skipped_by_reason) > 0 && (
                <div className="p-3 bg-gray-50 text-gray-600 text-sm rounded-lg">
                  <button
                    onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    {showSkippedDetails ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <Info className="w-4 h-4" />
                    <span className="font-medium">
                      {getOtherSkippedCount(stats.skipped_by_reason)} file(s)
                      skipped
                    </span>
                  </button>
                  <div className="ml-6 mt-1 space-y-0.5">
                    {getSkipCategories(stats.skipped_by_reason).map(
                      (category) => (
                        <div
                          key={category.key}
                          className="text-xs text-gray-500"
                        >
                          {category.files.length} {category.label}
                        </div>
                      ),
                    )}
                  </div>
                  {showSkippedDetails && (
                    <div className="mt-2 ml-6 max-h-32 overflow-y-auto space-y-2">
                      {getSkipCategories(stats.skipped_by_reason).map(
                        (category) => (
                          <div key={category.key}>
                            <div className="text-xs font-medium text-gray-500 mb-1">
                              {category.label}
                            </div>
                            {category.files.map((file, i) => (
                              <div
                                key={i}
                                className="text-xs text-gray-400 truncate pl-2"
                              >
                                {file.file_name}
                              </div>
                            ))}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}

            {stats && !isIndexing && stats.errors?.length > 0 && (
              <div className="p-3 bg-red-50 text-red-800 text-sm rounded-lg">
                <p className="font-medium mb-2">
                  {stats.errors.length} file(s) failed to index
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {stats.errors.map((err, i) => {
                    const match = err.match(/Error indexing .*\/(.+?): (.+)/);
                    const fileName = match ? match[1] : "Unknown file";
                    const reason = match ? match[2] : err;
                    const getReadableError = (error: string): string => {
                      if (
                        error.includes("not a zip file") ||
                        error.includes("BadZipFile")
                      ) {
                        return "File appears to be corrupted or incomplete";
                      }
                      if (
                        error.includes("cryptography") &&
                        error.includes("AES")
                      ) {
                        return "File is password-protected or encrypted";
                      }
                      if (
                        error.includes("max allowed") ||
                        error.includes("too large") ||
                        error.includes("exceeds")
                      ) {
                        return "File content exceeds size limit";
                      }
                      return error.length > 60
                        ? error.slice(0, 60) + "..."
                        : error;
                    };
                    return (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{fileName}</span>
                        <span
                          className="text-red-600 ml-1 block truncate"
                          title={reason}
                        >
                          {getReadableError(reason)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {status && status.files.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Indexed Files ({status.indexed_files})
                </h4>
                <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-2">
                  {status.files.slice(0, 20).map((file, i) => (
                    <div key={i} className="text-xs py-1 flex justify-between">
                      <span className="text-gray-700 truncate">
                        {file.file_name}
                      </span>
                      <span className="text-gray-400 ml-2">
                        {file.chunk_count} chunks
                      </span>
                    </div>
                  ))}
                  {status.files.length > 20 && (
                    <div className="text-xs text-gray-400 py-1">
                      ... and {status.files.length - 20} more files
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
