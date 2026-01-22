import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getApiUrl: () => ipcRenderer.invoke("get-api-url"),
  openFile: (filePath: string) => ipcRenderer.invoke("open-file", filePath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  preventSleep: () => ipcRenderer.invoke("prevent-sleep"),
  allowSleep: () => ipcRenderer.invoke("allow-sleep"),
  isSleepPrevented: () => ipcRenderer.invoke("is-sleep-prevented"),
  onIncompleteIndexing: (callback: (jobInfo: unknown) => void) => {
    ipcRenderer.on("incomplete-indexing", (_, jobInfo) => callback(jobInfo));
    return () => ipcRenderer.removeAllListeners("incomplete-indexing");
  },
  onAuthCallback: (callback: (url: string) => void) => {
    ipcRenderer.on("auth-callback", (_, url) => callback(url));
    return () => ipcRenderer.removeAllListeners("auth-callback");
  },
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  restartToUpdate: () => ipcRenderer.invoke("restart-to-update"),
  onUpdateReady: (callback: (version: string) => void) => {
    ipcRenderer.on("update-ready", (_, version) => callback(version));
    return () => ipcRenderer.removeAllListeners("update-ready");
  },
  getPlatform: () => process.platform,
  storeGet: (key: string) => ipcRenderer.invoke("electron-store-get", key),
  storeSet: (key: string, value: unknown) =>
    ipcRenderer.invoke("electron-store-set", key, value),
  storeDelete: (key: string) => ipcRenderer.invoke("electron-store-delete", key),
});
