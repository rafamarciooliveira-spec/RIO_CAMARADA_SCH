/**
 * Entrada por CPF e senha (para quem não usa a conta Google, como muitos sócios de mais idade).
 *
 * 1. A diretoria gera, no cadastro do sócio, um código de primeiro acesso (6 números, 3 dias, uso único).
 *    Ninguém da diretoria fica sabendo a senha.
 * 2. A pessoa abre /primeiro-acesso, digita CPF + código e escolhe a própria senha. O servidor cria a conta
 *    de login (ou põe a senha na conta Google que ela já tinha) e liga ao cadastro.
 * 3. Depois entra com CPF + senha: o servidor confere a senha (hash próprio) e só então devolve o e-mail
 *    interno da conta, que a tela usa para entrar. Errou 5 vezes: trava 15 minutos.
 * Esqueceu a senha: a diretoria gera outro código.
 */
import { z } from 'zod';
import { defineOp, fail, zId, zTenant, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { cleanCPF, validateCPF } from '../cpf.ts';
import { hashPassword, verifyPassword, weakPassword } from '../passwordHash.ts';
import type { MemberDoc, MemberPiiDoc, TenantDoc, TenantSettings } from '../types.ts';
import { boardUids, getSettings, notify, shortName, tid } from './helpers.ts';
import { approveCore, createMemberCore, zConsents, zPersonal } from './members.ts';
import { upsertMembership } from './access.ts';

const CODE_HOURS = 72;
const MAX_TRIES = 5;
const LOCK_MIN = 15;
const GONE = ['desligado', 'rejeitado'];

interface AccessCodeDoc {
  codeHash: string;
  expiresAt: string;
  tries: number;
  createdBy: string;
  createdAt: string;
}

interface LoginIndexDoc {
  uid: string;
  email: string;
  pwHash: string;
  fails: number;
  lockedUntil?: string;
  updatedAt: string;
}

const zCpf = z.string().min(11).max(20);
const zCode = z.string().regex(/^\d{6}$/, 'O código tem 6 números.');

/** Índice da conta pelo CPF (o mesmo em todas as sociedades: uma pessoa, uma conta) */
const loginHash = async (ctx: OpContext, cpf: string) => (await ctx.crypto.hmacHex(`login:${cpf}`)).slice(0, 40);
const internalEmail = (hash: string) => `c${hash.slice(0, 32)}@acesso.verein.app`;

function sixDigits(): string {
  const n = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

async function auditTenant(ctx: OpContext, t: string, action: string, targetId: string, who: string) {
  await ctx.store.add(P.audit(t), { action, actorUid: ctx.actor?.uid || 'sistema', actorName: who, targetId, at: ctx.nowIso });
}

/** Diretoria: código de primeiro acesso (ou de troca de senha) para um sócio */
export const createAccessCode = defineOp({
  name: 'access.createCode',
  input: zTenant.extend({ memberId: zId }),
  auth: 'user',
  tenant: { perm: ['socios', 'editar'] },
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) fail('failed-precondition', 'A entrada por CPF e senha não está disponível neste servidor.');
    return issueCode(ctx, input.memberId);
  },
});

/** Gera o código de um sócio (usado por um e por vários) */
async function issueCode(ctx: OpContext, memberId: string) {
  const input = { memberId };
  {
    const t = tid(ctx);
    const m = await ctx.store.get<MemberDoc>(P.member(t, input.memberId));
    if (!m) fail('not-found', 'Cadastro não encontrado.');
    if (GONE.includes(m!.status)) fail('failed-precondition', 'Este cadastro está desligado ou recusado.');
    const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, input.memberId));
    if (!pii?.cpfHmac) fail('failed-precondition', `${shortName(m!.fullName)} não tem CPF no cadastro. Inclua o CPF (Editar) e gere o código de novo: a entrada é pelo CPF.`);
    const code = sixDigits();
    const expiresAt = new Date(ctx.now().getTime() + CODE_HOURS * 3600_000).toISOString();
    const doc: AccessCodeDoc = { codeHash: await ctx.crypto.sha256Hex(`${input.memberId}:${code}`), expiresAt, tries: 0, createdBy: ctx.actor!.uid, createdAt: ctx.nowIso };
    await ctx.store.set(P.accessCode(t, input.memberId), doc as unknown as Record<string, unknown>);
    await ctx.audit('access.code_created', input.memberId);
    return { code, expiresAt, link: `${ctx.appUrl}/${ctx.tenant!.slug}/primeiro-acesso`, hasLogin: !!m!.uid };
  }
}

