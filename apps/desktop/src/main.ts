import { app, BrowserWindow, Menu, Tray, screen } from 'electron';
import * as path from 'path';

const GATEWAY_URL = process.env['CLAWBODY_URL'] ?? 'http://localhost:4000';
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let retryCount = 0;
const MAX_RETRIES = 30;

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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Toggle Always on Top',
      click: () => {
        if (mainWindow) {
          const current = mainWindow.isAlwaysOnTop();
          mainWindow.setAlwaysOnTop(!current);
        }
      },
    },
    {
      label: 'Show DevTools',
      click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip('ClawBody');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
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
