/**
 * Notificação no celular pelo Firebase Cloud Messaging.
 * Mensagem só com dados (data): quem mostra a notificação é o service worker do site (public/sw.js),
 * o que funciona igual em todos os navegadores e não depende do SDK do Firebase no service worker.
 */
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import type { PushPort } from '../../src/shared/core/ports.ts';

const INVALID = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

export function fcmPush(app: App, appUrl: string): PushPort {
  return {
    async send(tokens, msg) {
      if (!tokens.length) return { sent: 0, invalid: [] };
      const res = await getMessaging(app).sendEachForMulticast({
        tokens,
        data: { title: msg.title, body: msg.body, link: msg.link },
        webpush: { headers: { Urgency: 'high', TTL: '86400' }, fcmOptions: { link: `${appUrl}${msg.link}` } },
      });
      const invalid: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID.has(r.error.code)) invalid.push(tokens[i]);
      });
      // Sem dados pessoais no log: só contagens
      if (res.failureCount) logger.info('push_falhas', { total: tokens.length, falhas: res.failureCount, invalidos: invalid.length });
      return { sent: res.successCount, invalid };
    },
  };
}
