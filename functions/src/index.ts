/**
 * Cloud Functions do Sodalis (região southamerica-east1).
 *
 * - api: única porta de escrita do cliente. Recebe { op, input } e chama executeOp do código
 *   compartilhado (src/shared), o mesmo que roda na demonstração e nos testes.
 * - paymentsWebhook: eventos do provedor de pagamentos (assinatura conferida pelo adaptador).
 * - ics: feed de agenda por token revogável.
 * - daily: rotinas diárias de cada sociedade (05:30, horário de Brasília).
 * - uploadGuard: confere tipo real e tamanho dos arquivos enviados e apaga o que for inválido.
 * - mirrorMembership / mirrorMember: só quando o banco principal NÃO é o (default); copiam o
 *   mínimo para o (default), que é o único banco que as regras do Storage conseguem consultar.
 *
 * Logs nunca levam dado pessoal: só nome da operação, códigos e ids técnicos.
 */
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger, setGlobalOptions } from 'firebase-functions';
import { defineBoolean, defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import appletConfig from '../../firebase-applet-config.json';
import { executeOp, OpError, runDailyJobs, SYSTEM_ACTOR, type Actor, type Env } from '../../src/shared/core/ops.ts';
import { createSandboxPayments } from '../../src/shared/core/sandboxPayments.ts';
import { registerAllOps } from '../../src/shared/ops/index.ts';
import { AdminStore } from './adminStore.ts';
import { IS_EMULATOR, resendMail, serverCrypto, storageFiles } from './serverPorts.ts';
import { EMULATOR_WEBHOOK_SECRET, emulatorCpfKeys } from './emulatorKeys.ts';
import { judgeUpload } from './uploadCheck.ts';
import { googleNewsPort } from './newsPort.ts';
import { fcmPush } from './pushPort.ts';
import { stripeBilling, stripeEventToOp, verifyStripeSignature } from './stripeBilling.ts';
import type { PlanDoc } from '../../src/shared/types.ts';

const REGION = 'southamerica-east1';
setGlobalOptions({ region: REGION, maxInstances: 20 });

// ---------- Parâmetros e segredos ----------
const DEFAULT_DB = (appletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';
const FIRESTORE_DATABASE_ID = defineString('FIRESTORE_DATABASE_ID', {
  default: DEFAULT_DB,
  description: 'Banco do Firestore usado pelo servidor ((default) recomendado nos projetos novos)',
});
const APP_URL = defineString('APP_URL', { default: 'http://localhost:3000', description: 'URL pública do app (links e QR)' });
const MAIL_FROM = defineString('MAIL_FROM', { default: 'Sodalis <nao-responda@sodalis.app>', description: 'Remetente dos e-mails (domínio verificado na Resend)' });
const REQUIRE_MASTER_MFA = defineBoolean('REQUIRE_MASTER_MFA', { default: false, description: 'Exigir verificação em duas etapas do administrador geral (precisa do Identity Platform)' });
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', { default: false, description: 'Exigir App Check na api' });

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const CPF_ENCRYPTION_KEY = defineSecret('CPF_ENCRYPTION_KEY');
const CPF_HMAC_KEY = defineSecret('CPF_HMAC_KEY');
const SANDBOX_WEBHOOK_SECRET = defineSecret('SANDBOX_WEBHOOK_SECRET');

// Stripe: desligado até existir a conta. Para ligar: criar os dois segredos e pôr STRIPE_ENABLED=true em .env.prod
const STRIPE_ON = !IS_EMULATOR && process.env.STRIPE_ENABLED === 'true';
// Declarados só com o Stripe ligado: declarar exige que o segredo exista na publicação
const STRIPE_SECRET_KEY = STRIPE_ON ? defineSecret('STRIPE_SECRET_KEY') : null;
const STRIPE_WEBHOOK_SECRET = STRIPE_ON ? defineSecret('STRIPE_WEBHOOK_SECRET') : null;

// No emulador os segredos não existem: nada é declarado e as chaves locais são usadas
const SECRETS = IS_EMULATOR ? [] : [RESEND_API_KEY, CPF_ENCRYPTION_KEY, CPF_HMAC_KEY, SANDBOX_WEBHOOK_SECRET, ...(STRIPE_SECRET_KEY ? [STRIPE_SECRET_KEY] : [])];

/** Banco efetivo. Lido do ambiente na carga (o deploy grava os parâmetros em process.env). */
const DB_ID = IS_EMULATOR ? '(default)' : process.env.FIRESTORE_DATABASE_ID || DEFAULT_DB;

// ---------- Ambiente das operações (um por instância) ----------
let adminApp: App | null = null;
function app(): App {
  if (!adminApp) adminApp = getApps()[0] || initializeApp();
  return adminApp;
}

let envCache: Env | null = null;
function env(): Env {
  if (envCache) return envCache;
  registerAllOps();
  const a = app();
  const store = new AdminStore(a, DB_ID);
  let keys: { encKeyB64: string; hmacKeyB64: string };
  let webhookSecret: string;
  let resendKey = '';
  if (IS_EMULATOR) {
    logger.warn('emulador: usando chaves de CPF locais e fixas (dados fictícios); e-mails simulados; MFA do master dispensado');
    keys = emulatorCpfKeys();
    webhookSecret = EMULATOR_WEBHOOK_SECRET;
  } else {
    keys = { encKeyB64: CPF_ENCRYPTION_KEY.value(), hmacKeyB64: CPF_HMAC_KEY.value() };
    webhookSecret = SANDBOX_WEBHOOK_SECRET.value();
    resendKey = RESEND_API_KEY.value();
  }
  const crypto = serverCrypto(keys);
  envCache = {
    store,
    crypto,
    mail: resendMail(resendKey, MAIL_FROM.value()),
    payments: createSandboxPayments(crypto, webhookSecret),
    files: storageFiles(a),
    news: googleNewsPort(),
    ...(STRIPE_SECRET_KEY ? { billing: stripeBilling(STRIPE_SECRET_KEY.value()) } : {}),
    push: IS_EMULATOR ? undefined : fcmPush(a, APP_URL.value().replace(/\/+$/, '')),
    now: () => new Date(),
    appUrl: APP_URL.value().replace(/\/+$/, ''),
    // Só no emulador local (projeto demo-sodalis): o Auth Emulator não faz segundo fator
    demo: IS_EMULATOR,
    requireMasterMfa: REQUIRE_MASTER_MFA.value(),
  };
  return envCache;
}

function actorFrom(auth: { uid: string; token: Record<string, unknown> } | undefined): Actor | null {
  if (!auth) return null;
  const t = auth.token as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    master?: boolean;
    firebase?: { sign_in_second_factor?: string };
  };
  return {
    uid: auth.uid,
    email: (t.email || '').toLowerCase(),
    emailVerified: t.email_verified === true,
    displayName: t.name || '',
    master: t.master === true,
    mfa: !!t.firebase?.sign_in_second_factor,
  };
}

const GENERIC_ERROR = 'Não foi possível concluir agora. Tente de novo em instantes.';

function toHttpsError(e: unknown, op: string): HttpsError {
  if (e instanceof OpError) return new HttpsError(e.code, e.message);
  if (e instanceof HttpsError) return e;
  const err = e as { code?: unknown; name?: string };
  // Sem mensagem, sem input, sem dados do usuário: só a operação e o código técnico
  logger.error('op_falhou', { op, codigo: typeof err?.code === 'string' || typeof err?.code === 'number' ? String(err.code) : err?.name || 'desconhecido' });
  return new HttpsError('internal', GENERIC_ERROR);
}

// ---------- api ----------
export const api = onCall(
  // invoker public: o site chama sem conta do Google Cloud; login e permissão são conferidos em cada operação
  { region: REGION, invoker: 'public', enforceAppCheck: ENFORCE_APP_CHECK, secrets: SECRETS, memory: '512MiB', timeoutSeconds: 120 },
  async request => {
    const data = (request.data || {}) as { op?: unknown; input?: unknown };
    if (typeof data.op !== 'string' || !/^[A-Za-z0-9_.]{1,80}$/.test(data.op)) throw new HttpsError('invalid-argument', 'Operação inválida.');
    const op = data.op;
    if (op.startsWith('__')) throw new HttpsError('permission-denied', 'Operação interna.');
    try {
      return await executeOp(env(), {
        op,
        input: data.input ?? {},
        actor: actorFrom(request.auth as never),
        ip: request.rawRequest?.ip || '0.0.0.0',
        internal: false,
      });
    } catch (e) {
      throw toHttpsError(e, op);
    }
  }
);

// ---------- Webhook de pagamentos ----------
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export const paymentsWebhook = onRequest({ region: REGION, secrets: SECRETS, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Método não permitido');
    return;
  }
  const tenantId = String(req.query.tenant || '');
  if (!TENANT_ID_RE.test(tenantId)) {
    res.status(400).send('Sociedade inválida');
    return;
  }
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  const e = env();
  const ev = await e.payments.parseWebhook(headers, raw);
  if (!ev) {
    logger.warn('webhook_assinatura_invalida', { tenantId });
    res.status(401).send('Assinatura inválida');
    return;
  }
  try {
    await executeOp(e, {
      op: 'finance.applyPaymentEvent',
      input: { tenantId, eventId: ev.eventId, externalId: ev.externalId, type: ev.type, paidAmountCents: ev.paidAmountCents, paidAt: ev.paidAt },
      actor: SYSTEM_ACTOR,
      internal: true,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof OpError && err.code === 'already-exists') {
      // Evento repetido: já aplicado; responde 200 para o provedor parar de reenviar
      res.status(200).json({ ok: true, repetido: true });
      return;
    }
    if (err instanceof OpError && (err.code === 'not-found' || err.code === 'invalid-argument')) {
      logger.warn('webhook_rejeitado', { tenantId, codigo: err.code });
      res.status(200).json({ ok: false });
      return;
    }
    logger.error('webhook_falhou', { tenantId, codigo: err instanceof OpError ? err.code : (err as Error)?.name || 'desconhecido' });
    // 500 faz o provedor tentar de novo mais tarde (a op é idempotente pelo eventId)
    res.status(500).json({ ok: false });
  }
});

// ---------- Feed ICS ----------
export const ics = onRequest({ region: REGION, secrets: SECRETS, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Método não permitido');
    return;
  }
  const tenantId = String(req.query.t || '');
  const token = String(req.query.k || '');
  if (!TENANT_ID_RE.test(tenantId) || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) {
    res.status(404).send('Agenda não encontrada');
    return;
  }
  try {
    const out = (await executeOp(env(), {
      op: 'calendar.icsFeed',
      input: { tenantId, token },
      actor: SYSTEM_ACTOR,
      ip: req.ip || '0.0.0.0',
      internal: true,
    })) as { ics: string };
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    res.status(200).send(out.ics);
  } catch (err) {
    if (err instanceof OpError && ['not-found', 'permission-denied', 'invalid-argument', 'failed-precondition'].includes(err.code)) {
      res.status(404).send('Agenda não encontrada');
      return;
    }
    if (err instanceof OpError && err.code === 'resource-exhausted') {
      res.status(429).send('Muitas requisições');
      return;
    }
    logger.error('ics_falhou', { codigo: err instanceof OpError ? err.code : (err as Error)?.name || 'desconhecido' });
    res.status(500).send('Erro');
  }
});

