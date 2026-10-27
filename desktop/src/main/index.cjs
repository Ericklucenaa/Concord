const { app, BrowserWindow, ipcMain, desktopCapturer, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const startHidden = process.argv.includes('--hidden');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let shellSettings = { closeToTray: true, launchAtStartup: false, voiceMode: 'activity', pttKey: 'Backquote' };

// ---------------------------------------------------------------------------
// Single instance + concord:// invite links
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Only the installed app registers concord:// (dev runs would point the
// protocol at the bare electron.exe).
if (app.isPackaged) {
  app.setAsDefaultProtocolClient('concord');
}

function inviteFromArgs(argv) {
  const link = argv.find((a) => typeof a === 'string' && a.startsWith('concord://'));
  const match = link && link.match(/invite\/?([A-Za-z0-9]{4,16})/i);
  return match ? match[1].toUpperCase() : null;
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

app.on('second-instance', (_event, argv) => {
  showWindow();
  const code = inviteFromArgs(argv);
  if (code) mainWindow?.webContents.send('app:invite-link', code);
});

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    show: !startHidden,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:concord'
    }
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    const load = () => mainWindow.loadURL(devUrl).catch(() => setTimeout(() => mainWindow && !mainWindow.isDestroyed() && load(), 1000));
    load();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // External links open in the default browser; nothing opens inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !(isDev && url.startsWith('http://localhost'))) {
      event.preventDefault();
      if (url.startsWith('https:')) shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && shellSettings.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupMediaHandlers(mainWindow.webContents.session);

  const code = inviteFromArgs(process.argv);
  if (code) mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('app:invite-link', code));
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  const image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('Concord');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Concord', click: showWindow },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', showWindow);
}

// ---------------------------------------------------------------------------
// Permissions & screen capture
// ---------------------------------------------------------------------------

let pendingScreenSource = null; // { sourceId, audio }

function setupMediaHandlers(ses) {
  const allowed = new Set(['media', 'notifications', 'display-capture', 'clipboard-sanitized-write', 'fullscreen', 'speaker-selection']);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // getDisplayMedia() in the renderer is answered with the source the user
  // picked in our own picker. System audio uses Windows loopback capture.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const choice = pendingScreenSource;
      pendingScreenSource = null;
      const source = sources.find((s) => s.id === choice?.sourceId) || sources[0];
      if (!source) return callback({});
      const wantsAudio = choice?.audio && process.platform === 'win32';
      return callback(wantsAudio ? { video: source, audio: 'loopback' } : { video: source });
    } catch (err) {
      console.error('display media handler:', err);
      return callback({});
    }
  });
}

ipcMain.handle('screen:select-source', (_event, { sourceId, audio }) => {
  pendingScreenSource = { sourceId: String(sourceId || ''), audio: Boolean(audio) };
  return true;
});

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

// ---------------------------------------------------------------------------
// Window controls & app info
// ---------------------------------------------------------------------------

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:is-maximized', () => (mainWindow ? mainWindow.isMaximized() : false));
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
});

// Settings the renderer controls: tray behaviour, startup, push-to-talk key.
ipcMain.handle('app:apply-settings', (_event, settings) => {
  shellSettings = { ...shellSettings, ...settings };
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: Boolean(shellSettings.launchAtStartup), args: ['--hidden'] });
  }
  configurePushToTalk();
  return true;
});

// ---------------------------------------------------------------------------
// Global push-to-talk (works while the window is in the background)
// ---------------------------------------------------------------------------

let uiohook = null;
let UiohookKey = null;
let hookStarted = false;
let pttPressed = false;

try {
  ({ uIOhook: uiohook, UiohookKey } = require('uiohook-napi'));
} catch (err) {
  console.warn('Global push-to-talk unavailable (uiohook-napi failed to load):', err.message);
}

function uiohookKeyFor(code) {
  if (!UiohookKey || !code) return null;
  const aliases = {
    ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', ShiftLeft: 'Shift', ShiftRight: 'ShiftRight',
    AltLeft: 'Alt', AltRight: 'AltRight', MetaLeft: 'Meta', MetaRight: 'MetaRight'
  };
  let name = aliases[code] || code;
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
  if (/^Digit[0-9]$/.test(code)) name = code.slice(5);
  return UiohookKey[name] ?? null;
}

function sendPtt(pressed) {
  if (pttPressed === pressed) return;
  pttPressed = pressed;
  mainWindow?.webContents.send('ptt:state', pressed);
}

function configurePushToTalk() {
  if (!uiohook) return;
  const keycode = uiohookKeyFor(shellSettings.pttKey);
  const enabled = shellSettings.voiceMode === 'ptt' && keycode !== null;

  uiohook.removeAllListeners('keydown');
  uiohook.removeAllListeners('keyup');
  if (enabled) {
    uiohook.on('keydown', (e) => e.keycode === keycode && sendPtt(true));
    uiohook.on('keyup', (e) => e.keycode === keycode && sendPtt(false));
    if (!hookStarted) {
      uiohook.start();
      hookStarted = true;
    }
  } else if (hookStarted) {
    uiohook.stop();
    hookStarted = false;
    sendPtt(false);
  }
}

// ---------------------------------------------------------------------------
// Link previews (fetched here because the renderer is subject to CORS)
// ---------------------------------------------------------------------------

function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v === '::';
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Only public HTTPS hosts: link previews must not be usable to probe the user's LAN. */
async function assertPublicUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('only https');
  const { address } = await dns.lookup(url.hostname);
  if (isPrivateAddress(address)) throw new Error('private address');
  return url;
}

