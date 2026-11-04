/**
 * Enquetes rápidas, no lugar das do grupo de WhatsApp: a diretoria cria, todos recebem a notificação,
 * cada conta responde uma vez (pode mudar, se a enquete deixar) e, quando a enquete é de lista de
 * presença, todos veem quem escolheu cada opção. Sem a lista, só a contagem aparece.
 */
import { z } from 'zod';
import { defineOp, fail, zId, zTenant, zText } from '../core/ops.ts';
import { P } from '../paths.ts';
import type { MemberDoc, SurveyDoc } from '../types.ts';
import { notify, tid } from './helpers.ts';

const ACTIVE = ['aprovado', 'ativo', 'em_atraso'];

export const surveysCreate = defineOp({
  name: 'surveys.create',
  input: zTenant.extend({
    question: zText(300).min(3),
    options: z.array(zText(120).min(1)).min(2).max(10),
    showNames: z.boolean().default(false),
    allowChange: z.boolean().default(true),
    closesAt: z.string().datetime().optional(),
    notify: z.boolean().default(true),
  }),
  auth: 'user',
  tenant: { perm: ['engajamento', 'criar'] },
  module: 'engajamento',
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const id = ctx.store.newId();
    const doc: SurveyDoc & Record<string, unknown> = {
      id,
      title: input.question.slice(0, 150),
      question: input.question,
      options: input.options,
      counts: input.options.map(() => 0),
      open: true,
      showNames: input.showNames,
      allowChange: input.allowChange,
      ...(input.closesAt ? { closesAt: input.closesAt } : {}),
      createdBy: ctx.actor!.uid,
      createdAt: ctx.nowIso,
    };
    await ctx.store.set(`${P.surveys(t)}/${id}`, doc);
    let sent = 0;
    if (input.notify) {
      const rows = await ctx.store.query<MemberDoc>(P.members(t), { where: [['status', 'in', ACTIVE]], limit: 3000 });
      const uids = [...new Set(rows.map(r => r.data.uid).filter(Boolean) as string[])];
      for (const uid of uids) await notify(ctx, uid, 'Nova enquete', input.question, 'enquetes', { push: true });
      sent = uids.length;
    }
    await ctx.audit('surveys.created', id, { options: input.options.length, notified: sent });
    return { id, notified: sent };
  },
});

export const surveysClose = defineOp({
  name: 'surveys.close',
  input: zTenant.extend({ surveyId: zId, open: z.boolean().default(false) }),
  auth: 'user',
  tenant: { perm: ['engajamento', 'editar'] },
  module: 'engajamento',
  async run(ctx, input) {
    const path = `${P.surveys(tid(ctx))}/${input.surveyId}`;
    if (!(await ctx.store.get(path))) fail('not-found', 'Enquete não encontrada.');
    await ctx.store.update(path, { open: input.open });
    await ctx.audit(input.open ? 'surveys.reopened' : 'surveys.closed', input.surveyId);
    return { ok: true };
  },
});

/** Quem escolheu cada opção (só nas enquetes de lista de presença) */
export const surveysResponses = defineOp({
  name: 'surveys.responses',
  input: zTenant.extend({ surveyId: zId }),
  auth: 'user',
  tenant: { perm: null },
  module: 'engajamento',
  async run(ctx, input) {
    const t = tid(ctx);
    const s = await ctx.store.get<SurveyDoc & { showNames?: boolean }>(`${P.surveys(t)}/${input.surveyId}`);
    if (!s) fail('not-found', 'Enquete não encontrada.');
    if (!s!.showNames) fail('permission-denied', 'Esta enquete não mostra quem respondeu.');
    const voters = await ctx.store.query<{ optionIndex?: number; name?: string }>(`${P.surveys(t)}/${input.surveyId}/voters`, { limit: 3000 });
    const byOption: string[][] = s!.options.map(() => []);
    for (const v of voters) if (v.data.optionIndex !== undefined && v.data.name) byOption[v.data.optionIndex]?.push(v.data.name);
    return { byOption: byOption.map(l => l.sort((a, b) => a.localeCompare(b, 'pt-BR'))) };
  },
});

export const surveyOps = [surveysCreate, surveysClose, surveysResponses];
