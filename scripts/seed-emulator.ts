/**
 * Grava os dados SIMULADOS (fictícios) no Emulator Suite local e cria as contas das personas.
 *
 * Uso (com os emuladores rodando: npm run emulators):
 *   npm run seed            acrescenta por cima do que houver
 *   npm run seed -- --reset apaga o Firestore e o Auth DO EMULADOR antes
 *
 * Segurança: só roda contra o emulador (127.0.0.1/localhost) e o projeto demo-sodalis.
 * Nunca aponta para o projeto real; não usa conta de serviço.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { MemoryStore } from '../src/shared/core/memoryStore.ts';
import type { Env } from '../src/shared/core/ops.ts';
import { createWebCrypto, simulatedMail } from '../src/shared/core/ports.ts';
import { createSandboxPayments } from '../src/shared/core/sandboxPayments.ts';
import { registerAllOps } from '../src/shared/ops/index.ts';
import { buildDemoData } from '../src/shared/seed/demoData.ts';
import { EMULATOR_WEBHOOK_SECRET, emulatorCpfKeys } from '../functions/src/emulatorKeys.ts';

const PROJECT = 'demo-sodalis';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = PROJECT;

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
for (const v of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'] as const) {
  if (!LOCAL.test(process.env[v] || '')) {
    console.error(`${v} precisa apontar para o emulador local (127.0.0.1:porta). Abortado.`);
    process.exit(1);
  }
}

const reset = process.argv.includes('--reset');

async function clearEmulators() {
  const fs = process.env.FIRESTORE_EMULATOR_HOST;
  const au = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(`http://${fs}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${au}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  console.log('Emulador limpo (Firestore e Auth).');
}

async function main() {
  if (reset) await clearEmulators();

  registerAllOps();
  const crypto = createWebCrypto(emulatorCpfKeys());
  const store = new MemoryStore();
  const env: Env = {
    store,
    crypto,
    mail: simulatedMail,
    payments: createSandboxPayments(crypto, EMULATOR_WEBHOOK_SECRET),
    files: { signedUrl: async () => null, remove: async () => undefined },
    now: () => new Date(),
    appUrl: 'http://localhost:3000',
    demo: true,
  };
  const result = await buildDemoData(env);

  const app = initializeApp({ projectId: PROJECT });
  const db = getFirestore(app);
  const rows = store.dump();
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    for (const [path, data] of rows.slice(i, i + 400)) batch.set(db.doc(path), data);
    await batch.commit();
  }
  console.log(`Firestore do emulador: ${rows.length} documentos gravados.`);

  // Contas das personas, com e-mail verificado e provedor Google (para o login simulado)
  const auth = getAuth(app);
  const personas = Object.entries(result.personas);
  const res = await auth.importUsers(
    personas.map(([, p]) => ({
      uid: p.uid,
      email: p.email,
      emailVerified: true,
      displayName: p.displayName,
      ...(p.master ? { customClaims: { master: true } } : {}),
      providerData: [{ uid: `google-${p.uid}`, email: p.email, displayName: p.displayName, providerId: 'google.com' }],
    }))
  );
  if (res.failureCount) console.warn(`Falha ao criar ${res.failureCount} conta(s): ${res.errors.map(e => e.error.code).join(', ')}`);
  console.log('Contas criadas no Auth Emulator (entre com "Google" e escolha o e-mail):');
  for (const [role, p] of personas) console.log(`  ${role.padEnd(11)} ${p.email}${p.master ? '  (master)' : ''}`);
  console.log(`Sociedade: /${result.slug}  (id ${result.tenantId})`);
}

main().catch(e => {
  console.error('Falha no seed:', (e as Error).message);
  process.exit(1);
});