// ---------- Rotinas diárias ----------
export const daily = onSchedule(
  { schedule: '30 5 * * *', timeZone: 'America/Sao_Paulo', region: REGION, secrets: SECRETS, timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const e = env();
    let cursor: string | undefined;
    let tenants = 0;
    let failures = 0;
    for (;;) {
      const page = await e.store.query(`tenants`, { where: [['status', '==', 'ativa']], orderBy: [['__name__', 'asc']], limit: 100, startAfterId: cursor });
      if (!page.length) break;
      for (const t of page) {
        tenants++;
        try {
          const results = await runDailyJobs(e, t.id);
          const bad = results.filter(r => !r.ok);
          failures += bad.length;
          if (bad.length) logger.warn('rotina_com_falha', { tenantId: t.id, rotinas: bad.map(b => b.job).join(',') });
        } catch (err) {
          failures++;
          logger.error('rotinas_falharam', { tenantId: t.id, codigo: (err as Error)?.name || 'desconhecido' });
        }
      }
      cursor = page[page.length - 1].id;
      if (page.length < 100) break;
    }
    logger.info('rotinas_diarias', { sociedades: tenants, falhas: failures });
  }
);

// ---------- Conferência de uploads ----------
export const uploadGuard = onObjectFinalized({ region: REGION, memory: '256MiB', timeoutSeconds: 60 }, async event => {
  const obj = event.data;
  const path = obj.name || '';
  if (!path.startsWith('tenants/')) return;
  const file = getStorage(app()).bucket(obj.bucket).file(path);
  let head = new Uint8Array();
  try {
    const [buf] = await file.download({ start: 0, end: 15 });
    head = new Uint8Array(buf);
  } catch {
    // sem leitura não dá para confiar: trata como inválido
  }
  const verdict = judgeUpload(path, Number(obj.size || 0), obj.contentType, head);
  if (!verdict || verdict.ok) return;
  await file.delete({ ignoreNotFound: true });
  const tenantId = path.split('/')[1] || '';
  logger.warn('upload_removido', { tenantId, motivo: verdict.reason });
  // TODO(fase 9): remover EXIF e redimensionar fotos (ex.: sharp) antes de liberar a leitura
});

