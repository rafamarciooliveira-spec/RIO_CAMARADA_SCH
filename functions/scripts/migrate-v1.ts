/**
 * Migração dos dados da versão 1 (Portal do Associado, coleções na RAIZ do banco) para o modelo
 * multi-tenant (tenants/{t}/...). NUNCA apaga nada. Sem --commit, só simula e mostra o relatório.
 *
 * ANTES de rodar com --commit: faça o backup (functions/scripts/backup-export.md).
 *
 * Uso (na máquina de quem administra o projeto; credenciais padrão do gcloud, sem arquivo de conta de serviço):
 *   gcloud auth application-default login
 *   npx tsx functions/scripts/migrate-v1.ts --name "Sociedade X" --slug sociedade-x            (simulação)
 *   CPF_ENCRYPTION_KEY=... CPF_HMAC_KEY=... npx tsx functions/scripts/migrate-v1.ts --name "Sociedade X" --slug sociedade-x --commit
 *
 * Opções:
 *   --project ID      projeto (padrão: firebase-applet-config.json)
 *   --database ID     banco de ORIGEM e destino (padrão: firestoreDatabaseId do mesmo arquivo)
 *   --plan ID         plano da nova sociedade (padrão: completo; precisa existir em plans/ no --commit)
 *   --photos          também copia as fotos (base64 no documento antigo) para o Storage
 *   --commit          grava de verdade
 *
 * As chaves de CPF do --commit precisam ser AS MESMAS do Secret Manager usado pelas Functions
 * (senão o servidor não lê o CPF migrado). Passe por variável de ambiente, nunca por arquivo:
 *   export CPF_ENCRYPTION_KEY="$(gcloud secrets versions access latest --secret=CPF_ENCRYPTION_KEY)"
 *   export CPF_HMAC_KEY="$(gcloud secrets versions access latest --secret=CPF_HMAC_KEY)"
 */
import { readFileSync } from 'node:fs';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { MemoryStore } from '../../src/shared/core/memoryStore.ts';
import { SYSTEM_ACTOR, type Env, type OpContext } from '../../src/shared/core/ops.ts';
import { createWebCrypto, ephemeralKeys, simulatedMail } from '../../src/shared/core/ports.ts';
import { createSandboxPayments } from '../../src/shared/core/sandboxPayments.ts';
import type { Store } from '../../src/shared/core/store.ts';
import { registerAllOps } from '../../src/shared/ops/index.ts';
import { createTenantCore } from '../../src/shared/ops/platform.ts';
import { approveCore, createMemberCore } from '../../src/shared/ops/members.ts';
import { createInviteRecord, upsertMembership } from '../../src/shared/ops/access.ts';
import { MODULE_IDS } from '../../src/shared/modules.ts';
import { P } from '../../src/shared/paths.ts';
import { cleanCPF, validateCPF } from '../../src/shared/cpf.ts';
import type { TenantDoc, TenantSettings } from '../../src/shared/types.ts';
import { AdminStore } from '../src/adminStore.ts';

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string, d = '') => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const cfg = JSON.parse(readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8')) as {
  projectId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
};
const COMMIT = flag('commit');
const PHOTOS = flag('photos');
const projectId = opt('project', cfg.projectId);
const databaseId = opt('database', cfg.firestoreDatabaseId || '(default)');
const name = opt('name');
const slug = opt('slug');
const planId = opt('plan', 'completo');
if (!name || !slug) {
  console.error('Informe --name "Nome da sociedade" e --slug endereco-da-sociedade.');
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST && COMMIT && !projectId.startsWith('demo-')) {
  console.error('FIRESTORE_EMULATOR_HOST está definido com projeto real: confira o ambiente antes de gravar.');
  process.exit(1);
}

// ---------- leitura da versão 1 (somente leitura) ----------
const app = initializeApp({ credential: applicationDefault(), projectId, storageBucket: cfg.storageBucket });
const source = databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

interface V1Member {
  userId?: string;
  fullName?: string;
  cpf?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  category?: string;
  status?: string;
  rejectionReason?: string;
  membershipNumber?: string;
  validUntil?: string;
}

async function readAll<T>(col: string): Promise<{ id: string; data: T }[]> {
  const snap = await source.collection(col).get();
  return snap.docs.map(d => ({ id: d.id, data: d.data() as T }));
}

function toDateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}

function mkCtx(env: Env, tenant?: TenantDoc): OpContext {
  const ctx = {
    ...env,
    actor: SYSTEM_ACTOR,
    ip: '127.0.0.1',
    nowIso: env.now().toISOString(),
    tenantId: tenant?.id,
    tenant,
    membership: undefined,
    async audit(action: string, targetId?: string, details?: Record<string, string | number | boolean>) {
      const entry = { action, actorUid: 'migracao', ...(targetId ? { targetId } : {}), ...(details ? { details } : {}), at: ctx.nowIso };
      if (ctx.tenantId) await env.store.add(P.audit(ctx.tenantId), entry);
      else await env.store.add(P.platformAudit(), entry);
    },
    requireActor: () => SYSTEM_ACTOR,
    can: () => true,
    require: () => undefined,
  } as OpContext;
  return ctx;
}

