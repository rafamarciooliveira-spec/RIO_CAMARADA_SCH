/** Leitura de CSV no navegador (separador ";" ou ","; aspas; BOM do Excel) e mapeamento de colunas. */

export function detectDelimiter(firstLine: string): ';' | ',' {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = detectDelimiter(src.split(/\r?\n/, 1)[0] || '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some(c => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) rows.push(row);
  return rows.map(r => r.map(c => c.trim().replace(/^'(?=[=+\-@])/, '')));
}

export const IMPORT_FIELDS = [
  { key: 'fullName', label: 'Nome completo', required: true, guess: ['nome', 'nome completo', 'socio', 'sócio', 'associado'] },
  { key: 'cpf', label: 'CPF', guess: ['cpf'] },
  { key: 'email', label: 'E-mail', guess: ['email', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Telefone', guess: ['telefone', 'celular', 'whatsapp', 'fone'] },
  { key: 'birthDate', label: 'Nascimento', guess: ['nascimento', 'data de nascimento', 'nasc'] },
  { key: 'categoryName', label: 'Categoria', guess: ['categoria', 'tipo'] },
  { key: 'membershipNumber', label: 'Matrícula', guess: ['matricula', 'matrícula', 'numero', 'número', 'n'] },
  { key: 'status', label: 'Situação (ativo ou pendente)', guess: ['situacao', 'situação', 'status'] },
] as const;

export type ImportKey = (typeof IMPORT_FIELDS)[number]['key'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function guessMapping(headers: string[]): Partial<Record<ImportKey, number>> {
  const out: Partial<Record<ImportKey, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const f of IMPORT_FIELDS) if (out[f.key] === undefined && f.guess.some(g => norm(g) === n)) out[f.key] = i;
  });
  return out;
}

/** "31/12/1990" ou "1990-12-31" -> "1990-12-31"; outro formato -> "" */
export function toDateKey(v: string): string {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function buildRows(data: string[][], map: Partial<Record<ImportKey, number>>) {
  const get = (r: string[], k: ImportKey) => (map[k] === undefined ? '' : (r[map[k]!] || '').trim());
  return data
    .map(r => {
      const status = norm(get(r, 'status'));
      const email = get(r, 'email');
      return {
        fullName: get(r, 'fullName').slice(0, 150),
        ...(get(r, 'cpf') ? { cpf: get(r, 'cpf').slice(0, 20) } : {}),
        ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email: email.slice(0, 120) } : {}),
        ...(get(r, 'phone') ? { phone: get(r, 'phone').slice(0, 30) } : {}),
        ...(toDateKey(get(r, 'birthDate')) ? { birthDate: toDateKey(get(r, 'birthDate')) } : {}),
        ...(get(r, 'categoryName') ? { categoryName: get(r, 'categoryName').slice(0, 60) } : {}),
        ...(get(r, 'membershipNumber') ? { membershipNumber: get(r, 'membershipNumber').slice(0, 30) } : {}),
        ...(status === 'ativo' ? { status: 'ativo' as const } : status ? { status: 'pendente' as const } : {}),
      };
    })
    .filter(r => r.fullName.length >= 3);
}
