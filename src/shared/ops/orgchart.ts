/**
 * Organograma configurável: cargos e títulos de cada sociedade (presidente, tesoureiro,
 * rei e rainha do tiro, técnico, capitão...), em estilos de exibição diferentes.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import type { MemberDoc, MembershipDoc, OrgChartDoc, OrgPosition, TermDoc } from '../types.ts';
import { societyType } from '../societyTypes.ts';
import { notify, permsForRoles, tid } from './helpers.ts';
import { assertKeepsAnAdmin } from './access.ts';

const zPosition = z.object({
  id: zId,
  title: zText(80).min(2),
  group: zText(60).min(1),
  order: z.number().int().min(0).max(999),
  highlight: z.boolean(),
  memberId: zId.optional(),
  personName: zText(150).optional(),
  parentId: zId.optional(),
  since: zDateKey.optional(),
  roleId: zId.optional(), // papel de acesso que acompanha o cargo (presidente, tesoureiro...)
  roleFromGroup: z.boolean().optional(),
});

const zGroup = z.object({ name: zText(60).min(1), order: z.number().int().min(0).max(999), roleId: zId.optional() });

export const saveOrgChart = defineOp({
  name: 'orgchart.save',
  input: zTenant.extend({
    style: z.enum(['arvore', 'cartoes', 'corte']),
    title: zText(120).min(2),
    positions: z.array(zPosition).max(120),
    groups: z.array(zGroup).max(30).optional(),
    tabs: z.boolean().optional(),
    showOnPublicPage: z.boolean(),
  }),
  auth: 'user',
  tenant: { perm: ['organograma', 'editar'] },
  module: 'organograma',
  async run(ctx, input) {
    const t = tid(ctx);
    const ids = new Set<string>();
    for (const p of input.positions) {
      if (ids.has(p.id)) fail('invalid-argument', 'Há cargos repetidos.');
      ids.add(p.id);
    }
    for (const p of input.positions) {
      if (p.parentId && (!ids.has(p.parentId) || p.parentId === p.id)) fail('invalid-argument', `O cargo "${p.title}" aponta para um superior inexistente.`);
    }
    // Evita ciclos na árvore (A abaixo de B e B abaixo de A)
    const parent = new Map(input.positions.map(p => [p.id, p.parentId]));
    for (const p of input.positions) {
      const seen = new Set<string>();
      let cur: string | undefined = p.id;
      while (cur) {
        if (seen.has(cur)) fail('invalid-argument', 'A hierarquia tem um ciclo. Revise os superiores.');
        seen.add(cur);
        cur = parent.get(cur);
      }
    }
    // Nome exibido vem do cadastro quando o cargo é ligado a um sócio (só o nome reduzido)
    // Cargo com acesso só troca de ocupante pela passagem de cargo, que mexe nos papéis com segurança
    const storedDoc = await ctx.store.get<OrgChartDoc>(P.orgchart(t));
    const stored = new Map((storedDoc?.positions || []).map(p => [p.id, p]));
    // Abas: só as que têm cargo ficam; o acesso da aba vale para todos os cargos dela
    const groups = (input.groups || []).filter((g, i, all) => all.findIndex(x => x.name === g.name) === i && input.positions.some(p => p.group === g.name));
    const groupRole = new Map(groups.map(g => [g.name, g.roleId]));
    for (const g of groups) if (g.roleId) await permsForRoles(ctx, t, [g.roleId]);
    for (const p of input.positions) {
      const gr = groupRole.get(p.group);
      if (gr) Object.assign(p, { roleId: gr, roleFromGroup: true });
      else if (p.roleFromGroup) Object.assign(p, { roleId: undefined, roleFromGroup: undefined });
    }
    // Acesso trocado em cargo ocupado: quem ocupa ganha o novo e perde o antigo (depois de gravar)
    const accessChanges: { memberId: string; title: string; from?: string; to?: string }[] = [];
    for (const p of input.positions) {
      const old = stored.get(p.id);
      if (p.roleId || old?.roleId) ctx.require('papeis', 'aprovar');
      if (p.roleId) await permsForRoles(ctx, t, [p.roleId]);
      if (old?.memberId && (old.roleId || '') !== (p.roleId || '')) accessChanges.push({ memberId: old.memberId, title: p.title, from: old.roleId, to: p.roleId });
      // Cargo com acesso só troca de ocupante pela passagem de cargo, que mexe nos papéis com segurança
      if (p.roleId || old?.roleId) Object.assign(p, { memberId: old?.memberId, personName: old?.personName, since: old?.since });
    }
    const positions = [];
    for (const p of input.positions) {
      if (p.memberId) {
        const m = await ctx.store.get<MemberDoc>(P.member(t, p.memberId));
        if (!m) fail('invalid-argument', `Sócio do cargo "${p.title}" não encontrado.`);
        positions.push({ ...p, personName: p.personName || m!.fullName });
      } else positions.push(p);
    }
    // Quem ganha acesso precisa ter entrado no portal; confere antes de gravar qualquer coisa
    const occupants = new Map<string, MemberDoc>();
    for (const c of accessChanges) {
      const m = await ctx.store.get<MemberDoc>(P.member(t, c.memberId));
      if (c.to && !m?.uid) fail('failed-precondition', `${m?.fullName || 'Quem ocupa'} (${c.title}) ainda não entrou no portal com a conta Google. Mande um convite ou deixe o acesso desta aba para depois.`);
      if (m) occupants.set(c.memberId, m);
    }
    const doc: OrgChartDoc = { style: input.style, title: input.title, positions, ...(groups.length ? { groups } : {}), ...(input.tabs !== undefined ? { tabs: input.tabs } : {}), showOnPublicPage: input.showOnPublicPage, updatedAt: ctx.nowIso };
    await ctx.store.set(P.orgchart(t), { ...doc, positions: clean(positions) } as unknown as Record<string, unknown>);
    // Primeiro quem ganha, depois quem perde (a trava do último administrador enxerga os dois)
    for (const c of accessChanges) {
      const m = occupants.get(c.memberId);
      if (c.to && m?.uid) await grantRole(ctx, t, m.uid, c.to, c.title);
    }
    for (const c of accessChanges) {
      const m = occupants.get(c.memberId);
      const keeps = positions.some(p => p.memberId === c.memberId && p.roleId === c.from);
      if (c.from && m?.uid && !keeps) await dropRole(ctx, t, m.uid, c.from);
    }
    await ctx.audit('orgchart.saved', undefined, { positions: positions.length });
    await syncTermFromChart(ctx, t, positions);
    return { ok: true };
  },
});

/** Cargos sugeridos para o tipo da sociedade (não grava; a tela usa para restaurar) */
export const orgChartPreset = defineOp({
  name: 'orgchart.preset',
  input: zTenant.extend({ societyType: z.string().max(40).optional() }),
  auth: 'user',
  tenant: { perm: ['organograma', 'ver'] },
  async run(ctx, input) {
    const preset = societyType(input.societyType || ctx.tenant!.societyType);
    return { style: preset.orgStyle, positions: preset.positions.map((p, i) => ({ ...p, id: `cargo_${i + 1}` })) };
  },
});

