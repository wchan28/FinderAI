import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  getApiUrl: () => ipcRenderer.invoke("get-api-url"),
  openFile: (filePath: string) => ipcRenderer.invoke("open-file", filePath),
});
