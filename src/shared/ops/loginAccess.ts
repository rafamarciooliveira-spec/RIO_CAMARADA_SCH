/**
 * Entrada por CPF e senha (para quem não usa a conta Google, como muitos sócios de mais idade).
 *
 * 1. A diretoria gera, no cadastro do sócio, um código de primeiro acesso (6 números, 3 dias, uso único).
 *    Ninguém da diretoria fica sabendo a senha. Basta o nome e o telefone (pré-cadastro).
 * 2. A pessoa abre /primeiro-acesso, digita o telefone (ou o CPF) + o código. Se o cadastro está incompleto,
 *    completa ali mesmo (CPF, nascimento, aceites) e escolhe a própria senha. O servidor cria a conta de login
 *    (ou põe a senha na conta Google que ela já tinha) e liga ao cadastro.
 * 3. Depois entra com CPF + senha: o servidor confere a senha (hash próprio) e só então devolve o e-mail
 *    interno da conta, que a tela usa para entrar. Errou 5 vezes: trava 15 minutos.
 * Esqueceu a senha: a diretoria gera outro código.
 */
import { z } from 'zod';
import { defineOp, fail, zDateKey, zId, zTenant, zText, type OpContext } from '../core/ops.ts';
import { deleteField } from '../core/store.ts';
import { P } from '../paths.ts';
import { cleanCPF, validateCPF } from '../cpf.ts';
import { ageOn, birthMonthDay, localDateKey } from '../dates.ts';
import { phoneDigits, phoneTail } from '../phone.ts';
import { hashPassword, verifyPassword, weakPassword } from '../passwordHash.ts';
import type { MemberDoc, MemberPiiDoc, TenantDoc, TenantSettings } from '../types.ts';
import { boardUids, getSettings, notify, shortName, tid } from './helpers.ts';
import { approveCore, buildConsents, cpfFields, createMemberCore, writeCpfIndex, zConsents, zPersonal } from './members.ts';
import { upsertMembership } from './access.ts';

const CODE_HOURS = 72;
const MAX_TRIES = 5;
const LOCK_MIN = 15;
const GONE = ['desligado', 'rejeitado'];

interface AccessCodeDoc {
  codeHash: string;
  expiresAt: string;
  tries: number;
  phoneKey?: string; // para achar o cadastro pelo telefone no primeiro acesso
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
const zLogin = z.string().min(8).max(25); // telefone ou CPF

/** Índice da conta pelo CPF (o mesmo em todas as sociedades: uma pessoa, uma conta) */
const loginHash = async (ctx: OpContext, cpf: string) => (await ctx.crypto.hmacHex(`login:${cpf}`)).slice(0, 40);
const internalEmail = (hash: string) => `c${hash.slice(0, 32)}@acesso.verein.app`;
const phoneKey = async (ctx: OpContext, t: string, phone: string | undefined) => {
  const tail = phoneTail(phone);
  return tail ? (await ctx.crypto.hmacHex(`${t}:fone:${tail}`)).slice(0, 40) : '';
};

function sixDigits(): string {
  const n = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

async function auditTenant(ctx: OpContext, t: string, action: string, targetId: string, who: string) {
  await ctx.store.add(P.audit(t), { action, actorUid: ctx.actor?.uid || 'sistema', actorName: who, targetId, at: ctx.nowIso });
}

const noServer = () => fail('failed-precondition', 'A entrada por CPF e senha não está disponível neste servidor.');

/** Diretoria: código de primeiro acesso (ou de troca de senha) para um sócio */
export const createAccessCode = defineOp({
  name: 'access.createCode',
  input: zTenant.extend({ memberId: zId }),
  auth: 'user',
  tenant: { perm: ['socios', 'editar'] },
  rateLimit: { per: 'uid', max: 60, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) noServer();
    return issueCode(ctx, input.memberId);
  },
});

/** Gera o código de um sócio (usado por um, por vários e pelo pré-cadastro) */
async function issueCode(ctx: OpContext, memberId: string) {
  const t = tid(ctx);
  const m = await ctx.store.get<MemberDoc>(P.member(t, memberId));
  if (!m) fail('not-found', 'Cadastro não encontrado.');
  if (GONE.includes(m!.status)) fail('failed-precondition', 'Este cadastro está desligado ou recusado.');
  const pii = await ctx.store.get<MemberPiiDoc>(P.memberPii(t, memberId));
  const pk = await phoneKey(ctx, t, pii?.phone);
  if (!pii?.cpfHmac && !pk) fail('failed-precondition', `${shortName(m!.fullName)} não tem telefone nem CPF no cadastro. Inclua o telefone (Editar) e gere o código de novo.`);
  const code = sixDigits();
  const expiresAt = new Date(ctx.now().getTime() + CODE_HOURS * 3600_000).toISOString();
  const doc: AccessCodeDoc = { codeHash: await ctx.crypto.sha256Hex(`${memberId}:${code}`), expiresAt, tries: 0, ...(pk ? { phoneKey: pk } : {}), createdBy: ctx.actor!.uid, createdAt: ctx.nowIso };
  await ctx.store.set(P.accessCode(t, memberId), doc as unknown as Record<string, unknown>);
  await ctx.audit('access.code_created', memberId);
  return { code, expiresAt, link: `${ctx.appUrl}/${ctx.tenant!.slug}/primeiro-acesso`, hasLogin: !!m!.uid, byPhone: !!pk, phone: pii?.phone || '' };
}

/** Códigos para vários sócios de uma vez (folhas impressas para entregar em evento ou na secretaria) */
export const createAccessCodes = defineOp({
  name: 'access.createCodes',
  input: zTenant.extend({ memberIds: z.array(zId).min(1).max(60) }),
  auth: 'user',
  tenant: { perm: ['socios', 'editar'] },
  rateLimit: { per: 'uid', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) noServer();
    const done: { memberId: string; name: string; code: string; expiresAt: string; link: string; byPhone: boolean }[] = [];
    const skipped: { memberId: string; name: string; reason: string }[] = [];
    for (const id of [...new Set(input.memberIds)]) {
      const m = await ctx.store.get<MemberDoc>(P.member(tid(ctx), id));
      try {
        const r = await issueCode(ctx, id);
        done.push({ memberId: id, name: m?.fullName || '', code: r.code, expiresAt: r.expiresAt, link: r.link, byPhone: r.byPhone });
      } catch (e) {
        skipped.push({ memberId: id, name: m?.fullName || '', reason: (e as Error).message });
      }
    }
    return { done, skipped };
  },
});

