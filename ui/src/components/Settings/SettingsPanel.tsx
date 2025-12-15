import { useState, useEffect } from 'react'
import { Settings, ChevronDown, ChevronUp, Database, FileText, RefreshCw, Cpu, Loader2 } from 'lucide-react'
import { FolderPicker } from './FolderPicker'
import { ProgressBar } from '../Indexing/ProgressBar'
import { useIndexing } from '../../hooks/useIndexing'
import { getAvailableModels, type ModelInfo } from '../../api/client'

type SettingsPanelProps = {
  model: string
  onModelChange: (model: string) => void
}

export function SettingsPanel({ model, onModelChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [folder, setFolder] = useState('')
  const [maxChunks, setMaxChunks] = useState(50)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const { isIndexing, progress, stats, status, error, startIndexing, reindexAll, refreshStatus } = useIndexing()

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const models = await getAvailableModels()
        setAvailableModels(models)
      } catch {
        setAvailableModels([])
      } finally {
        setModelsLoading(false)
      }
    }
    fetchModels()
  }, [])

  const handleIndex = () => {
    if (folder) {
      startIndexing(folder, maxChunks)
    }
  }

  const handleReindex = () => {
    reindexAll(maxChunks)
  }

  return (
    <div className="border-b bg-white">
      <div className="drag-region flex items-center justify-between pl-20 pr-4 py-3">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-700">Settings & Indexing</span>
          {status && (
            <span className="text-xs text-gray-400 ml-2">
              {status.indexed_files} files, {status.total_chunks} chunks
            </span>
          )}
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="no-drag p-1 hover:bg-gray-100 rounded transition-colors"
        >
          {isOpen ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Folder to Index
            </label>
            <FolderPicker onSelect={setFolder} disabled={isIndexing} />
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
              disabled={isIndexing}
              className="w-full"
            />
            <p className="text-xs text-gray-400 mt-1">
              Higher = more content indexed, but slower. Start with 50, increase if needed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              LLM Model
            </label>
            {modelsLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading models...
              </div>
            ) : availableModels.length === 0 ? (
              <div className="px-3 py-2 text-amber-600 text-sm">
                No models found. Install models with: <code className="bg-gray-100 px-1 rounded">ollama pull llama3.2:3b</code>
              </div>
            ) : (
              <select
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {availableModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Smaller models are faster but may be less accurate. Try different models if results are poor.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleIndex}
              disabled={!folder || isIndexing}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              {isIndexing ? 'Indexing...' : 'Index Folder'}
            </button>
            <button
              onClick={handleReindex}
              disabled={isIndexing || !status?.indexed_files}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reindex
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
                {stats.skipped_files.length} file(s) skipped (exceeded {maxChunks} chunk limit)
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
              <p className="text-xs text-amber-600 mt-2">
                Increase "Max Chunks per File" above to index these files
              </p>
            </div>
          )}

          {stats && !isIndexing && stats.errors?.length > 0 && (
            <div className="p-3 bg-red-50 text-red-800 text-sm rounded-lg">
              <p className="font-medium mb-2">
                {stats.errors.length} file(s) failed to index
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {stats.errors.map((error, i) => {
                  const match = error.match(/Error indexing .*\/(.+?): (.+)/)
                  const fileName = match ? match[1] : 'Unknown file'
                  const reason = match ? match[2] : error
                  return (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{fileName}</span>
                      <span className="text-red-600 ml-1 block truncate" title={reason}>
                        {reason.length > 60 ? reason.slice(0, 60) + '...' : reason}
                      </span>
                    </div>
                  )
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
                    <span className="text-gray-700 truncate">{file.file_name}</span>
                    <span className="text-gray-400 ml-2">{file.chunk_count} chunks</span>
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
        </div>
      )}
    </div>
  )
}
