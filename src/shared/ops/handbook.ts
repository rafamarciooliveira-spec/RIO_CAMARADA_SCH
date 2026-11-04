/**
 * Manual do sócio: direitos, deveres e regras da casa, escrito em seções ou enviado em PDF.
 * Cada publicação é uma versão nova; os sócios são avisados e marcam "Li e estou ciente".
 * A diretoria acompanha quem já leu a versão atual. Vale em todos os planos.
 */
import { z } from 'zod';
import { defineOp, fail, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import type { HandbookDoc, MemberDoc } from '../types.ts';
import { notify, tid } from './helpers.ts';

const ACTIVE = ['aprovado', 'ativo', 'em_atraso'];

function canEdit(ctx: OpContext): boolean {
  return ctx.can('sociedade', 'editar') || ctx.can('documentos', 'editar');
}

export const handbookSave = defineOp({
  name: 'handbook.save',
  input: zTenant.extend({
    title: zText(120).min(3),
    intro: zText(2000).optional(),
    sections: z.array(z.object({ id: zId, title: zText(120).min(2), body: zText(20000) })).max(40),
    pdfPath: z.string().max(300).regex(/^tenants\/[A-Za-z0-9_-]+\/handbook\/[A-Za-z0-9._-]+\.pdf$/).optional().or(z.literal('')),
    publish: z.boolean().default(false),
    changeNote: zText(300).optional(),
    requireAck: z.boolean().default(true),
  }),
  auth: 'user',
  tenant: { perm: null },
  idempotent: true,
  async run(ctx, input) {
    if (!canEdit(ctx)) fail('permission-denied', 'Só quem edita os documentos da sociedade altera o manual.');
    const t = tid(ctx);
    if (input.pdfPath && !input.pdfPath.startsWith(`tenants/${t}/`)) fail('invalid-argument', 'Arquivo inválido.');
    if (!input.sections.length && !input.pdfPath) fail('invalid-argument', 'Escreva ao menos uma seção ou envie o PDF.');
    const cur = await ctx.store.get<HandbookDoc>(P.handbook(t));
    const version = input.publish ? (cur?.version || 0) + 1 : cur?.version || 0;
    const doc: HandbookDoc = {
      title: input.title,
      ...(input.intro ? { intro: input.intro } : {}),
      sections: input.sections,
      ...(input.pdfPath ? { pdfPath: input.pdfPath } : {}),
      requireAck: input.requireAck,
      version,
      ...(input.publish ? { publishedAt: ctx.nowIso } : cur?.publishedAt ? { publishedAt: cur.publishedAt } : {}),
      versions: input.publish ? [...(cur?.versions || []), { version, at: ctx.nowIso, ...(input.changeNote ? { note: input.changeNote } : {}) }].slice(-30) : cur?.versions || [],
      updatedAt: ctx.nowIso,
      updatedBy: ctx.actor!.uid,
    };
    await ctx.store.set(P.handbook(t), doc as unknown as Record<string, unknown>);
    let notified = 0;
    if (input.publish) {
      const rows = await ctx.store.query<MemberDoc>(P.members(t), { where: [['status', 'in', ACTIVE]], limit: 3000 });
      const uids = [...new Set(rows.map(r => r.data.uid).filter(Boolean) as string[])];
      const body = version === 1 ? 'Leia os direitos, deveres e regras da sociedade.' : input.changeNote || 'O manual foi atualizado. Veja o que mudou.';
      for (const uid of uids) await notify(ctx, uid, version === 1 ? 'Manual do sócio publicado' : 'Manual do sócio atualizado', body, 'manual', { push: true });
      notified = uids.length;
    }
    await ctx.audit(input.publish ? 'handbook.published' : 'handbook.draft_saved', undefined, { version, notified });
    return { version, notified };
  },
});

export const handbookAck = defineOp({
  name: 'handbook.ack',
  input: zTenant.extend({ version: z.number().int().min(1) }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const cur = await ctx.store.get<HandbookDoc>(P.handbook(t));
    if (!cur?.version) fail('not-found', 'O manual ainda não foi publicado.');
    if (input.version !== cur!.version) fail('failed-precondition', 'O manual foi atualizado. Abra de novo para ler a versão atual.');
    const me = ctx.membership?.memberId ? await ctx.store.get<MemberDoc>(P.member(t, ctx.membership.memberId)) : null;
    await ctx.store.set(P.handbookAck(t, ctx.actor!.uid), { version: input.version, at: ctx.nowIso, name: me?.fullName || ctx.actor!.displayName || ctx.actor!.email });
    return { ok: true };
  },
});

/** Quem já leu a versão atual (para a diretoria) */
export const handbookAcks = defineOp({
  name: 'handbook.acks',
  input: zTenant,
  auth: 'user',
  tenant: { perm: ['socios', 'ver'] },
  async run(ctx) {
    const t = tid(ctx);
    const cur = await ctx.store.get<HandbookDoc>(P.handbook(t));
    const version = cur?.version || 0;
    const acks = await ctx.store.query<{ version: number; at: string; name: string }>(`${P.handbook(t)}/acks`, { limit: 3000 });
    const rows = await ctx.store.query<MemberDoc>(P.members(t), { where: [['status', 'in', ACTIVE]], limit: 3000 });
    const withAccount = rows.filter(r => r.data.uid && !r.data.dependentOf);
    const readers = acks.filter(a => a.data.version === version);
    const readUids = new Set(readers.map(r => r.id));
    return {
      version,
      total: withAccount.length,
      read: readers.length,
      readers: readers.map(r => ({ name: r.data.name, at: r.data.at })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      pending: withAccount.filter(r => !readUids.has(r.data.uid!)).map(r => r.data.fullName).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  },
});

export const handbookOps = [handbookSave, handbookAck, handbookAcks];
