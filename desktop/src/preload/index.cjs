const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // Screen Share Native Sources
  getDesktopSources: () => ipcRenderer.invoke('desktop:get-sources'),

  // Native Google OAuth for Desktop App
  signInWithGoogleNative: () => ipcRenderer.invoke('auth:google-login'),

  // Open external URL in system browser
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url)
});
