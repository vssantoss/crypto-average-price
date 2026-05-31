const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const appName = 'Crypto Average Price';
const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const windowStateFileName = 'window-state.json';
const zoomStateFileName = 'zoom-state.json';
const defaultWindowWidth = 1440;
const defaultWindowHeight = 900;
const minimumWindowWidth = 1280;
const minimumWindowHeight = 720;
const minimumSavedWindowWidth = 400;
const minimumSavedWindowHeight = 300;
const minimumVisibleWindowPixels = 100;
const defaultZoomFactor = 1;
const minimumZoomFactor = 0.75;
const maximumZoomFactor = 1.5;

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
 * Resolves the persisted window state file path under Electron app data.
 * @returns {string} Absolute path to the window state JSON file.
 */
function getWindowStatePath() {
  return path.join(app.getPath('userData'), windowStateFileName);
}

/**
 * Resolves the persisted zoom state file path under Electron app data.
 * @returns {string} Absolute path to the zoom state JSON file.
 */
function getZoomStatePath() {
  return path.join(app.getPath('userData'), zoomStateFileName);
}

/**
 * Checks whether a value is a finite number.
 * @param {unknown} value - Value to validate.
 * @returns {boolean} True when the value is a finite number.
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks whether saved bounds are numerically valid and large enough to restore.
 * @param {unknown} bounds - Saved bounds value to validate.
 * @returns {boolean} True when bounds can be used as a BrowserWindow rectangle.
 */
function hasValidWindowBounds(bounds) {
  return Boolean(
    bounds
    && isFiniteNumber(bounds.x)
    && isFiniteNumber(bounds.y)
    && isFiniteNumber(bounds.width)
    && isFiniteNumber(bounds.height)
    && bounds.width >= minimumSavedWindowWidth
    && bounds.height >= minimumSavedWindowHeight,
  );
}

/**
 * Checks whether saved bounds overlap a display work area enough to be reachable.
 * @param {{x: number, y: number, width: number, height: number}} bounds - Bounds to test.
 * @param {Electron.Display} display - Display whose work area should contain the window.
 * @returns {boolean} True when the bounds have meaningful overlap with the display.
 */
function boundsOverlapDisplay(bounds, display) {
  const workArea = display.workArea;
  const overlapWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
  const overlapHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);

  return overlapWidth >= minimumVisibleWindowPixels && overlapHeight >= minimumVisibleWindowPixels;
}

/**
 * Checks whether saved bounds are visible on at least one currently connected display.
 * @param {{x: number, y: number, width: number, height: number}} bounds - Bounds to test.
 * @returns {boolean} True when the bounds can be restored without placing the window off-screen.
 */
function boundsAreVisible(bounds) {
  return screen.getAllDisplays().some(display => boundsOverlapDisplay(bounds, display));
}

/**
 * Loads persisted window bounds and maximized state when they are valid.
 * @returns {{bounds: {x: number, y: number, width: number, height: number}, maximized: boolean} | null} Saved state, or null when unavailable.
 */
function loadWindowState() {
  try {
    const rawState = fs.readFileSync(getWindowStatePath(), 'utf8');
    const state = JSON.parse(rawState);

    if (!hasValidWindowBounds(state.bounds) || !boundsAreVisible(state.bounds)) {
      return null;
    }

    return {
      bounds: state.bounds,
      maximized: state.maximized === true,
    };
  } catch {
    return null;
  }
}

/**
 * Gets restorable normal outer bounds from a BrowserWindow.
 * @param {BrowserWindow} window - Window whose last normal bounds should be saved.
 * @returns {{x: number, y: number, width: number, height: number}} Bounds suitable for future restoration.
 */
function getRestorableWindowBounds(window) {
  if (typeof window.getNormalBounds === 'function') {
    return window.getNormalBounds();
  }

  return window.getBounds();
}

/**
 * Checks whether the current BrowserWindow state should update saved normal bounds.
 * @param {BrowserWindow} window - Window whose state should be checked.
 * @returns {boolean} True when current bounds are safe to use for normal restore.
 */
