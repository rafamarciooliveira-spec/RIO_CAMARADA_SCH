// Empacota functions/src/index.ts (que importa ../../src/shared) em lib/index.js (CommonJS).
// firebase-admin e firebase-functions ficam de fora (instalados pelo deploy a partir do package.json).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  legalComments: 'none',
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*'],
  logLevel: 'info',
});