/**
 * Pré-cadastro da diretoria: só o nome e o telefone (e a categoria). Já sai com o código de primeiro acesso;
 * a própria pessoa completa CPF, nascimento e os aceites quando entra a primeira vez.
 */
export const preRegister = defineOp({
  name: 'members.preRegister',
  input: zTenant.extend({ fullName: zText(150).min(3), phone: zText(30), categoryId: zId, approve: z.boolean().default(false) }),
  auth: 'user',
  tenant: { perm: ['socios', 'criar'] },
  idempotent: true,
  async run(ctx, input) {
    if (!ctx.authAdmin) noServer();
    if (input.fullName.trim().split(/\s+/).length < 2) fail('invalid-argument', 'Escreva o nome completo (nome e sobrenome).');
    const d = phoneDigits(input.phone);
    if (d.length < 10 || d.length > 11) fail('invalid-argument', 'Informe o telefone com DDD, por exemplo (47) 99999-9999.');
    ctx.require('socios', 'editar'); // o código é gerado junto
    const memberId = await createMemberCore(ctx, {
      data: { fullName: input.fullName.trim(), phone: input.phone.trim(), categoryId: input.categoryId },
      consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false },
      status: 'pendente',
      pre: true,
    });
    if (input.approve) {
      ctx.require('socios', 'aprovar');
      await approveCore(ctx, memberId, {});
    }
    await ctx.audit('members.pre_registered', memberId);
    const code = await issueCode(ctx, memberId);
    return { memberId, ...code };
  },
});

