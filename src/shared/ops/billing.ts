/**
 * Plano e cobrança do SaaS. A diretoria vê o plano, os sócios cobrados e o valor, e pede a troca;
 * a plataforma decide (ou o Stripe, quando ligado, confirma o pagamento e o plano muda sozinho).
 */
import { z } from 'zod';
import { defineOp, fail, registerJobs, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { MODULES, type ModuleId } from '../modules.ts';
import { annualCents, billedQuantity, monthlyCents } from '../billing.ts';
import type { BillingDoc, DashboardStats, FederationDoc, MemberStatus, PlanDoc, PlanRequestDoc, TenantDoc } from '../types.ts';
import { boardUids, notify, tid } from './helpers.ts';

const ACTIVE: MemberStatus[] = ['aprovado', 'ativo', 'em_atraso'];

export async function holdersOf(ctx: OpContext, tenantId: string): Promise<{ active: number; dependents: number; holders: number }> {
  const active = await ctx.store.count(P.members(tenantId), { where: [['status', 'in', ACTIVE]] });
  const dependents = await ctx.store.count(P.members(tenantId), { where: [['status', 'in', ACTIVE], ['dependentOf', '>', '']] });
  return { active, dependents, holders: active - dependents };
}

/** Troca o plano e liga só os módulos que o plano inclui (os básicos ficam sempre ligados) */
export async function applyPlan(ctx: OpContext, tenantId: string, planId: string): Promise<void> {
  const plan = await ctx.store.get<PlanDoc>(P.plan(planId));
  if (!plan) fail('invalid-argument', 'Plano inexistente.');
  const patch: Record<string, unknown> = { planId, updatedAt: ctx.nowIso };
  for (const m of MODULES) patch[`modules.${m.id}`] = m.core || plan!.modules.includes(m.id as ModuleId);
  await ctx.store.update(P.tenant(tenantId), patch);
}

function publicPlan(p: PlanDoc & { id: string }) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    highlights: p.highlights || [],
    maxMembers: p.maxMembers,
    pricePerMemberCents: p.pricePerMemberCents || 0,
    minMonthlyCents: p.minMonthlyCents || 0,
    online: !!(p.stripePriceMonthly || p.stripePriceAnnual),
  };
}

// ---------- Diretoria da sociedade ----------

export const billingMine = defineOp({
  name: 'billing.mine',
  input: zTenant,
  auth: 'user',
  tenant: { perm: ['sociedade', 'ver'] },
  async run(ctx, input) {
    const t = ctx.tenant!;
    const plan = await ctx.store.get<PlanDoc>(P.plan(t.planId));
    const counts = await holdersOf(ctx, input.tenantId);
    const plans = (await ctx.store.query<PlanDoc>(P.plans(), { limit: 30 })).filter(p => p.data.active).map(p => publicPlan({ ...p.data, id: p.id }));
    const pending = await ctx.store.query<PlanRequestDoc>(P.planRequests(), { where: [['tenantId', '==', input.tenantId], ['status', '==', 'pendente']], limit: 1 });
    const billing = await ctx.store.get<BillingDoc>(P.billing(input.tenantId));
    const fed = t.federationId ? await ctx.store.get<FederationDoc>(P.federation(t.federationId)) : null;
    const monthly = plan ? monthlyCents(plan, counts.holders) : 0;
    return {
      plan: plan ? publicPlan({ ...plan, id: t.planId }) : null,
      counts,
      monthlyCents: monthly,
      annualCents: annualCents(monthly),
      overLimit: !!plan && counts.active > plan.maxMembers,
      plans,
      pendingRequest: pending[0] ? { ...pending[0].data, id: pending[0].id } : null,
      billing: billing ? { provider: billing.provider, status: billing.status, period: billing.period, currentPeriodEnd: billing.currentPeriodEnd || null, hasPortal: !!billing.customerId } : null,
      federation: fed ? { name: fed.name, pricePerMemberCents: fed.pricePerMemberCents } : null,
      onlinePayment: !!ctx.billing,
    };
  },
});