/** Dá um papel a quem já tem acesso ao portal (até 5 papéis por conta) */
async function grantRole(ctx: OpContext, t: string, uid: string, roleId: string, title: string) {
  const ms = await ctx.store.get<MembershipDoc>(P.membership(t, uid));
  if (!ms) fail('failed-precondition', 'Esta pessoa ainda não tem acesso ao portal desta sociedade.');
  if (ms!.roleIds.includes(roleId)) return;
  const roleIds = [...new Set([...ms!.roleIds, roleId])].slice(0, 5);
  const { perms, board } = await permsForRoles(ctx, t, roleIds);
  await ctx.store.update(P.membership(t, uid), { roleIds, perms, board, active: true, updatedAt: ctx.nowIso });
  await notify(ctx, uid, `Novo acesso pelo cargo de ${title}`, 'Os acessos já estão liberados no portal.', 'inicio');
}

/** Tira um papel de uma conta mantendo ao menos o papel de sócio (ou nenhum, se não for sócio) */
async function dropRole(ctx: OpContext, t: string, uid: string, roleId: string) {
  const ms = await ctx.store.get<MembershipDoc>(P.membership(t, uid));
  if (!ms || !ms.roleIds.includes(roleId)) return;
  let roleIds = ms.roleIds.filter(r => r !== roleId);
  if (!roleIds.length) roleIds = ['socio'];
  await assertKeepsAnAdmin(ctx, t, uid, roleIds);
  const { perms, board } = await permsForRoles(ctx, t, roleIds);
  await ctx.store.update(P.membership(t, uid), { roleIds, perms, board, updatedAt: ctx.nowIso });
}

/**
 * Passagem de cargo: quem assume o cargo recebe o papel de acesso ligado a ele (presidente,
 * tesoureiro...) e quem sai perde, salvo se a diretoria pedir para manter. O mandato que
 * termina vai para a galeria. Nunca deixa a sociedade sem alguém que gerencie papéis.
 */
