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
});
