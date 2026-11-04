/**
 * Federação: várias sociedades como filiais. A diretoria da federação vê só números somados,
 * nunca o cadastro ou o dado pessoal dos sócios; cada filial continua dona dos seus sócios.
 * Transferência de sócio entre filiais (pedida pela origem, aprovada pelo destino), carteirinha
 * aceita em toda a rede, campeonato que soma as etapas das filiais e cobrança somada.
 */
import { z } from 'zod';
import { defineOp, fail, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { overallRanking, type OverallRow } from '../rankings.ts';
import type {
  CompetitionDoc,
  CompetitionResultDoc,
  DashboardStats,
  FedChampionshipDoc,
  FederationDoc,
  FedTransferDoc,
  MemberDoc,
  MemberPiiDoc,
  MembershipDoc,
  MemberStatus,
  TenantDoc,
  TenantSettings,
} from '../types.ts';
import { normalizeSlug, slugProblem } from '../slug.ts';
import { boardUids, notify, tid } from './helpers.ts';
import { approveCore, createMemberCore, setStatusCore } from './members.ts';
import { upsertMembership } from './access.ts';

const ACTIVE: MemberStatus[] = ['aprovado', 'ativo', 'em_atraso'];
const zEmail = z.string().email().max(120);

const lower = (e: string) => e.trim().toLowerCase();

async function getFed(ctx: OpContext, id: string): Promise<FederationDoc> {
  const f = await ctx.store.get<FederationDoc>(P.federation(id));
  if (!f) fail('not-found', 'Federação não encontrada.');
  return f!;
}

/** Diretoria da federação: e-mail verificado na lista, ou administrador geral da plataforma */
async function requireFedAdmin(ctx: OpContext, id: string): Promise<FederationDoc> {
  const f = await getFed(ctx, id);
  const a = ctx.requireActor();
  if (!a.master && !(a.emailVerified && f.adminEmails.includes(lower(a.email)))) fail('permission-denied', 'Você não faz parte da diretoria desta federação.');
  return f;
}

/** Federação da filial atual (operações chamadas pela diretoria de uma filial) */
async function branchFed(ctx: OpContext): Promise<FederationDoc> {
  const id = ctx.tenant?.federationId;
  if (!id) fail('failed-precondition', 'Esta sociedade não faz parte de uma federação.');
  const f = await getFed(ctx, id!);
  if (!f.tenantIds.includes(tid(ctx))) fail('failed-precondition', 'Esta sociedade não faz parte de uma federação.');
  return f;
}

async function tenantsOf(ctx: OpContext, f: FederationDoc): Promise<TenantDoc[]> {
  const rows = await Promise.all(f.tenantIds.map(id => ctx.store.get<TenantDoc>(P.tenant(id))));
  return rows.filter(Boolean) as TenantDoc[];
}

/** Contexto de outra filial, para reaproveitar as regras de cadastro de lá */
function inTenant(ctx: OpContext, tenant: TenantDoc): OpContext {
  return { ...ctx, tenantId: tenant.id, tenant };
}

async function activeHolders(ctx: OpContext, tenantId: string): Promise<{ active: number; dependents: number }> {
  const active = await ctx.store.count(P.members(tenantId), { where: [['status', 'in', ACTIVE]] });
  const dependents = await ctx.store.count(P.members(tenantId), { where: [['status', 'in', ACTIVE], ['dependentOf', '>', '']] });
  return { active, dependents };
}

// ---------- Plataforma (administrador geral) ----------

export const fedSave = defineOp({
  name: 'federation.save',
  input: z.object({
    id: zId.optional(),
    name: zText(120).min(3),
    slug: z.string().min(3).max(40),
    tenantIds: z.array(zId).max(200),
    adminEmails: z.array(zEmail).max(20),
    networkCard: z.boolean().default(true),
    pricePerMemberCents: z.number().int().min(0).max(100_000).default(240),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1f3b2d'),
  }),
  auth: 'master',
  idempotent: true,
  async run(ctx, input) {
    const slug = normalizeSlug(input.slug);
    const bad = slugProblem(slug);
    if (bad) fail('invalid-argument', 'Endereço da federação inválido.');
    const same = await ctx.store.query<FederationDoc>(P.federations(), { where: [['slug', '==', slug]], limit: 2 });
    if (same.some(s => s.id !== input.id)) fail('already-exists', 'Já existe uma federação com este endereço.');
    const id = input.id || ctx.store.newId();
    const cur = input.id ? await getFed(ctx, input.id) : null;
    const tenantIds = [...new Set(input.tenantIds)];
    for (const t of tenantIds) {
      const doc = await ctx.store.get<TenantDoc>(P.tenant(t));
      if (!doc) fail('not-found', 'Sociedade não encontrada.');
      if (doc!.federationId && doc!.federationId !== id) fail('failed-precondition', `${doc!.name} já é filial de outra federação.`);
    }
    for (const t of tenantIds) await ctx.store.update(P.tenant(t), { federationId: id, updatedAt: ctx.nowIso });
    for (const t of cur?.tenantIds || []) {
      if (!tenantIds.includes(t)) await ctx.store.update(P.tenant(t), { federationId: '', updatedAt: ctx.nowIso });
    }
    const doc: FederationDoc = {
      id,
      name: input.name,
      slug,
      tenantIds,
      adminEmails: [...new Set(input.adminEmails.map(lower))],
      networkCard: input.networkCard,
      pricePerMemberCents: input.pricePerMemberCents,
      primaryColor: input.primaryColor,
      status: cur?.status || 'ativa',
      createdAt: cur?.createdAt || ctx.nowIso,
      updatedAt: ctx.nowIso,
    };
    await ctx.store.set(P.federation(id), doc as unknown as Record<string, unknown>);
    await ctx.audit(input.id ? 'federation.updated' : 'federation.created', id, { branches: tenantIds.length });
    return { id, slug };
  },
});

export const fedList = defineOp({
  name: 'federation.list',
  input: z.object({}),
  auth: 'master',
  async run(ctx) {
    const rows = await ctx.store.query<FederationDoc>(P.federations(), { limit: 200 });
    return rows.map(r => ({ ...r.data, id: r.id }));
  },
});

// ---------- Diretoria da federação ----------

/** Federações em que a conta faz parte da diretoria (tela "Onde você quer entrar?") */
export const fedMine = defineOp({
  name: 'federation.mine',
  input: z.object({}),
  auth: 'user',
  async run(ctx) {
    const a = ctx.requireActor();
    const rows = await ctx.store.query<FederationDoc>(P.federations(), { where: [['adminEmails', 'array-contains', lower(a.email)]], limit: 20 });
    return rows.map(r => ({ id: r.id, name: r.data.name, slug: r.data.slug }));
  },
});

/** Painel: só números por filial, somados; nenhum nome, CPF, contato ou valor de sócio */
export const fedDashboard = defineOp({
  name: 'federation.dashboard',
  input: z.object({ slug: z.string().min(1).max(40) }),
  auth: 'user',
  async run(ctx, input) {
    const found = await ctx.store.query<FederationDoc>(P.federations(), { where: [['slug', '==', normalizeSlug(input.slug)]], limit: 1 });
    if (!found.length) fail('not-found', 'Federação não encontrada.');
    const f = await requireFedAdmin(ctx, found[0].id);
    const branches = [];
    for (const t of await tenantsOf(ctx, f)) {
      const s = await ctx.store.get<DashboardStats>(P.stats(t.id));
      const { active, dependents } = await activeHolders(ctx, t.id);
      branches.push({
        id: t.id,
        name: t.name,
        shortName: t.shortName || t.name,
        slug: t.slug,
        city: t.publicPage?.city || t.region?.city || '',
        planId: t.planId,
        members: { active, holders: active - dependents, dependents, pending: s?.members.pendente || 0, overdue: s?.members.em_atraso || 0, total: s?.members.total || 0 },
        newThisMonth: s?.newThisMonth || 0,
        finance: { overdueCents: s?.finance.overdueCents || 0, monthInCents: s?.finance.monthInCents || 0 },
      });
    }
    const holders = branches.reduce((n, b) => n + b.members.holders, 0);
    return {
      federation: { id: f.id, name: f.name, slug: f.slug, networkCard: f.networkCard, primaryColor: f.primaryColor, adminEmails: f.adminEmails, pricePerMemberCents: f.pricePerMemberCents },
      branches,
      totals: {
        branches: branches.length,
        active: branches.reduce((n, b) => n + b.members.active, 0),
        holders,
        dependents: branches.reduce((n, b) => n + b.members.dependents, 0),
        pending: branches.reduce((n, b) => n + b.members.pending, 0),
        overdue: branches.reduce((n, b) => n + b.members.overdue, 0),
        newThisMonth: branches.reduce((n, b) => n + b.newThisMonth, 0),
      },
      // Cobrança única: titulares ativos de todas as filiais (dependentes não contam)
      billing: { holders, pricePerMemberCents: f.pricePerMemberCents, monthlyCents: holders * f.pricePerMemberCents },
    };
  },
});

export const fedUpdateSettings = defineOp({
  name: 'federation.updateSettings',
  input: z.object({ federationId: zId, networkCard: z.boolean(), adminEmails: z.array(zEmail).min(1).max(20) }),
  auth: 'user',
  async run(ctx, input) {
    await requireFedAdmin(ctx, input.federationId);
    const emails = [...new Set(input.adminEmails.map(lower))];
    const a = ctx.actor!;
    // Quem altera não tira a si mesmo sem querer (o administrador geral pode)
    if (!a.master && !emails.includes(lower(a.email))) fail('failed-precondition', 'Você não pode tirar a si mesmo da diretoria. Peça a outra pessoa da diretoria.');
    await ctx.store.update(P.federation(input.federationId), { networkCard: input.networkCard, adminEmails: emails, updatedAt: ctx.nowIso });
    await ctx.audit('federation.settings', input.federationId, { admins: emails.length, networkCard: input.networkCard });
    return { ok: true };
  },
});

// ---------- Campeonato da federação ----------

const zChampionship = z.object({
  name: zText(120).min(3),
  season: zText(20).min(1),
  unit: zText(30).min(1),
  higherIsBetter: z.boolean(),
  aggregate: z.enum(['soma', 'media', 'melhores']),
  bestN: z.number().int().min(1).max(100).optional(),
  status: z.enum(['planejada', 'em_andamento', 'encerrada']),
});

export const fedChampionshipSave = defineOp({
  name: 'federation.championshipSave',
  input: z.object({ federationId: zId, id: zId.optional(), data: zChampionship }),
  auth: 'user',
  idempotent: true,
  async run(ctx, input) {
    await requireFedAdmin(ctx, input.federationId);
    const id = input.id || ctx.store.newId();
    const cur = input.id ? await ctx.store.get<FedChampionshipDoc>(P.fedChampionship(input.federationId, id)) : null;
    if (input.id && !cur) fail('not-found', 'Campeonato não encontrado.');
    const data = { ...input.data };
    if (data.aggregate !== 'melhores') delete data.bestN;
    const doc: FedChampionshipDoc = { id, ...data, createdAt: cur?.createdAt || ctx.nowIso, updatedAt: ctx.nowIso };
    await ctx.store.set(P.fedChampionship(input.federationId, id), doc as unknown as Record<string, unknown>);
    await ctx.audit('federation.championship_saved', id);
    return { id };
  },
});

/** Campeonatos: para a diretoria da federação ou para as filiais escolherem a quais ligar a competição delas */
export const fedChampionships = defineOp({
  name: 'federation.championships',
  input: z.object({ federationId: zId.optional(), tenantId: zId.optional() }),
  auth: 'user',
  async run(ctx, input) {
    let fedId = input.federationId;
    if (input.tenantId) {
      const ms = await ctx.store.get<MembershipDoc>(P.membership(input.tenantId, ctx.requireActor().uid));
      const t = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
      if (!ms?.active || !ms.board || !t?.federationId) return [];
      fedId = t.federationId;
    } else {
      if (!fedId) fail('invalid-argument', 'Informe a federação.');
      await requireFedAdmin(ctx, fedId!);
    }
    const rows = await ctx.store.query<FedChampionshipDoc>(P.fedChampionships(fedId!), { limit: 100 });
    return rows.map(r => ({ ...r.data, id: r.id })).sort((a, b) => b.season.localeCompare(a.season) || a.name.localeCompare(b.name));
  },
});

/** Ranking do campeonato: junta os resultados das competições das filiais ligadas a ele */
export async function championshipRanking(ctx: OpContext, f: FederationDoc, champ: FedChampionshipDoc, category?: string) {
  const results: CompetitionResultDoc[] = [];
  const stages: { id: string; name: string; branch: string; date?: string }[] = [];
  for (const t of await tenantsOf(ctx, f)) {
    const comps = await ctx.store.query<CompetitionDoc>(P.competitions(t.id), { where: [['federationChampionshipId', '==', champ.id]], limit: 20 });
    const label = t.shortName || t.name;
    for (const c of comps) {
      if (c.data.format !== 'individual') continue;
      for (const s of c.data.stages) stages.push({ id: `${t.id}:${c.id}:${s.id}`, name: s.name, branch: label, ...(s.date ? { date: s.date } : {}) });
      const rs = await ctx.store.query<CompetitionResultDoc>(P.competitionResults(t.id, c.id), { limit: 3000 });
      for (const r of rs) {
        // Mesmo sócio em filiais diferentes conta separado; o nome leva a filial para não confundir
        results.push({
          ...r.data,
          id: r.id,
          stageId: `${t.id}:${c.id}:${r.data.stageId}`,
          participantName: `${r.data.participantName} (${label})`,
          ...(r.data.memberId ? { memberId: `${t.id}:${r.data.memberId}` } : {}),
        });
      }
    }
  }
  const rows: OverallRow[] = overallRanking(results, { ...champ, stages, categories: [] }, { category });
  return { stages, rows: rows.map(({ memberId: _m, ...r }) => r) };
}

export const fedRanking = defineOp({
  name: 'federation.ranking',
  input: z.object({ federationId: zId, championshipId: zId, category: zText(40).optional() }),
  auth: 'user',
  async run(ctx, input) {
    const f = await requireFedAdmin(ctx, input.federationId);
    const champ = await ctx.store.get<FedChampionshipDoc>(P.fedChampionship(f.id, input.championshipId));
    if (!champ) fail('not-found', 'Campeonato não encontrado.');
    return { championship: { ...champ!, id: input.championshipId }, ...(await championshipRanking(ctx, f, champ!, input.category)) };
  },
});

// ---------- Filial: informações da rede ----------

export const fedBranchInfo = defineOp({
  name: 'federation.branchInfo',
  input: zTenant,
  auth: 'user',
  tenant: { perm: null },
  async run(ctx) {
    if (!ctx.tenant?.federationId) return null;
    const f = await branchFed(ctx);
    const others = (await tenantsOf(ctx, f)).filter(t => t.id !== tid(ctx));
    return { id: f.id, name: f.name, networkCard: f.networkCard, branches: others.map(t => ({ id: t.id, name: t.name })) };
  },
});

// ---------- Transferência entre filiais ----------

export const fedTransferRequest = defineOp({
  name: 'federation.transferRequest',
  input: zTenant.extend({ memberId: zId, toTenantId: zId, note: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  idempotent: true,
  async run(ctx, input) {
    const f = await branchFed(ctx);
    if (input.toTenantId === tid(ctx) || !f.tenantIds.includes(input.toTenantId)) fail('invalid-argument', 'Escolha outra filial da mesma federação.');
    const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), input.memberId));
    if (!m) fail('not-found', 'Sócio não encontrado.');
    if (m!.dependentOf) fail('failed-precondition', 'Transfira o titular: os dependentes vão junto.');
    if (!ACTIVE.includes(m!.status)) fail('failed-precondition', 'Só sócio com cadastro aprovado pode ser transferido.');
    const open = await ctx.store.query<FedTransferDoc>(P.fedTransfers(f.id), { where: [['memberId', '==', input.memberId], ['status', '==', 'pendente']], limit: 1 });
    if (open.some(o => o.data.fromTenantId === tid(ctx))) fail('failed-precondition', 'Já existe uma transferência pendente para este sócio.');
    const dest = await ctx.store.get<TenantDoc>(P.tenant(input.toTenantId));
    const deps = await ctx.store.query<MemberDoc>(P.members(tid(ctx)), { where: [['dependentOf', '==', m!.id]], limit: 20 });
    const id = ctx.store.newId();
    const doc: FedTransferDoc = {
      id,
      fromTenantId: tid(ctx),
      fromTenantName: ctx.tenant!.name,
      toTenantId: input.toTenantId,
      toTenantName: dest!.name,
      memberId: m!.id,
      memberName: m!.displayName,
      dependents: deps.filter(d => ACTIVE.includes(d.data.status)).length,
      ...(input.note ? { note: input.note } : {}),
      status: 'pendente',
      requestedBy: ctx.actor!.uid,
      requestedAt: ctx.nowIso,
    };
    await ctx.store.set(P.fedTransfer(f.id, id), doc as unknown as Record<string, unknown>);
    const destCtx = inTenant(ctx, dest!);
    for (const uid of await boardUids(destCtx)) await notify(destCtx, uid, 'Transferência de sócio para aprovar', `${m!.displayName}, vindo de ${ctx.tenant!.name}.`, 'socios');
    await ctx.audit('federation.transfer_requested', m!.id, { to: input.toTenantId });
    return { id };
  },
});

