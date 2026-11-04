/** Operações do painel master (plataforma) e criação de sociedades. */
import { z } from 'zod';
import { defineOp, fail, zId, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { normalizeSlug, slugProblem, SLUG_PROBLEM_TEXT } from '../slug.ts';
import { DEFAULT_ROLES, MODULE_IDS, type ModuleId } from '../modules.ts';
import { DEFAULT_LABELS, type DashboardStats, type MembershipDoc, type PlanDoc, type SlugDoc, type TenantDoc, type TenantSettings } from '../types.ts';
import { EMAIL_TEMPLATES } from '../templates.ts';
import { emptyStats } from './helpers.ts';
import { createInviteRecord } from './access.ts';
import { DEFAULT_TZ } from '../dates.ts';
import { BR_STATES, SOCIETY_TYPES, societyType } from '../societyTypes.ts';
import type { OrgChartDoc } from '../types.ts';

export function defaultSettings(nowIso: string): TenantSettings {
  return {
    categories: [
      { id: 'efetivo', name: 'Sócio efetivo', feeCents: 3000, period: 'mensal', allowsDependents: true },
      { id: 'contribuinte', name: 'Sócio contribuinte', feeCents: 1500, period: 'mensal', allowsDependents: false },
      { id: 'benemerito', name: 'Sócio benemérito', feeCents: 0, period: 'isento', allowsDependents: true },
      { id: 'dependente', name: 'Dependente', feeCents: 0, period: 'isento', allowsDependents: false },
    ],
    customFields: [],
    membershipPrefix: '',
    nextMembershipNumber: 1,
    validityMonths: 12,
    approvalRequired: true,
    gracePeriodDays: 10,
    suspendAfterDays: 60,
    lateFeeBps: 200,
    interestBpsMonth: 100,
    dueDay: 10,
    doubleApprovalAboveCents: 0,
    showPhotoOnValidation: true,
    retentionYears: { financeiro: 5, atas: 99, inativos: 5 },
    emailTemplates: Object.fromEntries(Object.entries(EMAIL_TEMPLATES).map(([k, v]) => [k, { subject: v.subject, body: v.body }])),
    activeCardTemplateId: 'padrao',
    updatedAt: nowIso,
  };
}

export function defaultCardTemplate(name: string, nowIso: string) {
  return {
    id: 'padrao',
    name: 'Modelo padrão',
    associationName: name,
    associationSubtitle: '',
    logoUrl: 'shield',
    logoSize: 76,
    logoPosition: 'center',
    logoBgTransparent: true,
    infoAlignment: 'center',
    nameFontSize: 'lg',
    detailsFontSize: 'xs',
    primaryColor: '#1f3b2d',
    secondaryColor: '#0f1f17',
    accentColor: '#d4a64a',
    textColor: '#ffffff',
    orientation: 'vertical',
    backgroundPattern: 'guilloche',
    showQrCode: true,
    showPhoto: true,
    showCpf: false,
    showBirthDate: false,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [],
    signatureLabel: 'Diretoria',
    isDefault: true,
    updatedAt: nowIso,
  };
}

const zSlugInput = z.object({ slug: z.string().max(80) });

export const checkSlug = defineOp({
  name: 'platform.checkSlug',
  input: zSlugInput,
  auth: 'public',
  rateLimit: { per: 'ip', max: 60, windowSec: 60 },
  async run(ctx, input) {
    const slug = normalizeSlug(input.slug);
    const problem = slugProblem(slug);
    if (problem) return { slug, available: false, reason: SLUG_PROBLEM_TEXT[problem] };
    const taken = await ctx.store.get<SlugDoc>(P.slug(slug));
    return { slug, available: !taken, reason: taken ? 'Este endereço já está em uso.' : '' };
  },
});

/** Cria sociedade completa: slug reservado por transação, papéis padrão, configurações, convites */
export async function createTenantCore(
  ctx: OpContext,
  input: { name: string; slug: string; planId: string; timezone?: string; city?: string; state?: string; societyType?: string; adminEmails: string[] }
): Promise<{ tenantId: string; slug: string; invites: { email: string; link: string }[] }> {
  const slug = normalizeSlug(input.slug);
  const problem = slugProblem(slug);
  if (problem) fail('invalid-argument', SLUG_PROBLEM_TEXT[problem]);
  const plan = await ctx.store.get<PlanDoc>(P.plan(input.planId));
  if (!plan) fail('invalid-argument', 'Plano inexistente.');

  const tenantId = ctx.store.newId();
  const preset = societyType(input.societyType);
  const modules: Partial<Record<ModuleId, boolean>> = {};
  for (const m of MODULE_IDS) modules[m] = plan!.modules.includes(m);

  const tenant: TenantDoc = {
    id: tenantId,
    name: input.name.trim(),
    slug,
    status: 'ativa',
    planId: input.planId,
    modules,
    branding: {
      logoUrl: 'shield',
      primaryColor: '#1f3b2d',
      secondaryColor: '#0f1f17',
      accentColor: '#d4a64a',
      textColor: '#ffffff',
      fontFamily: 'Inter',
      theme: 'escuro',
    },
    labels: { ...DEFAULT_LABELS, member: preset.memberLabel, members: preset.memberLabel === 'Sócio' ? 'Sócios' : `${preset.memberLabel.replace(/\(a\)$/, '')}s` },
    societyType: preset.id,
    region: { city: input.city || '', state: input.state || '' },
    publicPage: { enabled: false, about: '', history: '', city: input.city || '', socials: {} },
    loginMethods: { google: true, emailLink: true },
    timezone: input.timezone || DEFAULT_TZ,
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  };

  await ctx.store.runTransaction(async tx => {
    const existing = await tx.get(P.slug(slug));
    if (existing) fail('already-exists', 'Este endereço já está em uso.');
    tx.create(P.slug(slug), { tenantId, reservedAt: ctx.nowIso });
    tx.set(P.tenant(tenantId), tenant as unknown as Record<string, unknown>);
  });

  await ctx.store.set(P.settings(tenantId), defaultSettings(ctx.nowIso) as unknown as Record<string, unknown>);
  await ctx.store.set(P.counters(tenantId), { ledgerNumber: 0, receiptNumber: 0, minuteNumber: 0, membershipNumber: 0 });
  await ctx.store.set(P.stats(tenantId), emptyStats(ctx.nowIso) as unknown as Record<string, unknown>);
  await ctx.store.set(P.cardTemplate(tenantId, 'padrao'), defaultCardTemplate(tenant.name, ctx.nowIso));
  for (const r of DEFAULT_ROLES) {
    await ctx.store.set(P.role(tenantId, r.id), { id: r.id, name: r.name, perms: r.perms, board: r.board, system: true, updatedAt: ctx.nowIso });
  }
  // Plano de contas e conta caixa iniciais
  const chart = [
    ['1.01', 'Mensalidades', 'receita'],
    ['1.02', 'Eventos e ingressos', 'receita'],
    ['1.03', 'Doações e patrocínios', 'receita'],
    ['1.04', 'Editais e incentivos', 'receita'],
    ['1.05', 'Locação de espaços', 'receita'],
    ['2.01', 'Água, luz e telefone', 'despesa'],
    ['2.02', 'Manutenção da sede', 'despesa'],
    ['2.03', 'Eventos', 'despesa'],
    ['2.04', 'Material e figurino', 'despesa'],
    ['2.05', 'Taxas e impostos', 'despesa'],
    ['2.06', 'Serviços de terceiros', 'despesa'],
  ];
  for (const [code, name, kind] of chart) {
    await ctx.store.set(`${P.chart(tenantId)}/c${code.replace('.', '_')}`, { code, name, kind });
  }
  await ctx.store.set(`${P.accounts(tenantId)}/caixa`, { name: 'Caixa', type: 'caixa', openingBalanceCents: 0, balanceCents: 0, active: true });
  await ctx.store.set(`${P.costCenters(tenantId)}/geral`, { name: 'Geral', kind: 'geral', active: true });
  // Predefinições do tipo da sociedade: palavras das notícias e cargos do organograma
  await ctx.store.set(P.newsConfig(tenantId), { enabled: true, keywords: preset.newsKeywords, includeRegion: true, blockedSources: [], updatedAt: ctx.nowIso });
  const org: OrgChartDoc = {
    style: preset.orgStyle,
    title: 'Diretoria',
    positions: preset.positions.map((p, i) => ({ ...p, id: `cargo_${i + 1}` })),
    showOnPublicPage: false,
    updatedAt: ctx.nowIso,
  };
  await ctx.store.set(P.orgchart(tenantId), org as unknown as Record<string, unknown>);

  ctx.tenantId = tenantId;
  ctx.tenant = tenant;
  const invites: { email: string; link: string }[] = [];
  for (const email of input.adminEmails) {
    const inv = await createInviteRecord(ctx, { email, roleIds: ['presidente'], days: 14 });
    invites.push({ email, link: inv.link });
  }
  ctx.tenantId = undefined;
  await ctx.audit('platform.tenant_created', tenantId, { planId: input.planId });
  return { tenantId, slug, invites };
}

export const createTenant = defineOp({
  name: 'platform.createTenant',
  input: z.object({
    name: zText(120).min(3),
    slug: z.string().max(80),
    planId: zId,
    timezone: z.string().max(60).optional(),
    city: zText(80).optional(),
    state: z.enum(BR_STATES as [string, ...string[]]).optional(),
    societyType: z.enum(SOCIETY_TYPES.map(t => t.id) as [string, ...string[]]).optional(),
    adminEmails: z.array(z.string().email().max(120)).min(1).max(5),
  }),
  auth: 'master',
  async run(ctx, input) {
    return createTenantCore(ctx, input);
  },
});

export const updateTenantPlatform = defineOp({
  name: 'platform.updateTenant',
  input: z.object({
    tenantId: zId,
    status: z.enum(['ativa', 'suspensa']).optional(),
    planId: zId.optional(),
    modules: z.record(z.string(), z.boolean()).optional(),
    reason: zText(300).optional(),
  }),
  auth: 'master',
  async run(ctx, input) {
    const t = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
    if (!t) fail('not-found', 'Sociedade não encontrada.');
    const patch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    if (input.status) patch.status = input.status;
    if (input.planId && input.planId !== t!.planId) {
      // Troca de plano liga e desliga os módulos conforme o plano novo
      const { applyPlan } = await import('./billing.ts');
      await applyPlan(ctx, input.tenantId, input.planId);
    }
    if (input.modules) {
      for (const [k, v] of Object.entries(input.modules)) if (MODULE_IDS.includes(k as ModuleId)) patch[`modules.${k}`] = v;
    }
    await ctx.store.update(P.tenant(input.tenantId), patch);
    await ctx.audit('platform.tenant_updated', input.tenantId, { status: input.status || '', planId: input.planId || '' });
    return { ok: true };
  },
});

export const listTenants = defineOp({
  name: 'platform.listTenants',
  input: z.object({}),
  auth: 'master',
  async run(ctx) {
    const rows = await ctx.store.query<TenantDoc>(P.tenants(), { orderBy: [['createdAt', 'desc']], limit: 500 });
    const out = [];
    for (const r of rows) {
      const stats = await ctx.store.get<DashboardStats>(P.stats(r.id));
      // Só agregados: nenhum dado pessoal
      out.push({
        id: r.id,
        name: r.data.name,
        slug: r.data.slug,
        status: r.data.status,
        planId: r.data.planId,
        modules: r.data.modules,
        createdAt: r.data.createdAt,
        membersTotal: stats?.members?.total || 0,
        membersActive: (stats?.members?.ativo || 0) + (stats?.members?.aprovado || 0),
      });
    }
    return out;
  },
});

export const savePlan = defineOp({
  name: 'platform.savePlan',
  input: z.object({
    id: zId,
    name: zText(60).min(2),
    maxMembers: z.number().int().min(1).max(1_000_000),
    modules: z.array(z.string()).max(40),
    priceCents: z.number().int().min(0).default(0),
    pricePerMemberCents: z.number().int().min(0).max(100_000).default(0),
    minMonthlyCents: z.number().int().min(0).max(10_000_000).default(0),
    description: zText(200).optional(),
    highlights: z.array(zText(120)).max(15).default([]),
    stripePriceMonthly: z.string().regex(/^(price_[A-Za-z0-9]+)?$/).max(80).optional(),
    stripePriceAnnual: z.string().regex(/^(price_[A-Za-z0-9]+)?$/).max(80).optional(),
    active: z.boolean(),
  }),
  auth: 'master',
  async run(ctx, input) {
    const modules = input.modules.filter(m => MODULE_IDS.includes(m as ModuleId));
    await ctx.store.set(P.plan(input.id), { ...input, modules });
    await ctx.audit('platform.plan_saved', input.id);
    return { ok: true };
  },
});

export const changeSlug = defineOp({
  name: 'platform.changeSlug',
  input: z.object({ tenantId: zId, newSlug: z.string().max(80) }),
  auth: 'user',
  tenant: { perm: ['sociedade', 'editar'] },
  async run(ctx, input) {
    const slug = normalizeSlug(input.newSlug);
    const problem = slugProblem(slug);
    if (problem) fail('invalid-argument', SLUG_PROBLEM_TEXT[problem]);
    const oldSlug = ctx.tenant!.slug;
    if (slug === oldSlug) return { slug };
    await ctx.store.runTransaction(async tx => {
      if (await tx.get(P.slug(slug))) fail('already-exists', 'Este endereço já está em uso.');
      tx.create(P.slug(slug), { tenantId: input.tenantId, reservedAt: ctx.nowIso });
      // O antigo fica reservado para a mesma sociedade e redireciona
      tx.set(P.slug(oldSlug), { tenantId: input.tenantId, redirectTo: slug, reservedAt: ctx.nowIso });
      tx.update(P.tenant(input.tenantId), { slug, updatedAt: ctx.nowIso });
    });
    await ctx.audit('tenant.slug_changed', input.tenantId, { from: oldSlug, to: slug });
    return { slug };
  },
});

/** Acesso de suporte: com motivo, prazo curto, auditoria e aviso à diretoria */
export const requestSupportAccess = defineOp({
  name: 'platform.supportAccess',
  input: z.object({ tenantId: zId, reason: zText(300).min(10), hours: z.number().int().min(1).max(8) }),
  auth: 'master',
  async run(ctx, input) {
    const actor = ctx.requireActor();
    const t = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
    if (!t) fail('not-found', 'Sociedade não encontrada.');
    const expiresAtMs = ctx.now().getTime() + input.hours * 3600_000;
    const membership: MembershipDoc = {
      uid: actor.uid,
      email: actor.email,
      displayName: 'Suporte da plataforma',
      roleIds: [],
      perms: { sociedade: ['ver'], socios: ['ver'], carteirinha: ['ver'], financeiro: ['ver'], eventos: ['ver'], atas: ['ver'], auditoria: ['ver'] },
      board: true,
      active: true,
      support: { reason: input.reason, masterUid: actor.uid },
      expiresAtMs,
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    await ctx.store.set(P.membership(input.tenantId, actor.uid), membership as unknown as Record<string, unknown>);
    await ctx.store.add(P.supportAccess(), {
      tenantId: input.tenantId,
      masterUid: actor.uid,
      reason: input.reason,
      expiresAt: new Date(expiresAtMs).toISOString(),
      createdAt: ctx.nowIso,
    });
    const board = await ctx.store.query<MembershipDoc>(P.memberships(input.tenantId), { where: [['board', '==', true], ['active', '==', true]] });
    for (const b of board) {
      if (b.id === actor.uid) continue;
      await ctx.store.add(P.notifications(input.tenantId), {
        uid: b.id,
        title: 'Acesso de suporte aberto',
        body: `A equipe da plataforma abriu acesso de leitura por ${input.hours} h. Motivo: ${input.reason}`,
        link: '',
        read: false,
        createdAt: ctx.nowIso,
      });
    }
    await ctx.store.add(P.audit(input.tenantId), { action: 'support.access_opened', actorUid: actor.uid, details: { hours: input.hours }, at: ctx.nowIso });
    await ctx.audit('platform.support_access', input.tenantId, { hours: input.hours });
    return { expiresAt: new Date(expiresAtMs).toISOString() };
  },
});

export const setFlags = defineOp({
  name: 'platform.setFlags',
  input: z.object({ flags: z.record(z.string().max(60), z.boolean()) }),
  auth: 'master',
  async run(ctx, input) {
    await ctx.store.set('platform/config', { flags: input.flags, updatedAt: ctx.nowIso }, { merge: true });
    await ctx.audit('platform.flags_updated');
    return { ok: true };
  },
});

export const platformOps = [checkSlug, createTenant, updateTenantPlatform, listTenants, savePlan, changeSlug, requestSupportAccess, setFlags];
