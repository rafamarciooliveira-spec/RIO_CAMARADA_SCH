/** Ficha pelo link com dependentes, aprovação em conjunto e alteração depois de aprovado (só vale com a diretoria). */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberChangeDoc, MemberDoc, MemberPiiDoc } from '../../src/shared/types.ts';

const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });
const consents = { cadastro: true, imagem: false, comunicacao: true, marketing: false };

async function applyWithDeps(h: Awaited<ReturnType<typeof makeTestTenant>>) {
  const who = actor('nova-familia');
  const r = await h.call<{ memberId: string; dependents: number }>(
    'members.apply',
    {
      tenantId: h.tenantId,
      data: { fullName: 'Marta Souza Lima', birthDate: '1985-04-10', categoryId: 'efetivo' },
      consents,
      dependents: [
        { fullName: 'Pedro Souza Lima', birthDate: '2015-08-01', categoryId: 'efetivo', guardian: { name: 'Marta Souza Lima', consent: true }, custom: { parentesco: 'Filho(a)' } },
        { fullName: 'Carlos Lima Neto', birthDate: '1983-02-20', categoryId: 'efetivo', custom: { parentesco: 'Cônjuge ou companheiro(a)' } },
      ],
    },
    who
  );
  return { ...r, who };
}

describe('ficha pelo link com dependentes', () => {
  it('titular e dependentes entram pendentes, a diretoria é avisada e aprova todos de uma vez', async () => {
    const h = await makeTestTenant();
    const { memberId, dependents, who } = await applyWithDeps(h);
    expect(dependents).toBe(2);
    const deps = await h.store.query<MemberDoc>(P.members(h.tenantId), { where: [['dependentOf', '==', memberId]] });
    expect(deps.map(d => d.data.status)).toEqual(['pendente', 'pendente']);
    expect(deps.find(d => d.data.fullName.startsWith('Pedro'))!.data.isMinor).toBe(true);
    // O titular não aprova a si nem aos dependentes
    await denied(h.call('members.approve', { tenantId: h.tenantId, memberId, withDependents: true }, who), 'permission-denied');
    await h.call('members.approve', { tenantId: h.tenantId, memberId, withDependents: true }, h.actors.presidente);
    const holder = (await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!;
    const after = await h.store.query<MemberDoc>(P.members(h.tenantId), { where: [['dependentOf', '==', memberId]] });
    for (const d of after) {
      expect(['aprovado', 'ativo']).toContain(d.data.status);
      expect(d.data.validUntil).toBe(holder.validUntil);
    }
  });

  it('categoria que não aceita dependentes recusa a ficha com dependentes', async () => {
    const h = await makeTestTenant();
    const s = (await h.store.get<{ categories: { id: string; allowsDependents: boolean }[] }>(P.settings(h.tenantId)))!;
    await h.store.update(P.settings(h.tenantId), { categories: s.categories.map(c => ({ ...c, allowsDependents: false })) });
    await denied(applyWithDeps(h), 'failed-precondition');
  });
});

describe('alteração depois de aprovado', () => {
  it('nome e CPF só mudam quando a diretoria aprova, e o CPF novo não fica legível no pedido', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const t = h.tenantId;
    const before = (await h.store.get<MemberDoc>(P.member(t, memberId)))!;
    const { changeId } = await h.call<{ changeId: string }>('members.requestChange', { tenantId: t, memberId, kind: 'dados', fullName: 'Nome Corrigido da Silva', cpf: '111.444.777-35' }, who);
    expect((await h.store.get<MemberDoc>(P.member(t, memberId)))!.fullName).toBe(before.fullName);
    const c = (await h.store.get<MemberChangeDoc>(P.memberChange(t, memberId, changeId)))!;
    expect(JSON.stringify(c)).not.toContain('11144477735');
    expect(c.cpfMasked).toMatch(/\*/);
    // Um pedido por vez, e o sócio não decide o próprio pedido
    await denied(h.call('members.requestChange', { tenantId: t, memberId, kind: 'dados', fullName: 'Outro Nome Qualquer' }, who), 'failed-precondition');
    await denied(h.call('members.reviewChange', { tenantId: t, memberId, changeId, approve: true }, who), 'permission-denied');
    await h.call('members.reviewChange', { tenantId: t, memberId, changeId, approve: true }, h.actors.presidente);
    const m = (await h.store.get<MemberDoc>(P.member(t, memberId)))!;
    expect(m.fullName).toBe('Nome Corrigido da Silva');
    expect(m.changePending).toBe(false);
    const pii = (await h.store.get<MemberPiiDoc>(P.memberPii(t, memberId)))!;
    expect(pii.cpfMasked).toBe(c.cpfMasked);
    expect((await h.store.get<MemberChangeDoc>(P.memberChange(t, memberId, changeId)))!.cpfEnc).toBe('');
  });

  it('recusa exige motivo e não muda nada', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const t = h.tenantId;
    const { changeId } = await h.call<{ changeId: string }>('members.requestChange', { tenantId: t, memberId, kind: 'dados', fullName: 'Nome Inventado Qualquer' }, who);
    await denied(h.call('members.reviewChange', { tenantId: t, memberId, changeId, approve: false }, h.actors.presidente), 'invalid-argument');
    await h.call('members.reviewChange', { tenantId: t, memberId, changeId, approve: false, reason: 'Mande o documento' }, h.actors.presidente);
    const m = (await h.store.get<MemberDoc>(P.member(t, memberId)))!;
    expect(m.fullName).not.toBe('Nome Inventado Qualquer');
    expect(m.changePending).toBe(false);
  });

  it('retirar dependente só com aprovação; o titular não pede a própria saída por aqui', async () => {
    const h = await makeTestTenant();
    const { memberId, dependents, who } = await applyWithDeps(h);
    expect(dependents).toBe(2);
    await h.call('members.approve', { tenantId: h.tenantId, memberId, withDependents: true }, h.actors.presidente);
    await denied(h.call('members.requestChange', { tenantId: h.tenantId, memberId, kind: 'remover' }, who), 'failed-precondition');
    const [dep] = await h.store.query<MemberDoc>(P.members(h.tenantId), { where: [['dependentOf', '==', memberId]] });
    const { changeId } = await h.call<{ changeId: string }>('members.requestChange', { tenantId: h.tenantId, memberId: dep.id, kind: 'remover' }, who);
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, dep.id)))!.status).not.toBe('desligado');
    await h.call('members.reviewChange', { tenantId: h.tenantId, memberId: dep.id, changeId, approve: true }, h.actors.presidente);
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, dep.id)))!.status).toBe('desligado');
  });

  it('ninguém pede alteração do cadastro de outra família', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await denied(h.call('members.requestChange', { tenantId: h.tenantId, memberId, kind: 'dados', fullName: 'Nome Alheio Qualquer' }, actor('vizinho')), 'permission-denied');
  });
});

describe('diretoria se cadastra como sócio', () => {
  it('quem já aprova sócios entra aprovado ao preencher a própria ficha; sócio comum fica pendente', async () => {
    const h = await makeTestTenant();
    const pres = h.actors.presidente;
    const { memberId } = await h.call<{ memberId: string }>('members.apply', { tenantId: h.tenantId, data: { fullName: 'Presidente da Silva', birthDate: '1970-01-01', categoryId: 'efetivo' }, consents }, pres);
    expect(['aprovado', 'ativo']).toContain((await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!.status);
    const ms = await h.store.get<{ roleIds: string[]; memberId: string }>(P.membership(h.tenantId, pres.uid));
    expect(ms!.roleIds).toContain('presidente');
    expect(ms!.memberId).toBe(memberId);
    const other = await h.call<{ memberId: string }>('members.apply', { tenantId: h.tenantId, data: { fullName: 'Pessoa Comum Souza', categoryId: 'efetivo' }, consents }, actor('comum'));
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, other.memberId)))!.status).toBe('pendente');
  });
});