/** Transferências da filial (que saem e que chegam) ou de toda a federação (diretoria da federação) */
export const fedTransferList = defineOp({
  name: 'federation.transfers',
  input: z.object({ tenantId: zId.optional(), federationId: zId.optional() }),
  auth: 'user',
  async run(ctx, input) {
    let f: FederationDoc;
    let mine: string | null = null;
    if (input.tenantId) {
      const ms = await ctx.store.get<MembershipDoc>(P.membership(input.tenantId, ctx.requireActor().uid));
      const t = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
      const canSee = ms?.active && (ms.perms?.socios || []).includes('ver');
      if (!canSee || !t?.federationId) return [];
      f = await getFed(ctx, t.federationId);
      mine = input.tenantId;
    } else {
      if (!input.federationId) fail('invalid-argument', 'Informe a federação.');
      f = await requireFedAdmin(ctx, input.federationId!);
    }
    const rows = await ctx.store.query<FedTransferDoc>(P.fedTransfers(f.id), { orderBy: [['requestedAt', 'desc']], limit: 200 });
    return rows
      .map(r => ({ ...r.data, id: r.id }))
      .filter(r => !mine || r.fromTenantId === mine || r.toTenantId === mine)
      .map(({ note, ...r }) => (mine ? { ...r, ...(note ? { note } : {}) } : r));
  },
});

