import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'

let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
const API_PORT = 8000

function findPythonPath(): string {
  if (process.platform === 'win32') {
    return 'python'
  }
  return 'python3'
}

function startPythonServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pythonPath = findPythonPath()
    const backendPath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend')
      : path.join(__dirname, '..', '..', 'backend')

    console.log('Starting Python server from:', backendPath)

    pythonProcess = spawn(pythonPath, ['-m', 'uvicorn', 'backend.api.server:app', '--host', '127.0.0.1', '--port', String(API_PORT)], {
      cwd: path.join(backendPath, '..'),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    })

    pythonProcess.stdout?.on('data', (data) => {
      console.log(`Python: ${data}`)
      if (data.toString().includes('Uvicorn running')) {
        resolve()
      }
    })

    pythonProcess.stderr?.on('data', (data) => {
      console.error(`Python stderr: ${data}`)
      if (data.toString().includes('Uvicorn running')) {
        resolve()
      }
    })

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python:', err)
      reject(err)
    })

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`)
      pythonProcess = null
    })

    setTimeout(() => resolve(), 3000)
  })
}

function stopPythonServer(): void {
  if (pythonProcess) {
    console.log('Stopping Python server...')
    pythonProcess.kill()
    pythonProcess = null
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
  })

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-api-url', () => {
  return `http://127.0.0.1:${API_PORT}`
})

app.whenReady().then(async () => {
  try {
    await startPythonServer()
    console.log('Python server started')
  } catch (err) {
    console.error('Failed to start Python server:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopPythonServer()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopPythonServer()
})
