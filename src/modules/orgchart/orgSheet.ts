/**
 * Organograma por planilha: o modelo para baixar (colunas fixas e uma aba de instruções),
 * a leitura do arquivo preenchido e a junção com os cargos que já existem.
 * Funções puras (sem tela) para poder testar.
 */
import type { OrgPosition } from '../../shared/types.ts';

export const SHEET_COLUMNS = [
  { key: 'cargo', title: 'Cargo', need: 'Obrigatório', what: 'Nome do cargo.', example: 'Presidente' },
  { key: 'aba', title: 'Aba', need: 'Obrigatório', what: 'Grupo ou aba onde o cargo aparece. Em branco, repete a aba da linha de cima.', example: 'Diretoria' },
  { key: 'pessoa', title: 'Quem ocupa', need: 'Opcional', what: 'Nome como está no cadastro de sócios. Pode deixar em branco e escolher depois na tela.', example: 'Maria da Silva' },
  { key: 'linha', title: 'Linha', need: 'Opcional', what: 'Número da linha dentro da aba: cargos com o mesmo número ficam lado a lado (1 em cima, depois 2, 3...).', example: '2' },
  { key: 'abaixo', title: 'Abaixo de', need: 'Opcional', what: 'Cargo que fica logo acima deste, na mesma coluna. Use para o vice ficar abaixo do titular.', example: 'Tesoureiro' },
  { key: 'destaque', title: 'Destaque', need: 'Opcional', what: 'Escreva sim para mostrar com coroa e em destaque (majestades).', example: 'sim' },
] as const;

type Key = (typeof SHEET_COLUMNS)[number]['key'];

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const SYNONYMS: Record<Key, string[]> = {
  cargo: ['cargo', 'funcao', 'titulo', 'posicao'],
  aba: ['aba', 'grupo', 'setor', 'grupo/aba', 'aba/grupo'],
  pessoa: ['quem ocupa', 'socio', 'nome', 'ocupante', 'pessoa', 'quem'],
  linha: ['linha', 'nivel', 'fileira'],
  abaixo: ['abaixo de', 'fica abaixo de', 'vice de', 'superior', 'titular', 'abaixo'],
  destaque: ['destaque', 'coroa', 'majestade'],
};

export interface SheetRow {
  line: number; // linha da planilha (para mensagens)
  title: string;
  group: string;
  person: string;
  row?: number;
  below: string;
  highlight: boolean;
}

export interface SheetResult {
  rows: SheetRow[];
  problems: string[]; // linhas ignoradas ou dados que não deu para usar
}

/** Linhas do modelo: os cargos atuais (ou os sugeridos), na ordem das colunas */
export function templateRows(positions: OrgPosition[], groupOrder: string[]): string[][] {
  const byId = new Map(positions.map(p => [p.id, p]));
  const rank = (g: string) => (groupOrder.indexOf(g) < 0 ? 999 : groupOrder.indexOf(g));
  const list = [...positions].sort((a, b) => rank(a.group) - rank(b.group) || a.order - b.order);
  return [
    SHEET_COLUMNS.map(c => c.title),
    ...list.map(p => [p.title, p.group, p.personName || '', p.row ? String(p.row) : '', (p.under && byId.get(p.under)?.title) || '', p.highlight ? 'sim' : '']),
  ];
}

export function instructionRows(): string[][] {
  return [
    ['Coluna', 'Título', 'Preenchimento', 'O que vai', 'Exemplo'],
    ...SHEET_COLUMNS.map((c, i) => [String.fromCharCode(65 + i), c.title, c.need, c.what, c.example]),
    [],
    ['Dicas'],
    ['Uma linha por cargo. Não mude a ordem nem os títulos das colunas da primeira aba.'],
    ['Exemplo de montagem: Presidente na linha 1; Vice-presidente com Abaixo de = Presidente; Diretor de tiro, Secretário e Tesoureiro na linha 2; cada vice com Abaixo de = o seu titular; Conselho fiscal na linha 3.'],
    ['Quem ocupa pode ficar em branco: depois de enviar, escolha cada pessoa na tela do organograma.'],
    ['Cargos que dão acesso ao portal mantêm quem ocupa; a troca é feita em Passar o cargo.'],
  ];
}

