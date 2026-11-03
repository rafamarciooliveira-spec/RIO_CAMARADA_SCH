/** Os dados simulados montam sem erro e ficam coerentes (base da demonstração e do emulador). */
import { describe, expect, it } from 'vitest';
import { makeEnv } from './helpers/env.ts';
import { buildDemoData } from '../src/shared/seed/demoData.ts';
import { P } from '../src/shared/paths.ts';

describe('dados simulados', () => {
  it('monta a sociedade de exemplo sem etapas falhando', async () => {
    const h = makeEnv(new Date().toISOString());
    const res = await buildDemoData(h.env, { files: new Map() });
    if (res.warnings.length) console.log(res.warnings.join('\n'));
    expect(res.warnings).toEqual([]);
    const t = res.tenantId;
    expect((await h.store.count(P.members(t))) > 30).toBe(true);
    expect((await h.store.count(P.ledger(t))) > 20).toBe(true);
    expect((await h.store.count(P.events(t))) >= 3).toBe(true);
    expect(await h.store.get(P.membership(t, res.personas.socio.uid))).not.toBeNull();
    const dump = JSON.stringify(h.store.dump());
    expect(dump).not.toMatch(/@(?!exemplo\.invalid|plataforma\.invalid|teste\.local)[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
