const { app, BrowserWindow, ipcMain, desktopCapturer, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    frame: false, // Custom sleek titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const isDev = !app.isPackaged;

  if (isDev) {
    const loadDevServer = () => {
      mainWindow.loadURL(devUrl).catch(() => {
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            loadDevServer();
          }
        }, 1000);
      });
    };
    loadDevServer();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window Controls IPC
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

// Desktop Capturer for Screen & Window Share
ipcMain.handle('desktop:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
  } catch (error) {
    console.error('Error getting desktop sources:', error);
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