const truthy = (s: string) => ['sim', 's', 'x', '1', 'yes', 'y', 'true', 'verdadeiro', 'coroa'].includes(norm(s));

/** Lê as linhas da planilha (com ou sem cabeçalho) */
export function parseSheet(cells: string[][]): SheetResult {
  const problems: string[] = [];
  let start = 0;
  let index: Record<Key, number> = { cargo: 0, aba: 1, pessoa: 2, linha: 3, abaixo: 4, destaque: 5 };
  const firstFilled = cells.findIndex(r => r.some(c => (c || '').trim()));
  if (firstFilled >= 0) {
    const head = cells[firstFilled].map(c => norm(c || ''));
    const found: Partial<Record<Key, number>> = {};
    head.forEach((h, i) => {
      for (const k of Object.keys(SYNONYMS) as Key[]) if (found[k] === undefined && SYNONYMS[k].includes(h)) found[k] = i;
    });
    if (found.cargo !== undefined) {
      start = firstFilled + 1;
      index = { ...index, ...Object.fromEntries((Object.keys(index) as Key[]).map(k => [k, found[k] ?? -1])) } as Record<Key, number>;
      if (found.aba === undefined) problems.push('A planilha não tem a coluna Aba: todos os cargos vão para a Diretoria.');
    }
  }
  const rows: SheetRow[] = [];
  let lastGroup = '';
  for (let i = start; i < cells.length; i++) {
    const r = cells[i] || [];
    const get = (k: Key) => (index[k] >= 0 ? String(r[index[k]] ?? '').replace(/\s+/g, ' ').trim() : '');
    if (!r.some(c => (c || '').trim())) continue;
    const line = i + 1;
    const title = get('cargo');
    if (title.length < 2) {
      problems.push(`Linha ${line}: falta o nome do cargo (ignorada).`);
      continue;
    }
    if (title.length > 80) {
      problems.push(`Linha ${line}: nome do cargo com mais de 80 letras (ignorada).`);
      continue;
    }
    const group = (get('aba') || lastGroup || 'Diretoria').slice(0, 60);
    lastGroup = group;
    const rawRow = get('linha');
    let row: number | undefined;
    if (rawRow) {
      const n = Number(rawRow.replace(',', '.'));
      if (Number.isInteger(n) && n >= 1 && n <= 30) row = n;
      else problems.push(`Linha ${line}: "${rawRow}" não é uma linha válida (use 1 a 30); ficou automática.`);
    }
    rows.push({ line, title, group, person: get('pessoa').slice(0, 150), row, below: get('abaixo'), highlight: truthy(get('destaque')) });
    if (rows.length >= 120) {
      problems.push('A planilha passou de 120 cargos: o restante foi ignorado.');
      break;
    }
  }
  return { rows, problems };
}

export interface MemberRef {
  id: string;
  fullName: string;
}

export interface MergeResult {
  positions: OrgPosition[];
  groupOrder: string[];
  created: number;
  updated: number;
  removed: number;
  kept: string[]; // cargos com acesso que ficaram mesmo fora da planilha
  notes: string[];
}

/**
 * Junta a planilha com os cargos atuais. Cargo igual (mesmo nome na mesma aba, ou só o nome quando
 * é único) é atualizado; o resto entra como novo. No modo "trocar", sai o que não está na planilha,
 * menos os cargos que dão acesso ao portal e estão ocupados.
 */
