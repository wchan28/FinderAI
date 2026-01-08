import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  streamIndex,
  streamReindex,
  streamIndexSkipped,
  streamResume,
  getStatus,
  clearIndex as clearIndexApi,
  cancelIndex as cancelIndexApi,
  getIndexingResults,
  getJobStatus,
  discardJob as discardJobApi,
  StatusResponse,
  IndexStats,
  JobInfo,
} from "../api/client";

export function useIndexing() {
  const { getToken } = useAuth();
  const [isIndexing, setIsIndexing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incompleteJob, setIncompleteJob] = useState<JobInfo | null>(null);

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

  const checkIncompleteJob = useCallback(async () => {
    try {
      const data = await getJobStatus();
      if (data.has_incomplete_job && data.job_info) {
        setIncompleteJob(data.job_info);
      } else {
        setIncompleteJob(null);
      }
    } catch (err) {
      console.error("Failed to check incomplete job:", err);
    }
  }, []);

  const discardJob = useCallback(async () => {
    try {
      await discardJobApi();
      setIncompleteJob(null);
    } catch (err) {
      console.error("Failed to discard job:", err);
    }
  }, []);

  useEffect(() => {
    restoreResults();
    checkIncompleteJob();

    if (window.electronAPI?.onIncompleteIndexing) {
      const cleanup = window.electronAPI.onIncompleteIndexing((jobInfo) => {
        setIncompleteJob(jobInfo as JobInfo);
      });
      return cleanup;
    }
  }, [restoreResults, checkIncompleteJob]);

  const stopIndexing = useCallback(async () => {
    setIsStopping(true);
    setIsIndexing(false);
    setProgress([]);
    window.electronAPI?.allowSleep();
    try {
      await cancelIndexApi();
    } catch (err) {
      console.error("Failed to cancel indexing:", err);
      setIsStopping(false);
    }
  }, []);

  const startIndexing = useCallback(
    async (folder: string, maxChunks: number = 50, force: boolean = false) => {
      if (isStopping) {
        setError("Please wait, previous indexing is still stopping...");
        return;
      }

      setIsIndexing(true);
      setProgress([]);
      setStats(null);
      setError(null);
      setIncompleteJob(null);

      window.electronAPI?.preventSleep();

      const clerkToken = await getToken();

      await streamIndex(
        folder,
        maxChunks,
        force,
        {
          onProgress: (message) => {
            setProgress((prev) => [...prev, message]);
          },
          onStats: (newStats) => {
            setStats(newStats);
          },
          onCancelled: (newStats) => {
            setStats(newStats);
            setProgress((prev) => [...prev, "Indexing paused"]);
            setIsStopping(false);
            checkIncompleteJob();
          },
          onDone: () => {
            setIsIndexing(false);
            setIsStopping(false);
            window.electronAPI?.allowSleep();
            refreshStatus();
          },
          onError: (err) => {
            setError(err);
            setIsIndexing(false);
            setIsStopping(false);
            window.electronAPI?.allowSleep();
          },
        },
        clerkToken ?? undefined,
      );
    },
    [refreshStatus, checkIncompleteJob, getToken, isStopping],
  );

  const resumeIndexing = useCallback(async () => {
    if (!incompleteJob) return;

    setIsIndexing(true);
    setProgress([]);
    setStats(null);
    setError(null);

    window.electronAPI?.preventSleep();

    const clerkToken = await getToken();

    await streamResume(
      incompleteJob.id,
      {
        onProgress: (message) => {
          setProgress((prev) => [...prev, message]);
        },
        onStats: (newStats) => {
          setStats(newStats);
          setIncompleteJob(null);
        },
        onPaused: (newStats) => {
          setStats(newStats);
          setProgress((prev) => [...prev, "Indexing paused"]);
          setIsStopping(false);
          checkIncompleteJob();
        },
        onDone: () => {
          setIsIndexing(false);
          setIsStopping(false);
          window.electronAPI?.allowSleep();
          refreshStatus();
        },
        onError: (err) => {
          setError(err);
          setIsIndexing(false);
          setIsStopping(false);
          window.electronAPI?.allowSleep();
        },
      },
      clerkToken ?? undefined,
    );
  }, [incompleteJob, refreshStatus, checkIncompleteJob, getToken]);

  const reindexAll = useCallback(
    async (maxChunks: number = 50) => {
      setIsIndexing(true);
      setProgress([]);
      setStats(null);
      setError(null);

      const clerkToken = await getToken();

      await streamReindex(
        maxChunks,
        {
          onProgress: (message) => {
            setProgress((prev) => [...prev, message]);
          },
          onStats: (newStats) => {
            setStats(newStats);
          },
          onCancelled: (newStats) => {
            setStats(newStats);
            setProgress((prev) => [...prev, "Reindexing stopped by user"]);
            setIsStopping(false);
          },
          onDone: () => {
            setIsIndexing(false);
            setIsStopping(false);
            refreshStatus();
          },
          onError: (err) => {
            setError(err);
            setIsIndexing(false);
            setIsStopping(false);
          },
        },
        clerkToken ?? undefined,
      );
    },
    [refreshStatus, getToken],
  );

  const indexSkippedFiles = useCallback(
    async (maxChunks: number = 50) => {
      setIsIndexing(true);
      setProgress([]);
      setStats(null);
      setError(null);

      const clerkToken = await getToken();

      await streamIndexSkipped(
        maxChunks,
        {
          onProgress: (message) => {
            setProgress((prev) => [...prev, message]);
          },
          onStats: (newStats) => {
            setStats(newStats);
          },
          onCancelled: (newStats) => {
            setStats(newStats);
            setProgress((prev) => [...prev, "Indexing stopped by user"]);
            setIsStopping(false);
          },
          onDone: () => {
            setIsIndexing(false);
            setIsStopping(false);
            refreshStatus();
          },
          onError: (err) => {
            setError(err);
            setIsIndexing(false);
            setIsStopping(false);
          },
        },
        clerkToken ?? undefined,
      );
    },
    [refreshStatus, getToken],
  );

  const clearIndex = useCallback(async () => {
    setIsClearing(true);
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
      setIsClearing(false);
    }
  }, [refreshStatus]);

  return {
    isIndexing,
    isStopping,
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
    reindexAll,
    indexSkippedFiles,
    clearIndex,
    refreshStatus,
  };
}