export const handover = defineOp({
  name: 'orgchart.handover',
  input: zTenant.extend({
    positionId: zId,
    memberId: zId.optional(), // vazio = cargo fica vago
    since: zDateKey,
    keepOldAccess: z.boolean().default(false),
    note: zText(300).optional(),
  }),
  auth: 'user',
  tenant: { perm: ['organograma', 'editar'] },
  module: 'organograma',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const chart = await ctx.store.get<OrgChartDoc>(P.orgchart(t));
    const pos = chart?.positions.find(p => p.id === input.positionId);
    if (!chart || !pos) fail('not-found', 'Cargo não encontrado. Salve o organograma antes.');
    if (input.memberId && input.memberId === pos!.memberId) fail('failed-precondition', 'Esta pessoa já ocupa o cargo.');
    const positions = await occupy(ctx, t, chart!.positions, pos!.id, input.memberId ? { memberId: input.memberId } : null, input.since, input.keepOldAccess, input.note);
    await ctx.store.update(P.orgchart(t), { positions: clean(positions), updatedAt: ctx.nowIso });
    await syncTermFromChart(ctx, t, positions);
    return { ok: true };
  },
});

const clean = (positions: OrgPosition[]) => positions.map(p => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));

/**
 * Troca quem ocupa um cargo (ou deixa vago) e devolve a lista nova, sem gravar o organograma.
 * Cargo com acesso: quem assume ganha o papel antes de quem sai perder (a trava do último admin
 * enxerga os dois). Nome livre (sem cadastro) só em cargo sem acesso. Quem sai vai para a galeria.
 */
async function occupy(
  ctx: OpContext,
  t: string,
  positions: OrgPosition[],
  positionId: string,
  who: { memberId?: string; personName?: string } | null,
  since: string,
  keepOldAccess = false,
  note?: string
): Promise<OrgPosition[]> {
  const pos = positions.find(p => p.id === positionId)!;
  if (pos.roleId) ctx.require('papeis', 'aprovar');
  let next: MemberDoc | null = null;
  if (who?.memberId) {
    next = await ctx.store.get<MemberDoc>(P.member(t, who.memberId));
    if (!next) fail('not-found', 'Sócio não encontrado.');
    if (!['ativo', 'aprovado', 'em_atraso'].includes(next!.status)) fail('failed-precondition', `Só um sócio com cadastro aprovado assume cargo (${pos.title}).`);
    if (pos.roleId && !next!.uid) fail('failed-precondition', `${next!.fullName} ainda não entrou no portal com a conta Google, e o cargo ${pos.title} dá acesso ao portal. Mande o link de cadastro ou um convite e tente de novo.`);
  } else if (who?.personName && pos.roleId) {
    fail('failed-precondition', `O cargo ${pos.title} dá acesso ao portal: escolha um sócio cadastrado.`);
  }
  const prev = pos.memberId ? await ctx.store.get<MemberDoc>(P.member(t, pos.memberId)) : null;

  if (pos.roleId && next?.uid) {
    const ms = await ctx.store.get<MembershipDoc>(P.membership(t, next.uid));
    if (!ms) fail('failed-precondition', 'Esta pessoa ainda não tem acesso ao portal desta sociedade.');
    const roleIds = [...new Set([...ms!.roleIds, pos.roleId])].slice(0, 5);
    const { perms, board } = await permsForRoles(ctx, t, roleIds);
    await ctx.store.update(P.membership(t, next.uid), { roleIds, perms, board, active: true, updatedAt: ctx.nowIso });
    await notify(ctx, next.uid, `Você assumiu o cargo de ${pos.title}`, 'Os acessos do cargo já estão liberados no portal.', 'inicio');
  }
  // Quem sai perde o acesso do cargo (se não estiver também em outro cargo com o mesmo papel)
  if (pos.roleId && prev?.uid && !keepOldAccess) {
    const sameRoleElsewhere = positions.some(p => p.id !== pos.id && p.roleId === pos.roleId && p.memberId === prev.id);
    if (!sameRoleElsewhere) await dropRole(ctx, t, prev.uid, pos.roleId);
    await notify(ctx, prev.uid, `Mandato de ${pos.title} encerrado`, `Obrigado pela dedicação. O cargo passou para ${next?.displayName || who?.personName || 'vago'}.`, 'inicio');
  }
  if (pos.memberId || pos.personName) {
    await ctx.store.add(P.mandates(t), {
      positionId: pos.id,
      title: pos.title,
      memberId: pos.memberId || null,
      personName: prev?.fullName || pos.personName || '',
      from: pos.since || null,
      to: since,
      ...(note ? { note } : {}),
      at: ctx.nowIso,
    });
  }
  await ctx.audit('orgchart.handover', pos.id, { role: pos.roleId || '', from: prev?.id || '', to: next?.id || '' });
  const name = next?.fullName || who?.personName || '';
  return positions.map(p => (p.id === pos.id ? { ...p, memberId: next?.id, personName: name, since: name ? since : undefined } : p));
}

