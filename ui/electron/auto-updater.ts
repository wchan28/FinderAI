import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";

let updateDownloaded = false;
let downloadedVersion: string | null = null;

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.logger = null;

  autoUpdater.checkForUpdates().catch(() => {});

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    4 * 60 * 60 * 1000,
  );

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloaded = true;
    downloadedVersion = info.version;
    mainWindow.webContents.send("update-ready", info.version);
  });

  autoUpdater.on("error", () => {});
}

export function registerAutoUpdateIPC(): void {
  ipcMain.handle("get-update-status", () => ({
    updateReady: updateDownloaded,
    version: downloadedVersion,
  }));

  ipcMain.handle("restart-to-update", () => {
    // Set flag so before-quit handler doesn't block the update
    (global as any).isQuittingForUpdate = true;
    autoUpdater.quitAndInstall(false, true);
  });
}