export function mergeSheet(current: OrgPosition[], rows: SheetRow[], opts: { mode: 'juntar' | 'trocar'; members: MemberRef[]; newId: () => string }): MergeResult {
  const notes: string[] = [];
  const used = new Set<string>();
  const byName = new Map<string, MemberRef[]>();
  for (const m of opts.members) byName.set(norm(m.fullName), [...(byName.get(norm(m.fullName)) || []), m]);
  const out: OrgPosition[] = [];
  const lineId = new Map<number, string>();
  let created = 0;
  let updated = 0;
  rows.forEach((r, i) => {
    const sameTab = current.find(p => !used.has(p.id) && norm(p.title) === norm(r.title) && norm(p.group) === norm(r.group));
    const onlyName = current.filter(p => !used.has(p.id) && norm(p.title) === norm(r.title));
    const match = sameTab || (onlyName.length === 1 ? onlyName[0] : undefined);
    const base: OrgPosition = match ? { ...match } : { id: opts.newId(), title: r.title, group: r.group, order: 0, highlight: false };
    if (match) {
      used.add(match.id);
      updated++;
    } else created++;
    const next: OrgPosition = { ...base, title: r.title, group: r.group, order: i + 1, highlight: r.highlight, row: r.row, under: undefined };
    if (r.person) {
      if (match?.roleId) {
        if (norm(r.person) !== norm(match.personName || '')) notes.push(`${r.title}: o cargo dá acesso ao portal, então quem ocupa só muda em Passar o cargo.`);
      } else {
        const found = byName.get(norm(r.person)) || [];
        if (found.length === 1) Object.assign(next, { memberId: found[0].id, personName: found[0].fullName });
        else {
          Object.assign(next, { memberId: undefined, personName: r.person });
          if (found.length > 1) notes.push(`${r.title}: há mais de um sócio chamado ${r.person}; escolha o certo na tela.`);
        }
      }
    }
    lineId.set(r.line, next.id);
    out.push(next);
  });
  // "Abaixo de": primeiro na mesma aba, depois em qualquer aba
  rows.forEach((r, i) => {
    if (!r.below) return;
    const me = out[i];
    const target = out.find(p => p.id !== me.id && norm(p.title) === norm(r.below) && norm(p.group) === norm(r.group)) || out.find(p => p.id !== me.id && norm(p.title) === norm(r.below));
    // Vale para a montagem em linhas (under) e, no estilo árvore, como superior (parentId)
    if (target) Object.assign(me, { under: target.id, parentId: target.id });
    else notes.push(`Linha ${r.line}: o cargo "${r.below}" (Abaixo de) não está na planilha; ${r.title} ficou sem.`);
  });
  // Sem ciclos (A abaixo de B e B abaixo de A): desfaz o segundo
  const parent = new Map(out.map(p => [p.id, p.under]));
  for (const p of out) {
    const seen = new Set<string>([p.id]);
    let cur = p.under;
    while (cur) {
      if (seen.has(cur)) {
        Object.assign(p, { under: undefined, parentId: undefined });
        parent.set(p.id, undefined);
        notes.push(`${p.title}: "Abaixo de" fazia um círculo e foi tirado.`);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  const kept: string[] = [];
  let removed = 0;
  let order = out.length;
  for (const p of current) {
    if (used.has(p.id)) continue;
    if (opts.mode === 'juntar' || (p.roleId && p.memberId)) {
      if (opts.mode === 'trocar') kept.push(p.title);
      // O que ficou fora não pode apontar para um cargo que saiu
      out.push({ ...p, order: ++order, parentId: p.parentId && (out.some(x => x.id === p.parentId) || current.some(x => x.id === p.parentId && (opts.mode === 'juntar' || used.has(x.id)))) ? p.parentId : undefined });
    } else removed++;
  }
  const ids = new Set(out.map(p => p.id));
  for (const p of out) {
    if (p.parentId && !ids.has(p.parentId)) p.parentId = undefined;
    if (p.under && !ids.has(p.under)) p.under = undefined;
  }
  const groupOrder: string[] = [];
  for (const p of out) if (!groupOrder.includes(p.group)) groupOrder.push(p.group);
  return { positions: out, groupOrder, created, updated, removed, kept, notes };
}
