/** Federação (filiais, painel só com números, transferência, carteirinha na rede, campeonato) e plano por sócio. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { createTenantCore } from '../../src/shared/ops/platform.ts';
import { upsertMembership } from '../../src/shared/ops/access.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberDoc, TenantDoc } from '../../src/shared/types.ts';
import { billedQuantity, monthlyCents } from '../../src/shared/billing.ts';

const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

/** Duas filiais no mesmo banco, cada uma com a sua presidência, e uma federação com as duas */
async function twoBranches() {
  const h = await makeTestTenant('filial-a');
  const master = h.actors.master;
  const ctx = { ...h.env, actor: master, ip: '10.0.0.1', nowIso: h.env.now().toISOString(), async audit() {}, requireActor: () => master, can: () => true, require: () => undefined } as never;
  const { tenantId: b } = await createTenantCore(ctx, { name: 'Filial B', slug: 'filial-b', planId: 'completo', adminEmails: [] });
  const tenantB = (await h.store.get<TenantDoc>(P.tenant(b)))!;
  const presB = actor('presidenteB');
  await upsertMembership({ ...(ctx as object), tenantId: b, tenant: tenantB } as never, tenantB, presB, ['presidente']);
  const fedAdmin = actor('federacao', { email: 'diretoria@federacao.local' });
  const { id: fedId } = await h.call<{ id: string }>('federation.save', { name: 'Federação Teste', slug: 'federacao-teste', tenantIds: [h.tenantId, b], adminEmails: ['diretoria@federacao.local'], networkCard: true }, master);
  return { h, a: h.tenantId, b, presA: h.actors.presidente, presB, fedAdmin, fedId };
}

describe('federação', () => {
  it('painel da federação só com números; quem não é da diretoria não vê', async () => {
    const { h, fedAdmin } = await twoBranches();
    await makeMember(h);
    const d = await h.call<{ branches: unknown[]; totals: { holders: number }; billing: { monthlyCents: number } }>('federation.dashboard', { slug: 'federacao-teste' }, fedAdmin);
    expect(d.branches).toHaveLength(2);
    expect(d.totals.holders).toBe(1);
    expect(d.billing.monthlyCents).toBe(240);
    const text = JSON.stringify(d);
    for (const pii of ['529.982.247-25', '52998224725', '1990-05-10', '(47) 90000-0000', 'Pessoa de Teste']) expect(text).not.toContain(pii);
    await denied(h.call('federation.dashboard', { slug: 'federacao-teste' }, h.actors.presidente), 'permission-denied');
    await denied(h.call('federation.dashboard', { slug: 'federacao-teste' }, actor('intruso')), 'permission-denied');
    const mine = await h.call<{ slug: string }[]>('federation.mine', {}, fedAdmin);
    expect(mine.map(m => m.slug)).toEqual(['federacao-teste']);
  });

  it('a diretoria da federação não lê dados de sócio pelas operações das filiais', async () => {
    const { h, a, fedAdmin } = await twoBranches();
    const { memberId } = await makeMember(h);
    await denied(h.call('members.getPii', { tenantId: a, memberId }, fedAdmin), 'permission-denied');
    await denied(h.call('members.export', { tenantId: a, purpose: 'curiosidade' }, fedAdmin), 'permission-denied');
  });

  it('uma sociedade não entra em duas federações', async () => {
    const { h, a } = await twoBranches();
    await denied(h.call('federation.save', { name: 'Outra Federação', slug: 'outra-fed', tenantIds: [a], adminEmails: [] }, h.actors.master), 'failed-precondition');
  });

  it('transferência: a origem pede, o destino aprova; dependentes e data de entrada vão junto', async () => {
    const { h, a, b, presA, presB } = await twoBranches();
    const { memberId, who } = await makeMember(h);
    const holder = (await h.store.get<MemberDoc>(P.member(a, memberId)))!;
    await h.call('members.addDependent', { tenantId: a, holderId: memberId, data: { fullName: 'Filho de Teste Silva', birthDate: '2016-03-03', categoryId: 'dependente', guardian: { name: 'Pessoa de Teste Silva', consent: true } }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } }, who);
    const [dep] = await h.store.query<MemberDoc>(P.members(a), { where: [['dependentOf', '==', memberId]] });
    await h.call('members.approve', { tenantId: a, memberId: dep.id }, presA);
    // O destino não pede, o sócio não pede, e a origem não aprova a própria transferência
    await denied(h.call('federation.transferRequest', { tenantId: a, memberId, toTenantId: b }, who), 'permission-denied');
    const { id } = await h.call<{ id: string }>('federation.transferRequest', { tenantId: a, memberId, toTenantId: b }, presA);
    await denied(h.call('federation.transferDecide', { tenantId: a, transferId: id, approve: true }, presA), 'permission-denied');
    const r = await h.call<{ memberId: string }>('federation.transferDecide', { tenantId: b, transferId: id, approve: true }, presB);
    const moved = (await h.store.get<MemberDoc>(P.member(b, r.memberId)))!;
    expect(moved.fullName).toBe('Pessoa de Teste Silva');
    expect(moved.joinedAt).toBe(holder.joinedAt);
    expect(['ativo', 'aprovado']).toContain(moved.status);
    expect((await h.store.get<MemberDoc>(P.member(a, memberId)))!.status).toBe('desligado');
    const movedDeps = await h.store.query<MemberDoc>(P.members(b), { where: [['dependentOf', '==', r.memberId]] });
    expect(movedDeps).toHaveLength(1);
    // O sócio passa a ter acesso à filial nova
    expect((await h.store.get<{ memberId: string }>(P.membership(b, who.uid)))!.memberId).toBe(r.memberId);
  });

  it('carteirinha de uma filial vale na portaria da outra; sem a opção da rede, não vale', async () => {
    const { h, a, b, presB, fedAdmin, fedId } = await twoBranches();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: a, memberId, kind: 'rotativo' }, who);
    const r = await h.call<{ status: string; tenantName: string }>('portaria.checkin', { tenantId: b, token: tok.token, slug: 'filial-a' }, presB);
    expect(r.status).toBe('valido');
    expect(r.tenantName).toBe('Sociedade Teste');
    await h.call('federation.updateSettings', { federationId: fedId, networkCard: false, adminEmails: ['diretoria@federacao.local'] }, fedAdmin);
    const r2 = await h.call<{ status: string }>('portaria.checkin', { tenantId: b, token: tok.token, slug: 'filial-a' }, presB);
    expect(r2.status).toBe('invalido');
  });

  it('campeonato da federação soma as etapas das filiais', async () => {
    const { h, a, b, presA, presB, fedAdmin, fedId } = await twoBranches();
    const { id: champ } = await h.call<{ id: string }>('federation.championshipSave', { federationId: fedId, data: { name: 'Estadual 2026', season: '2026', unit: 'pontos', higherIsBetter: true, aggregate: 'soma', status: 'em_andamento' } }, fedAdmin);
    for (const [t, pres, name] of [[a, presA, 'João Souza'], [b, presB, 'Maria Lima']] as const) {
      const { id } = await h.call<{ id: string }>('competitions.save', { tenantId: t, data: { name: `Etapa ${name}`, format: 'individual', stages: [{ id: 'e1', name: 'Etapa 1' }], federationChampionshipId: champ } }, pres);
      await h.call('competitions.saveResults', { tenantId: t, competitionId: id, stageId: 'e1', entries: [{ participantName: name, value: name === 'Maria Lima' ? 98 : 90 }] }, pres);
    }
    const r = await h.call<{ rows: { participantName: string; position: number }[] }>('federation.ranking', { federationId: fedId, championshipId: champ }, fedAdmin);
    expect(r.rows.map(x => [x.position, x.participantName])).toEqual([[1, 'Maria Lima (Filial B)'], [2, 'João Souza (Sociedade Teste)']]);
    // Filial não liga competição a campeonato de outra federação
    await denied(h.call('competitions.save', { tenantId: a, data: { name: 'Falsa', federationChampionshipId: 'naoexiste' } }, presA), 'invalid-argument');
  });
});