/** Códigos para vários sócios de uma vez (folhas impressas para entregar em evento ou na secretaria) */
export const createAccessCodes = defineOp({
  name: 'access.createCodes',
  input: zTenant.extend({ memberIds: z.array(zId).min(1).max(60) }),
  auth: 'user',
  tenant: { perm: ['socios', 'editar'] },
  rateLimit: { per: 'uid', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) fail('failed-precondition', 'A entrada por CPF e senha não está disponível neste servidor.');
    const done: { memberId: string; name: string; code: string; expiresAt: string; link: string }[] = [];
    const skipped: { memberId: string; name: string; reason: string }[] = [];
    for (const id of [...new Set(input.memberIds)]) {
      const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), id));
      try {
        const r = await issueCode(ctx, id);
        done.push({ memberId: id, name: m?.fullName || '', code: r.code, expiresAt: r.expiresAt, link: r.link });
      } catch (e) {
        skipped.push({ memberId: id, name: m?.fullName || '', reason: (e as Error).message });
      }
    }
    return { done, skipped };
  },
});

/** Primeiro acesso (ou troca de senha): CPF + código da diretoria + a senha que a pessoa escolheu */
export const redeemAccessCode = defineOp({
  name: 'access.redeem',
  input: z.object({ tenantId: zId, cpf: zCpf, code: zCode, password: z.string().min(1).max(64) }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) fail('failed-precondition', 'A entrada por CPF e senha não está disponível neste servidor.');
    const t = input.tenantId;
    const tenant = await ctx.store.get<TenantDoc>(P.tenant(t));
    if (!tenant) fail('not-found', 'Sociedade não encontrada.');
    const cpf = cleanCPF(input.cpf);
    const wrong = () => fail('permission-denied', 'CPF ou código não conferem. Confira os números ou peça um código novo à diretoria.');
    if (!validateCPF(cpf)) wrong();
    const idx = await ctx.store.get<{ memberId: string }>(P.cpfIndex(t, await ctx.crypto.hmacHex(`${t}:${cpf}`)));
    if (!idx) wrong();
    const memberId = idx!.memberId;
    const codeDoc = await ctx.store.get<AccessCodeDoc>(P.accessCode(t, memberId));
    if (!codeDoc) wrong();
    if (codeDoc!.expiresAt < ctx.nowIso) fail('failed-precondition', 'Este código venceu. Peça um código novo à diretoria.');
    if (codeDoc!.tries >= MAX_TRIES) fail('failed-precondition', 'Muitas tentativas com este código. Peça um código novo à diretoria.');
    if ((await ctx.crypto.sha256Hex(`${memberId}:${input.code}`)) !== codeDoc!.codeHash) {
      await ctx.store.update(P.accessCode(t, memberId), { tries: codeDoc!.tries + 1 });
      wrong();
    }
    const weak = weakPassword(input.password, cpf);
    if (weak) fail('invalid-argument', weak);
    const m = await ctx.store.get<MemberDoc>(P.member(t, memberId));
    if (!m || GONE.includes(m.status)) fail('failed-precondition', 'Este cadastro está desligado ou recusado. Fale com a diretoria.');

    const hash = await loginHash(ctx, cpf);
    const prev = await ctx.store.get<LoginIndexDoc>(P.loginIndex(hash));
    // Quem já entrava com a conta Google ganha a senha na mesma conta (um cadastro, uma conta)
    const acc = await ctx.authAdmin!.setPassword({ uid: m!.uid || prev?.uid, email: internalEmail(hash), password: input.password, displayName: m!.fullName });
    const entry: LoginIndexDoc = { uid: acc.uid, email: acc.email, pwHash: await hashPassword(input.password), fails: 0, updatedAt: ctx.nowIso };
    await ctx.store.set(P.loginIndex(hash), entry as unknown as Record<string, unknown>);
    if (!m!.uid) await ctx.store.update(P.member(t, memberId), { uid: acc.uid, updatedAt: ctx.nowIso });
    await upsertMembership(ctx, tenant!, { uid: acc.uid, email: acc.email, displayName: m!.fullName }, ['socio'], memberId);
    await ctx.store.delete(P.accessCode(t, memberId));
    await auditTenant(ctx, t, 'access.code_redeemed', memberId, m!.fullName);
    return { email: acc.email };
  },
});

