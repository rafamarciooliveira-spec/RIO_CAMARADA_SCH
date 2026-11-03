/**
 * Portas do servidor: e-mail (Resend), arquivos (Admin Storage), criptografia de CPF e pagamentos.
 * Nenhum dado pessoal vai para o log: só códigos e identificadores técnicos.
 */
import { getStorage } from 'firebase-admin/storage';
import type { App } from 'firebase-admin/app';
import { logger } from 'firebase-functions';
import type { CryptoPort, FilePort, MailMessage, MailPort } from '../../src/shared/core/ports.ts';
import { createWebCrypto, simulatedMail } from '../../src/shared/core/ports.ts';

export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

function isKey32(b64: string): boolean {
  try {
    return Buffer.from(b64, 'base64').length === 32;
  } catch {
    return false;
  }
}

/** CPF: AES-256-GCM e HMAC com chaves de 32 bytes em base64 (Secret Manager) */
export function serverCrypto(keys: { encKeyB64: string; hmacKeyB64: string }): CryptoPort {
  if (!isKey32(keys.encKeyB64) || !isKey32(keys.hmacKeyB64)) {
    // Falha fechada: sem chave válida o servidor não grava nem lê CPF
    throw new Error('CPF_ENCRYPTION_KEY e CPF_HMAC_KEY precisam ter 32 bytes em base64.');
  }
  return createWebCrypto(keys);
}

/** E-mail transacional pela API HTTP da Resend; sem chave (ou no emulador) fica simulado */
export function resendMail(apiKey: string, from: string): MailPort {
  if (!apiKey || IS_EMULATOR) return simulatedMail;
  return {
    async send(msg: MailMessage) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [msg.to],
            subject: msg.subject,
            text: msg.text,
            ...(msg.html ? { html: msg.html } : {}),
            ...(msg.tag ? { tags: [{ name: 'modelo', value: msg.tag.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) }] } : {}),
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
        if (!res.ok) {
          logger.warn('resend_falhou', { status: res.status, tipo: body.name || '' });
          return { id: '', status: 'falhou', error: `HTTP ${res.status}` };
        }
        return { id: body.id || '', status: 'enviado' };
      } catch (e) {
        logger.warn('resend_erro_de_rede', { erro: (e as Error).name });
        return { id: '', status: 'falhou', error: 'rede' };
      }
    },
  };
}

/** Arquivos privados: URL assinada v4 de curta duração e remoção */
export function storageFiles(app: App): FilePort {
  const bucket = () => getStorage(app).bucket();
  return {
    async signedUrl(path, ttlSeconds) {
      if (!path || path.includes('..')) return null;
      try {
        const [url] = await bucket()
          .file(path)
          .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + Math.min(ttlSeconds, 3600) * 1000 });
        return url;
      } catch {
        // No emulador não há credencial para assinar; a validação segue sem foto
        return null;
      }
    },
    async remove(path) {
      if (!path || path.includes('..')) return;
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}
