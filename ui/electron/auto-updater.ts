import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import { ipcMain } from "electron";
import log from "electron-log";

let updateDownloaded = false;
let downloadedVersion: string | null = null;

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;
  log.transports.file.level = "info";

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  autoUpdater.on("checking-for-update", () => {
    log.info("Auto-updater: checking for update...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Auto-updater: update available", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    log.info("Auto-updater: no update available");
  });

  autoUpdater.on("download-progress", (progress) => {
    log.info(`Auto-updater: download progress ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Auto-updater: update downloaded", info.version);
    updateDownloaded = true;
    downloadedVersion = info.version;
    mainWindow.webContents.send("update-ready", info.version);
  });

  autoUpdater.on("error", (error) => {
    log.error("Auto-updater error:", error);
    mainWindow.webContents.send("update-error", error.message);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    log.error("Auto-updater: checkForUpdates failed", err);
  });

  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        log.error("Auto-updater: periodic check failed", err);
      });
    },
    4 * 60 * 60 * 1000,
  );
}

export function registerAutoUpdateIPC(): void {
  ipcMain.handle("get-update-status", () => ({
    updateReady: updateDownloaded,
    version: downloadedVersion,
  }));

  ipcMain.handle("restart-to-update", () => {
    log.info("Auto-updater: restart-to-update requested");
    try {
      (global as any).isQuittingForUpdate = true;
      autoUpdater.quitAndInstall(false, true);
    } catch (error) {
      log.error("Auto-updater: quitAndInstall failed", error);
      (global as any).isQuittingForUpdate = false;
      throw error;
    }
  });
}