function fetchHead(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    assertPublicUrl(url).then((parsed) => {
      const req = https.get(parsed, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ConcordLinkPreview/1.0)', Accept: 'text/html' },
        timeout: 5000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
          res.resume();
          resolve(fetchHead(new URL(res.headers.location, parsed).toString(), redirects - 1));
          return;
        }
        if (res.statusCode !== 200 || !String(res.headers['content-type'] || '').includes('text/html')) {
          res.resume();
          resolve('');
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 300_000 || body.includes('</head>')) res.destroy();
        });
        res.on('close', () => resolve(body));
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    }).catch(reject);
  });
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    if (m) return decodeEntities(m[1]).trim();
  }
  return null;
}

const previewCache = new Map();

ipcMain.handle('link:preview', async (_event, url) => {
  if (typeof url !== 'string' || url.length > 2000) return null;
  if (previewCache.has(url)) return previewCache.get(url);
  try {
    const html = await fetchHead(url);
    const title = metaContent(html, ['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? null);
    let image = metaContent(html, ['og:image', 'twitter:image']);
    if (image) {
      image = new URL(image, url).toString();
      if (!image.startsWith('https:')) image = null;
    }
    const result = title ? {
      title: decodeEntities(title).slice(0, 200),
      description: (metaContent(html, ['og:description', 'description', 'twitter:description']) || '').slice(0, 300),
      image,
      siteName: metaContent(html, ['og:site_name'])
    } : null;
    previewCache.set(url, result);
    return result;
  } catch {
    previewCache.set(url, null);
    return null;
  }
});

// ---------------------------------------------------------------------------
// Auto-update: download from this repo's GitHub releases only, verify the
// SHA-256 published in the update manifest, then run the installer.
// ---------------------------------------------------------------------------

const RELEASE_PATH = /^\/Ericklucenaa\/Concord\/releases\/download\/v\d+\.\d+\.\d+\/[\w.-]+\.exe$/;
const OFFICIAL_RELEASES_PAGE = 'https://github.com/Ericklucenaa/Concord/releases/latest';

function isOfficialReleaseUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' && RELEASE_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

// GitHub redirects release downloads to its own asset CDN.
function isGithubAssetHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)githubusercontent\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const hash = crypto.createHash('sha256');
    const fail = (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    };

    const request = (current, hops) => {
      if (hops > 5) return fail(new Error('Redirecionamentos demais.'));
      if (!(hops === 0 ? isOfficialReleaseUrl(current) : isGithubAssetHost(current) || isOfficialReleaseUrl(current))) {
        return fail(new Error('URL de atualização bloqueada: origem não confiável.'));
      }
      return https.get(current, { headers: { 'User-Agent': 'Concord-Desktop-App' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return request(new URL(res.headers.location, current).toString(), hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`Download falhou (HTTP ${res.statusCode}).`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          hash.update(chunk);
          if (onProgress && total > 0) {
            onProgress({ percent: Math.min(100, Math.round((received / total) * 100)), transferred: received, total });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(hash.digest('hex'))));
        res.on('error', fail);
        return undefined;
      }).on('error', fail);
    };
    request(url, 0);
  });
}

ipcMain.handle('updater:download-and-install', async (_event, { downloadUrl, version, sha256 }) => {
  try {
    const safeVersion = typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
    if (!safeVersion) throw new Error('Versão de atualização inválida.');
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error('O manifesto de atualização não traz a assinatura SHA-256.');
    }

    const target = downloadUrl || `https://github.com/Ericklucenaa/Concord/releases/download/v${safeVersion}/Concord-Setup-${safeVersion}.exe`;
    if (!isOfficialReleaseUrl(target)) throw new Error('URL de atualização não confiável foi bloqueada.');

    const dest = path.join(app.getPath('temp'), `Concord-Setup-${safeVersion}.exe`);
    const digest = await downloadFile(target, dest, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updater:progress', progress);
    });

    if (digest.toLowerCase() !== sha256.toLowerCase()) {
      fs.unlink(dest, () => {});
      throw new Error('O arquivo baixado não confere com a assinatura publicada. A atualização foi cancelada.');
    }

    spawn(dest, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => {
      isQuitting = true;
      app.quit();
    }, 800);
    return { success: true };
  } catch (error) {
    console.error('Auto update error:', error);
    shell.openExternal(OFFICIAL_RELEASES_PAGE);
    return { success: false, error: error.message };
  }
});

// ---------------------------------------------------------------------------
// Google sign-in for the desktop app
// ---------------------------------------------------------------------------

ipcMain.handle('auth:google-login', () => new Promise((resolve) => {
  const authWindow = new BrowserWindow({
    width: 520,
    height: 680,
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    title: 'Concord - Login com o Google',
    backgroundColor: '#0f1117',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  authWindow.loadURL('https://concord-3af70.web.app/?mode=desktop_google_auth');

  let done = false;
  const finish = (value) => {
    if (done) return;
    done = true;
    resolve(value);
    if (!authWindow.isDestroyed()) authWindow.close();
  };

  // The bridge page puts the OAuth credential in the URL hash.
  const check = (_event, url) => {
    if (!url || !url.startsWith('https://concord-3af70.web.app/')) return;
    const match = url.match(/#google_auth_success=([^&]+)/);
    if (!match) return;
    try {
      const data = JSON.parse(decodeURIComponent(match[1]));
      finish({ idToken: data.idToken || null, accessToken: data.accessToken || null });
    } catch (err) {
      console.error('Google bridge parse error:', err);
      finish(null);
    }
  };

  authWindow.webContents.on('did-navigate-in-page', check);
  authWindow.webContents.on('did-navigate', check);
  authWindow.on('closed', () => finish(null));
}));

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  app.setAppUserModelId('com.concord.app');
  createWindow();
  createTray();
  app.on('activate', showWindow);
});

app.on('before-quit', () => {
  isQuitting = true;
  if (hookStarted) uiohook?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
