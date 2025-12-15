const API_BASE = 'http://127.0.0.1:8000'

export interface Source {
  file_name: string
  file_path: string
  slide_number: number
  relevance_score: number
}

export interface StatusResponse {
  total_chunks: number
  indexed_files: number
  files: Array<{
    file_path: string
    file_name: string
    chunk_count: number
    indexed_at: string
  }>
}

export interface SkippedFile {
  file_name: string
  reason: string
  chunks_would_be: number
}

export interface IndexStats {
  total_files: number
  indexed_files: number
  skipped_unchanged: number
  skipped_limits: number
  total_chunks: number
  total_time: number
  errors: string[]
  skipped_files: SkippedFile[]
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await fetch(`${API_BASE}/api/status`)
  if (!res.ok) throw new Error('Failed to get status')
  return res.json()
}

export async function checkHealth(): Promise<{ status: string; ollama: boolean }> {
  const res = await fetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error('Backend not available')
  return res.json()
}

export interface ModelInfo {
  name: string
  label: string
  size: string
}

export async function getAvailableModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/api/models`)
  if (!res.ok) throw new Error('Failed to get models')
  const data = await res.json()
  return data.models
}

export interface ChatStreamCallbacks {
  onChunk: (chunk: string) => void
  onSources: (sources: Source[]) => void
  onDone: () => void
  onError: (error: string) => void
}

export async function streamChat(
  message: string,
  callbacks: ChatStreamCallbacks,
  model?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...(model && { model }) }),
  })

  if (!res.ok) {
    callbacks.onError('Failed to send message')
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError('No response body')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'chunk') {
            callbacks.onChunk(data.content)
          } else if (data.type === 'sources') {
            callbacks.onSources(data.content)
          } else if (data.type === 'done') {
            callbacks.onDone()
          } else if (data.type === 'error') {
            callbacks.onError(data.content)
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}

export interface IndexStreamCallbacks {
  onProgress: (message: string) => void
  onStats: (stats: IndexStats) => void
  onDone: () => void
  onError: (error: string) => void
}

export async function streamIndex(
  folder: string,
  maxChunks: number,
  force: boolean,
  callbacks: IndexStreamCallbacks
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, max_chunks: maxChunks, force }),
  })

  if (!res.ok) {
    callbacks.onError('Failed to start indexing')
    return
  }

  await processSSEStream(res, callbacks)
}

export async function streamReindex(
  maxChunks: number,
  callbacks: IndexStreamCallbacks
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reindex`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_chunks: maxChunks }),
  })

  if (!res.ok) {
    callbacks.onError('Failed to start reindexing')
    return
  }

  await processSSEStream(res, callbacks)
}

async function processSSEStream(res: Response, callbacks: IndexStreamCallbacks): Promise<void> {
  const reader = res.body?.getReader()
  if (!reader) {
    callbacks.onError('No response body')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'progress') {
            callbacks.onProgress(data.content)
          } else if (data.type === 'stats') {
            callbacks.onStats(data.content)
          } else if (data.type === 'done') {
            callbacks.onDone()
          } else if (data.type === 'error') {
            callbacks.onError(data.content)
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }
}
