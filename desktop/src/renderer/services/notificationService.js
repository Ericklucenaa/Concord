/**
 * NotificationService handles native OS/browser push notifications
 * for messages, mentions, and friend/server invites.
 */

let permissionRequested = false;

export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied' && !permissionRequested) {
    permissionRequested = true;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch (e) {
      return false;
    }
  }
  return false;
}

export function showNativeNotification(title, { body = '', icon = '', onClick = null, tag = '' } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // Only notify if window is not focused or user is in another tab/app
  if (document.hasFocus && document.hasFocus()) {
    return;
  }

  try {
    const notification = new Notification(title || 'Concord', {
      body,
      icon: icon || 'https://api.dicebear.com/7.x/bottts/svg?seed=ConcordApp',
      badge: 'https://api.dicebear.com/7.x/bottts/svg?seed=ConcordApp',
      tag: tag || ('concord_' + Date.now()),
      silent: false
    });

    notification.onclick = () => {
      window.focus();
      if (typeof onClick === 'function') {
        onClick();
      }
      notification.close();
    };

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      try { notification.close(); } catch (e) {}
    }, 6000);
  } catch (err) {
    console.warn('Native notification error:', err);
  }
}
