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
import http from "http";
import { spawn, ChildProcess, execSync } from "child_process";

let isQuitting = false;
let sleepBlockerId: number | null = null;
let oauthServer: http.Server | null = null;

const PROTOCOL_NAME = "finderai";
const OAUTH_PORT = 3001;

function handleAuthCallback(url: string): void {
  console.log("Auth callback received:", url);
  if (mainWindow) {
    mainWindow.webContents.send("auth-callback", url);
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
              <p>You can close this window and return to FinderAI.</p>
            </div>
            <script>setTimeout(() => window.close(), 1500)</script>
          </body>
        </html>
      `);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  oauthServer.listen(OAUTH_PORT, "127.0.0.1", () => {
    console.log(`OAuth callback server listening on http://127.0.0.1:${OAUTH_PORT}`);
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
  return "python3";
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

    const pythonPath = findPythonPath();
    const backendPath = app.isPackaged
      ? path.join(process.resourcesPath, "backend")
      : path.join(__dirname, "..", "..", "backend");

    installPythonDependencies(backendPath);

    console.log("Starting Python server from:", backendPath);

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
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
    );

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
      console.error("Failed to start Python:", err);
      reject(err);
    });

    pythonProcess.on("close", (code) => {
      console.log(`Python process exited with code ${code}`);
      pythonProcess = null;
    });

    setTimeout(() => resolve(), 3000);
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
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
  });

  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
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
    handleAuthCallback(url);
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
      handleAuthCallback(url);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  startOAuthServer();

  try {
    await startPythonServer();
    console.log("Python server started");
  } catch (err) {
    console.error("Failed to start Python server:", err);
  }

  createWindow();

  // Check for protocol URL passed as argument (Windows/Linux cold start)
  const protocolUrl = process.argv.find((arg) =>
    arg.startsWith(`${PROTOCOL_NAME}://`),
  );
  if (protocolUrl) {
    setTimeout(() => handleAuthCallback(protocolUrl), 1000);
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
  if (!isQuitting) {
    event.preventDefault();
    await gracefulShutdown();
    app.quit();
  }
});