type BoardRow = TermDoc['board'][number];
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Organograma mudou: a gestão atual acompanha nos cargos que ela já tem (nome do cargo e quem ocupa). */
export async function syncTermFromChart(ctx: OpContext, t: string, positions: OrgPosition[]) {
  if (ctx.tenant!.modules?.mandatos === false) return;
  const [cur] = await ctx.store.query<TermDoc>(P.terms(t), { where: [['current', '==', true]], limit: 1 });
  if (!cur) return;
  const byId = new Map(positions.map(p => [p.id, p]));
  let changed = false;
  const board = cur.data.board
    .filter(b => !b.positionId || byId.has(b.positionId) || ((changed = true), false))
    .map(b => {
      const p = b.positionId ? byId.get(b.positionId) : undefined;
      if (!p) return b;
      const row: BoardRow = { positionId: p.id, ...(p.memberId ? { memberId: p.memberId } : {}), name: p.personName || '', roleId: p.roleId || p.id, roleName: p.title.slice(0, 60) };
      if (row.name !== b.name || row.memberId !== b.memberId || row.roleName !== b.roleName || row.roleId !== b.roleId) changed = true;
      return row;
    });
  if (changed) await ctx.store.update(cur.path, { board, updatedAt: ctx.nowIso });
}

/**
 * Gestão atual salva: os cargos dela vão para o organograma (cargo novo é criado, nome trocado é
 * renomeado, pessoa trocada passa o cargo com as mesmas travas da passagem). Cargos do organograma
 * que não estão na gestão (majestades, por exemplo) ficam como estão. Devolve as linhas com o cargo ligado.
 */
export async function applyTermToChart(ctx: OpContext, t: string, board: BoardRow[], since: string): Promise<BoardRow[]> {
  if (ctx.tenant!.modules?.organograma === false) return board;
  const chart = await ctx.store.get<OrgChartDoc>(P.orgchart(t));
  let positions: OrgPosition[] = chart?.positions ? [...chart.positions] : [];
  let structural = false;
  const seen = new Set<string>();
  const rows: BoardRow[] = [];
  for (const b of board) {
    let p = b.positionId ? positions.find(x => x.id === b.positionId) : undefined;
    // Gestão antiga sem o cargo ligado: casa pelo nome do cargo (ou pelo acesso) antes de criar outro igual
    p ||= positions.find(x => !seen.has(x.id) && !board.some(o => o.positionId === x.id) && (norm(x.title) === norm(b.roleName) || (!!x.roleId && x.roleId === b.roleId)));
    if (!p) {
      // Cargo novo (ou que não existe mais): entra no organograma no grupo da diretoria
      p = { id: `cargo_${ctx.store.newId().slice(0, 12)}`, title: b.roleName, group: ctx.tenant!.labels?.board || 'Diretoria', order: positions.reduce((m, x) => Math.max(m, x.order), 0) + 1, highlight: false };
      positions.push(p);
      structural = true;
    } else if (b.roleName && b.roleName !== p.title) {
      positions = positions.map(x => (x.id === p!.id ? { ...x, title: b.roleName } : x));
      structural = true;
    }
    if (seen.has(p.id)) fail('invalid-argument', `O cargo "${b.roleName}" aparece duas vezes na gestão.`);
    seen.add(p.id);
    rows.push({ ...b, positionId: p.id, roleId: p.roleId || p.id });
  }
  if (structural) ctx.require('organograma', 'editar');
  for (const r of rows) {
    const p = positions.find(x => x.id === r.positionId)!;
    const want = r.memberId ? { memberId: r.memberId } : r.name.trim() ? { personName: r.name.trim() } : null;
    const same = want?.memberId ? want.memberId === p.memberId : !p.memberId && (want?.personName || '') === (p.personName || '');
    if (same) continue;
    ctx.require('organograma', 'editar');
    positions = await occupy(ctx, t, positions, p.id, want, since);
    structural = true;
  }
  if (structural) {
    const doc: OrgChartDoc = chart
      ? { ...chart, positions, updatedAt: ctx.nowIso }
      : { style: societyType(ctx.tenant!.societyType).orgStyle, title: ctx.tenant!.labels?.board || 'Diretoria', positions, showOnPublicPage: false, updatedAt: ctx.nowIso };
    await ctx.store.set(P.orgchart(t), { ...doc, positions: clean(doc.positions) } as unknown as Record<string, unknown>);
  }
  // Nome exibido na gestão é o do cadastro (o organograma guarda o nome completo do sócio)
  return rows.map(r => {
    const p = positions.find(x => x.id === r.positionId)!;
    return { ...r, name: p.personName || r.name };
  });
}

export const orgchartOps = [saveOrgChart, orgChartPreset, handover];
