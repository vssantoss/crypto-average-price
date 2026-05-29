const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const appName = 'Crypto Average Price';
const devServerUrl = process.env.ELECTRON_RENDERER_URL;

/**
 * Resolves the renderer entry URL for development and packaged app modes.
 * @returns {string} Absolute URL or file path loaded by the BrowserWindow.
 */
function getRendererEntry() {
  if (devServerUrl) {
    return devServerUrl;
  }

  return path.join(app.getAppPath(), 'crypto-average-price', 'dist', 'index.html');
}

/**
 * Creates the main application window with secure renderer defaults.
 * @returns {BrowserWindow} The created Electron browser window.
 */
function createMainWindow() {
  const mainWindow = new BrowserWindow({
    title: appName,
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#0f172a',
    show: false,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 12 } }
      : {
          titleBarOverlay: {
            color: '#111318',
            symbolColor: '#e8eaf0',
            height: 40,
          },
        }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let protocol;

    try {
      ({ protocol } = new URL(url));
    } catch {
      return { action: 'deny' };
    }

    if (protocol === 'https:' || protocol === 'http:') {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  if (devServerUrl) {
    const rendererUrl = new URL(getRendererEntry());
    rendererUrl.searchParams.set('runtime', 'electron');
    rendererUrl.searchParams.set('platform', process.platform);
    void mainWindow.loadURL(rendererUrl.toString());
  } else {
    void mainWindow.loadFile(getRendererEntry(), {
      query: {
        runtime: 'electron',
        platform: process.platform,
      },
    });
  }

  return mainWindow;
}

app.setName(appName);

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
