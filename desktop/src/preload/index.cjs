const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  applySettings: (settings) => ipcRenderer.invoke('app:apply-settings', settings),
  onInviteLink: (callback) => subscribe('app:invite-link', callback),

  // Screen share
  getDesktopSources: () => ipcRenderer.invoke('desktop:get-sources'),
  selectScreenSource: (choice) => ipcRenderer.invoke('screen:select-source', choice),

  // Global push-to-talk
  onPushToTalk: (callback) => subscribe('ptt:state', callback),

  // Link previews
  fetchLinkPreview: (url) => ipcRenderer.invoke('link:preview', url),

  // Google sign-in (returns the OAuth credential)
  signInWithGoogleNative: () => ipcRenderer.invoke('auth:google-login'),

  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),

  // Auto updater
  downloadAndInstallUpdate: (data) => ipcRenderer.invoke('updater:download-and-install', data),
  onUpdateProgress: (callback) => subscribe('updater:progress', callback)
});
