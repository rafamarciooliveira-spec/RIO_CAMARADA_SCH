import { defineConfig } from 'vitest/config';

// `npm test` roda os testes que não precisam de emulador (operações, regras de negócio).
// `npm run test:rules` roda os testes de regras do Firestore/Storage dentro do emulador.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: process.env.RULES_TESTS ? [] : ['tests/rules/**'],
    testTimeout: 30_000,
  },
});
