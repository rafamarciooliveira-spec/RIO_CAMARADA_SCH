import { playNotificationSound } from './sound.ts';

const STORAGE_KEY = 'portal_push_permission_active';

export async function requestPushPermission(): Promise<NotificationPermission> {
  let nativeGranted = false;

  // Try native Web Notification API if available
  if ('Notification' in window) {
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        nativeGranted = true;
      }
    } catch {
      // In iframes or restricted environments, browser throws TypeError.
      // We gracefully fallback to the in-app push system.
    }
  }

  // Mark in-app push system as enabled
  try {
    localStorage.setItem(STORAGE_KEY, 'granted');
  } catch {}

  // Trigger immediate confirmation notification with auditory chime & toast
  triggerPushNotification(
    '🔔 Notificações Ativadas com Sucesso!',
    'Você receberá alertas sonoros e visuais em tempo real a cada atualização de status e carteirinha.',
    'approval'
  );

  return 'granted';
}

export function getPushPermissionStatus(): NotificationPermission {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local === 'granted') {
      return 'granted';
    }
  } catch {}

  if ('Notification' in window && Notification.permission === 'granted') {
    return 'granted';
  }

  return 'default';
}

export function triggerPushNotification(
  title: string,
  body: string,
  type: 'approval' | 'rejection' | 'expiration' | 'status_change' = 'status_change'
) {
  // 1. Play auditory chime
  try {
    if (type === 'approval') {
      playNotificationSound('success');
    } else if (type === 'rejection' || type === 'expiration') {
      playNotificationSound('alert');
    } else {
      playNotificationSound('ding');
    }
  } catch {}

  // 2. Dispatch custom in-app event for toast overlay
  try {
    window.dispatchEvent(
      new CustomEvent('portal_push_notification', {
        detail: { title, body, type, timestamp: new Date().toISOString() },
      })
    );
  } catch {}

  // 3. Native browser notification if permitted and in top-level context
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `status-update-${Date.now()}`,
      });
    } catch {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then(reg => {
            reg.showNotification(title, {
              body,
              icon: '/favicon.ico',
            });
          })
          .catch(() => {});
      }
    }
  }
}