// ---------- Espelho mínimo para as regras do Storage ----------
// As regras do Storage só consultam o banco (default). Se o principal for nomeado, copiamos para lá
// apenas o necessário para decidir acesso a arquivos (permissões do vínculo e dono do cadastro).
const MIRROR_ON = !IS_EMULATOR && DB_ID !== '(default)';

function mirrorDb() {
  return getFirestore(app());
}

export const mirrorMembership = MIRROR_ON
  ? onDocumentWritten({ document: 'tenants/{t}/memberships/{uid}', database: DB_ID, region: REGION }, async event => {
      const { t, uid } = event.params as { t: string; uid: string };
      const ref = mirrorDb().doc(`tenants/${t}/memberships/${uid}`);
      const after = event.data?.after?.data();
      if (!after) {
        await ref.delete();
        return;
      }
      await ref.set({
        perms: after.perms || {},
        board: after.board === true,
        active: after.active === true,
        ...(after.memberId ? { memberId: after.memberId } : {}),
        ...(typeof after.expiresAtMs === 'number' ? { expiresAtMs: after.expiresAtMs } : {}),
      });
    })
  : undefined;

export const mirrorMember = MIRROR_ON
  ? onDocumentWritten({ document: 'tenants/{t}/members/{id}', database: DB_ID, region: REGION }, async event => {
      const { t, id } = event.params as { t: string; id: string };
      const ref = mirrorDb().doc(`tenants/${t}/members/${id}`);
      const after = event.data?.after?.data();
      if (!after) {
        await ref.delete();
        return;
      }
      await ref.set({ ...(after.uid ? { uid: after.uid } : {}), ...(after.dependentOf ? { dependentOf: after.dependentOf } : {}) });
    })
  : undefined;

