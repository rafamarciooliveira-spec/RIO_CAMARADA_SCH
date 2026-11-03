/**
 * Procura no código as consultas com where + orderBy (ou desigualdade + outro campo) e sugere os
 * índices compostos do Firestore. Uso:
 *   npm run indexes:scan            mostra o que falta em firestore.indexes.json
 *   npm run indexes:scan -- --write acrescenta o que falta (não remove nada)
 *
 * Heurística: lê os objetos { where: [...], orderBy: [...] } passados a query/count/useList/watchList
 * com o caminho escrito como P.algo(...). Consultas montadas de outro jeito precisam ser revistas à mão;
 * o emulador e o console do Firebase também mostram o link do índice que faltar.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { P } from '../src/shared/paths.ts';

type Field = { fieldPath: string; order?: 'ASCENDING' | 'DESCENDING'; arrayConfig?: 'CONTAINS' };
type Index = { collectionGroup: string; queryScope: 'COLLECTION'; fields: Field[] };

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

function balanced(text: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

function collectionOf(expr: string): string | null {
  const m = /P\.(\w+)\(/.exec(expr);
  if (!m) return null;
  const fn = (P as Record<string, (...a: string[]) => string>)[m[1]];
  if (typeof fn !== 'function') return null;
  const path = fn(...Array.from({ length: fn.length }, () => 'x'));
  return path.split('/').pop() || null;
}

const found = new Map<string, Index & { where: string }>();
const unknown: string[] = [];
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8');
  const re = /(query|count|useList|watchList|list)\s*(<[^>]*>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const args = balanced(text, m.index + m[0].length - 1, '(', ')');
    if (!/where\s*:|orderBy\s*:/.test(args)) continue;
    const coll = collectionOf(args.split(',')[0]);
    const wheres = [...args.matchAll(/\[\s*'([\w.]+)'\s*,\s*'(==|!=|<=?|>=?|in|array-contains)'/g)].map(x => ({ f: x[1], op: x[2] }));
    const orders = [...args.matchAll(/\[\s*'([\w.]+)'\s*,\s*'(asc|desc)'\s*\]/g)].map(x => ({ f: x[1], dir: x[2] }));
    const fieldsUsed = new Set([...wheres.map(w => w.f), ...orders.map(o => o.f)]);
    const ranges = wheres.filter(w => !['==', 'in', 'array-contains'].includes(w.op));
    const needs = fieldsUsed.size >= 2 && (orders.length > 0 || ranges.length > 0 || wheres.some(w => w.op === 'array-contains'));
    if (!needs) continue;
    if (!coll) {
      unknown.push(`${file}: ${args.slice(0, 120).replace(/\s+/g, ' ')}`);
      continue;
    }
    const fields: Field[] = [];
    for (const w of wheres.filter(w => w.op === '==' || w.op === 'in')) fields.push({ fieldPath: w.f, order: 'ASCENDING' });
    for (const w of wheres.filter(w => w.op === 'array-contains')) fields.push({ fieldPath: w.f, arrayConfig: 'CONTAINS' });
    for (const w of ranges) if (!orders.find(o => o.f === w.f)) fields.push({ fieldPath: w.f, order: 'ASCENDING' });
    for (const o of orders) if (!fields.find(f => f.fieldPath === o.f)) fields.push({ fieldPath: o.f, order: o.dir === 'desc' ? 'DESCENDING' : 'ASCENDING' });
    const key = `${coll}|${JSON.stringify(fields)}`;
    found.set(key, { collectionGroup: coll, queryScope: 'COLLECTION', fields, where: file });
  }
}

const current = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as { indexes: Index[]; fieldOverrides: unknown[] };
const have = new Set(current.indexes.map(i => `${i.collectionGroup}|${JSON.stringify(i.fields)}`));
const missing = [...found.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);

console.log(`Consultas que pedem índice composto: ${found.size}; faltando em firestore.indexes.json: ${missing.length}`);
for (const i of missing) console.log(`  ${i.collectionGroup}: ${i.fields.map(f => `${f.fieldPath} ${f.order || f.arrayConfig}`).join(', ')}   (${i.where})`);
if (unknown.length) {
  console.log('\nConsultas com caminho que o script não resolveu (rever à mão):');
  for (const u of unknown) console.log(`  ${u}`);
}
if (process.argv.includes('--write') && missing.length) {
  current.indexes.push(...missing.map(({ where: _w, ...i }) => i));
  writeFileSync('firestore.indexes.json', JSON.stringify(current, null, 2) + '\n');
  console.log('\nfirestore.indexes.json atualizado.');
}
