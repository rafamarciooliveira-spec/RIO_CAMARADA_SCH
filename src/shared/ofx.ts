/**
 * Leitor de extrato OFX (SGML 1.x, sem fechamento de tags, e XML 2.x). Função pura, sem
 * dependência de navegador. Valores em centavos: positivo entrada, negativo saída.
 */

export interface OfxTransaction {
  fitId: string;
  date: string; // AAAA-MM-DD
  amountCents: number;
  memo: string;
  type: string;
}

export interface OfxStatement {
  bankId?: string;
  accountNumber?: string;
  currency?: string;
  transactions: OfxTransaction[];
}

function tag(block: string, name: string): string | undefined {
  // Aceita <NAME>valor</NAME> e <NAME>valor (SGML), parando na próxima tag ou quebra de linha
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i');
  const m = block.match(re);
  if (!m) return undefined;
  const v = m[1].trim();
  return v || undefined;
}

/** "20261102120000[-3:BRT]" -> "2026-11-02" */
export function ofxDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo}-${d}`;
}

/** "-1234.56" | "1234,56" | "1.234,56" | "1,234.56" -> centavos */
export function ofxAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // O separador que aparece por último é o decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Identificador estável quando o banco não manda FITID */
function syntheticId(date: string, cents: number, memo: string, i: number): string {
  let h = 0;
  const text = `${date}|${cents}|${memo}|${i}`;
  for (let k = 0; k < text.length; k++) h = (Math.imul(h, 31) + text.charCodeAt(k)) | 0;
  return `sint_${date.replace(/-/g, '')}_${(h >>> 0).toString(36)}`;
}

export function parseOfx(text: string): OfxStatement {
  const src = String(text || '');
  const body = src.slice(Math.max(0, src.search(/<OFX>/i)));
  const out: OfxStatement = {
    bankId: tag(body, 'BANKID'),
    accountNumber: tag(body, 'ACCTID'),
    currency: tag(body, 'CURDEF'),
    transactions: [],
  };
  const blocks = body.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(tag(block, 'DTPOSTED'));
    const cents = ofxAmount(tag(block, 'TRNAMT'));
    if (!date || cents === null) return;
    const memo = decodeEntities([tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' ').trim()).slice(0, 300);
    const fit = tag(block, 'FITID');
    out.transactions.push({
      fitId: fit ? fit.slice(0, 120) : syntheticId(date, cents, memo, i),
      date,
      amountCents: cents,
      memo,
      type: (tag(block, 'TRNTYPE') || (cents >= 0 ? 'CREDIT' : 'DEBIT')).toUpperCase(),
    });
  });
  return out;
}
