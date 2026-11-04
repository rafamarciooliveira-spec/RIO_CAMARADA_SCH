/**
 * Primeira configuração do projeto REAL (rodar uma vez, depois de publicar Functions e regras):
 *  1. cria (ou acha) as contas dos administradores gerais e dá a claim `master`;
 *  2. cria os planos;
 *  3. cria a sociedade inicial (dados em functions/scripts/bootstrap/<arquivo>.json), com logo e cores,
 *     e coloca os administradores gerais como presidência dela.
 *
 * Os e-mails NUNCA ficam no código: vêm pela linha de comando.
 * Usa as credenciais padrão do gcloud (sem arquivo de conta de serviço):
 *   gcloud auth application-default login
 *   npx tsx functions/scripts/bootstrap/bootstrap-prod.mts --project sodalis-5be4d --masters email1,email2 --tenant functions/scripts/bootstrap/riocamarada.json
 *
 * É seguro rodar de novo: o que já existe é mantido e só a identidade visual é atualizada.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { AdminStore } from '../../src/adminStore.ts';
import { createWebCrypto, ephemeralKeys, simulatedMail } from '../../../src/shared/core/ports.ts';
import { createSandboxPayments } from '../../../src/shared/core/sandboxPayments.ts';
import { registerAllOps } from '../../../src/shared/ops/index.ts';
import { createTenantCore } from '../../../src/shared/ops/platform.ts';
import { upsertMembership } from '../../../src/shared/ops/access.ts';
import { P } from '../../../src/shared/paths.ts';
import { MODULE_IDS } from '../../../src/shared/modules.ts';
import type { Actor, Env, OpContext } from '../../../src/shared/core/ops.ts';
import type { SlugDoc, TenantDoc } from '../../../src/shared/types.ts';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] || '' : '';
}

const project = arg('project');
const masters = arg('masters').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
const tenantFile = arg('tenant');
if (!project || masters.length === 0) {
  console.error('Uso: npx tsx functions/scripts/bootstrap/bootstrap-prod.mts --project ID --masters email1,email2 [--tenant arquivo.json]');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) console.log('Atenção: FIRESTORE_EMULATOR_HOST definido, rodando contra o emulador.');

interface TenantSeed {
  name: string;
  shortName: string;
  slug: string;
  societyType: string;
  city: string;
  state: string;
  subtitle: string;
  foundedYear?: number;
  about: string;
  logoFile: string;
  colors: { primary: string; secondary: string; accent: string; text: string };
}

const onEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const app = initializeApp({
  ...(onEmulator ? {} : { credential: applicationDefault() }),
  projectId: project,
  storageBucket: onEmulator ? `${project}.appspot.com` : `${project}.firebasestorage.app`,
});
const auth = getAuth(app);
registerAllOps();
const store = new AdminStore(app, '(default)');
const crypto = createWebCrypto(ephemeralKeys()); // só hash e sorteio aqui (nenhum CPF é gravado)
const env: Env = {
  store,
  crypto,
  mail: simulatedMail,
  payments: createSandboxPayments(crypto, 'nao-usado'),
  files: { signedUrl: async () => null, remove: async () => undefined },
  now: () => new Date(),
  appUrl: 'https://vereinapp.vercel.app',
  demo: false,
};

async function ensureUser(email: string) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    // Conta criada já verificada; ao entrar com o Google pelo mesmo e-mail, o Firebase vincula a ela
    return auth.createUser({ email, emailVerified: true });
  }
}

const actors: Actor[] = [];
for (const email of masters) {
  const u = await ensureUser(email);
  await auth.setCustomUserClaims(u.uid, { ...(u.customClaims || {}), master: true });
  actors.push({ uid: u.uid, email, emailVerified: true, displayName: u.displayName || email.split('@')[0], master: true, mfa: true });
  console.log(`Administrador geral: ${email.replace(/(.{3}).*(@.*)/, '$1***$2')}`);
}

// Preços por sócio titular ativo, por mês (dependentes não contam). Os ids do Stripe entram depois pelo painel.
const keepStripe = async (id: string) => {
  const cur = await store.get<{ stripePriceMonthly?: string; stripePriceAnnual?: string }>(P.plan(id));
  return { ...(cur?.stripePriceMonthly ? { stripePriceMonthly: cur.stripePriceMonthly } : {}), ...(cur?.stripePriceAnnual ? { stripePriceAnnual: cur.stripePriceAnnual } : {}) };
};
await store.set(P.plan('essencial'), {
  id: 'essencial',
  name: 'Essencial',
  description: 'Para organizar o quadro de sócios.',
  maxMembers: 300,
  modules: ['sociedade', 'papeis', 'socios', 'pii', 'carteirinha', 'portaria', 'avisos', 'agenda', 'auditoria', 'noticias', 'organograma'],
  priceCents: 0,
  pricePerMemberCents: 190,
  minMonthlyCents: 6900,
  highlights: ['Cadastro pelo link, com dependentes e aprovação', 'Carteirinha digital com QR que se confere', 'Portaria com leitura do QR', 'Avisos, agenda e notícias da região', 'Organograma e passagem de cargo', 'Notificação no celular'],
  ...(await keepStripe('essencial')),
  active: true,
});
await store.set(P.plan('completo'), {
  id: 'completo',
  name: 'Completo',
  description: 'Para a diretoria inteira.',
  maxMembers: 100000,
  modules: MODULE_IDS,
  priceCents: 0,
  pricePerMemberCents: 290,
  minMonthlyCents: 9900,
  highlights: ['Tudo do Essencial', 'Mensalidades, Pix, recibos e prestação de contas', 'Eventos com orçado e realizado', 'Atas, assembleias e votação secreta', 'Competições e ranking', 'Oficinas, reservas, patrimônio e certificados'],
  ...(await keepStripe('completo')),
  active: true,
});
console.log('Planos: Essencial (R$ 1,90 por sócio, mínimo R$ 69) e Completo (R$ 2,90 por sócio, mínimo R$ 99).');

if (tenantFile) {
  const seed = JSON.parse(readFileSync(tenantFile, 'utf8')) as TenantSeed;
  const ctx = {
    ...env,
    actor: actors[0],
    ip: '127.0.0.1',
    nowIso: new Date().toISOString(),
    async audit() {},
    requireActor: () => actors[0],
    can: () => true,
    require: () => undefined,
  } as unknown as OpContext;

  let tenantId = (await store.get<SlugDoc>(P.slug(seed.slug)))?.tenantId;
  if (!tenantId) {
    const r = await createTenantCore(ctx, { name: seed.name, slug: seed.slug, planId: 'completo', city: seed.city, state: seed.state, societyType: seed.societyType, adminEmails: [] });
    tenantId = r.tenantId;
    console.log(`Sociedade criada: /${r.slug}`);
  } else console.log(`Sociedade já existia: /${seed.slug} (atualizando a identidade)`);

  // Logo pública no Storage (logos podem ser públicas; fotos de sócios nunca)
  const bucket = getStorage(app).bucket();
  const logoPath = `tenants/${tenantId}/public/logo.jpg`;
  await bucket.file(logoPath).save(readFileSync(join(dirname(tenantFile), seed.logoFile)), { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=86400' } });
  const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(logoPath)}?alt=media`;

  const tenant = (await store.get<TenantDoc>(P.tenant(tenantId)))!;
  await store.update(P.tenant(tenantId), {
    shortName: seed.shortName,
    branding: { ...tenant.branding, logoUrl, primaryColor: seed.colors.primary, secondaryColor: seed.colors.secondary, accentColor: seed.colors.accent, textColor: seed.colors.text, theme: 'escuro' },
    publicPage: { ...tenant.publicPage, enabled: true, about: seed.about, city: seed.city, ...(seed.foundedYear ? { foundedYear: seed.foundedYear } : {}) },
    updatedAt: new Date().toISOString(),
  });
  await store.update(P.cardTemplate(tenantId, 'padrao'), {
    associationName: seed.name,
    associationSubtitle: seed.subtitle,
    logoUrl,
    primaryColor: seed.colors.primary,
    secondaryColor: seed.colors.secondary,
    accentColor: seed.colors.accent,
    textColor: seed.colors.text,
    updatedAt: new Date().toISOString(),
  });
  const t2 = (await store.get<TenantDoc>(P.tenant(tenantId)))!;
  const mctx = { ...ctx, tenantId, tenant: t2 } as OpContext;
  for (const a of actors) await upsertMembership(mctx, t2, a, ['presidente']);
  console.log('Administradores gerais incluídos na presidência da sociedade.');
}

console.log('Pronto. Cada pessoa deve sair e entrar de novo no site para o acesso de administrador geral valer.');
process.exit(0);
