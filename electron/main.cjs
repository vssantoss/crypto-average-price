const { app, BrowserWindow, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const appName = 'Crypto Average Price';
const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const windowStateFileName = 'window-state.json';
const defaultWindowWidth = 1440;
const defaultWindowHeight = 900;
const minimumWindowWidth = 1280;
const minimumWindowHeight = 720;
const minimumSavedWindowWidth = 400;
const minimumSavedWindowHeight = 300;
const minimumVisibleWindowPixels = 100;

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
 * Checks whether the window is in a normal state that should update restorable bounds.
 * @param {BrowserWindow} window - Window whose state should be checked.
 * @returns {boolean} True when current bounds are safe to persist.
 */
function hasRestorableWindowState(window) {
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
 * Creates the main application window with secure renderer defaults.
 * @returns {BrowserWindow} The created Electron browser window.
 */
function createMainWindow() {
  const windowState = loadWindowState();
  const windowBounds = windowState?.bounds;
  let lastRestorableBounds = windowBounds;
  let isTrackingWindowBounds = false;
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
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (windowBounds) {
      mainWindow.setBounds(windowBounds, false);
    }

    mainWindow.show();
  });

  mainWindow.once('show', () => {
    // Ignore startup resize/move events caused by Electron applying native frame bounds.
    setTimeout(() => {
      isTrackingWindowBounds = true;
    }, 500);
  });

  mainWindow.on('resize', () => {
    if (isTrackingWindowBounds && hasRestorableWindowState(mainWindow)) {
      lastRestorableBounds = getRestorableWindowBounds(mainWindow);
    }
  });

  mainWindow.on('move', () => {
    if (isTrackingWindowBounds && hasRestorableWindowState(mainWindow)) {
      lastRestorableBounds = getRestorableWindowBounds(mainWindow);
    }
  });

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
