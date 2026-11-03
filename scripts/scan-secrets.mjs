#!/usr/bin/env node
/**
 * Varredura de segredos e credenciais conhecidas no código-fonte e no build.
 * Uso: node scripts/scan-secrets.mjs [pasta ...]   (padrão: src, dist e arquivos da raiz)
 * Sai com código 1 se encontrar algo.
 *
 * A apiKey pública do Firebase (firebase-applet-config.json) é configuração de cliente, não
 * segredo; a proteção vem das regras, do App Check e da restrição de domínio da chave.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

// Credenciais e e-mails da versão antiga, guardados só como SHA-256 (nada pessoal neste arquivo)
const OLD_SECRET_HASHES = new Set([
  '92a5b823f10caa2f59059ef1869d0d704cc3d181f042262ad0022c8fb1e505e5',
  '4bab69b2a4f9d0b20bfdca8b26a017c51e0d0aa9c655d75e95697ac7a51097dd',
  'ac0e7d037817094e9e0b4441f9bae3209d67b02fa484917065f71b16109a1a78',
  '4e60d540842df310f161342f4d243b5e22d0056ae72aa8d2ac60915154c8ba22',
]);
const sha = t => createHash('sha256').update(t).digest('hex');

const targets = process.argv.slice(2);
const roots = targets.length ? targets : ['src', 'dist', 'functions/src', 'scripts', 'index.html', 'firestore.rules', 'storage.rules'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage']);
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.rules', '.md', '.txt', '.env', '']);
const SELF = 'scan-secrets.mjs';

const PATTERNS = [
  { name: 'chave privada', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'conta de serviço do Google', re: /"type"\s*:\s*"service_account"/ },
  { name: 'chave da Resend', re: /\bre_[A-Za-z0-9]{20,}\b/ },
  { name: 'chave secreta (sk_)', re: /\bsk_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: 'token do GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'token da AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'foto de banco de imagens no código', re: /images\.unsplash\.com/ },
];

const findings = [];
function scanFile(path) {
  if (path.endsWith(SELF)) return;
  if (!TEXT_EXT.has(extname(path))) return;
  const text = readFileSync(path, 'utf8');
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) findings.push(`${path}: ${name}`);
  }
  // Senhas e e-mails da versão antiga (comparados pelo hash)
  const candidates = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[a-z]+\d{4,}\b/g) || [];
  if (candidates.some(c => OLD_SECRET_HASHES.has(sha(c.toLowerCase())))) findings.push(`${path}: credencial ou e-mail da versão antiga`);
}
function walk(p) {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const entry of readdirSync(p)) {
      if (!SKIP_DIRS.has(entry)) walk(join(p, entry));
    }
  } else {
    scanFile(p);
  }
}
roots.forEach(walk);

if (findings.length) {
  console.error('Segredos ou credenciais encontrados:\n' + findings.map(f => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('Varredura de segredos: nada encontrado.');