export const billingRequestChange = defineOp({
  name: 'billing.requestChange',
  input: zTenant.extend({ planId: zId, period: z.enum(['mensal', 'anual']), note: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  idempotent: true,
  async run(ctx, input) {
    const t = ctx.tenant!;
    const plan = await ctx.store.get<PlanDoc>(P.plan(input.planId));
    if (!plan?.active) fail('invalid-argument', 'Plano indisponível.');
    if (input.planId === t.planId) fail('failed-precondition', 'A sociedade já está neste plano.');
    const counts = await holdersOf(ctx, t.id);
    if (counts.active > plan!.maxMembers) fail('failed-precondition', `O plano ${plan!.name} vai até ${plan!.maxMembers} sócios e a sociedade tem ${counts.active}.`);
    const open = await ctx.store.query<PlanRequestDoc>(P.planRequests(), { where: [['tenantId', '==', t.id], ['status', '==', 'pendente']], limit: 1 });
    if (open.length) fail('failed-precondition', 'Já existe um pedido de troca esperando a plataforma.');
    const id = ctx.store.newId();
    const doc: PlanRequestDoc = {
      id,
      tenantId: t.id,
      tenantName: t.name,
      fromPlanId: t.planId,
      toPlanId: input.planId,
      period: input.period,
      ...(input.note ? { note: input.note } : {}),
      status: 'pendente',
      byUid: ctx.actor!.uid,
      at: ctx.nowIso,
    };
    await ctx.store.set(P.planRequest(id), doc as unknown as Record<string, unknown>);
    await ctx.audit('billing.change_requested', input.planId, { period: input.period });
    return { id };
  },
});

export const billingCancelRequest = defineOp({
  name: 'billing.cancelRequest',
  input: zTenant.extend({ requestId: zId }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  async run(ctx, input) {
    const r = await ctx.store.get<PlanRequestDoc>(P.planRequest(input.requestId));
    if (!r || r.tenantId !== input.tenantId || r.status !== 'pendente') fail('not-found', 'Pedido não encontrado.');
    await ctx.store.delete(P.planRequest(input.requestId));
    await ctx.audit('billing.change_cancelled', input.requestId);
    return { ok: true };
  },
});

/** Pagamento online (Stripe): abre a página de pagamento do plano escolhido */
export const billingCheckout = defineOp({
  name: 'billing.checkout',
  input: zTenant.extend({ planId: zId, period: z.enum(['mensal', 'anual']) }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  rateLimit: { per: 'uid', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.billing) fail('failed-precondition', 'O pagamento online ainda não está ligado. Use "Pedir troca de plano".');
    const t = ctx.tenant!;
    if (t.federationId) fail('failed-precondition', 'Esta sociedade é cobrada pela federação.');
    const plan = await ctx.store.get<PlanDoc>(P.plan(input.planId));
    const priceId = input.period === 'anual' ? plan?.stripePriceAnnual : plan?.stripePriceMonthly;
    if (!plan?.active || !priceId) fail('failed-precondition', 'Este plano ainda não tem pagamento online configurado.');
    const counts = await holdersOf(ctx, t.id);
    if (counts.active > plan!.maxMembers) fail('failed-precondition', `O plano ${plan!.name} vai até ${plan!.maxMembers} sócios.`);
    const cur = await ctx.store.get<BillingDoc>(P.billing(t.id));
    const back = `${ctx.appUrl}/${t.slug}/plano`;
    const r = await ctx.billing!.createCheckout({
      tenantId: t.id,
      tenantName: t.name,
      planId: input.planId,
      period: input.period,
      priceId: priceId!,
      quantity: billedQuantity(plan!, counts.holders),
      customerEmail: ctx.actor!.email,
      successUrl: `${back}?pagamento=ok`,
      cancelUrl: back,
      ...(cur?.customerId ? { customerId: cur.customerId } : {}),
    });
    await ctx.audit('billing.checkout_opened', input.planId, { period: input.period });
    return r;
  },
});

export const billingPortal = defineOp({
  name: 'billing.portal',
  input: zTenant,
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  async run(ctx, input) {
    const cur = await ctx.store.get<BillingDoc>(P.billing(input.tenantId));
    if (!ctx.billing || !cur?.customerId) fail('failed-precondition', 'Não há assinatura online para esta sociedade.');
    return ctx.billing!.portal({ customerId: cur!.customerId!, returnUrl: `${ctx.appUrl}/${ctx.tenant!.slug}/plano` });
  },
});

/** Aviso do Stripe já conferido pela assinatura do servidor (chamado só pelo webhook) */
export const billingStripeEvent = defineOp({
  name: 'billing.stripeEvent',
  input: z.object({
    kind: z.enum(['checkout_done', 'subscription_updated', 'subscription_deleted', 'payment_failed']),
    tenantId: zId,
    planId: zId.optional(),
    period: z.enum(['mensal', 'anual']).optional(),
    customerId: z.string().max(100).optional(),
    subscriptionId: z.string().max(100).optional(),
    quantity: z.number().int().min(0).optional(),
    currentPeriodEnd: z.string().max(40).optional(),
  }),
  auth: 'public',
  internal: true,
  async run(ctx, input) {
    const t = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
    if (!t) return { ok: false };
    const cur = await ctx.store.get<BillingDoc>(P.billing(input.tenantId));
    const status: BillingDoc['status'] =
      input.kind === 'subscription_deleted' ? 'cancelada' : input.kind === 'payment_failed' ? 'atrasada' : 'ativa';
    const doc: BillingDoc = {
      provider: 'stripe',
      status,
      period: input.period || cur?.period || 'mensal',
      ...(input.customerId || cur?.customerId ? { customerId: input.customerId || cur?.customerId } : {}),
      ...(input.subscriptionId || cur?.subscriptionId ? { subscriptionId: input.subscriptionId || cur?.subscriptionId } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : cur?.quantity !== undefined ? { quantity: cur.quantity } : {}),
      ...(input.currentPeriodEnd ? { currentPeriodEnd: input.currentPeriodEnd } : {}),
      updatedAt: ctx.nowIso,
    };
    await ctx.store.set(P.billing(input.tenantId), doc as unknown as Record<string, unknown>);
    if (input.kind === 'checkout_done' && input.planId && input.planId !== t.planId) await applyPlan(ctx, input.tenantId, input.planId);
    const tctx = { ...ctx, tenantId: t.id, tenant: t };
    const title = status === 'ativa' ? 'Assinatura confirmada' : status === 'atrasada' ? 'Pagamento da assinatura não passou' : 'Assinatura cancelada';
    for (const uid of await boardUids(tctx)) await notify(tctx, uid, title, `Plano e cobrança da ${t.name}.`, 'plano');
    return { ok: true };
  },
});

// ---------- Plataforma ----------

/** Visão de cobrança de todas as sociedades: plano, situação, sócios cobrados e valor */
export const billingOverview = defineOp({
  name: 'billing.overview',
  input: z.object({}),
  auth: 'master',
  async run(ctx) {
    const plans = new Map((await ctx.store.query<PlanDoc>(P.plans(), { limit: 50 })).map(p => [p.id, p.data]));
    const feds = new Map((await ctx.store.query<FederationDoc>(P.federations(), { limit: 200 })).map(f => [f.id, f.data]));
    const tenants = await ctx.store.query<TenantDoc>(P.tenants(), { orderBy: [['createdAt', 'desc']], limit: 500 });
    const pending = await ctx.store.query<PlanRequestDoc>(P.planRequests(), { where: [['status', '==', 'pendente']], limit: 200 });
    const rows = [];
    for (const t of tenants) {
      const counts = await holdersOf(ctx, t.id);
      const stats = await ctx.store.get<DashboardStats>(P.stats(t.id));
      const plan = plans.get(t.data.planId);
      const fed = t.data.federationId ? feds.get(t.data.federationId) : undefined;
      const billing = await ctx.store.get<BillingDoc>(P.billing(t.id));
      rows.push({
        id: t.id,
        name: t.data.name,
        slug: t.data.slug,
        status: t.data.status,
        planId: t.data.planId,
        planName: plan?.name || t.data.planId,
        maxMembers: plan?.maxMembers || 0,
        createdAt: t.data.createdAt,
        membersTotal: stats?.members?.total || 0,
        pending: stats?.members?.pendente || 0,
        ...counts,
        federation: fed ? fed.name : '',
        // Filial de federação: a federação paga o valor dela por titular
        monthlyCents: fed ? counts.holders * fed.pricePerMemberCents : plan ? monthlyCents(plan, counts.holders) : 0,
        billingStatus: billing?.status || 'sem_assinatura',
        billingProvider: billing?.provider || 'manual',
        pendingRequest: pending.find(p => p.data.tenantId === t.id)?.id || null,
      });
    }
    return {
      rows,
      totals: {
        tenants: rows.length,
        active: rows.filter(r => r.status === 'ativa').length,
        holders: rows.reduce((n, r) => n + r.holders, 0),
        monthlyCents: rows.filter(r => r.status === 'ativa').reduce((n, r) => n + r.monthlyCents, 0),
      },
      requests: pending.map(p => ({ ...p.data, id: p.id })),
    };
  },
});

export const billingDecideRequest = defineOp({
  name: 'billing.decideRequest',
  input: z.object({ requestId: zId, approve: z.boolean(), reason: zText(300).optional() }),
  auth: 'master',
  async run(ctx, input) {
    const r = await ctx.store.get<PlanRequestDoc>(P.planRequest(input.requestId));
    if (!r || r.status !== 'pendente') fail('not-found', 'Pedido não encontrado ou já decidido.');
    if (!input.approve && !input.reason?.trim()) fail('invalid-argument', 'Explique o motivo para a sociedade.');
    if (input.approve) await applyPlan(ctx, r!.tenantId, r!.toPlanId);
    await ctx.store.update(P.planRequest(input.requestId), { status: input.approve ? 'aprovado' : 'recusado', decidedBy: ctx.actor!.uid, decidedAt: ctx.nowIso, ...(input.reason ? { reason: input.reason } : {}) });
    const t = await ctx.store.get<TenantDoc>(P.tenant(r!.tenantId));
    if (t) {
      const tctx = { ...ctx, tenantId: t.id, tenant: t };
      const plan = await ctx.store.get<PlanDoc>(P.plan(r!.toPlanId));
      for (const uid of await boardUids(tctx)) {
        await notify(tctx, uid, input.approve ? 'Plano alterado' : 'Troca de plano não aprovada', input.approve ? `A sociedade agora está no plano ${plan?.name || r!.toPlanId}.` : input.reason!, 'plano');
      }
    }
    await ctx.audit(input.approve ? 'billing.change_approved' : 'billing.change_rejected', r!.tenantId, { to: r!.toPlanId });
    return { ok: true };
  },
});

export const billingOps = [billingMine, billingRequestChange, billingCancelRequest, billingCheckout, billingPortal, billingStripeEvent, billingOverview, billingDecideRequest];

// Uma vez por dia: a quantidade cobrada no Stripe acompanha o número de sócios titulares
registerJobs([
  {
    name: 'billing.syncQuantity',
    async run(ctx) {
      if (!ctx.billing) return;
      const t = tid(ctx);
      const b = await ctx.store.get<BillingDoc>(P.billing(t));
      if (b?.provider !== 'stripe' || b.status !== 'ativa' || !b.subscriptionId) return;
      const plan = await ctx.store.get<PlanDoc>(P.plan(ctx.tenant!.planId));
      if (!plan) return;
      const q = billedQuantity(plan, (await holdersOf(ctx, t)).holders);
      if (q === b.quantity) return;
      await ctx.billing.updateQuantity(b.subscriptionId, q);
      await ctx.store.update(P.billing(t), { quantity: q, updatedAt: ctx.nowIso });
    },
  },
]);
