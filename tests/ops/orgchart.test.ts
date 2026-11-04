/** Organograma: permissão, validação da hierarquia e predefinição pelo tipo da sociedade. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import type { MembershipDoc } from '../../src/shared/types.ts';
import { P } from '../../src/shared/paths.ts';

const pos = (id: string, title: string, extra: object = {}) => ({ id, title, group: 'Diretoria', order: 1, highlight: false, ...extra });

describe('organograma', () => {
  it('a sociedade nasce com os cargos do tipo escolhido', async () => {
    const h = await makeTestTenant();
    const r = await h.call<{ positions: { title: string }[] }>('orgchart.preset', { tenantId: h.tenantId, societyType: 'tiro_esportivo' }, h.actors.presidente);
    expect(r.positions.map(p => p.title)).toContain('Rei do tiro');
    const fut = await h.call<{ positions: { title: string }[] }>('orgchart.preset', { tenantId: h.tenantId, societyType: 'futebol' }, h.actors.presidente);
    expect(fut.positions.map(p => p.title)).toContain('Técnico(a)');
    expect(await h.store.get(P.orgchart(h.tenantId))).not.toBeNull();
  });

  it('salva com sócio vinculado e recusa hierarquia em ciclo', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await h.call('orgchart.save', { tenantId: h.tenantId, style: 'arvore', title: 'Diretoria', showOnPublicPage: false, positions: [pos('a', 'Presidente', { memberId }), pos('b', 'Tesoureiro', { parentId: 'a' })] }, h.actors.presidente);
    const doc = await h.store.get<{ positions: { personName?: string }[] }>(P.orgchart(h.tenantId));
    expect(doc!.positions[0].personName).toBe('Pessoa de Teste Silva');
    await expect(
      h.call('orgchart.save', { tenantId: h.tenantId, style: 'arvore', title: 'Ciclo', showOnPublicPage: false, positions: [pos('a', 'Cargo A', { parentId: 'b' }), pos('b', 'Cargo B', { parentId: 'a' })] }, h.actors.presidente)
    ).rejects.toThrow(/ciclo/);
  });

  it('sócio e tesoureiro não editam o organograma', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const input = { tenantId: h.tenantId, style: 'cartoes', title: 'Majestades', showOnPublicPage: true, positions: [pos('a', 'Rei do tiro')] };
    await expect(h.call('orgchart.save', input, who)).rejects.toThrow();
    await expect(h.call('orgchart.save', input, h.actors.tesoureiro)).rejects.toThrow();
    await expect(h.call('orgchart.save', input, h.actors.secretario)).resolves.toBeTruthy();
  });
});

describe('passagem de cargo', () => {
  async function second(h: Awaited<ReturnType<typeof makeTestTenant>>) {
    const who = actor('socio2');
    const { memberId } = await h.call<{ memberId: string }>(
      'members.apply',
      { tenantId: h.tenantId, data: { fullName: 'Segunda Pessoa Souza', birthDate: '1980-01-01', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: true, marketing: false } },
      who
    );
    await h.call('members.approve', { tenantId: h.tenantId, memberId }, h.actors.presidente);
    return { memberId, who };
  }

  it('quem assume ganha o acesso do cargo, quem sai perde, e o mandato vai para a galeria', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const b = await second(h);
    const t = h.tenantId;
    await h.call('orgchart.save', { tenantId: t, style: 'arvore', title: 'Diretoria', showOnPublicPage: false, positions: [pos('pres', 'Presidente', { roleId: 'presidente' })] }, h.actors.presidente);
    await h.call('orgchart.handover', { tenantId: t, positionId: 'pres', memberId: a.memberId, since: '2026-01-01' }, h.actors.presidente);
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).toContain('presidente');
    // O novo presidente já consegue passar o cargo adiante
    await h.call('orgchart.handover', { tenantId: t, positionId: 'pres', memberId: b.memberId, since: '2028-01-01' }, a.who);
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).not.toContain('presidente');
    expect((await h.store.get<MembershipDoc>(P.membership(t, b.who.uid)))!.roleIds).toContain('presidente');
    const gallery = await h.store.query<{ personName: string; from: string; to: string }>(P.mandates(t));
    expect(gallery.map(g => g.data)).toEqual(expect.arrayContaining([expect.objectContaining({ personName: 'Pessoa de Teste Silva', from: '2026-01-01', to: '2028-01-01' })]));
  });

  it('o editor não troca o ocupante de cargo com acesso, e sócio não passa cargo', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const b = await second(h);
    const t = h.tenantId;
    await h.call('orgchart.save', { tenantId: t, style: 'arvore', title: 'Diretoria', showOnPublicPage: false, positions: [pos('tes', 'Tesoureiro', { roleId: 'tesoureiro' })] }, h.actors.presidente);
    await h.call('orgchart.handover', { tenantId: t, positionId: 'tes', memberId: a.memberId, since: '2026-01-01' }, h.actors.presidente);
    await h.call('orgchart.save', { tenantId: t, style: 'arvore', title: 'Diretoria', showOnPublicPage: false, positions: [pos('tes', 'Tesoureiro', { roleId: 'tesoureiro', memberId: b.memberId })] }, h.actors.presidente);
    const doc = await h.store.get<{ positions: { memberId?: string }[] }>(P.orgchart(t));
    expect(doc!.positions[0].memberId).toBe(a.memberId);
    await expect(h.call('orgchart.handover', { tenantId: t, positionId: 'tes', memberId: b.memberId, since: '2027-01-01' }, b.who)).rejects.toThrow();
    // Secretário edita o organograma, mas cargo com acesso pede quem gerencia papéis
    await expect(h.call('orgchart.handover', { tenantId: t, positionId: 'tes', memberId: b.memberId, since: '2027-01-01' }, h.actors.secretario)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('campos vazios enviados como nulo', () => {
  it('o organograma salva mesmo quando o site manda null nos campos vazios', async () => {
    const h = await makeTestTenant();
    await h.call('orgchart.save', { tenantId: h.tenantId, style: 'corte', title: 'Diretoria', showOnPublicPage: false, positions: [{ id: 'a', title: 'Vice secretária', group: 'Diretoria', order: 1, highlight: false, parentId: null, memberId: null, roleId: null, personName: null }] }, h.actors.presidente);
    const doc = await h.store.get<{ positions: { title: string }[] }>(P.orgchart(h.tenantId));
    expect(doc!.positions[0].title).toBe('Vice secretária');
  });
});
