/**
 * Portas para efeitos externos: criptografia, e-mail, pagamentos e arquivos.
 * Implementação criptográfica única com WebCrypto (funciona no Node 22 e no navegador).
 */

export interface CryptoPort {
  randomToken(bytes?: number): string; // base64url
  sha256Hex(text: string): Promise<string>;
  hmacHex(text: string): Promise<string>; // índice cego (chave por plataforma + tenantId no texto)
  encrypt(plain: string): Promise<string>; // AES-256-GCM -> base64(iv|cipher)
  decrypt(payload: string): Promise<string>;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tenantId?: string;
  tag?: string;
}

export interface MailPort {
  send(msg: MailMessage): Promise<{ id: string; status: 'enviado' | 'simulado' | 'falhou'; error?: string }>;
}

export interface PaymentCharge {
  chargeId: string;
  tenantId: string;
  amountCents: number;
  dueDate: string;
  description: string;
  payerName: string;
  payerEmail?: string;
  method: 'pix' | 'boleto';
}

/** Interface desacoplada do fornecedor (Asaas, Mercado Pago etc. entram como adaptadores) */
export interface PaymentProvider {
  name: string;
  createCharge(c: PaymentCharge): Promise<{ externalId: string; pixCopyPaste?: string; boletoUrl?: string; boletoLine?: string }>;
  cancelCharge(externalId: string): Promise<void>;
  /** Confere a assinatura do webhook e devolve o evento normalizado (ou null se inválido) */
  parseWebhook(headers: Record<string, string | undefined>, rawBody: string): Promise<null | {
    eventId: string;
    externalId: string;
    type: 'paid' | 'canceled' | 'overdue';
    paidAmountCents?: number;
    paidAt?: string;
  }>;
}

/** Busca de manchetes (RSS de notícias). No servidor faz a requisição; na demo devolve itens fictícios. */
export interface NewsHeadline {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
}
export interface NewsPort {
  search(query: string, limit: number): Promise<NewsHeadline[]>;
}

/** Notificação no celular (Firebase Cloud Messaging no servidor) */
export interface PushMessage {
  title: string;
  body: string;
  link: string; // caminho absoluto no site, ex.: /minha-sociedade/avisos
}
export interface PushPort {
  /** Envia para os tokens e devolve os que não valem mais (para apagar) */
  send(tokens: string[], msg: PushMessage): Promise<{ sent: number; invalid: string[] }>;
}

export interface FilePort {
  /** URL assinada de curta duração para um arquivo privado */
  signedUrl(path: string, ttlSeconds: number): Promise<string | null>;
  remove(path: string): Promise<void>;
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * keys.encKeyB64: 32 bytes (AES-256) em base64; keys.hmacKeyB64: 32 bytes em base64.
 * Em produção vêm do Secret Manager (CPF_ENCRYPTION_KEY, CPF_HMAC_KEY).
 */
export function createWebCrypto(keys: { encKeyB64: string; hmacKeyB64: string }): CryptoPort {
  const subtle = globalThis.crypto.subtle;
  let encKey: Promise<CryptoKey> | null = null;
  let macKey: Promise<CryptoKey> | null = null;
  const getEnc = () =>
    (encKey ||= subtle.importKey('raw', fromB64(keys.encKeyB64) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']));
  const getMac = () =>
    (macKey ||= subtle.importKey('raw', fromB64(keys.hmacKeyB64) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));

  return {
    randomToken(bytes = 32) {
      const arr = new Uint8Array(bytes);
      globalThis.crypto.getRandomValues(arr);
      return toB64(arr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    async sha256Hex(text) {
      return toHex(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
    },
    async hmacHex(text) {
      return toHex(await subtle.sign('HMAC', await getMac(), new TextEncoder().encode(text)));
    },
    async encrypt(plain) {
      const iv = new Uint8Array(12);
      globalThis.crypto.getRandomValues(iv);
      const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, await getEnc(), new TextEncoder().encode(plain));
      const out = new Uint8Array(iv.length + cipher.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(cipher), iv.length);
      return toB64(out);
    },
    async decrypt(payload) {
      const bytes = fromB64(payload);
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv }, await getEnc(), data);
      return new TextDecoder().decode(plain);
    },
  };
}

/** Chaves aleatórias para demonstração/emulador (nunca para produção) */
export function ephemeralKeys(): { encKeyB64: string; hmacKeyB64: string } {
  const a = new Uint8Array(32);
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(a);
  globalThis.crypto.getRandomValues(b);
  return { encKeyB64: toB64(a), hmacKeyB64: toB64(b) };
}

/** E-mail simulado: registra no outbox e não envia (emulador, demo, ou sem chave do Resend) */
export const simulatedMail: MailPort = {
  async send() {
    return { id: `sim_${Date.now().toString(36)}`, status: 'simulado' };
  },
};

/** Cobrança da assinatura do SaaS (Stripe quando ligado; sem porta, os pedidos de plano vão para a plataforma) */
export interface BillingPort {
  name: 'stripe';
  /** Página de pagamento da assinatura; quantity = sócios cobrados (já com o mínimo do plano) */
  createCheckout(args: { tenantId: string; tenantName: string; planId: string; period: 'mensal' | 'anual'; priceId: string; quantity: number; customerEmail: string; successUrl: string; cancelUrl: string; customerId?: string }): Promise<{ url: string }>;
  /** Portal do cliente (trocar cartão, ver faturas, cancelar) */
  portal(args: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Atualiza a quantidade cobrada quando o número de sócios muda */
  updateQuantity(subscriptionId: string, quantity: number): Promise<void>;
}
