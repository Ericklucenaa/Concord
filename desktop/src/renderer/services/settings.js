import { useEffect, useState } from 'react';
import { logWarn } from './log';

// Per-device preferences (not synced): voice mode, keybinds, notifications…
const KEY = 'concord_settings_v1';

export const DEFAULT_SETTINGS = {
  voiceMode: 'activity', // 'activity' | 'ptt'
  // A key that is not used while typing, since push-to-talk also works
  // globally (with the window in the background) in the desktop app.
  pttKey: 'Backquote',
  pttKeyLabel: '`',
  pttReleaseDelayMs: 200,
  notifyMentions: true,
  notifyDMs: true,
  notifyAllMessages: false,
  notificationSounds: true,
  closeToTray: true,
  launchAtStartup: false
};

let current = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch (err) {
    logWarn('save settings', err);
  }
  listeners.forEach((fn) => fn(current));
  window.electronAPI?.applySettings?.({
    closeToTray: current.closeToTray,
    launchAtStartup: current.launchAtStartup,
    voiceMode: current.voiceMode,
    pttKey: current.pttKey
  });
}

export function useSettings() {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return [value, updateSettings];
}
