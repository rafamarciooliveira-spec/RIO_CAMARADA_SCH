#!/usr/bin/env node
/**
 * Concede (ou revoga) a claim `master` da plataforma Sodalis. Único caminho para criar um master:
 * nenhum e-mail fica fixo no código.
 *
 * Uso (na máquina de quem administra o projeto; credenciais padrão do gcloud, sem conta de serviço):
 *   gcloud auth application-default login
 *   node functions/scripts/grant-master.mjs pessoa@exemplo.com --project ID-DO-PROJETO
 *   node functions/scripts/grant-master.mjs pessoa@exemplo.com --project ID-DO-PROJETO --revoke
 *
 * A pessoa precisa ter entrado pelo menos uma vez (a conta precisa existir no Firebase Auth)
 * e ter o e-mail verificado. O painel master EXIGE verificação em duas etapas (MFA): as regras e o
 * servidor recusam o token sem segundo fator. Ative o MFA por SMS/TOTP no Firebase Auth
 * (Identity Platform) e peça para a pessoa cadastrar o segundo fator antes de usar o painel.
 * Depois da mudança a pessoa precisa sair e entrar de novo (o token novo traz a claim).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const args = process.argv.slice(2);
const email = (args.find(a => a.includes('@')) || '').trim().toLowerCase();
const revoke = args.includes('--revoke');
const pi = args.indexOf('--project');
const cfg = JSON.parse(readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8'));
const projectId = pi >= 0 ? args[pi + 1] : cfg.projectId;

if (!email) {
  console.error('Informe o e-mail: node functions/scripts/grant-master.mjs pessoa@exemplo.com --project ID [--revoke]');
  process.exit(1);
}
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) console.log(`Usando o Auth Emulator em ${process.env.FIREBASE_AUTH_EMULATOR_HOST}.`);

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
let user;
try {
  user = await auth.getUserByEmail(email);
} catch {
  console.error('Conta não encontrada. A pessoa precisa entrar no portal uma vez antes.');
  process.exit(1);
}
if (!user.emailVerified && !revoke) {
  console.error('O e-mail desta conta não está verificado. Peça para a pessoa verificar e tente de novo.');
  process.exit(1);
}
const claims = { ...(user.customClaims || {}) };
if (revoke) delete claims.master;
else claims.master = true;
await auth.setCustomUserClaims(user.uid, claims);
if (revoke) await auth.revokeRefreshTokens(user.uid);

console.log(revoke ? `Claim master revogada (uid ${user.uid}); sessões encerradas.` : `Claim master concedida (uid ${user.uid}).`);
if (!revoke) {
  const factors = user.multiFactor?.enrolledFactors?.length || 0;
  console.log(factors ? `Segundo fator cadastrado: ${factors}.` : 'ATENÇÃO: esta conta ainda não tem segundo fator. Sem MFA o painel master fica bloqueado.');
}