/** Entrar com CPF e senha: confere a senha e devolve o e-mail interno da conta (a tela entra com ele) */
export const loginWithCpf = defineOp({
  name: 'access.login',
  input: z.object({ cpf: zCpf, password: z.string().min(1).max(64) }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 30, windowSec: 900 },
  async run(ctx, input) {
    const cpf = cleanCPF(input.cpf);
    const wrong = () => fail('permission-denied', 'CPF ou senha não conferem. Esqueceu a senha? Peça um código novo à diretoria.');
    if (!validateCPF(cpf)) wrong();
    const hash = await loginHash(ctx, cpf);
    const entry = await ctx.store.get<LoginIndexDoc>(P.loginIndex(hash));
    if (!entry) {
      // Mesmo tempo de resposta de quem existe: não revela se o CPF tem conta
      await verifyPassword(input.password, 'pbkdf2$120000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      wrong();
    }
    if (entry!.lockedUntil && entry!.lockedUntil > ctx.nowIso) fail('resource-exhausted', `Muitas tentativas erradas. Espere ${LOCK_MIN} minutos e tente de novo, ou peça um código novo à diretoria.`);
    if (!(await verifyPassword(input.password, entry!.pwHash))) {
      const fails = (entry!.fails || 0) + 1;
      await ctx.store.update(P.loginIndex(hash), { fails, ...(fails >= MAX_TRIES ? { lockedUntil: new Date(ctx.now().getTime() + LOCK_MIN * 60_000).toISOString(), fails: 0 } : {}) });
      wrong();
    }
    if (entry!.fails) await ctx.store.update(P.loginIndex(hash), { fails: 0 });
    return { email: entry!.email };
  },
});

/** Opções da ficha sem conta Google (quem ainda não tem login nenhum): só o necessário para preencher */
export const openFormOptions = defineOp({
  name: 'members.openFormOptions',
  input: z.object({ tenantId: zId }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 120, windowSec: 3600 },
  async run(ctx, input) {
    const tenant = await ctx.store.get<TenantDoc>(P.tenant(input.tenantId));
    if (!tenant || tenant.status !== 'ativa') fail('not-found', 'Sociedade não encontrada.');
    if (tenant!.loginMethods?.cpfPassword === false || !ctx.authAdmin) return { enabled: false, categories: [], customFields: [], requirePhoto: true, approvalRequired: true };
    const s = await ctx.store.get<TenantSettings>(P.settings(input.tenantId));
    return {
      enabled: true,
      categories: (s?.categories || []).filter(c => c.id !== 'dependente').map(c => ({ id: c.id, name: c.name, feeCents: c.feeCents, period: c.period, allowsDependents: c.allowsDependents })),
      // Só os campos obrigatórios: a ficha é curta (o resto a pessoa completa depois no perfil)
      customFields: (s?.customFields || []).filter(f => f.required).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options || [], required: true, sensitive: f.sensitive })),
      requirePhoto: s?.cardRequiresPhoto !== false,
      approvalRequired: s?.approvalRequired ?? true,
    };
  },
});

/**
 * Ficha sem conta Google: a própria pessoa faz o cadastro e já cria a senha (entra depois com CPF e senha).
 * O cadastro entra para aprovação da diretoria, como a ficha comum.
 */
export const applyOpen = defineOp({
  name: 'members.applyOpen',
  input: z.object({ tenantId: zId, data: zPersonal, consents: zConsents, password: z.string().min(1).max(64) }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 6, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) fail('failed-precondition', 'A entrada por CPF e senha não está disponível neste servidor.');
    const t = input.tenantId;
    const tenant = await ctx.store.get<TenantDoc>(P.tenant(t));
    if (!tenant || tenant.status !== 'ativa') fail('not-found', 'Sociedade não encontrada.');
    if (tenant!.loginMethods?.cpfPassword === false) fail('failed-precondition', 'Esta sociedade não usa cadastro com CPF e senha. Use a conta Google.');
    const cpf = cleanCPF(input.data.cpf || '');
    if (!validateCPF(cpf)) fail('invalid-argument', 'Confira o CPF: os números não batem.');
    if (!input.data.birthDate) fail('invalid-argument', 'Informe a data de nascimento.');
    if (await ctx.store.get(P.cpfIndex(t, await ctx.crypto.hmacHex(`${t}:${cpf}`)))) {
      fail('already-exists', 'Já existe um cadastro com este CPF nesta sociedade. Peça à diretoria o código de acesso para criar a sua senha.');
    }
    const hash = await loginHash(ctx, cpf);
    if (await ctx.store.get(P.loginIndex(hash))) {
      fail('already-exists', 'Você já tem senha no portal (de outra sociedade). Entre com CPF e senha e depois toque em "Quero ser sócio".');
    }
    const weak = weakPassword(input.password, cpf);
    if (weak) fail('invalid-argument', weak);
    // Contexto da sociedade para o cadastro (a operação é pública: não há vínculo ainda)
    ctx.tenantId = t;
    ctx.tenant = tenant!;
    const acc = await ctx.authAdmin!.setPassword({ email: internalEmail(hash), password: input.password, displayName: input.data.fullName });
    ctx.actor = { uid: acc.uid, email: acc.email, emailVerified: true, displayName: input.data.fullName, master: false, mfa: false };
    const memberId = await createMemberCore(ctx, { data: { ...input.data, cpf }, consents: input.consents, status: 'pendente', uid: acc.uid });
    await ctx.store.set(P.loginIndex(hash), { uid: acc.uid, email: acc.email, pwHash: await hashPassword(input.password), fails: 0, updatedAt: ctx.nowIso });
    await upsertMembership(ctx, tenant!, { uid: acc.uid, email: acc.email, displayName: input.data.fullName }, ['socio'], memberId);
    const settings = await getSettings(ctx);
    if (!settings.approvalRequired) await approveCore(ctx, memberId, {});
    else for (const uid of await boardUids(ctx)) await notify(ctx, uid, 'Novo cadastro para aprovar', `${shortName(input.data.fullName)} (ficha sem conta Google)`, 'socios');
    await ctx.audit('members.applied_open', memberId);
    return { email: acc.email, memberId };
  },
});

export const loginAccessOps = [createAccessCode, createAccessCodes, redeemAccessCode, loginWithCpf, openFormOptions, applyOpen];