async function main() {
  registerAllOps();
  console.log(`Projeto ${projectId}, banco ${databaseId}. Modo: ${COMMIT ? 'GRAVAÇÃO (--commit)' : 'simulação (nada é gravado)'}`);

  const members = await readAll<V1Member>('members');
  const admins = await readAll<{ email?: string; role?: string }>('admins');
  const tplSnap = await source.doc('cardTemplates/active_template').get();
  const sysSettings = await readAll<Record<string, unknown>>('systemSettings');
  console.log(`Lido da versão 1: ${members.length} sócios, ${admins.length} administradores, modelo de carteirinha: ${tplSnap.exists ? 'sim' : 'não'}, configurações: ${sysSettings.length}`);

  // Destino: memória na simulação, banco real no --commit
  let store: Store;
  let keys: { encKeyB64: string; hmacKeyB64: string };
  if (COMMIT) {
    keys = { encKeyB64: process.env.CPF_ENCRYPTION_KEY || '', hmacKeyB64: process.env.CPF_HMAC_KEY || '' };
    if (Buffer.from(keys.encKeyB64, 'base64').length !== 32 || Buffer.from(keys.hmacKeyB64, 'base64').length !== 32) {
      console.error('No --commit, CPF_ENCRYPTION_KEY e CPF_HMAC_KEY (32 bytes em base64, iguais às do Secret Manager) são obrigatórias.');
      process.exit(1);
    }
    store = new AdminStore(app, databaseId);
    if (!(await store.get(P.plan(planId)))) {
      console.error(`Plano "${planId}" não existe em plans/. Crie pelo painel master antes.`);
      process.exit(1);
    }
  } else {
    keys = ephemeralKeys();
    store = new MemoryStore();
    await store.set(P.plan(planId), { id: planId, name: planId, maxMembers: 100000, modules: MODULE_IDS, priceCents: 0, active: true });
  }
  const crypto = createWebCrypto(keys);
  const env: Env = {
    store,
    crypto,
    mail: simulatedMail, // convites não saem por e-mail aqui: os links aparecem no fim para a diretoria reenviar
    payments: createSandboxPayments(crypto, ''),
    files: { signedUrl: async () => null, remove: async () => undefined },
    now: () => new Date(),
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    demo: false,
  };

  // 1. Sociedade (sem convites automáticos; os administradores antigos recebem convite abaixo)
  const created = await createTenantCore(mkCtx(env), { name, slug, planId, adminEmails: [] as string[] }).catch(e => {
    console.error(`Não foi possível criar a sociedade: ${(e as Error).message}`);
    process.exit(1);
  });
  const tenantId = created.tenantId;
  const tenant = (await store.get<TenantDoc>(P.tenant(tenantId)))!;
  const ctx = mkCtx(env, tenant);
  const settings = (await store.get<TenantSettings>(P.settings(tenantId)))!;

  // 2. Configurações e modelo da carteirinha
  for (const s of sysSettings) {
    const subject = typeof s.data.subject === 'string' ? s.data.subject : '';
    const body = typeof s.data.body === 'string' ? s.data.body : typeof s.data.template === 'string' ? (s.data.template as string) : '';
    if (subject && body) {
      await store.set(P.settings(tenantId), { emailTemplates: { ...settings.emailTemplates, ajuste: { subject: subject.slice(0, 200), body: body.slice(0, 4000) } } }, { merge: true });
    }
  }
  if (tplSnap.exists) {
    const t = tplSnap.data() as Record<string, unknown>;
    const keep = ['associationName', 'associationSubtitle', 'primaryColor', 'secondaryColor', 'accentColor', 'textColor', 'orientation', 'backgroundPattern', 'showQrCode', 'showPhoto', 'showCategory', 'showSecurityStamp', 'signatureLabel', 'logoSize', 'logoPosition', 'infoAlignment'];
    const patch: Record<string, unknown> = {};
    for (const k of keep) if (t[k] !== undefined) patch[k] = t[k];
    if (typeof t.logoUrl === 'string' && t.logoUrl.length <= 600) patch.logoUrl = t.logoUrl;
    patch.showCpf = false; // CPF nunca na carteirinha
    await store.set(P.cardTemplate(tenantId, 'padrao'), patch, { merge: true });
  }

  // 3. Sócios
  const report = { criados: 0, aprovados: 0, pendentes: 0, ajuste: 0, cpfInvalido: 0, cpfRepetido: 0, semNascimento: 0, vinculados: 0, fotos: 0, falhas: 0 };
  const problems: string[] = [];
  const catByName = (n?: string) => settings.categories.find(c => c.name.toLowerCase() === String(n || '').toLowerCase())?.id || 'efetivo';
  const seenCpf = new Set<string>();
  for (const { id, data: m } of members) {
    try {
      let cpf = cleanCPF(m.cpf);
      if (cpf && !validateCPF(cpf)) {
        report.cpfInvalido++;
        problems.push(`sócio ${id}: CPF inválido (importado sem CPF)`);
        cpf = '';
      }
      if (cpf && seenCpf.has(cpf)) {
        report.cpfRepetido++;
        problems.push(`sócio ${id}: CPF repetido (importado sem CPF)`);
        cpf = '';
      }
      if (cpf) seenCpf.add(cpf);
      let birthDate = toDateKey(m.birthDate);
      const data = {
        fullName: String(m.fullName || 'Sem nome').slice(0, 150).padEnd(3, '.'),
        cpf: cpf || undefined,
        birthDate,
        email: m.email && /@/.test(m.email) ? m.email.trim().toLowerCase().slice(0, 120) : undefined,
        phone: m.phone ? String(m.phone).slice(0, 30) : undefined,
        categoryId: catByName(m.category),
      };
      const consents = { cadastro: true as const, imagem: !!m.photoUrl, comunicacao: true, marketing: false };
      let memberId: string;
      try {
        memberId = await createMemberCore(ctx, { data, consents, status: 'pendente', uid: m.userId || undefined, memberId: id.replace(/[^A-Za-z0-9_-]/g, '_') });
      } catch (e) {
        // Menor sem responsável cadastrado: importa sem a data e marca para a secretaria completar
        if (!/Menores/.test((e as Error).message)) throw e;
        birthDate = undefined;
        report.semNascimento++;
        problems.push(`sócio ${id}: menor sem responsável legal (importado sem nascimento; completar o responsável)`);
        memberId = await createMemberCore(ctx, { data: { ...data, birthDate }, consents, status: 'pendente', uid: m.userId || undefined, memberId: id.replace(/[^A-Za-z0-9_-]/g, '_') });
      }
      report.criados++;
      const status = String(m.status || 'pendente');
      if (status === 'aprovado' || status === 'expirado') {
        await approveCore(ctx, memberId, { validUntil: toDateKey(m.validUntil) });
        if (m.membershipNumber) await store.update(P.member(tenantId, memberId), { membershipNumber: String(m.membershipNumber).slice(0, 30) });
        report.aprovados++;
      } else if (status === 'rejeitado') {
        await store.update(P.member(tenantId, memberId), { status: 'rejeitado', statusReason: String(m.rejectionReason || '').slice(0, 500) });
        report.ajuste++;
      } else report.pendentes++;
      if (m.userId) {
        await upsertMembership(ctx, tenant, { uid: m.userId, email: data.email || '', displayName: data.fullName }, ['socio'], memberId);
        report.vinculados++;
      }
      if (PHOTOS && m.photoUrl) {
        const dm = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(m.photoUrl);
        if (dm) {
          const ext = dm[2] === 'jpeg' ? 'jpg' : dm[2];
          const path = `tenants/${tenantId}/members/${memberId}/photo/migrada.${ext}`;
          if (COMMIT) await getStorage(app).bucket().file(path).save(Buffer.from(dm[3], 'base64'), { contentType: dm[1], resumable: false });
          await store.update(P.member(tenantId, memberId), { photoPath: path });
          report.fotos++;
        }
      }
    } catch (e) {
      report.falhas++;
      problems.push(`sócio ${id}: ${(e as Error).message}`);
    }
  }

  // 4. Convites para os administradores antigos (vinculam ao uid no primeiro login com e-mail verificado)
  const invites: { email: string; link: string }[] = [];
  const emails = new Set<string>();
  for (const a of admins) {
    const email = String(a.data.email || '').trim().toLowerCase();
    if (!email || emails.has(email)) continue;
    emails.add(email);
    const roleIds = a.data.role === 'gestor' ? ['secretario'] : ['presidente'];
    const inv = await createInviteRecord(ctx, { email, roleIds, days: 14 });
    invites.push({ email, link: inv.link });
  }

  await ctx.audit('migration.v1_imported', tenantId, { socios: report.criados, falhas: report.falhas, commit: COMMIT });

  console.log('\nRelatório da migração');
  console.log(`  Sociedade: ${name} (/${slug}, id ${tenantId})`);
  for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(14)} ${v}`);
  if (problems.length) {
    console.log('\nPendências (ids técnicos, sem dados pessoais):');
    for (const p of problems) console.log(`  - ${p}`);
  }
  console.log(`\nConvites para ${invites.length} administrador(es) antigo(s), válidos por 14 dias.`);
  if (COMMIT) {
    console.log('Links (envie a cada pessoa por canal seguro; cada link é de uso único e exige o e-mail certo):');
    for (const i of invites) console.log(`  ${i.email}: ${i.link}`);
  }
  console.log(COMMIT ? '\nGravado. Nada da versão 1 foi apagado.' : '\nSimulação: nada foi gravado. Rode de novo com --commit para gravar.');
}

main().catch(e => {
  console.error('Falha na migração:', (e as Error).message);
  process.exit(1);
});
