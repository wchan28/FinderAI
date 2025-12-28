import { useState, useCallback, useEffect } from "react";
import {
  streamIndex,
  streamReindex,
  getStatus,
  clearIndex as clearIndexApi,
  getIndexingResults,
  StatusResponse,
  IndexStats,
} from "../api/client";

export function useIndexing() {
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getStatus();
      setStatus(data);
    } catch (err) {
      console.error("Failed to get status:", err);
    }
  }, []);

  const restoreResults = useCallback(async () => {
    try {
      const savedStats = await getIndexingResults();
      if (savedStats) {
        setStats(savedStats);
      }
    } catch (err) {
      console.error("Failed to restore indexing results:", err);
    }
  }, []);

  useEffect(() => {
    restoreResults();
  }, [restoreResults]);

  const startIndexing = useCallback(
    async (folder: string, maxChunks: number = 50, force: boolean = false) => {
      setIsIndexing(true);
      setProgress([]);
      setStats(null);
      setError(null);

      await streamIndex(folder, maxChunks, force, {
        onProgress: (message) => {
          setProgress((prev) => [...prev, message]);
        },
        onStats: (newStats) => {
          setStats(newStats);
        },
        onDone: () => {
          setIsIndexing(false);
          refreshStatus();
        },
        onError: (err) => {
          setError(err);
          setIsIndexing(false);
        },
      });
    },
    [refreshStatus],
  );

  const reindexAll = useCallback(
    async (maxChunks: number = 50) => {
      setIsIndexing(true);
      setProgress([]);
      setStats(null);
      setError(null);

      await streamReindex(maxChunks, {
        onProgress: (message) => {
          setProgress((prev) => [...prev, message]);
        },
        onStats: (newStats) => {
          setStats(newStats);
        },
        onDone: () => {
          setIsIndexing(false);
          refreshStatus();
        },
        onError: (err) => {
          setError(err);
          setIsIndexing(false);
        },
      });
    },
    [refreshStatus],
  );

  const clearIndex = useCallback(async () => {
    setIsIndexing(true);
    setProgress([]);
    setStats(null);
    setError(null);

    try {
      await clearIndexApi();
      setProgress(["Index cleared successfully"]);
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear index");
    } finally {
      setIsIndexing(false);
    }
  }, [refreshStatus]);

  return {
    isIndexing,
    progress,
    stats,
    status,
    error,
    startIndexing,
    reindexAll,
    clearIndex,
    refreshStatus,
  };
}
