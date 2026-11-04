/**
 * Núcleo das operações (escritas sensíveis e leituras que exigem servidor).
 *
 * Cada operação declara: schema Zod de entrada, nível de autenticação, permissão no tenant,
 * limite de taxa e se é idempotente. O executor valida tudo antes de chamar run().
 * O mesmo executor roda na Cloud Function `api`, na demonstração (memória) e no seed.
 */
import { z, ZodType } from 'zod';

// Mensagens de validação em português do Brasil
z.config(z.locales.pt());
import type { Store } from './store.ts';
import type { BillingPort, CryptoPort, FilePort, MailPort, NewsPort, PaymentProvider, PushPort } from './ports.ts';
import type { Action, ModuleId } from '../modules.ts';
import { can } from '../modules.ts';
import type { AuditDoc, MembershipDoc, TenantDoc } from '../types.ts';
import { P } from '../paths.ts';

export type OpErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'not-found'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'already-exists'
  | 'resource-exhausted'
  | 'unavailable';

export class OpError extends Error {
  constructor(public code: OpErrorCode, message: string) {
    super(message);
    this.name = 'OpError';
  }
}

export const fail = (code: OpErrorCode, message: string): never => {
  throw new OpError(code, message);
};

export interface Actor {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  master: boolean; // custom claim `master`
  mfa: boolean; // segundo fator presente no token
}

export interface Env {
  store: Store;
  crypto: CryptoPort;
  mail: MailPort;
  payments: PaymentProvider;
  files: FilePort;
  billing?: BillingPort; // Stripe; sem porta a troca de plano é pedida à plataforma
  news?: NewsPort; // sem porta configurada, as notícias externas ficam desligadas
  push?: PushPort; // sem porta configurada, não há notificação no celular
  now: () => Date;
  appUrl: string;
  demo: boolean; // demonstração: dispensa MFA do master
  /** Exigir verificação em duas etapas do master (desligado por padrão; ligar junto com o Identity Platform) */
  requireMasterMfa?: boolean;
}

export interface OpContext extends Env {
  actor: Actor | null;
  ip: string;
  nowIso: string;
  tenantId?: string;
  tenant?: TenantDoc;
  membership?: MembershipDoc;
  /** Grava na auditoria do tenant (ou da plataforma). Nunca passe dado pessoal em details. */
  audit(action: string, targetId?: string, details?: AuditDoc['details']): Promise<void>;
  requireActor(): Actor;
  can(module: ModuleId, action?: Action): boolean;
  require(module: ModuleId, action?: Action): void;
}

export type AuthLevel = 'public' | 'user' | 'master';

export interface OpDef<S extends ZodType = ZodType, O = unknown> {
  name: string;
  input: S;
  auth: AuthLevel;
  /**
   * Exige input.tenantId e membership ativa. perm: permissão mínima (null = qualquer membro).
   * allowNonMember: aceita usuário logado sem vínculo (ex.: proposta de sócio, aceitar convite).
   */
  tenant?: { perm: [ModuleId, Action] | null; allowNonMember?: boolean };
  /** Requer módulo ligado na sociedade */
  module?: ModuleId;
  rateLimit?: { per: 'ip' | 'uid'; max: number; windowSec: number };
  idempotent?: boolean;
  /** Só pode ser chamada pelo próprio servidor (webhook, agendamento), nunca pela API pública */
  internal?: boolean;
  run(ctx: OpContext, input: z.infer<S>): Promise<O>;
}

export function defineOp<S extends ZodType, O>(def: OpDef<S, O>): OpDef<S, O> {
  return def;
}

/** Tira as chaves com valor null (também dentro de listas e objetos) */
function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
  return v;
}

const registry = new Map<string, OpDef>();

export function registerOps(defs: OpDef[]): void {
  for (const d of defs) {
    if (registry.has(d.name)) throw new Error(`Operação duplicada: ${d.name}`);
    registry.set(d.name, d);
  }
}

export function listOps(): string[] {
  return [...registry.keys()].sort();
}

