/// <reference types="vite/client" />

type IncompleteJobInfo = {
  folder: string;
  files_total: number;
  files_processed: number;
  status: string;
  progress_percent: number;
};

interface ElectronAPI {
  selectFolder: () => Promise<string | null>;
  getApiUrl: () => Promise<string>;
  openFile: (filePath: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  preventSleep: () => Promise<{ blocked: boolean }>;
  allowSleep: () => Promise<{ stopped: boolean }>;
  isSleepPrevented: () => Promise<{ prevented: boolean }>;
  onIncompleteIndexing: (
    callback: (jobInfo: IncompleteJobInfo) => void,
  ) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