function canSaveCurrentWindowBounds(window) {
  return !window.isMaximized() && !window.isMinimized() && !window.isFullScreen();
}

/**
 * Persists the BrowserWindow size, position, and maximized state.
 * @param {{bounds: {x: number, y: number, width: number, height: number}, maximized: boolean}} state - Window state to persist.
 * @returns {void}
 */
function writeWindowState(state) {
  try {
    const windowStatePath = getWindowStatePath();

    fs.mkdirSync(path.dirname(windowStatePath), { recursive: true });
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2));
  } catch {
    // Window state persistence is best-effort and should never block app close.
  }
}

/**
 * Limits a zoom factor to the supported renderer zoom range.
 * @param {number} zoomFactor - Requested zoom factor.
 * @returns {number} Clamped zoom factor rounded to two decimals.
 */
function clampZoomFactor(zoomFactor) {
  return Math.round(Math.min(maximumZoomFactor, Math.max(minimumZoomFactor, zoomFactor)) * 100) / 100;
}

/**
 * Loads the persisted renderer zoom factor from disk.
 * @returns {number} Saved zoom factor, or the default factor when unavailable.
 */
function loadZoomFactor() {
  try {
    const rawState = fs.readFileSync(getZoomStatePath(), 'utf8');
    const state = JSON.parse(rawState);

    if (!isFiniteNumber(state.zoomFactor)) {
      return defaultZoomFactor;
    }

    return clampZoomFactor(state.zoomFactor);
  } catch {
    return defaultZoomFactor;
  }
}

/**
 * Persists the renderer zoom factor to disk.
 * @param {number} zoomFactor - Zoom factor to persist.
 * @returns {void}
 */
function writeZoomFactor(zoomFactor) {
  try {
    const zoomStatePath = getZoomStatePath();
    const state = { zoomFactor: clampZoomFactor(zoomFactor) };

    fs.mkdirSync(path.dirname(zoomStatePath), { recursive: true });
    fs.writeFileSync(zoomStatePath, JSON.stringify(state, null, 2));
  } catch {
    // Zoom persistence is best-effort and should never interrupt app usage.
  }
}

/**
 * Sends the persisted renderer zoom factor to a BrowserWindow.
 * @param {BrowserWindow} window - Window that should receive the zoom factor.
 * @returns {void}
 */
function sendZoomFactor(window) {
  window.webContents.send('app-zoom-factor', loadZoomFactor());
}

/**
 * Creates the main application window with secure renderer defaults.
 * @returns {BrowserWindow} The created Electron browser window.
 */
function createMainWindow() {
  const windowState = loadWindowState();
  const windowBounds = windowState?.bounds;
  let canTrackWindowBounds = false;
  let lastRestorableBounds = windowBounds;
  const mainWindow = new BrowserWindow({
    title: appName,
    x: windowBounds?.x,
    y: windowBounds?.y,
    width: windowBounds?.width ?? defaultWindowWidth,
    height: windowBounds?.height ?? defaultWindowHeight,
    minWidth: minimumWindowWidth,
    minHeight: minimumWindowHeight,
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
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (windowBounds) {
      mainWindow.setBounds(windowBounds, false);
    }

    mainWindow.show();
    sendZoomFactor(mainWindow);

    setTimeout(() => {
      canTrackWindowBounds = true;
    }, 500);
  });

  const rememberRestorableBounds = () => {
    if (canTrackWindowBounds && canSaveCurrentWindowBounds(mainWindow)) {
      lastRestorableBounds = getRestorableWindowBounds(mainWindow);
    }
  };

  mainWindow.on('move', rememberRestorableBounds);
  mainWindow.on('resize', rememberRestorableBounds);

  mainWindow.on('close', () => {
    writeWindowState({
      bounds: lastRestorableBounds ?? getRestorableWindowBounds(mainWindow),
      maximized: mainWindow.isMaximized(),
    });
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

  if (windowState?.maximized) {
    mainWindow.maximize();
  }

  return mainWindow;
}

ipcMain.on('app-zoom-factor-changed', (_event, zoomFactor) => {
  if (isFiniteNumber(zoomFactor)) {
    writeZoomFactor(zoomFactor);
  }
});

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