async function checkRateLimit(env: Env, key: string, max: number, windowSec: number): Promise<void> {
  const path = P.rateLimit(key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 200));
  const nowMs = env.now().getTime();
  await env.store.runTransaction(async tx => {
    const cur = await tx.get<{ count: number; windowStart: number }>(path);
    if (!cur || nowMs - cur.windowStart > windowSec * 1000) {
      tx.set(path, { count: 1, windowStart: nowMs, expiresAt: new Date(nowMs + windowSec * 1000).toISOString() });
      return;
    }
    if (cur.count >= max) fail('resource-exhausted', 'Muitas tentativas. Aguarde um pouco e tente de novo.');
    tx.update(path, { count: cur.count + 1 });
  });
}

export interface ExecuteArgs {
  op: string;
  input: unknown;
  actor: Actor | null;
  ip?: string;
  /** true apenas quando chamado pelo código do servidor (webhooks, agendamentos, seed) */
  internal?: boolean;
}

/** Ator usado por webhooks e agendamentos */
export const SYSTEM_ACTOR: Actor = {
  uid: 'sistema',
  email: 'sistema@plataforma.invalid',
  emailVerified: true,
  displayName: 'Sistema',
  master: false,
  mfa: false,
};

export async function executeOp(env: Env, args: ExecuteArgs): Promise<unknown> {
  const def = registry.get(args.op);
  if (!def) fail('not-found', 'Operação desconhecida.');
  const d = def as OpDef;
  if (d.internal && !args.internal) fail('permission-denied', 'Operação interna.');

  let parsed = d.input.safeParse(args.input ?? {});
  // O envio das Functions transforma campo vazio em null; se só isso derrubou a validação, tenta sem os nulos
  // (campos que aceitam null de propósito, como voto em branco, passam já na primeira tentativa)
  if (!parsed.success) {
    const retry = d.input.safeParse(dropNulls(args.input ?? {}));
    if (retry.success) parsed = retry;
  }
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    fail('invalid-argument', `Dados inválidos${first?.path?.length ? ` em ${first.path.join('.')}` : ''}: ${first?.message || ''}`);
  }
  const input = (parsed as { data: Record<string, unknown> }).data;

  const actor = args.actor;
  if (d.auth !== 'public' && !(d.internal && args.internal)) {
    if (!actor) fail('unauthenticated', 'Entre na sua conta para continuar.');
    if (!actor!.emailVerified) fail('permission-denied', 'Confirme seu e-mail antes de continuar.');
  }
  if (d.auth === 'master') {
    if (!actor!.master) fail('permission-denied', 'Acesso restrito ao painel da plataforma.');
    if (env.requireMasterMfa && !actor!.mfa && !env.demo) fail('permission-denied', 'O painel da plataforma exige verificação em duas etapas.');
  }

  const ip = args.ip || '0.0.0.0';
  if (d.rateLimit) {
    const who = d.rateLimit.per === 'ip' ? ip : actor?.uid || ip;
    await checkRateLimit(env, `${d.name}:${who}`, d.rateLimit.max, d.rateLimit.windowSec);
  }

  const now = env.now();
  const ctx: OpContext = {
    ...env,
    actor,
    ip,
    nowIso: now.toISOString(),
    requireActor() {
      if (!actor) fail('unauthenticated', 'Entre na sua conta para continuar.');
      return actor!;
    },
    can(module, action = 'ver') {
      return can(ctx.membership?.perms, module, action);
    },
    require(module, action = 'ver') {
      if (!ctx.can(module, action)) fail('permission-denied', 'Seu papel não permite esta ação.');
    },
    async audit(action, targetId, details) {
      const entry = {
        action,
        actorUid: actor?.uid || 'sistema',
        ...(targetId ? { targetId } : {}),
        ...(details ? { details } : {}),
        at: ctx.nowIso,
      };
      if (ctx.tenantId) await env.store.add(P.audit(ctx.tenantId), entry);
      else await env.store.add(P.platformAudit(), entry);
    },
  };

  if (d.tenant) {
    const tenantId = input.tenantId;
    if (typeof tenantId !== 'string' || !tenantId) fail('invalid-argument', 'Sociedade não informada.');
    const tenant = await env.store.get<TenantDoc>(P.tenant(tenantId as string));
    if (!tenant) fail('not-found', 'Sociedade não encontrada.');
    ctx.tenantId = tenantId as string;
    ctx.tenant = tenant!;
    if (d.internal && args.internal) {
      // Webhook/agendamento: age em nome da sociedade, com todas as permissões
      const { MODULE_IDS, ACTIONS } = await import('../modules.ts');
      ctx.membership = {
        uid: 'sistema', email: '', displayName: 'Sistema', roleIds: [], board: true, active: true,
        perms: Object.fromEntries(MODULE_IDS.map(m => [m, [...ACTIONS]])),
        createdAt: ctx.nowIso, updatedAt: ctx.nowIso,
      };
    } else if (d.auth !== 'public') {
      const membership = await env.store.get<MembershipDoc>(P.membership(tenantId as string, actor!.uid));
      const expired = !!membership?.expiresAtMs && membership.expiresAtMs < now.getTime();
      const activeMembership = membership && membership.active && !expired ? membership : null;
      if (!activeMembership && !d.tenant.allowNonMember) fail('permission-denied', 'Você não faz parte desta sociedade.');
      if (activeMembership) ctx.membership = activeMembership;
      if (tenant!.status === 'suspensa') fail('failed-precondition', 'Esta sociedade está suspensa. Fale com o suporte da plataforma.');
      if (d.tenant.perm) ctx.require(d.tenant.perm[0], d.tenant.perm[1]);
    }
    if (d.module && tenant!.modules?.[d.module] === false) fail('failed-precondition', 'Este módulo está desligado nesta sociedade.');
  }

  // Idempotência: mesma requestId devolve o mesmo resultado sem repetir efeitos
  const requestId = typeof input.requestId === 'string' ? input.requestId : '';
  const idemPath =
    d.idempotent && requestId && ctx.tenantId ? P.idempotency(ctx.tenantId, `${d.name}_${requestId}`.replace(/[^a-zA-Z0-9_-]/g, '_')) : '';
  if (idemPath) {
    const prev = await env.store.get<{ result: unknown }>(idemPath);
    if (prev) return prev.result;
  }

  const result = await d.run(ctx, input);

  if (idemPath) {
    await env.store.set(idemPath, { result: result ?? null, at: ctx.nowIso, uid: actor?.uid || '' });
  }
  return result;
}

