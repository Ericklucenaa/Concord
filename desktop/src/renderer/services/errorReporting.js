import { doc, setDoc } from 'firebase/firestore';
import { firestore, auth } from './firebase';
import { newId } from './cloud/util';

// Lightweight crash/error reporting into Firestore (write-only collection,
// read with `node scripts/error-reports.mjs`). A free stand-in for Sentry.
const MAX_REPORTS_PER_SESSION = 20;
const sent = new Set();
let count = 0;

function appVersion() {
  return typeof window !== 'undefined' && window.__CONCORD_VERSION__ ? window.__CONCORD_VERSION__ : 'web';
}

export function reportError(error, context = '') {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid || count >= MAX_REPORTS_PER_SESSION) return;
    const message = String(error?.message || error || 'erro desconhecido').slice(0, 2000);
    const key = `${context}:${message}`;
    if (sent.has(key)) return;
    sent.add(key);
    count++;
    const id = newId('err');
    setDoc(doc(firestore, 'concord_error_reports', id), {
      id,
      userId: uid,
      message,
      stack: String(error?.stack || '').slice(0, 8000),
      context: String(context).slice(0, 200),
      version: appVersion(),
      platform: typeof window !== 'undefined' && window.electronAPI ? 'desktop' : 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : '',
      createdAt: new Date().toISOString()
    }).catch(() => {
      // Reporting must never surface its own failures.
    });
  } catch {
    // ignore
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => reportError(e.error || e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}