/** Acha o cadastro pelo telefone ou pelo CPF e confere o código (conta tentativa errada) */
async function matchCode(ctx: OpContext, t: string, login: string, code: string) {
  const wrong = () => fail('permission-denied', 'Telefone ou código não conferem. Confira os números ou peça um código novo à diretoria.');
  const digits = login.replace(/\D/g, '');
  const ids = new Set<string>();
  if (digits.length === 11 && validateCPF(digits)) {
    const idx = await ctx.store.get<{ memberId: string }>(P.cpfIndex(t, await ctx.crypto.hmacHex(`${t}:${digits}`)));
    if (idx) ids.add(idx.memberId);
  }
  const pk = await phoneKey(ctx, t, digits);
  if (pk) for (const s of await ctx.store.query<AccessCodeDoc>(P.accessCodes(t), { where: [['phoneKey', '==', pk]], limit: 20 })) ids.add(s.id);
  const docs: { id: string; doc: AccessCodeDoc }[] = [];
  for (const id of ids) {
    const doc = await ctx.store.get<AccessCodeDoc>(P.accessCode(t, id));
    if (doc) docs.push({ id, doc });
  }
  if (!docs.length) wrong();
  for (const x of docs) {
    if ((await ctx.crypto.sha256Hex(`${x.id}:${code}`)) !== x.doc.codeHash) continue;
    if (x.doc.expiresAt < ctx.nowIso) fail('failed-precondition', 'Este código venceu. Peça um código novo à diretoria.');
    if (x.doc.tries >= MAX_TRIES) fail('failed-precondition', 'Muitas tentativas com este código. Peça um código novo à diretoria.');
    const m = await ctx.store.get<MemberDoc>(P.member(t, x.id));
    if (!m || GONE.includes(m.status)) fail('failed-precondition', 'Este cadastro está desligado ou recusado. Fale com a diretoria.');
    return { memberId: x.id, m: m! };
  }
  for (const x of docs) await ctx.store.update(P.accessCode(t, x.id), { tries: (x.doc.tries || 0) + 1 });
  if (docs.every(x => x.doc.tries + 1 >= MAX_TRIES)) fail('failed-precondition', 'Muitas tentativas com este código. Peça um código novo à diretoria.');
  return wrong();
}

/** O que falta no cadastro para a própria pessoa completar no primeiro acesso */
async function missingFor(ctx: OpContext, t: string, m: MemberDoc) {
  const pii = (await ctx.store.get<MemberPiiDoc>(P.memberPii(t, m.id))) || ({ consents: [] } as unknown as MemberPiiDoc);
  const s = await ctx.store.get<TenantSettings>(P.settings(t));
  const customFields = m.preCadastro ? (s?.customFields || []).filter(f => f.required && !m.custom?.[f.id]) : [];
  return {
    pii,
    needCpf: !pii.cpfHmac,
    needBirthDate: !pii.birthDate,
    needConsents: !!m.preCadastro || !(pii.consents || []).length,
    customFields,
    needPhoto: !m.photoPath && s?.cardRequiresPhoto !== false,
  };
}

/** Primeiro acesso, passo 1: confere telefone (ou CPF) e código e diz o que falta preencher */
export const checkAccessCode = defineOp({
  name: 'access.check',
  input: z.object({ tenantId: zId, login: zLogin, code: zCode }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) noServer();
    const t = input.tenantId;
    if (!(await ctx.store.get<TenantDoc>(P.tenant(t)))) fail('not-found', 'Sociedade não encontrada.');
    const { m } = await matchCode(ctx, t, input.login, input.code);
    const need = await missingFor(ctx, t, m);
    return {
      firstName: m.fullName.split(' ')[0],
      needCpf: need.needCpf,
      needBirthDate: need.needBirthDate,
      needConsents: need.needConsents,
      needPhoto: need.needPhoto,
      customFields: need.customFields.map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options || [] })),
    };
  },
});

