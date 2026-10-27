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
      sandbox: true,
      partition: 'persist:concord'
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

const https = require('https');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

// Security: the auto-updater downloads and EXECUTES an installer, so the URL
// must never be attacker-controlled (e.g. poisoned via the cloud version doc).
// Only HTTPS downloads from the official GitHub release infrastructure are allowed.
const ALLOWED_UPDATE_HOST_PATTERNS = [
  /(^|\.)github\.com$/i,
  /(^|\.)githubusercontent\.com$/i
];

function isAllowedUpdateUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_UPDATE_HOST_PATTERNS.some((re) => re.test(parsed.hostname));
  } catch (e) {
    return false;
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    function makeRequest(currentUrl) {
      // Re-validate on every hop so a redirect cannot escape the allowlist.
      if (!isAllowedUpdateUrl(currentUrl)) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error('Update URL bloqueada: origem não confiável.'));
      }

      const client = currentUrl.startsWith('https:') ? https : http;

      const req = client.get(currentUrl, {
        headers: {
          'User-Agent': 'Concord-Desktop-App'
        }
      }, (res) => {
        // Follow redirects (e.g. GitHub releases to AWS S3 CDN)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location);
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
            onProgress({
              percent,
              transferred: receivedBytes,
              total: totalBytes
            });
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve(dest));
        });
      });

      req.on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
    }

    makeRequest(url);
  });
}

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('app:open-external', (_, url) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    shell.openExternal(url);
  }
});

// Auto-Update Download and Silent/Instant Install
const OFFICIAL_RELEASES_PAGE = 'https://github.com/Ericklucenaa/Concord/releases/latest';

ipcMain.handle('updater:download-and-install', async (event, { downloadUrl, version }) => {
  try {
    // Only accept a clean semver so it cannot be used to build a malicious URL/path.
    const safeVersion = typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? version : null;

    const tempDir = app.getPath('temp');
    const destPath = path.join(tempDir, `Concord-Setup-${safeVersion || Date.now()}.exe`);

    let targetUrl = downloadUrl;
    if (!targetUrl || targetUrl.endsWith('/releases') || targetUrl.endsWith('/releases/latest')) {
      if (!safeVersion) throw new Error('Versão de atualização inválida.');
      targetUrl = `https://github.com/Ericklucenaa/Concord/releases/download/v${safeVersion}/Concord-Setup-${safeVersion}.exe`;
    }

    // Reject any URL not on the official GitHub release hosts (defends against a
    // poisoned cloud version document pointing at malware).
    if (!isAllowedUpdateUrl(targetUrl)) {
      throw new Error('URL de atualização não confiável foi bloqueada.');
    }

    await downloadFile(targetUrl, destPath, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:progress', progress);
      }
    });

    // Run the installer silently/detached and quit the current running app instance
    spawn(destPath, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => {
      app.quit();
    }, 800);

    return { success: true };
  } catch (error) {
    console.error('Auto update error, falling back to official releases page:', error);
    // Never open a client-supplied URL; always send the user to the official page.
    shell.openExternal(OFFICIAL_RELEASES_PAGE);
    return { success: false, error: error.message };
  }
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

// Native Google OAuth for Desktop Electron App
ipcMain.handle('auth:google-login', () => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      title: 'Concord - Login com o Google',
      backgroundColor: '#0f1117',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const targetUrl = 'https://concord-3af70.web.app/?mode=desktop_google_auth';
    authWindow.loadURL(targetUrl);

    let isCompleted = false;

    const checkUrl = (url) => {
      if (url && url.includes('google_auth_success=')) {
        try {
          const match = url.match(/google_auth_success=([^&#]+)/);
          if (match && match[1]) {
            const decoded = decodeURIComponent(match[1]);
            const userData = JSON.parse(decoded);
            isCompleted = true;
            authWindow.close();
            resolve(userData);
          }
        } catch (e) {
          if (!isCompleted) {
            isCompleted = true;
            authWindow.close();
            reject(e);
          }
        }
      }
    };

    authWindow.webContents.on('will-navigate', (e, url) => checkUrl(url));
    authWindow.webContents.on('did-navigate', (e, url) => checkUrl(url));

    authWindow.on('closed', () => {
      if (!isCompleted) {
        resolve(null);
      }
    });
  });
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
