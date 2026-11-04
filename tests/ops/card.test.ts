/** Critérios de aceite da carteirinha: QR baixado falha após 24 h e logo após a suspensão; validação mínima. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';

describe('carteirinha', () => {
  it('QR do arquivo baixado vale 24 h e depois expira', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string; expiresAt: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, who);
    const ok = await h.call<{ status: string }>('card.verify', { slug: h.tenant.slug, token: tok.token }, null);
    expect(ok.status).toBe('valido');
    h.clock.advance(24 * 3600_000 + 1000);
    const late = await h.call<{ status: string }>('card.verify', { slug: h.tenant.slug, token: tok.token }, null);
    expect(late.status).toBe('expirado');
  });

  it('suspensão invalida na hora, mesmo com token dentro do prazo', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, who);
    await h.call('members.setStatus', { tenantId: h.tenantId, memberId, status: 'suspenso', reason: 'teste' }, h.actors.presidente);
    const r = await h.call<{ status: string }>('card.verify', { slug: h.tenant.slug, token: tok.token }, null);
    expect(r.status).toBe('suspenso');
  });

  it('a validação devolve só o mínimo', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who);
    const r = await h.call<Record<string, unknown>>('card.verify', { slug: h.tenant.slug, token: tok.token }, null);
    // A foto entra só como link assinado de curta duração (a sociedade pode desligar)
    expect(Object.keys(r).sort()).toEqual(['categoryName', 'checkedAt', 'displayName', 'photoUrl', 'status', 'tenantName', 'validUntil'].sort());
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/529|982|247|1990|@|90000/);
    expect(r.displayName).toBe('Pessoa S.');
  });

  it('token aleatório e só o hash fica gravado', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who);
    expect(tok.token.length).toBeGreaterThanOrEqual(40);
    const dump = JSON.stringify(h.store.dump());
    expect(dump).not.toContain(tok.token);
  });

  it('o sócio não emite carteirinha de outra pessoa e estranho não emite nada', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    const other = await makeMember(h, 'socio2', 'Outra Pessoa Souza').catch(() => null);
    expect(other).toBeNull(); // mesmo CPF: deduplicação barra o segundo cadastro
    await expect(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, h.actors.estranho)).rejects.toThrow();
    await expect(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, h.actors.tesoureiro)).rejects.toThrow();
  });

  it('CPF fica cifrado no banco', async () => {
    const h = await makeTestTenant();
    await makeMember(h);
    const dump = JSON.stringify(h.store.dump());
    expect(dump).not.toContain('52998224725');
    expect(dump).not.toContain('529.982.247-25');
    expect(dump).toContain('***.982.247-**');
  });
});

describe('foto obrigatória', () => {
  it('sem foto a carteirinha não é emitida; com a regra desligada, é', async () => {
    const { makeTestTenant: mk, makeMember: mm } = await import('../helpers/env.ts');
    const { P: paths } = await import('../../src/shared/paths.ts');
    const h = await mk();
    const { memberId, who } = await mm(h);
    await h.store.update(paths.member(h.tenantId, memberId), { photoPath: '' });
    await expect(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who)).rejects.toMatchObject({ code: 'failed-precondition' });
    await h.store.update(paths.settings(h.tenantId), { cardRequiresPhoto: false });
    await expect(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who)).resolves.toBeTruthy();
  });
});

describe('validade da carteirinha baixada', () => {
  it('24 h, fim do mês ou fim do ano, nunca além da validade do cadastro', async () => {
    const { makeTestTenant: mk, makeMember: mm } = await import('../helpers/env.ts');
    const { P: paths } = await import('../../src/shared/paths.ts');
    const h = await mk(); // 02/11/2026 12:00 UTC
    const { memberId, who } = await mm(h);
    const issue = () => h.call<{ expiresAt: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, who);
    expect((await issue()).expiresAt).toBe('2026-11-03T12:00:00.000Z');
    await h.store.update(paths.settings(h.tenantId), { cardDownloadValidity: 'mes' });
    expect((await issue()).expiresAt).toBe('2026-12-01T02:59:59.000Z'); // 30/11 23:59:59 em Brasília
    await h.store.update(paths.settings(h.tenantId), { cardDownloadValidity: 'ano' });
    expect((await issue()).expiresAt).toBe('2027-01-01T02:59:59.000Z');
    await h.store.update(paths.member(h.tenantId, memberId), { validUntil: '2026-12-15' });
    expect((await issue()).expiresAt).toBe('2026-12-16T02:59:59.000Z');
  });
});