export const fedTransferDecide = defineOp({
  name: 'federation.transferDecide',
  input: zTenant.extend({ transferId: zId, approve: z.boolean(), categoryId: zId.optional(), reason: zText(300).optional() }),
  auth: 'user',
  tenant: { perm: ['socios', 'aprovar'] },
  idempotent: true,
  async run(ctx, input) {
    const f = await branchFed(ctx);
    const tr = await ctx.store.get<FedTransferDoc>(P.fedTransfer(f.id, input.transferId));
    if (!tr) fail('not-found', 'Transferência não encontrada.');
    if (tr!.toTenantId !== tid(ctx)) fail('permission-denied', 'Só a filial de destino aprova a transferência.');
    if (tr!.status !== 'pendente') fail('failed-precondition', 'Esta transferência já foi decidida.');
    const origin = await ctx.store.get<TenantDoc>(P.tenant(tr!.fromTenantId));
    if (!origin) fail('not-found', 'Filial de origem não encontrada.');
    const originCtx = inTenant(ctx, origin!);
    const holder = await ctx.store.get<MemberDoc>(P.member(origin!.id, tr!.memberId));

    if (!input.approve) {
      if (!input.reason?.trim()) fail('invalid-argument', 'Explique o motivo para a filial de origem.');
      await ctx.store.update(P.fedTransfer(f.id, tr!.id), { status: 'recusada', decidedBy: ctx.actor!.uid, decidedAt: ctx.nowIso, reason: input.reason });
      for (const uid of await boardUids(originCtx)) await notify(originCtx, uid, 'Transferência recusada', `${tr!.memberName}: ${input.reason}`, 'socios');
      await ctx.audit('federation.transfer_rejected', tr!.id);
      return { ok: true };
    }
    if (!holder || !ACTIVE.includes(holder.status)) fail('failed-precondition', 'O cadastro na filial de origem não está mais ativo.');

    const settings = await ctx.store.get<TenantSettings>(P.settings(tid(ctx)));
    const categoryId = input.categoryId || settings?.categories.find(c => c.id === holder!.categoryId)?.id || settings?.categories[0]?.id;
    if (!categoryId) fail('failed-precondition', 'Cadastre ao menos uma categoria de sócio nesta filial.');

    /** Copia um cadastro para cá: dados pessoais decifrados só aqui no servidor e cifrados de novo */
    const copy = async (m: MemberDoc, dependentOf?: string): Promise<string> => {
      const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(origin!.id, m.id));
      const consent = (p: string) => !!pii?.consents?.filter(c => c.purpose === p).pop()?.granted;
      const cat = dependentOf ? settings?.categories.find(c => c.id === 'dependente')?.id || categoryId! : categoryId!;
      const id = await createMemberCore(ctx, {
        data: {
          fullName: m.fullName,
          ...(pii?.cpfEnc ? { cpf: await ctx.crypto.decrypt(pii.cpfEnc) } : {}),
          ...(pii?.birthDate ? { birthDate: pii.birthDate } : {}),
          ...(pii?.email ? { email: pii.email } : {}),
          ...(pii?.phone ? { phone: pii.phone } : {}),
          ...(pii?.address ? { address: pii.address } : {}),
          ...(pii?.guardian ? { guardian: { name: pii.guardian.name, ...(pii.guardian.email ? { email: pii.guardian.email } : {}), ...(pii.guardian.phone ? { phone: pii.guardian.phone } : {}), consent: true as const } } : {}),
          categoryId: cat,
          custom: m.custom?.parentesco ? { parentesco: m.custom.parentesco } : {},
        },
        consents: { cadastro: true, imagem: consent('imagem'), comunicacao: consent('comunicacao'), marketing: consent('marketing') },
        status: 'pendente',
        ...(m.uid ? { uid: m.uid } : {}),
        ...(dependentOf ? { dependentOf } : {}),
      });
      await approveCore(ctx, id, { categoryId: cat, ...(m.validUntil ? { validUntil: m.validUntil } : {}) });
      // Mantém a data de entrada original: o tempo de sócio não se perde na mudança de filial
      await ctx.store.update(P.member(tid(ctx), id), { joinedAt: m.joinedAt || ctx.nowIso.slice(0, 10), updatedAt: ctx.nowIso });
      await ctx.store.add(P.memberHistory(tid(ctx), id), { from: null, to: 'ativo', reason: `Transferido de ${origin!.name}`, byUid: ctx.actor!.uid, at: ctx.nowIso });
      if (m.uid && pii?.email && !dependentOf) {
        await upsertMembership(ctx, ctx.tenant!, { uid: m.uid, email: pii.email, displayName: m.displayName }, ['socio'], id);
      }
      await setStatusCore(originCtx, m.id, 'desligado', `Transferido para ${ctx.tenant!.name}`);
      return id;
    };

    const newId = await copy(holder!);
    const deps = await ctx.store.query<MemberDoc>(P.members(origin!.id), { where: [['dependentOf', '==', holder!.id]], limit: 20 });
    for (const d of deps) if (ACTIVE.includes(d.data.status)) await copy({ ...d.data, id: d.id }, newId);

    await ctx.store.update(P.fedTransfer(f.id, tr!.id), { status: 'concluida', decidedBy: ctx.actor!.uid, decidedAt: ctx.nowIso, newMemberId: newId });
    await notify(ctx, holder!.uid, 'Transferência concluída', `Agora você é sócio da ${ctx.tenant!.name}. A carteirinha nova já está no portal.`, 'carteirinha');
    for (const uid of await boardUids(originCtx)) await notify(originCtx, uid, 'Transferência concluída', `${tr!.memberName} agora é da ${ctx.tenant!.name}.`, 'socios');
    await ctx.audit('federation.transfer_done', newId, { from: origin!.id });
    return { memberId: newId };
  },
});

// ---------- Carteirinha aceita em toda a rede ----------

/** Filial da mesma federação a quem pertence o QR lido na portaria (null se não houver) */
export async function networkTenantFor(ctx: OpContext, slug: string | undefined): Promise<TenantDoc | null> {
  if (!slug || !ctx.tenant?.federationId) return null;
  const f = await ctx.store.get<FederationDoc>(P.federation(ctx.tenant.federationId));
  if (!f?.networkCard || f.status !== 'ativa') return null;
  const s = await ctx.store.get<{ tenantId: string }>(P.slug(slug.toLowerCase()));
  if (!s || s.tenantId === ctx.tenant.id || !f.tenantIds.includes(s.tenantId)) return null;
  return ctx.store.get<TenantDoc>(P.tenant(s.tenantId));
}

export const federationOps = [
  fedSave,
  fedList,
  fedMine,
  fedDashboard,
  fedUpdateSettings,
  fedChampionshipSave,
  fedChampionships,
  fedRanking,
  fedBranchInfo,
  fedTransferRequest,
  fedTransferList,
  fedTransferDecide,
];
