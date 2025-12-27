/// <reference types="vite/client" />

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getApiUrl: () => Promise<string>;
  openFile: (filePath: string) => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