// ---------- stripeWebhook (só existe com STRIPE_ENABLED=true) ----------
async function planForPrice(priceId: string): Promise<{ planId: string; period: 'mensal' | 'anual' } | null> {
  const rows = await getFirestore(app(), DB_ID).collection('plans').get();
  for (const d of rows.docs) {
    const p = d.data() as PlanDoc;
    if (p.stripePriceMonthly === priceId) return { planId: d.id, period: 'mensal' };
    if (p.stripePriceAnnual === priceId) return { planId: d.id, period: 'anual' };
  }
  return null;
}

export const stripeWebhook = STRIPE_WEBHOOK_SECRET
  ? onRequest({ region: REGION, secrets: [...SECRETS, STRIPE_WEBHOOK_SECRET], timeoutSeconds: 60 }, async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).send('Método não permitido');
        return;
      }
      const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
      if (!verifyStripeSignature(raw, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET!.value())) {
        res.status(400).send('Assinatura inválida');
        return;
      }
      try {
        const ev = JSON.parse(raw);
        const o = ev?.data?.object || {};
        const price = o.items?.data?.[0]?.price?.id || o.lines?.data?.[0]?.price?.id || '';
        const mapped = stripeEventToOp(ev, () => null);
        if (mapped && !mapped.planId && price) Object.assign(mapped, (await planForPrice(price)) || {});
        if (mapped) await executeOp(env(), { op: 'billing.stripeEvent', input: mapped, actor: SYSTEM_ACTOR, internal: true });
        res.status(200).send('ok');
      } catch (e) {
        logger.error('stripe_webhook_falhou', { erro: (e as Error).name });
        res.status(500).send('erro');
      }
    })
  : undefined;
