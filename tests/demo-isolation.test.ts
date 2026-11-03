/**
 * A demonstração "Ver sistema" não pode carregar o SDK do Firebase, a configuração do projeto
 * nem fazer chamadas de rede. Percorre o grafo de imports (estáticos e lazy) a partir do DemoApp.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const FORBIDDEN_FILES = ['src/data/firebaseClient.ts', 'src/data/firebaseSession.ts', 'src/app/RealApp.tsx', 'firebase-applet-config.json'];

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(c) && !c.endsWith('/') && /\.(tsx?|json)$/.test(c)) return c;
  }
  return null;
}

function graph(entry: string) {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (f.endsWith('.json')) continue;
    const src = readFileSync(f, 'utf8');
    const re = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith('.')) {
        const r = resolveImport(f, spec);
        if (r) stack.push(r);
      } else bare.add(spec);
    }
  }
  return { files: [...seen].map(f => f.slice(ROOT.length + 1).split('\\').join('/')), bare: [...bare] };
}

describe('isolamento da demonstração', () => {
  it('não alcança Firebase, configuração do projeto nem o app real', () => {
    const g = graph(resolve(ROOT, 'src/modules/demo/DemoApp.tsx'));
    expect(g.files.length).toBeGreaterThan(20);
    for (const f of FORBIDDEN_FILES) expect(g.files).not.toContain(f);
    expect(g.bare.filter(b => b === 'firebase' || b.startsWith('firebase/') || b.startsWith('@firebase/'))).toEqual([]);
  });

  it('o código alcançado não faz chamadas de rede', () => {
    const g = graph(resolve(ROOT, 'src/modules/demo/DemoApp.tsx'));
    const offenders = g.files.filter(f => /\.(tsx?)$/.test(f)).filter(f => /\bfetch\(|XMLHttpRequest|WebSocket\(|sendBeacon/.test(readFileSync(resolve(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
