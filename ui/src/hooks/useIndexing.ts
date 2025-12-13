import { useState, useCallback } from 'react'
import { streamIndex, getStatus, StatusResponse, IndexStats } from '../api/client'

export function useIndexing() {
  const [isIndexing, setIsIndexing] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [stats, setStats] = useState<IndexStats | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getStatus()
      setStatus(data)
    } catch (err) {
      console.error('Failed to get status:', err)
    }
  }, [])

  const startIndexing = useCallback(async (folder: string, maxChunks: number = 50, force: boolean = false) => {
    setIsIndexing(true)
    setProgress([])
    setStats(null)
    setError(null)

    await streamIndex(folder, maxChunks, force, {
      onProgress: (message) => {
        setProgress(prev => [...prev, message])
      },
      onStats: (newStats) => {
        setStats(newStats)
      },
      onDone: () => {
        setIsIndexing(false)
        refreshStatus()
      },
      onError: (err) => {
        setError(err)
        setIsIndexing(false)
      },
    })
  }, [refreshStatus])

  return {
    isIndexing,
    progress,
    stats,
    status,
    error,
    startIndexing,
    refreshStatus,
  }
}
