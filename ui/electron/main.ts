import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  powerSaveBlocker,
  powerMonitor,
} from "electron";
import path from "path";
import dotenv from "dotenv";
import http from "http";
import fs, { createReadStream, statSync } from "fs";
import { spawn, ChildProcess, execSync } from "child_process";
import { lookup as mimeLookup } from "mime-types";
import { setupAutoUpdater, registerAutoUpdateIPC } from "./auto-updater";
import { migrateUserData } from "./migration";

type StoreInstance = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
};

let store: StoreInstance | null = null;

async function initStore(): Promise<void> {
  // Use Function constructor to create a true dynamic import that TypeScript won't transform to require()
  const dynamicImport = new Function("modulePath", "return import(modulePath)");
  const module = await dynamicImport("electron-store");
  const Store = module.default;
  store = new Store() as unknown as StoreInstance;
}

let isQuitting = false;
let sleepBlockerId: number | null = null;
let oauthServer: http.Server | null = null;
let staticServer: http.Server | null = null;

const PROTOCOL_NAME = "docora";
const OAUTH_PORT = 3002;
const STATIC_PORT = 5174;


function handleAuthCallback(url: string): void {
  console.log("Auth callback received:", url);
  if (mainWindow) {
    mainWindow.webContents.send("auth-callback", url);
    if (process.platform === "darwin") {
      app.dock?.show();
    }
    app.focus({ steal: true });
    mainWindow.show();
    mainWindow.focus();
  }
}

function handleCheckoutCallback(url: string): void {
  console.log("Checkout callback received:", url);
  if (mainWindow) {
    mainWindow.webContents.send("checkout-callback", url);
    if (process.platform === "darwin") {
      app.dock?.show();
    }
    app.focus({ steal: true });
    mainWindow.show();
    mainWindow.focus();
  }
}

function startOAuthServer(): void {
  oauthServer = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`);

    if (reqUrl.pathname === "/auth/callback") {
      const fullUrl = `http://localhost:${OAUTH_PORT}${req.url}`;
      console.log("OAuth callback received:", fullUrl);

      handleAuthCallback(fullUrl);

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .container { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h2 { color: #333; margin-bottom: 10px; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Authentication Successful!</h2>
              <p>You can close this window and return to Docora.</p>
            </div>
            <script>
              window.close();
              setTimeout(() => window.close(), 500);
            </script>
          </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  oauthServer.listen(OAUTH_PORT, "127.0.0.1", () => {
    console.log(
      `OAuth callback server listening on http://127.0.0.1:${OAUTH_PORT}`,
    );
  });

  oauthServer.on("error", (err) => {
    console.error("OAuth server error:", err);
  });
}

function stopOAuthServer(): void {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
    console.log("OAuth server stopped");
  }
}

function startStaticServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, "..", "dist");

    staticServer = http.createServer((req, res) => {
      const urlPath = req.url?.split("?")[0] || "/";
      let filePath = path.join(
        distPath,
        urlPath === "/" ? "index.html" : urlPath,
      );

      if (!fs.existsSync(filePath) || statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, "index.html");
      }

      try {
        const stat = statSync(filePath);
        const mimeType = mimeLookup(filePath) || "application/octet-stream";

        res.writeHead(200, {
          "Content-Type": mimeType,
          "Content-Length": stat.size,
        });

        createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    staticServer.listen(STATIC_PORT, "127.0.0.1", () => {
      console.log(`Static server listening on http://127.0.0.1:${STATIC_PORT}`);
      resolve();
    });

    staticServer.on("error", (err) => {
      console.error("Static server error:", err);
      reject(err);
    });
  });
}

function stopStaticServer(): void {
  if (staticServer) {
    staticServer.close();
    staticServer = null;
    console.log("Static server stopped");
  }
}

function preventSleep(): boolean {
  if (sleepBlockerId === null) {
    sleepBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    console.log("Sleep prevention started, id:", sleepBlockerId);
    return true;
  }
  return powerSaveBlocker.isStarted(sleepBlockerId);
}

function allowSleep(): boolean {
  if (sleepBlockerId !== null) {
    powerSaveBlocker.stop(sleepBlockerId);
    console.log("Sleep prevention stopped, id:", sleepBlockerId);
    sleepBlockerId = null;
    return true;
  }
  return false;
}

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;
const API_PORT = 8000;

