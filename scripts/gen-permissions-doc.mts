// Gera docs/permissions.md a partir de src/shared/modules.ts (fonte única da matriz)
import { writeFileSync } from 'node:fs';
import { DEFAULT_ROLES, MODULES } from '../src/shared/modules.ts';

const head = ['Módulo', ...DEFAULT_ROLES.map(r => r.name)];
const lines = [
  '# Matriz de permissões padrão',
  '',
  'Gerado de `src/shared/modules.ts` por `node scripts/gen-permissions-doc.mts`. Cada sociedade pode editar os papéis em Configurações > Papéis e pessoas.',
  'Ações: v = ver, c = criar, e = editar, a = aprovar, x = exportar. O sócio sempre vê os próprios dados (carteirinha, cobranças, perfil) sem precisar de permissão de módulo.',
  '',
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
];
for (const m of MODULES) {
  const cells = DEFAULT_ROLES.map(r => (r.perms[m.id] || []).map(a => ({ ver: 'v', criar: 'c', editar: 'e', aprovar: 'a', exportar: 'x' })[a]).join('') || '–');
  lines.push(`| ${m.label} | ${cells.join(' | ')} |`);
}
lines.push('', 'Master da plataforma: claim `master` concedida por script, MFA obrigatório; não vê dados pessoais. Acesso de suporte: leitura por até 8 h, com motivo, auditoria e aviso à diretoria.');
writeFileSync('docs/permissions.md', lines.join('\n') + '\n');
console.log('docs/permissions.md gerado');
