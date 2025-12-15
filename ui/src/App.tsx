import { useEffect, useState } from 'react'
import { ChatContainer } from './components/Chat/ChatContainer'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { checkHealth } from './api/client'
import { AlertCircle, Loader2 } from 'lucide-react'

const DEFAULT_MODEL = 'llama3.1:8b'
const MODEL_STORAGE_KEY = 'finderai-selected-model'

function App() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [ollamaReady, setOllamaReady] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL
  })

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    localStorage.setItem(MODEL_STORAGE_KEY, model)
  }

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const health = await checkHealth()
        setBackendStatus('ready')
        setOllamaReady(health.ollama)
      } catch {
        setBackendStatus('error')
      }
    }

    checkBackend()
    const interval = setInterval(checkBackend, 5000)
    return () => clearInterval(interval)
  }, [])

  if (backendStatus === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Starting FinderAI...</p>
          <p className="text-sm text-gray-400 mt-1">Loading backend services</p>
        </div>
      </div>
    )
  }

  if (backendStatus === 'error') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <p className="mt-4 text-gray-900 font-medium">Backend Not Available</p>
          <p className="text-sm text-gray-600 mt-2">
            Make sure the Python backend is running. Start it with:
          </p>
          <code className="block mt-2 p-2 bg-gray-100 rounded text-sm">
            python -m uvicorn backend.api.server:app
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {!ollamaReady && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Ollama not detected. Make sure Ollama is running for chat functionality.
        </div>
      )}
      <SettingsPanel model={selectedModel} onModelChange={handleModelChange} />
      <div className="flex-1 overflow-hidden">
        <ChatContainer model={selectedModel} />
      </div>
    </div>
  )
}

export default App
