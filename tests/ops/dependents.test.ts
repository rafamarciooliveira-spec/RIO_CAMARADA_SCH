/** Dependente na mensalidade do titular, faixa grátis por idade, teto da família, avisos de idade e passagem a titular. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';
import { P } from '../../src/shared/paths.ts';
import type { ChargeDoc, MemberDoc, NotificationDoc } from '../../src/shared/types.ts';
import { dependentTimeline } from '../../src/shared/dependents.ts';

const consents = { cadastro: true, imagem: false, comunicacao: false, marketing: false };

async function family(rules: object) {
  const h = await makeTestTenant(); // relógio em 02/11/2026
  await h.call('tenant.updateSettings', { tenantId: h.tenantId, settings: { dependentRules: rules } }, h.actors.presidente);
  const { memberId, who } = await makeMember(h); // categoria efetivo, R$ 30
  const add = async (fullName: string, birthDate: string) => {
    const { memberId: id } = await h.call<{ memberId: string }>(
      'members.addDependent',
      { tenantId: h.tenantId, holderId: memberId, data: { fullName, birthDate, categoryId: 'dependente', guardian: { name: 'Pessoa de Teste Silva', consent: true } }, consents },
      who
    );
    await h.call('members.approve', { tenantId: h.tenantId, memberId: id }, h.actors.presidente);
    return id;
  };
  return { h, memberId, who, add };
}

describe('dependente na mensalidade', () => {
  it('valor por dependente, grátis até 12 anos e cobrado na mensalidade do titular, discriminado', async () => {
    const { h, memberId, add } = await family({ mode: 'valor_fixo', feeCents: 1500, freeUntilAge: 12, maxAge: 21, familyCapCents: 0 });
    await add('Filho Pequeno Silva', '2020-01-10'); // 6 anos: grátis
    await add('Filha Maior Silva', '2010-03-01'); // 16 anos: paga
    await h.call('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-11' }, h.actors.tesoureiro);
    const charges = await h.store.query<ChargeDoc>(P.charges(h.tenantId));
    expect(charges).toHaveLength(1); // dependente nunca recebe cobrança separada
    const c = charges[0].data;
    expect(c.memberId).toBe(memberId);
    expect(c.amountCents).toBe(3000 + 1500);
    expect(c.items?.map(i => i.amountCents)).toEqual([3000, 1500]);
  });

  it('teto da família limita a soma dos dependentes', async () => {
    const { h, add } = await family({ mode: 'valor_fixo', feeCents: 1500, freeUntilAge: 0, maxAge: 0, familyCapCents: 2000 });
    await add('Filho Um Silva', '2010-01-10');
    await add('Filho Dois Silva', '2011-01-10');
    await add('Filho Tres Silva', '2012-01-10');
    await h.call('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-11' }, h.actors.tesoureiro);
    const [c] = await h.store.query<ChargeDoc>(P.charges(h.tenantId));
    expect(c.data.amountCents).toBe(3000 + 2000);
  });

  it('grátis: a mensalidade é só a do titular', async () => {
    const { h, add } = await family({ mode: 'gratis', feeCents: 0, freeUntilAge: 0, maxAge: 0, familyCapCents: 0 });
    await add('Filho Um Silva', '2010-01-10');
    await h.call('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-11' }, h.actors.tesoureiro);
    const [c] = await h.store.query<ChargeDoc>(P.charges(h.tenantId));
    expect(c.data.amountCents).toBe(3000);
    expect(c.data.items).toBeUndefined();
  });
});

describe('idade do dependente', () => {
  it('linha do tempo: passa a pagar ao completar a idade e deixa de ser dependente no limite', () => {
    const rules = { mode: 'valor_fixo' as const, feeCents: 1500, freeUntilAge: 12, maxAge: 21, familyCapCents: 0 };
    const tl = dependentTimeline(rules, '2015-05-20', '2026-11-02');
    expect(tl).toMatchObject({ age: 11, feeNowCents: 0, paysFrom: '2027-05-20', limitAt: '2036-05-20', overLimit: false });
    expect(dependentTimeline(rules, '2004-01-01', '2026-11-02').overLimit).toBe(true);
  });

  it('avisa o titular e a diretoria perto do limite, uma vez só, e a diretoria torna titular', async () => {
    const { h, who, add } = await family({ mode: 'gratis', feeCents: 0, freeUntilAge: 0, maxAge: 21, familyCapCents: 0 });
    const dep = await add('Filha Quase Adulta Silva', '2005-12-01'); // faz 21 em 01/12/2026
    await runDailyJobs(h.env, h.tenantId);
    await runDailyJobs(h.env, h.tenantId);
    const notes = await h.store.query<NotificationDoc>(P.notifications(h.tenantId), { where: [['uid', '==', who.uid]] });
    expect(notes.filter(n => n.data.title.includes('limite de idade'))).toHaveLength(1);
    const boardNotes = await h.store.query<NotificationDoc>(P.notifications(h.tenantId), { where: [['uid', '==', h.actors.presidente.uid]] });
    expect(boardNotes.some(n => n.data.title.includes('limite de idade'))).toBe(true);
    await expect(h.call('members.promoteDependent', { tenantId: h.tenantId, memberId: dep, categoryId: 'efetivo' }, who)).rejects.toMatchObject({ code: 'permission-denied' });
    await h.call('members.promoteDependent', { tenantId: h.tenantId, memberId: dep, categoryId: 'efetivo' }, h.actors.presidente);
    const m = (await h.store.get<MemberDoc>(P.member(h.tenantId, dep)))!;
    expect(m.dependentOf).toBeUndefined();
    expect(m.categoryId).toBe('efetivo');
  });
});
