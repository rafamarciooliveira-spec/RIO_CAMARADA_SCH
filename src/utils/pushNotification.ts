import { playNotificationSound } from './sound.ts';

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('Este navegador não suporta notificações nativas da web.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Erro ao solicitar permissão de notificações push:', error);
    return 'denied';
  }
}

export function getPushPermissionStatus(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export function triggerPushNotification(
  title: string,
  body: string,
  type: 'approval' | 'rejection' | 'expiration' | 'status_change' = 'status_change'
) {
  // 1. Play auditory chime
  if (type === 'approval') {
    playNotificationSound('success');
  } else if (type === 'rejection' || type === 'expiration') {
    playNotificationSound('alert');
  } else {
    playNotificationSound('ding');
  }

  // 2. Dispatch custom in-app event for toast overlay
  window.dispatchEvent(
    new CustomEvent('portal_push_notification', {
      detail: { title, body, type, timestamp: new Date().toISOString() },
    })
  );

  // 3. Native browser notification if permitted
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `status-update-${Date.now()}`,
      });
    } catch {
      // Service worker registration fallback if direct Notification constructor blocked
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, {
            body,
            icon: '/favicon.ico',
          });
        }).catch(() => {});
      }
    }
  }
}
