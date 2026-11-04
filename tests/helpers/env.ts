/**
 * Ambiente de teste das operações: MemoryStore + relógio controlável + atores prontos.
 * Uso:
 *   const h = await makeTestTenant();
 *   await h.call('members.approve', { tenantId: h.tenantId, memberId }, h.actors.presidente);
 *   h.clock.advance(25 * 3600_000);
 */
import { MemoryStore } from '../../src/shared/core/memoryStore.ts';
import { executeOp, type Actor, type Env } from '../../src/shared/core/ops.ts';
import { createWebCrypto, ephemeralKeys, simulatedMail } from '../../src/shared/core/ports.ts';
import { createSandboxPayments } from '../../src/shared/core/sandboxPayments.ts';
import { registerAllOps } from '../../src/shared/ops/index.ts';
import { createTenantCore } from '../../src/shared/ops/platform.ts';
import { upsertMembership } from '../../src/shared/ops/access.ts';
import { P } from '../../src/shared/paths.ts';
import { MODULE_IDS } from '../../src/shared/modules.ts';
import type { TenantDoc } from '../../src/shared/types.ts';

export function actor(uid: string, extra: Partial<Actor> = {}): Actor {
  return { uid, email: `${uid}@teste.local`, emailVerified: true, displayName: uid, master: false, mfa: false, ...extra };
}

export function makeEnv(start = '2026-11-02T12:00:00.000Z') {
  registerAllOps();
  const store = new MemoryStore();
  let nowMs = Date.parse(start);
  const crypto = createWebCrypto(ephemeralKeys());
  const env: Env = {
    store,
    crypto,
    mail: simulatedMail,
    payments: createSandboxPayments(crypto, 'segredo-de-teste'),
    files: { signedUrl: async p => `memoria://${p}`, remove: async () => undefined },
    now: () => new Date(nowMs),
    appUrl: 'http://localhost:3000',
    demo: false,
  };
  const clock = {
    advance(ms: number) {
      nowMs += ms;
    },
    set(iso: string) {
      nowMs = Date.parse(iso);
    },
  };
  const call = <T = unknown>(op: string, input: object, who: Actor | null, opts: { internal?: boolean; ip?: string } = {}) =>
    executeOp(env, { op, input, actor: who, ip: opts.ip || '10.0.0.1', internal: opts.internal }) as Promise<T>;
  return { env, store, clock, call };
}

/** Cria uma sociedade com todos os módulos e pessoas em cada papel padrão */
export async function makeTestTenant(slug = 'sociedade-teste') {
  const h = makeEnv();
  await h.store.set(P.plan('completo'), { id: 'completo', name: 'Completo', maxMembers: 5000, modules: MODULE_IDS, priceCents: 0, active: true });
  const master = actor('master1', { master: true, mfa: true });
  const ctx = {
    ...h.env,
    actor: master,
    ip: '10.0.0.1',
    nowIso: h.env.now().toISOString(),
    async audit() {},
    requireActor: () => master,
    can: () => true,
    require: () => undefined,
  } as unknown as Parameters<typeof createTenantCore>[0];
  const { tenantId } = await createTenantCore(ctx, { name: 'Sociedade Teste', slug, planId: 'completo', adminEmails: ['presidente@teste.local'] });
  const tenant = (await h.store.get<TenantDoc>(P.tenant(tenantId)))!;
  const roles = ['presidente', 'tesoureiro', 'secretario', 'conselho_fiscal', 'diretor_eventos', 'portaria'] as const;
  const actors: Record<(typeof roles)[number] | 'master' | 'estranho', Actor> = {
    master,
    estranho: actor('estranho'),
  } as never;
  const mctx = { ...ctx, tenantId, tenant } as typeof ctx & { tenantId: string; tenant: TenantDoc };
  for (const r of roles) {
    const a = actor(r);
    actors[r] = a;
    await upsertMembership(mctx as never, tenant, a, [r]);
  }
  return { ...h, tenantId, tenant, actors };
}

/** Cria um sócio aprovado e vinculado a uma conta (devolve memberId e o ator do sócio) */
export async function makeMember(h: Awaited<ReturnType<typeof makeTestTenant>>, uid = 'socio1', fullName = 'Pessoa de Teste Silva') {
  const who = actor(uid);
  const { memberId } = await h.call<{ memberId: string }>(
    'members.apply',
    {
      tenantId: h.tenantId,
      data: { fullName, cpf: '529.982.247-25', birthDate: '1990-05-10', categoryId: 'efetivo', phone: '(47) 90000-0000' },
      consents: { cadastro: true, imagem: true, comunicacao: true, marketing: false },
    },
    who
  );
  await h.call('members.approve', { tenantId: h.tenantId, memberId }, h.actors.presidente);
  // A carteirinha exige foto: simula o envio (o caminho é o que a tela grava)
  await h.store.update(P.member(h.tenantId, memberId), { photoPath: `tenants/${h.tenantId}/members/${memberId}/photo/teste.jpg` });
  return { memberId, who };
}
