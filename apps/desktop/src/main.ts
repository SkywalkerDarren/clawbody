import { app, BrowserWindow, Menu, Tray, screen, shell } from 'electron';
import * as path from 'path';

const GATEWAY_URL = process.env['CLAWBODY_URL'] ?? 'http://localhost:4000';
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let retryCount = 0;
const MAX_RETRIES = 30;

// Pipeline state
let pipelineEnabled = false;

async function fetchPipelineStatus(): Promise<void> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/pipeline`);
    if (response.ok) {
      const data = (await response.json()) as { enabled: boolean };
      pipelineEnabled = data.enabled;
      updateTrayMenu();
    }
  } catch {
    // Gateway not ready yet
  }
}

async function togglePipeline(): Promise<void> {
  try {
    const endpoint = pipelineEnabled ? 'disable' : 'enable';
    const response = await fetch(`${GATEWAY_URL}/api/pipeline/${endpoint}`, {
      method: 'POST',
    });
    if (response.ok) {
      pipelineEnabled = !pipelineEnabled;
      updateTrayMenu();
    }
  } catch (err) {
    console.error('Failed to toggle pipeline:', err);
  }
}

function updateTrayMenu(): void {
  if (!tray) return;

  const statusLabel = pipelineEnabled ? '🟢 Pipeline: 启用' : '⚪ Pipeline: 禁用';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: statusLabel,
      enabled: false,
    },
    {
      label: pipelineEnabled ? '禁用 Pipeline' : '启用 Pipeline',
      click: togglePipeline,
    },
    { type: 'separator' },
    {
      label: '打开 Dashboard',
      click: () => shell.openExternal(`${GATEWAY_URL}/dashboard/`),
    },
    {
      label: '切换置顶',
      click: () => {
        if (mainWindow) {
          const current = mainWindow.isAlwaysOnTop();
          mainWindow.setAlwaysOnTop(!current);
        }
      },
    },
    {
      label: '开发者工具',
      click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip(`ClawBody - Pipeline ${pipelineEnabled ? '启用' : '禁用'}`);
  tray.setContextMenu(contextMenu);
}

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: screenWidth - WINDOW_WIDTH - 20,
    y: screenHeight - WINDOW_HEIGHT - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadGateway();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function loadGateway(): void {
  if (!mainWindow) return;

  mainWindow.loadURL(GATEWAY_URL).catch(() => {
    retryCount++;
    if (retryCount < MAX_RETRIES) {
      console.log(`Gateway not ready, retrying (${retryCount}/${MAX_RETRIES})...`);
      setTimeout(loadGateway, 1000);
    } else {
      console.error('Failed to connect to gateway after max retries');
      app.quit();
    }
  });
}

function createTray(): void {
  // Use a simple icon or create one
  tray = new Tray(path.join(__dirname, '..', 'assets', 'icon.png'));

  updateTrayMenu();

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  // Fetch initial pipeline status
  fetchPipelineStatus();

  // Poll pipeline status every 10s
  setInterval(fetchPipelineStatus, 10000);
}

// Linux transparency fix
// Note: disableHardwareAcceleration() causes WebGL to use CPU rendering (very slow)
// Keep GPU acceleration enabled, transparency works on most modern compositors
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  // Don't disable hardware acceleration - it kills WebGL performance
}

app.whenReady().then(() => {
  // Delay for Linux transparency
  setTimeout(() => {
    createWindow();
    createTray();
  }, process.platform === 'linux' ? 300 : 0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
