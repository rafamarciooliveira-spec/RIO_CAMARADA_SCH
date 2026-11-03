/**
 * Adaptador de pagamentos SANDBOX: gera Pix copia e cola e linha digitável fictícios.
 * Nenhum dinheiro passa por aqui. O provedor real (Asaas, Mercado Pago...) entra como
 * outro adaptador da mesma interface. Webhook do sandbox: assinatura HMAC-SHA256 do corpo
 * com o segredo SANDBOX_WEBHOOK_SECRET no cabeçalho x-sandbox-signature.
 */
import type { CryptoPort, PaymentProvider } from './ports.ts';

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** Pix copia e cola (BR Code) estático, no padrão EMV, com a chave e o valor informados */
export function buildPixPayload(opts: { key: string; name: string; city: string; amountCents: number; txid: string }): string {
  const merchant = emv('00', 'br.gov.bcb.pix') + emv('01', opts.key);
  const add = emv('05', opts.txid.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***');
  const ascii = (s: string, n: number) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().slice(0, n);
  const body =
    emv('00', '01') +
    emv('26', merchant) +
    emv('52', '0000') +
    emv('53', '986') +
    emv('54', (opts.amountCents / 100).toFixed(2)) +
    emv('58', 'BR') +
    emv('59', ascii(opts.name, 25) || 'SOCIEDADE') +
    emv('60', ascii(opts.city, 15) || 'BRASIL') +
    emv('62', add) +
    '6304';
  return body + crc16(body);
}

export function createSandboxPayments(crypto: CryptoPort, webhookSecret: string, pix?: { key: string; name: string; city: string }): PaymentProvider {
  return {
    name: 'sandbox',
    async createCharge(c) {
      const externalId = `sbx_${crypto.randomToken(9)}`;
      const pixCopyPaste = buildPixPayload({
        key: pix?.key || 'chave-pix-de-teste@sandbox.invalid',
        name: pix?.name || 'SOCIEDADE TESTE',
        city: pix?.city || 'BRASIL',
        amountCents: c.amountCents,
        txid: externalId,
      });
      const digits = String(c.amountCents).padStart(10, '0');
      return {
        externalId,
        pixCopyPaste,
        boletoLine: c.method === 'boleto' ? `00190.00009 01234.567890 12345.678901 1 0000${digits}` : undefined,
        boletoUrl: undefined,
      };
    },
    async cancelCharge() {
      /* nada a fazer no sandbox */
    },
    async parseWebhook(headers, rawBody) {
      const sig = headers['x-sandbox-signature'];
      if (!sig || !webhookSecret) return null;
      const expected = await crypto.sha256Hex(`${webhookSecret}.${rawBody}`);
      if (expected !== sig) return null;
      try {
        const ev = JSON.parse(rawBody) as { id: string; externalId: string; type: 'paid' | 'canceled' | 'overdue'; amountCents?: number; paidAt?: string };
        if (!ev.id || !ev.externalId) return null;
        return { eventId: ev.id, externalId: ev.externalId, type: ev.type, paidAmountCents: ev.amountCents, paidAt: ev.paidAt };
      } catch {
        return null;
      }
    },
  };
}
