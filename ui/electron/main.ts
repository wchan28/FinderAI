import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { spawn, ChildProcess, execSync } from "child_process";

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
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8" });
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) {
          execSync(`taskkill /PID ${pid} /F`, { encoding: "utf8" });
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { encoding: "utf8" });
    }
    console.log(`Killed existing process on port ${port}`);
  } catch {
    console.log(`No existing process on port ${port}`);
  }
}

function checkPythonDependencies(): boolean {
  const pythonPath = findPythonPath();
  try {
    execSync(`"${pythonPath}" -c "import voyageai; import fastapi; import uvicorn"`, {
      encoding: "utf8",
      timeout: 5000,
    });
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
    execSync(`"${pythonPath}" -m pip install -r "${requirementsPath}" --quiet`, {
      cwd: backendPath,
      encoding: "utf8",
      timeout: 120000,
    });
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
  console.log("[open-file] shell.openPath result:", result || "Success (empty string)");
  return result;
});

app.whenReady().then(async () => {
  try {
    await startPythonServer();
    console.log("Python server started");
  } catch (err) {
    console.error("Failed to start Python server:", err);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopPythonServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopPythonServer();
});