describe('plano por sócio', () => {
  it('valor do mês: titulares × preço, com mínimo; dependentes não contam', () => {
    const plan = { pricePerMemberCents: 290, minMonthlyCents: 9900, priceCents: 0 };
    expect(monthlyCents(plan, 10)).toBe(9900);
    expect(monthlyCents(plan, 150)).toBe(43500);
    expect(billedQuantity(plan, 10)).toBe(35);
    expect(billedQuantity(plan, 150)).toBe(150);
  });

  it('diretoria vê o plano e pede troca; só a plataforma aprova, e o plano liga os módulos', async () => {
    const h = await makeTestTenant();
    await h.store.set(P.plan('essencial'), { id: 'essencial', name: 'Essencial', maxMembers: 300, modules: ['sociedade', 'socios', 'carteirinha'], priceCents: 0, pricePerMemberCents: 190, minMonthlyCents: 6900, active: true });
    await h.store.update(P.plan('completo'), { pricePerMemberCents: 290, minMonthlyCents: 9900 });
    const mine = await h.call<{ monthlyCents: number; plans: unknown[] }>('billing.mine', { tenantId: h.tenantId }, h.actors.presidente);
    expect(mine.monthlyCents).toBe(9900);
    expect(mine.plans).toHaveLength(2);
    const { who } = await makeMember(h);
    await denied(h.call('billing.mine', { tenantId: h.tenantId }, who), 'permission-denied');
    const { id } = await h.call<{ id: string }>('billing.requestChange', { tenantId: h.tenantId, planId: 'essencial', period: 'anual' }, h.actors.presidente);
    await denied(h.call('billing.decideRequest', { requestId: id, approve: true }, h.actors.presidente), 'permission-denied');
    await denied(h.call('billing.checkout', { tenantId: h.tenantId, planId: 'essencial', period: 'mensal' }, h.actors.presidente), 'failed-precondition');
    await h.call('billing.decideRequest', { requestId: id, approve: true }, h.actors.master);
    const t = (await h.store.get<TenantDoc>(P.tenant(h.tenantId)))!;
    expect(t.planId).toBe('essencial');
    expect(t.modules.financeiro).toBe(false);
    expect(t.modules.socios).toBe(true);
    const ov = await h.call<{ rows: { planId: string; monthlyCents: number }[] }>('billing.overview', {}, h.actors.master);
    expect(ov.rows[0].planId).toBe('essencial');
    expect(ov.rows[0].monthlyCents).toBe(6900);
  });

  it('aviso do Stripe só vale vindo do servidor', async () => {
    const h = await makeTestTenant();
    await denied(h.call('billing.stripeEvent', { kind: 'checkout_done', tenantId: h.tenantId, planId: 'completo' }, h.actors.master), 'permission-denied');
    await h.call('billing.stripeEvent', { kind: 'checkout_done', tenantId: h.tenantId, customerId: 'cus_1', subscriptionId: 'sub_1' }, null, { internal: true });
    expect((await h.store.get<{ status: string }>(P.billing(h.tenantId)))!.status).toBe('ativa');
  });
});
