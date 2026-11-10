/** Organograma: permissão, validação da hierarquia e predefinição pelo tipo da sociedade. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import type { MembershipDoc, OrgChartDoc, TermDoc } from '../../src/shared/types.ts';
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

describe('gestão atual e organograma andam juntos', () => {
  it('cargo novo, nome trocado e pessoa da gestão vão para o organograma; a majestade fica como está; o contrário também vale', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const t = h.tenantId;
    await h.call('orgchart.save', { tenantId: t, style: 'corte', title: 'Diretoria', showOnPublicPage: false, positions: [pos('pres', 'Presidente', { roleId: 'presidente' }), pos('rei', 'Rei do tiro', { group: 'Majestades', personName: 'Fulano Rei' })] }, h.actors.presidente);
    // Gestão gravada como antes (sem o cargo ligado): casa pelo nome, sem criar outro "Presidente"
    const { id } = await h.call<{ id: string }>('generic.save', {
      tenantId: t, collection: 'terms',
      data: { name: 'Gestão 2026 a 2027', start: '2026-02-02', end: '2028-02-02', current: true, board: [
        { memberId: a.memberId, name: 'Pessoa de Teste Silva', roleId: 'presidente', roleName: 'Presidente' },
        { name: 'Ana Livre', roleId: 'diretor_social', roleName: 'Diretora social' },
      ] },
    }, h.actors.presidente);
    let chart = (await h.store.get<OrgChartDoc>(P.orgchart(t)))!;
    expect(chart.positions.filter(p => p.title === 'Presidente')).toHaveLength(1);
    expect(chart.positions.find(p => p.id === 'pres')).toMatchObject({ memberId: a.memberId, personName: 'Pessoa de Teste Silva' });
    const social = chart.positions.find(p => p.title === 'Diretora social')!;
    expect(social.personName).toBe('Ana Livre');
    expect(chart.positions.find(p => p.id === 'rei')!.personName).toBe('Fulano Rei');
    // Cargo com acesso: quem assume pela gestão recebe o acesso
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).toContain('presidente');
    let term = (await h.store.get<TermDoc>(`${P.terms(t)}/${id}`))!;
    expect(term.board.map(b => b.positionId)).toEqual(['pres', social.id]);

    // Renomear na gestão renomeia no organograma
    await h.call('generic.save', { tenantId: t, collection: 'terms', id, data: { board: term.board.map(b => (b.positionId === social.id ? { ...b, roleName: 'Diretor(a) social' } : b)) } }, h.actors.presidente);
    chart = (await h.store.get<OrgChartDoc>(P.orgchart(t)))!;
    expect(chart.positions.find(p => p.id === social.id)!.title).toBe('Diretor(a) social');

    // Mudar no organograma muda a gestão atual
    await h.call('orgchart.save', { tenantId: t, style: 'corte', title: 'Diretoria', showOnPublicPage: false, positions: chart.positions.map(p => (p.id === social.id ? { ...p, title: 'Social', personName: 'Beatriz Livre' } : p)) }, h.actors.presidente);
    term = (await h.store.get<TermDoc>(`${P.terms(t)}/${id}`))!;
    expect(term.board.find(b => b.positionId === social.id)).toMatchObject({ roleName: 'Social', name: 'Beatriz Livre' });
    await h.call('orgchart.handover', { tenantId: t, positionId: 'pres', since: '2027-01-01', keepOldAccess: true }, h.actors.presidente);
    term = (await h.store.get<TermDoc>(`${P.terms(t)}/${id}`))!;
    expect(term.board.find(b => b.positionId === 'pres')!.name).toBe('');

    // Cargo com acesso não aceita nome solto, e gestão antiga não mexe no organograma
    await expect(h.call('generic.save', { tenantId: t, collection: 'terms', id, data: { board: [{ positionId: 'pres', name: 'Sem Cadastro', roleId: 'presidente', roleName: 'Presidente' }] } }, h.actors.presidente)).rejects.toThrow(/sócio cadastrado/);
    await h.call('generic.save', { tenantId: t, collection: 'terms', data: { name: 'Gestão 2020', start: '2020-01-01', end: '2021-12-31', current: false, board: [{ name: 'Antigo Presidente', roleId: 'presidente', roleName: 'Presidente' }] } }, h.actors.presidente);
    expect((await h.store.get<OrgChartDoc>(P.orgchart(t)))!.positions.find(p => p.id === 'pres')!.personName).toBe('');
  });
});

describe('abas do organograma com nível de acesso', () => {
  it('o acesso da aba vale para todos os cargos dela, inclusive quem já ocupa; tirar o acesso da aba devolve', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const t = h.tenantId;
    await h.call('orgchart.save', { tenantId: t, style: 'cartoes', title: 'Diretoria', showOnPublicPage: false, positions: [pos('dir', 'Diretor social', { group: 'Diretoria', memberId: a.memberId }), pos('rei', 'Rei do tiro', { group: 'Majestades do tiro' })] }, h.actors.presidente);
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).not.toContain('secretario');
    const chart = (await h.store.get<OrgChartDoc>(P.orgchart(t)))!;
    await h.call('orgchart.save', { tenantId: t, style: 'cartoes', title: 'Diretoria', showOnPublicPage: false, tabs: true, groups: [{ name: 'Majestades do tiro', order: 1 }, { name: 'Diretoria', order: 2, roleId: 'secretario' }], positions: chart.positions }, h.actors.presidente);
    const after = (await h.store.get<OrgChartDoc>(P.orgchart(t)))!;
    expect(after.groups!.map(g => g.name)).toEqual(['Majestades do tiro', 'Diretoria']);
    expect(after.positions.find(p => p.id === 'dir')).toMatchObject({ roleId: 'secretario', roleFromGroup: true, memberId: a.memberId });
    expect(after.positions.find(p => p.id === 'rei')!.roleId).toBeUndefined();
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).toContain('secretario');
    // Tirou o acesso da aba: o cargo volta a não ter acesso e a pessoa perde o papel
    await h.call('orgchart.save', { tenantId: t, style: 'cartoes', title: 'Diretoria', showOnPublicPage: false, groups: [{ name: 'Diretoria', order: 1 }], positions: after.positions }, h.actors.presidente);
    expect((await h.store.get<OrgChartDoc>(P.orgchart(t)))!.positions.find(p => p.id === 'dir')!.roleId).toBeUndefined();
    expect((await h.store.get<MembershipDoc>(P.membership(t, a.who.uid)))!.roleIds).not.toContain('secretario');
    // Quem só edita o organograma (sem gerenciar papéis) não dá acesso por aba
    await expect(h.call('orgchart.save', { tenantId: t, style: 'cartoes', title: 'Diretoria', showOnPublicPage: false, groups: [{ name: 'Diretoria', order: 1, roleId: 'tesoureiro' }], positions: after.positions }, h.actors.secretario)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('cargo dá o acesso do papel de mesmo nome', () => {
  async function two() {
    const h = await makeTestTenant();
    const a = await makeMember(h, 'danubia', 'Danubia Beck');
    const b = actor('aline');
    const { memberId: bId } = await h.call<{ memberId: string }>(
      'members.apply',
      { tenantId: h.tenantId, data: { fullName: 'Aline Esperanca', cpf: '111.444.777-35', birthDate: '1985-01-01', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } },
      b
    );
    await h.call('members.approve', { tenantId: h.tenantId, memberId: bId }, h.actors.presidente);
    const roles = async (uid: string) => (await h.store.get<MembershipDoc>(P.membership(h.tenantId, uid)))!.roleIds;
    return { h, a, b, bId, roles };
  }

  it('pelo organograma: Secretária ocupada liga sozinho; "Só no organograma" não liga; nome sem cadastro fica de fora', async () => {
    const { h, a, roles } = await two();
    const t = h.tenantId;
    const r = await h.call<{ notes: string[] }>('orgchart.save', {
      tenantId: t, style: 'cartoes', title: 'Diretoria', showOnPublicPage: false,
      positions: [pos('sec', 'Secretária', { memberId: a.memberId }), pos('tes', 'Tesoureiro(a)', { personName: 'Fulano Sem Cadastro' }), pos('vice', 'Vice-presidente', { accessOff: true })],
    }, h.actors.presidente);
    const chart = (await h.store.get<OrgChartDoc>(P.orgchart(t)))!;
    expect(chart.positions.find(p => p.id === 'sec')!.roleId).toBe('secretario');
    expect(await roles(a.who.uid)).toContain('secretario');
    expect(chart.positions.find(p => p.id === 'tes')!.roleId).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/Tesoureiro.*sem cadastro|não tem cadastro/);
    expect(chart.positions.find(p => p.id === 'vice')!.roleId).toBeUndefined();
  });

  it('pela gestão: cargo sem acesso ligado passa a dar o acesso, e na troca quem sai perde e quem entra ganha', async () => {
    const { h, a, b, bId, roles } = await two();
    const t = h.tenantId;
    // Organograma salvo por quem não gerencia papéis (sem ligar): o cargo fica "Só no organograma"
    await h.store.set(P.orgchart(t), { style: 'cartoes', title: 'Diretoria', showOnPublicPage: false, updatedAt: '', positions: [pos('sec', 'Secretário(a)', { memberId: a.memberId, personName: 'Danubia Beck' })] });
    const { id } = await h.call<{ id: string }>('generic.save', {
      tenantId: t, collection: 'terms',
      data: { name: 'Gestão 2026 a 2027', start: '2026-01-01', end: '2027-12-31', current: true, board: [{ positionId: 'sec', memberId: a.memberId, name: 'Danubia Beck', roleId: 'sec', roleName: 'Secretário(a)' }] },
    }, h.actors.presidente);
    expect(await roles(a.who.uid)).toContain('secretario');
    // Troca de secretária na gestão
    await h.call('generic.save', { tenantId: t, collection: 'terms', id, data: { board: [{ positionId: 'sec', memberId: bId, name: 'Aline Esperanca', roleId: 'secretario', roleName: 'Secretário(a)' }] } }, h.actors.presidente);
    expect(await roles(b.uid)).toContain('secretario');
    expect(await roles(a.who.uid)).not.toContain('secretario');
  });
});
