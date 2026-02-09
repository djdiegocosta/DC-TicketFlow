// main.js
// Electron bootstrap for the TicketFlow desktop application.
// It wraps the existing web frontend (local build or hosted URL) in a single desktop window,
// keeping Supabase auth and database 100% online and unchanged.

const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Optional helper for Squirrel (Windows) installer behavior
const isSquirrel = require('electron-squirrel-startup');
if (isSquirrel) {
  app.quit();
}

// Single instance lock: prevents multiple running instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

// FRONTEND SOURCE
// 1) If FRONTEND_URL is set (e.g. https://your-netlify-app.netlify.app), load that URL.
// 2) Otherwise, load the local index.html included with the app.
const FRONTEND_URL = process.env.FRONTEND_URL || null;
const isProd = app.isPackaged;

/**
 * Creates the main application window.
 * Window behavior:
 * - Single window
 * - Initial size optimized for admin use
 * - Minimal/hidden menu
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false, // show after ready-to-show to avoid flicker
    webPreferences: {
      // TicketFlow is a browser-based app using standard web APIs and Supabase JS
      // We keep contextIsolation enabled and nodeIntegration disabled in the renderer
      // so it behaves like a normal web client.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Remove default menu for a clean, "app-like" feel
  Menu.setApplicationMenu(null);

  // Decide what to load (remote URL or local file)
  if (FRONTEND_URL) {
    mainWindow.loadURL(FRONTEND_URL);
  } else {
    // Load local index.html from the app folder (packaged together with assets)
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// When Electron is ready, create the window
app.whenReady().then(() => {
  createMainWindow();

  // On macOS it is common to re-create a window when the dock icon is clicked
  // and there are no other open windows.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Second instance handling: focus existing window instead of opening another
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});