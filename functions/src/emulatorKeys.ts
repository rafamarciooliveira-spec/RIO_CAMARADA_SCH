/**
 * Chaves de CPF SÓ PARA O EMULADOR LOCAL (projeto demo-sodalis, dados fictícios).
 *
 * São derivadas de um rótulo fixo e público para que o script de dados simulados
 * (scripts/seed-emulator.ts) e as Functions do emulador cifrem e leiam o mesmo CPF fictício.
 * Não são segredo e não protegem nada: em produção as chaves vêm do Secret Manager
 * (CPF_ENCRYPTION_KEY e CPF_HMAC_KEY) e o servidor se recusa a subir sem elas.
 */
import { createHash } from 'node:crypto';

const LABEL = 'sodalis-emulador-local-nunca-usar-em-producao';

export function emulatorCpfKeys(): { encKeyB64: string; hmacKeyB64: string } {
  const enc = createHash('sha256').update(`${LABEL}:enc`).digest('base64');
  const mac = createHash('sha256').update(`${LABEL}:hmac`).digest('base64');
  return { encKeyB64: enc, hmacKeyB64: mac };
}

export const EMULATOR_WEBHOOK_SECRET = 'segredo-do-sandbox-somente-emulador';
