// ESLint (flat config). typescript-eslint vem de tools/lint, onde roda com o TypeScript 6
// (o TypeScript 7 da raiz é o compilador nativo e não tem a API JavaScript que o parser usa).
// Instalar uma vez: npm run lint:install
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const lintPkg = new URL('./tools/lint/package.json', import.meta.url);
if (!existsSync(new URL('./tools/lint/node_modules/typescript-eslint/package.json', import.meta.url))) {
  throw new Error('Ferramentas de lint não instaladas. Rode: npm run lint:install');
}
const require = createRequire(lintPkg);
const tseslint = require('typescript-eslint');

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-ai-studio/**', 'coverage/**', 'functions/lib/**', '**/node_modules/**', 'tools/lint/**', '.firebase/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Regras dos hooks: erro de verdade (quebra a tela em produção)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // O resto entra como aviso para não travar o trabalho em andamento
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-misleading-character-class': 'warn',
      'prefer-const': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-async-promise-executor': 'warn',
      'no-cond-assign': 'warn',
      'no-fallthrough': 'warn',
      'no-sparse-arrays': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-constant-condition': 'warn',
      'no-unsafe-finally': 'warn',
      'no-self-assign': 'warn',
      'no-useless-catch': 'warn',
      'no-unassigned-vars': 'warn',
      'preserve-caught-error': 'off',
    },
  }
);
