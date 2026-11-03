/**
 * Organograma configurável: cargos e títulos de cada sociedade (presidente, tesoureiro,
 * rei e rainha do tiro, técnico, capitão...), em estilos de exibição diferentes.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import type { MemberDoc, MembershipDoc, OrgChartDoc } from '../types.ts';
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
});

export const saveOrgChart = defineOp({
  name: 'orgchart.save',
  input: zTenant.extend({
    style: z.enum(['arvore', 'cartoes', 'corte']),
    title: zText(120).min(2),
    positions: z.array(zPosition).max(120),
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
    const stored = new Map(((await ctx.store.get<OrgChartDoc>(P.orgchart(t)))?.positions || []).map(p => [p.id, p]));
    for (const p of input.positions) {
      const old = stored.get(p.id);
      if (p.roleId) ctx.require('papeis', 'aprovar');
      if (p.roleId) await permsForRoles(ctx, t, [p.roleId]);
      if (old?.memberId && (old.roleId || '') !== (p.roleId || '')) fail('failed-precondition', `Para mudar o acesso ligado ao cargo "${p.title}", passe o cargo para vago antes.`);
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
    const doc: OrgChartDoc = { style: input.style, title: input.title, positions, showOnPublicPage: input.showOnPublicPage, updatedAt: ctx.nowIso };
    await ctx.store.set(P.orgchart(t), doc as unknown as Record<string, unknown>);
    await ctx.audit('orgchart.saved', undefined, { positions: positions.length });
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
    if (pos!.roleId) ctx.require('papeis', 'aprovar');
    if (input.memberId && input.memberId === pos!.memberId) fail('failed-precondition', 'Esta pessoa já ocupa o cargo.');
    let next: MemberDoc | null = null;
    if (input.memberId) {
      next = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
      if (!next) fail('not-found', 'Sócio não encontrado.');
      if (!['ativo', 'aprovado', 'em_atraso'].includes(next!.status)) fail('failed-precondition', 'Só um sócio com cadastro aprovado assume cargo.');
      if (pos!.roleId && !next!.uid) fail('failed-precondition', 'Esta pessoa ainda não entrou no portal com a conta Google. Mande o link de cadastro ou um convite e tente de novo.');
    }
    const prev = pos!.memberId ? await ctx.store.get<MemberDoc>(P.member(t, pos!.memberId)) : null;

    // 1. Quem assume ganha o acesso do cargo antes de quem sai perder (a trava do último admin enxerga os dois)
    if (pos!.roleId && next?.uid) {
      const ms = await ctx.store.get<MembershipDoc>(P.membership(t, next.uid));
      if (!ms) fail('failed-precondition', 'Esta pessoa ainda não tem acesso ao portal desta sociedade.');
      const roleIds = [...new Set([...ms!.roleIds, pos!.roleId])].slice(0, 5);
      const { perms, board } = await permsForRoles(ctx, t, roleIds);
      await ctx.store.update(P.membership(t, next.uid), { roleIds, perms, board, active: true, updatedAt: ctx.nowIso });
      await notify(ctx, next.uid, `Você assumiu o cargo de ${pos!.title}`, 'Os acessos do cargo já estão liberados no portal.', 'inicio');
    }
    // 2. Quem sai perde o acesso do cargo (se não estiver também em outro cargo com o mesmo papel)
    if (pos!.roleId && prev?.uid && !input.keepOldAccess) {
      const sameRoleElsewhere = chart!.positions.some(p => p.id !== pos!.id && p.roleId === pos!.roleId && p.memberId === prev.id);
      if (!sameRoleElsewhere) await dropRole(ctx, t, prev.uid, pos!.roleId);
      await notify(ctx, prev.uid, `Mandato de ${pos!.title} encerrado`, `Obrigado pela dedicação. O cargo passou para ${next?.displayName || 'vago'}.`, 'inicio');
    }
    // 3. Galeria de mandatos
    if (pos!.memberId || pos!.personName) {
      await ctx.store.add(P.mandates(t), {
        positionId: pos!.id,
        title: pos!.title,
        memberId: pos!.memberId || null,
        personName: prev?.fullName || pos!.personName || '',
        from: pos!.since || null,
        to: input.since,
        ...(input.note ? { note: input.note } : {}),
        at: ctx.nowIso,
      });
    }
    const positions = chart!.positions.map(p =>
      p.id === pos!.id ? { ...p, memberId: next?.id, personName: next?.fullName || '', since: next ? input.since : undefined } : p
    );
    await ctx.store.update(P.orgchart(t), { positions: positions.map(p => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))), updatedAt: ctx.nowIso });
    await ctx.audit('orgchart.handover', pos!.id, { role: pos!.roleId || '', from: prev?.id || '', to: next?.id || '' });
    return { ok: true };
  },
});

export const orgchartOps = [saveOrgChart, orgChartPreset, handover];