function findPythonPath(): string {
  if (process.platform === "win32") {
    return "python";
  }

  // In dev mode, prefer virtual environment with Python 3.12+ and all dependencies
  const backendVenvPath = path.join(
    __dirname,
    "..",
    "..",
    "backend",
    "venv312",
    "bin",
    "python",
  );
  if (fs.existsSync(backendVenvPath)) {
    console.log(`Using Python from venv: ${backendVenvPath}`);
    return backendVenvPath;
  }

  // Fallback: prefer Python 3.12+ for ChromaDB 1.x compatibility
  const pythonCandidates = [
    "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.13",
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.13",
    "python3.12",
    "python3.13",
    "python3",
  ];

  for (const candidate of pythonCandidates) {
    try {
      execSync(`"${candidate}" --version`, { encoding: "utf8", timeout: 2000 });
      console.log(`Using Python: ${candidate}`);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  return "python3";
}

function getBundledServerPath(): string {
  const executableName =
    process.platform === "win32" ? "finderai-server.exe" : "finderai-server";

  return path.join(process.resourcesPath, "python-backend", executableName);
}

function killProcessOnPort(port: number): void {
  try {
    if (process.platform === "win32") {
      const output = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: "utf8" },
      );
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          execSync(`taskkill /PID ${pid} /F`, { encoding: "utf8" });
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        encoding: "utf8",
      });
    }
    console.log(`Killed existing process on port ${port}`);
  } catch {
    console.log(`No existing process on port ${port}`);
  }
}

function checkPythonDependencies(): boolean {
  const pythonPath = findPythonPath();
  try {
    execSync(
      `"${pythonPath}" -c "import voyageai; import fastapi; import uvicorn"`,
      {
        encoding: "utf8",
        timeout: 5000,
      },
    );
    return true;
  } catch {
    return false;
  }
}

function installPythonDependencies(backendPath: string): void {
  if (checkPythonDependencies()) {
    console.log("Python dependencies already installed, skipping...");
    return;
  }

  const pythonPath = findPythonPath();
  const requirementsPath = path.join(backendPath, "requirements.txt");

  console.log("Installing Python dependencies...");
  try {
    execSync(
      `"${pythonPath}" -m pip install -r "${requirementsPath}" --quiet`,
      {
        cwd: backendPath,
        encoding: "utf8",
        timeout: 120000,
      },
    );
    console.log("Python dependencies installed successfully");
  } catch (err) {
    console.error("Failed to install Python dependencies:", err);
  }
}

function startPythonServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    killProcessOnPort(API_PORT);

    if (app.isPackaged) {
      const bundledPath = getBundledServerPath();
      console.log("Starting bundled Python server:", bundledPath);
      console.log("Resources path:", process.resourcesPath);

      if (!fs.existsSync(bundledPath)) {
        console.error("Bundled server not found at:", bundledPath);
        const pythonBackendDir = path.join(
          process.resourcesPath,
          "python-backend",
        );
        if (fs.existsSync(pythonBackendDir)) {
          console.log(
            "python-backend directory contents:",
            fs.readdirSync(pythonBackendDir),
          );
        } else {
          console.error("python-backend directory does not exist");
        }
        reject(new Error(`Bundled Python server not found at: ${bundledPath}`));
        return;
      }

      try {
        const stats = fs.statSync(bundledPath);
        console.log(
          "Server file stats - size:",
          stats.size,
          "mode:",
          stats.mode.toString(8),
        );

        if (process.platform !== "win32") {
          const isExecutable = (stats.mode & 0o111) !== 0;
          if (!isExecutable) {
            console.log(
              "File is not executable, attempting to fix permissions...",
            );
            fs.chmodSync(bundledPath, 0o755);
            console.log("Permissions updated to 755");
          }
        }
      } catch (err) {
        console.error("Error checking file stats:", err);
      }

      console.log("Spawning bundled server...");
      pythonProcess = spawn(bundledPath, [], {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
          STRIPE_PRICE_ID_MONTHLY: process.env.STRIPE_PRICE_ID_MONTHLY || "",
          STRIPE_PRICE_ID_ANNUAL: process.env.STRIPE_PRICE_ID_ANNUAL || "",
        },
      });
    } else {
      const pythonPath = findPythonPath();
      const backendPath = path.join(__dirname, "..", "..", "backend");

      installPythonDependencies(backendPath);

      console.log("Starting Python server (dev mode) from:", backendPath);

      pythonProcess = spawn(
        pythonPath,
        [
          "-m",
          "uvicorn",
          "backend.api.server:app",
          "--host",
          "127.0.0.1",
          "--port",
          String(API_PORT),
        ],
        {
          cwd: path.join(backendPath, ".."),
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
            STRIPE_PRICE_ID_MONTHLY: process.env.STRIPE_PRICE_ID_MONTHLY || "",
            STRIPE_PRICE_ID_ANNUAL: process.env.STRIPE_PRICE_ID_ANNUAL || "",
          },
        },
      );
    }

    pythonProcess.stdout?.on("data", (data) => {
      console.log(`Python: ${data}`);
      if (data.toString().includes("Uvicorn running")) {
        resolve();
      }
    });

    pythonProcess.stderr?.on("data", (data) => {
      console.error(`Python stderr: ${data}`);
      if (data.toString().includes("Uvicorn running")) {
        resolve();
      }
    });

    pythonProcess.on("error", (err) => {
      console.error("Failed to start Python process:", err);
      console.error("Error code:", (err as NodeJS.ErrnoException).code);
      console.error("Error message:", err.message);
      reject(err);
    });

    pythonProcess.on("close", (code, signal) => {
      console.log(`Python process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        console.error("Python process exited with non-zero code:", code);
      }
      pythonProcess = null;
    });

    setTimeout(() => {
      console.log("Startup timeout reached, proceeding anyway...");
      resolve();
    }, 5000);
  });
}

function stopPythonServer(): void {
  if (pythonProcess) {
    console.log("Stopping Python server...");
    pythonProcess.kill();
    pythonProcess = null;
  }
}

async function pauseIndexingIfRunning(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    await fetch(`http://127.0.0.1:${API_PORT}/api/index/pause`, {
      method: "POST",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log("Indexing paused successfully");
  } catch {
    console.log("Could not pause indexing (may not be running)");
  }
}

async function checkForIncompleteIndexing(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `http://127.0.0.1:${API_PORT}/api/index/job-status`,
      {
        signal: controller.signal,
      },
    );

    clearTimeout(timeoutId);
    const data = await res.json();

    if (data.has_incomplete_job) {
      console.log("Found incomplete indexing job:", data.job_info);
      mainWindow?.webContents.send("incomplete-indexing", data.job_info);
    }
  } catch {
    console.log("Could not check indexing status");
  }
}

async function gracefulShutdown(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;

  console.log("Initiating graceful shutdown...");

  await pauseIndexingIfRunning();
  allowSleep();
  stopOAuthServer();
  stopStaticServer();

  await new Promise((resolve) => setTimeout(resolve, 500));

  stopPythonServer();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:docora",
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
  });

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${STATIC_PORT}`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("get-api-url", () => {
  return `http://127.0.0.1:${API_PORT}`;
});

ipcMain.handle("open-file", async (_, filePath: string) => {
  console.log("[open-file] IPC handler called with path:", filePath);
  const result = await shell.openPath(filePath);
  console.log(
    "[open-file] shell.openPath result:",
    result || "Success (empty string)",
  );
  return result;
});

ipcMain.handle("open-external", async (_, url: string) => {
  console.log("[open-external] Opening URL:", url);
  await shell.openExternal(url);
});

ipcMain.handle("prevent-sleep", () => {
  const blocked = preventSleep();
  return { blocked };
});

ipcMain.handle("allow-sleep", () => {
  const stopped = allowSleep();
  return { stopped };
});

ipcMain.handle("is-sleep-prevented", () => {
  return {
    prevented:
      sleepBlockerId !== null && powerSaveBlocker.isStarted(sleepBlockerId),
  };
});

ipcMain.handle("electron-store-get", (_, key: string) => {
  return store?.get(key) ?? null;
});

