/// <reference types="vite/client" />

interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  getApiUrl: () => Promise<string>
}

interface Window {
  electronAPI?: ElectronAPI
}