// Schemas de uso comum
export const zId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, 'identificador inválido');
export const zTenant = z.object({ tenantId: zId, requestId: z.string().max(80).optional() });
export const zDateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
export const zIso = z.string().min(10).max(40);
export const zCents = z.number().int().min(0).max(100_000_000_00);
export const zText = (max = 500) => z.string().trim().max(max);
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor no formato #RRGGBB');

// ---------- Rotinas diárias (Cloud Scheduler) ----------
export interface DailyJob {
  name: string;
  /** ctx com tenantId/tenant preenchidos e ator de sistema */
  run(ctx: OpContext): Promise<void>;
}

const jobs: DailyJob[] = [];
export function registerJobs(list: DailyJob[]): void {
  for (const j of list) if (!jobs.find(x => x.name === j.name)) jobs.push(j);
}
export function listJobs(): string[] {
  return jobs.map(j => j.name);
}

/** Roda todas as rotinas para uma sociedade; uma falha não impede as demais */
export async function runDailyJobs(env: Env, tenantId: string): Promise<{ job: string; ok: boolean; error?: string }[]> {
  const tenant = await env.store.get<TenantDoc>(P.tenant(tenantId));
  if (!tenant || tenant.status === 'suspensa') return [];
  const out: { job: string; ok: boolean; error?: string }[] = [];
  for (const j of jobs) {
    try {
      await executeOp(env, { op: '__job', input: { tenantId, job: j.name }, actor: SYSTEM_ACTOR, internal: true });
      out.push({ job: j.name, ok: true });
    } catch (e) {
      out.push({ job: j.name, ok: false, error: (e as Error).message });
    }
  }
  return out;
}

/** Operação interna que executa uma rotina com o contexto completo da sociedade */
export const jobRunnerOp = defineOp({
  name: '__job',
  input: z.object({ tenantId: zIdLoose(), job: z.string().max(60) }),
  auth: 'user',
  tenant: { perm: null },
  internal: true,
  async run(ctx, input) {
    const j = jobs.find(x => x.name === input.job);
    if (!j) fail('not-found', 'Rotina desconhecida.');
    await j!.run(ctx);
    return { ok: true };
  },
});

function zIdLoose() {
  return z.string().min(1).max(128);
}