ipcMain.handle("electron-store-set", (_, key: string, value: unknown) => {
  store?.set(key, value);
});

ipcMain.handle("electron-store-delete", (_, key: string) => {
  store?.delete(key);
});

// Register custom protocol for OAuth callbacks
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_NAME);
}

// Handle protocol on macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url.startsWith(`${PROTOCOL_NAME}://`)) {
    if (url.includes("/checkout/")) {
      handleCheckoutCallback(url);
    } else {
      handleAuthCallback(url);
    }
  }
});

// Handle protocol on Windows/Linux (second instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      if (url.includes("/checkout/")) {
        handleCheckoutCallback(url);
      } else {
        handleAuthCallback(url);
      }
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function checkAppLocation(): Promise<void> {
  if (process.platform !== "darwin" || !app.isPackaged) {
    return;
  }

  if (app.isInApplicationsFolder()) {
    return;
  }

  const response = await dialog.showMessageBox({
    type: "question",
    buttons: ["Move to Applications", "Not Now"],
    defaultId: 0,
    cancelId: 1,
    title: "Move to Applications?",
    message: "Docora works best when installed in your Applications folder.",
    detail:
      "This enables automatic updates and ensures full functionality. Would you like to move it now?",
  });

  if (response.response === 0) {
    try {
      const moved = app.moveToApplicationsFolder({
        conflictHandler: (conflictType) => {
          if (conflictType === "existsAndRunning") {
            dialog.showMessageBoxSync({
              type: "warning",
              message:
                "Please close the existing Docora app first, then try again.",
            });
            return false;
          }
          return true;
        },
      });

      if (moved) {
        return;
      }
    } catch (error) {
      console.error("Failed to move to Applications:", error);
    }
  }
}

app.whenReady().then(async () => {
  // Load environment variables FIRST, before anything else
  if (app.isPackaged) {
    const envPath = path.join(process.resourcesPath, ".env");
    const result = dotenv.config({ path: envPath });
    console.log("Loaded .env from:", envPath);
    console.log(
      "Dotenv result:",
      result.error ? result.error.message : "success",
    );
    console.log(
      "STRIPE_SECRET_KEY loaded:",
      !!process.env.STRIPE_SECRET_KEY,
    );
  } else {
    const devEnvPath = path.join(__dirname, "..", "..", ".env");
    dotenv.config({ path: devEnvPath });
    console.log("Loaded .env from:", devEnvPath);
  }

  await checkAppLocation();

  try {
    await migrateUserData();
  } catch (error) {
    console.error("Failed to migrate user data:", error);
  }

  await initStore();
  killProcessOnPort(OAUTH_PORT);
  startOAuthServer();

  if (app.isPackaged) {
    try {
      await startStaticServer();
      console.log("Static server started");
    } catch (err) {
      console.error("Failed to start static server:", err);
    }
  }

  try {
    await startPythonServer();
    console.log("Python server started");
  } catch (err) {
    console.error("Failed to start Python server:", err);
  }

  createWindow();

  if (app.isPackaged) {
    registerAutoUpdateIPC();
    setupAutoUpdater(mainWindow!);
  }

  // Check for protocol URL passed as argument (Windows/Linux cold start)
  const protocolUrl = process.argv.find((arg) =>
    arg.startsWith(`${PROTOCOL_NAME}://`),
  );
  if (protocolUrl) {
    setTimeout(() => {
      if (protocolUrl.includes("/checkout/")) {
        handleCheckoutCallback(protocolUrl);
      } else {
        handleAuthCallback(protocolUrl);
      }
    }, 1000);
  }

  setTimeout(() => {
    checkForIncompleteIndexing();
  }, 2000);

  powerMonitor.on("suspend", () => {
    console.log("System going to sleep");
    pauseIndexingIfRunning();
  });

  powerMonitor.on("resume", () => {
    console.log("System resumed from sleep");
    setTimeout(() => {
      checkForIncompleteIndexing();
    }, 1000);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await gracefulShutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  // Let quitAndInstall proceed without interference for auto-updates
  if ((global as any).isQuittingForUpdate) {
    return;
  }

  if (!isQuitting) {
    event.preventDefault();
    await gracefulShutdown();
    app.quit();
  }
});