/** Primeiro acesso (ou troca de senha): telefone ou CPF + código + o que faltava no cadastro + a senha */
export const redeemAccessCode = defineOp({
  name: 'access.redeem',
  input: z.object({
    tenantId: zId,
    login: zLogin.optional(),
    cpf: zCpf.optional(), // telas antigas mandavam só o CPF
    code: zCode,
    password: z.string().min(1).max(64),
    data: z.object({ cpf: zText(20).optional(), birthDate: zDateKey.optional(), custom: z.record(zId, zText(300)).optional() }).optional(),
    consents: zConsents.optional(),
  }),
  auth: 'public',
  rateLimit: { per: 'ip', max: 20, windowSec: 3600 },
  async run(ctx, input) {
    if (!ctx.authAdmin) noServer();
    const t = input.tenantId;
    const tenant = await ctx.store.get<TenantDoc>(P.tenant(t));
    if (!tenant) fail('not-found', 'Sociedade não encontrada.');
    const login = input.login || input.cpf;
    if (!login) fail('invalid-argument', 'Digite o telefone ou o CPF.');
    const { memberId, m } = await matchCode(ctx, t, login!, input.code);
    ctx.tenantId = t;
    ctx.tenant = tenant!;
    const need = await missingFor(ctx, t, m);
    const d = input.data || {};

    // O que faltava: tudo conferido antes de criar a conta e gastar o código
    let cpf = need.pii.cpfEnc ? await ctx.crypto.decrypt(need.pii.cpfEnc) : '';
    const piiPatch: Record<string, unknown> = { updatedAt: ctx.nowIso };
    const basic: Record<string, unknown> = { updatedAt: ctx.nowIso };
    let cpfHmac: string | undefined;
    if (need.needCpf) {
      cpf = cleanCPF(d.cpf || '');
      if (!validateCPF(cpf)) fail('invalid-argument', 'Confira o CPF: os números não batem.');
      // CPF de quem já tem senha no portal: não deixa trocar a senha de outra pessoa por aqui
      if (await ctx.store.get(P.loginIndex(await loginHash(ctx, cpf)))) fail('already-exists', 'Este CPF já tem senha no portal. Entre com CPF e senha, ou fale com a diretoria.');
      const c = await cpfFields(ctx, cpf, memberId);
      Object.assign(piiPatch, c);
      cpfHmac = c.cpfHmac;
    }
    if (need.needBirthDate) {
      const today = localDateKey(ctx.now(), tenant!.timezone);
      if (!d.birthDate || d.birthDate > today) fail('invalid-argument', 'Informe a data de nascimento.');
      if (ageOn(d.birthDate!, today) < 18) fail('invalid-argument', 'Menores de 18 anos entram como dependente de um responsável. Fale com a diretoria.');
      piiPatch.birthDate = d.birthDate;
      Object.assign(basic, { birthMonthDay: birthMonthDay(d.birthDate), birthYear: Number(d.birthDate!.slice(0, 4)), isMinor: false });
    }
    if (need.needConsents) {
      if (!input.consents?.cadastro) fail('invalid-argument', 'Marque o aceite para continuar.');
      piiPatch.consents = buildConsents(ctx, input.consents!);
    }
    if (need.customFields.length) {
      const custom = { ...(m.custom || {}) };
      for (const f of need.customFields) {
        const v = d.custom?.[f.id]?.trim();
        if (!v) fail('invalid-argument', `Preencha o campo "${f.label}".`);
        custom[f.id] = v!;
      }
      basic.custom = custom;
    }
    if (m.preCadastro) basic.preCadastro = deleteField();
    const weak = weakPassword(input.password, cpf);
    if (weak) fail('invalid-argument', weak);

    const hash = await loginHash(ctx, cpf);
    const prev = await ctx.store.get<LoginIndexDoc>(P.loginIndex(hash));
    // Quem já entrava com a conta Google ganha a senha na mesma conta (um cadastro, uma conta)
    const acc = await ctx.authAdmin!.setPassword({ uid: m.uid || prev?.uid, email: internalEmail(hash), password: input.password, displayName: m.fullName });
    const entry: LoginIndexDoc = { uid: acc.uid, email: acc.email, pwHash: await hashPassword(input.password), fails: 0, updatedAt: ctx.nowIso };
    await ctx.store.set(P.loginIndex(hash), entry as unknown as Record<string, unknown>);
    if (!m.uid) basic.uid = acc.uid;
    await ctx.store.update(P.member(t, memberId), basic);
    await ctx.store.set(P.memberPii(t, memberId), piiPatch, { merge: true });
    if (cpfHmac) await writeCpfIndex(ctx, cpfHmac, memberId);
    await upsertMembership(ctx, tenant!, { uid: acc.uid, email: acc.email, displayName: m.fullName }, ['socio'], memberId);
    await ctx.store.delete(P.accessCode(t, memberId));
    await auditTenant(ctx, t, 'access.code_redeemed', memberId, m.fullName);
    if (m.preCadastro) {
      ctx.actor = { uid: acc.uid, email: acc.email, emailVerified: true, displayName: m.fullName, master: false, mfa: false };
      for (const uid of await boardUids(ctx)) await notify(ctx, uid, 'Cadastro completado', `${shortName(m.fullName)} completou o cadastro no primeiro acesso.`, 'socios');
    }
    return { email: acc.email, memberId };
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

export const loginAccessOps = [createAccessCode, createAccessCodes, preRegister, checkAccessCode, redeemAccessCode, loginWithCpf, openFormOptions, applyOpen];
