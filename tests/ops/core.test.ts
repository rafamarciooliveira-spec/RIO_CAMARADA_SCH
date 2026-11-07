/**
 * Executor de operações e critérios de aceite de acesso (sem emulador, MemoryStore).
 * O mesmo executeOp roda na Cloud Function `api`: o que falha aqui falha em produção.
 */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberDoc, MembershipDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

async function inviteFor(h: H, email: string, roleIds = ['secretario']) {
  const r = await h.call<{ id: string; link?: string }>('invites.create', { tenantId: h.tenantId, email, roleIds }, h.actors.presidente);
  expect(r.link).toBeTruthy(); // e-mail simulado: o link volta para quem convidou
  const url = new URL(r.link!);
  return { inviteId: url.searchParams.get('i')!, token: url.searchParams.get('t')! };
}

describe('executor: autenticação e autorização', () => {
  it('rejeita sem login', async () => {
    const h = await makeTestTenant();
    await denied(h.call('members.create', { tenantId: h.tenantId, data: { fullName: 'Fulano de Tal', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } }, null), 'unauthenticated');
  });

  it('rejeita e-mail não verificado, mesmo com papel de presidente', async () => {
    const h = await makeTestTenant();
    const naoVerificado = { ...h.actors.presidente, emailVerified: false };
    await denied(h.call('members.export', { tenantId: h.tenantId, purpose: 'teste de acesso' }, naoVerificado), 'permission-denied');
  });

  it('rejeita quem não tem o papel exigido', async () => {
    const h = await makeTestTenant();
    await denied(h.call('members.export', { tenantId: h.tenantId, purpose: 'teste de acesso' }, h.actors.portaria), 'permission-denied');
    await denied(h.call('roles.save', { tenantId: h.tenantId, name: 'Novo papel', perms: {}, board: false }, h.actors.tesoureiro), 'permission-denied');
  });

  it('rejeita quem não é da sociedade', async () => {
    const h = await makeTestTenant();
    await denied(h.call('members.export', { tenantId: h.tenantId, purpose: 'teste de acesso' }, h.actors.estranho), 'permission-denied');
  });

  it('operação interna não pode ser chamada de fora', async () => {
    const h = await makeTestTenant();
    await denied(h.call('__job', { tenantId: h.tenantId, job: 'qualquer' }, h.actors.presidente), 'permission-denied');
    await denied(h.call('__job', { tenantId: h.tenantId, job: 'qualquer' }, null), 'permission-denied');
  });

  it('operação desconhecida falha', async () => {
    const h = await makeTestTenant();
    await denied(h.call('nao.existe', {}, h.actors.presidente), 'unimplemented');
  });

  it('com a exigência ligada, master sem segundo fator não entra no painel da plataforma', async () => {
    const h = await makeTestTenant();
    h.env.requireMasterMfa = true;
    const semMfa = { ...h.actors.master, mfa: false };
    await denied(h.call('platform.listTenants', {}, semMfa), 'permission-denied');
    await denied(h.call('platform.createTenant', { name: 'Outra Sociedade', slug: 'outra', planId: 'completo', adminEmails: ['a@teste.local'] }, semMfa), 'permission-denied');
    await expect(h.call('platform.listTenants', {}, h.actors.master)).resolves.toBeTruthy();
  });

  it('quem não é master não usa operações da plataforma, mesmo sendo presidente', async () => {
    const h = await makeTestTenant();
    await denied(h.call('platform.updateTenant', { tenantId: h.tenantId, status: 'ativa' }, { ...h.actors.presidente, mfa: true }), 'permission-denied');
    await denied(h.call('platform.supportAccess', { tenantId: h.tenantId, reason: 'motivo qualquer de teste', hours: 1 }, h.actors.presidente), 'permission-denied');
  });

  it('entrada inválida é barrada pelo schema', async () => {
    const h = await makeTestTenant();
    await denied(h.call('members.approve', { tenantId: h.tenantId, memberId: '../../outro' }, h.actors.presidente), 'invalid-argument');
    await denied(h.call('members.approve', { tenantId: '' }, h.actors.presidente), 'invalid-argument');
  });
});

describe('executor: idempotência e limite de taxa', () => {
  it('a mesma requestId não repete o efeito', async () => {
    const h = await makeTestTenant();
    const input = {
      tenantId: h.tenantId,
      requestId: 'req-123',
      data: { fullName: 'Pessoa Idempotente', categoryId: 'efetivo' },
      consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false },
    };
    const a = await h.call<{ memberId: string }>('members.create', input, h.actors.secretario);
    const b = await h.call<{ memberId: string }>('members.create', input, h.actors.secretario);
    expect(b.memberId).toBe(a.memberId);
    const all = await h.store.query(P.members(h.tenantId));
    expect(all.length).toBe(1);
  });

  it('limite de taxa por IP barra excesso e libera depois da janela', async () => {
    const h = await makeTestTenant();
    for (let i = 0; i < 60; i++) await h.call('platform.checkSlug', { slug: `teste-${i}` }, null, { ip: '10.9.9.9' });
    await denied(h.call('platform.checkSlug', { slug: 'mais-um' }, null, { ip: '10.9.9.9' }), 'resource-exhausted');
    // Outro IP não é afetado
    await expect(h.call('platform.checkSlug', { slug: 'outro-ip' }, null, { ip: '10.9.9.10' })).resolves.toBeTruthy();
    h.clock.advance(61_000);
    await expect(h.call('platform.checkSlug', { slug: 'depois' }, null, { ip: '10.9.9.9' })).resolves.toBeTruthy();
  });

  it('limite de taxa por conta na proposta de sócio', async () => {
    const h = await makeTestTenant();
    const who = actor('curioso');
    const input = { tenantId: h.tenantId, data: { fullName: 'Pessoa Curiosa', categoryId: 'inexistente' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } };
    for (let i = 0; i < 5; i++) await h.call('members.apply', input, who).catch(() => undefined);
    await denied(h.call('members.apply', input, who), 'resource-exhausted');
  });
});

describe('o sócio não altera a própria situação, valores, papéis ou carteirinha', () => {
  it('não muda situação, validade, aprovação nem categoria', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const t = h.tenantId;
    await denied(h.call('members.setStatus', { tenantId: t, memberId, status: 'ativo' }, who), 'permission-denied');
    await denied(h.call('members.approve', { tenantId: t, memberId }, who), 'permission-denied');
    await denied(h.call('members.renew', { tenantId: t, memberId, months: 120 }, who), 'permission-denied');
    await denied(h.call('members.update', { tenantId: t, memberId, data: { categoryId: 'benemerito' } }, who), 'permission-denied');
    await denied(h.call('members.requestFix', { tenantId: t, memberId, reason: 'teste qualquer' }, who), 'permission-denied');
    await denied(h.call('members.anonymize', { tenantId: t, memberId, reason: 'teste qualquer' }, who), 'permission-denied');
    await denied(h.call('members.import', { tenantId: t, rows: [{ fullName: 'Alguém Novo', status: 'ativo' }], commit: true }, who), 'permission-denied');
  });

  it('updateSelf ignora campos protegidos e não deixa trocar identidade depois de aprovado', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const before = (await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!;
    await h.call(
      'members.updateSelf',
      { tenantId: h.tenantId, memberId, phone: '(47) 91111-1111', status: 'ativo', validUntil: '2099-12-31', categoryId: 'benemerito', membershipNumber: '0001', uid: 'outro' },
      who
    );
    const after = (await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!;
    for (const k of ['status', 'validUntil', 'categoryId', 'categoryName', 'membershipNumber', 'uid'] as const) expect(after[k]).toEqual(before[k]);
    await denied(h.call('members.updateSelf', { tenantId: h.tenantId, memberId, fullName: 'Outro Nome Qualquer' }, who), 'failed-precondition');
    await denied(h.call('members.updateSelf', { tenantId: h.tenantId, memberId, cpf: '111.444.777-35' }, who), 'failed-precondition');
  });

  it('não mexe em valores da sociedade (mensalidade, contas, multa)', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const t = h.tenantId;
    await denied(h.call('tenant.updateSettings', { tenantId: t, settings: { categories: [{ id: 'efetivo', name: 'Efetivo', feeCents: 0, period: 'isento', allowsDependents: true }] } }, who), 'permission-denied');
    await denied(h.call('tenant.updateSettings', { tenantId: t, settings: { lateFeeBps: 0 } }, who), 'permission-denied');
    await denied(h.call('generic.save', { tenantId: t, collection: 'finAccounts', data: { name: 'Minha conta', type: 'caixa', openingBalanceCents: 999999, active: true } }, who), 'permission-denied');
    await denied(h.call('generic.save', { tenantId: t, collection: 'finAccounts', id: 'caixa', data: { openingBalanceCents: 1 } }, who), 'permission-denied');
    await denied(h.call('tenant.update', { tenantId: t, name: 'Sociedade Tomada' }, who), 'permission-denied');
  });

  it('não ganha papel nem convida', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const t = h.tenantId;
    await denied(h.call('memberships.setRoles', { tenantId: t, uid: who.uid, roleIds: ['presidente'] }, who), 'permission-denied');
    await denied(h.call('roles.save', { tenantId: t, id: 'socio', name: 'Sócio', perms: { socios: ['ver', 'editar'] }, board: true }, who), 'permission-denied');
    await denied(h.call('invites.create', { tenantId: t, email: who.email, roleIds: ['presidente'] }, who), 'permission-denied');
    const ms = (await h.store.get<MembershipDoc>(P.membership(t, who.uid)))!;
    expect(ms.roleIds).toEqual(['socio']);
    expect(ms.board).toBe(false);
  });

  it('não altera o modelo da carteirinha nem emite a de outra pessoa', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const t = h.tenantId;
    await denied(h.call('generic.save', { tenantId: t, collection: 'cardTemplates', id: 'padrao', data: { primaryColor: '#000000' } }, who), 'permission-denied');
    await denied(h.call('generic.delete', { tenantId: t, collection: 'cardTemplates', id: 'padrao' }, who), 'permission-denied');
    const other = await h.call<{ memberId: string }>(
      'members.create',
      { tenantId: t, data: { fullName: 'Outra Pessoa Souza', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true },
      h.actors.presidente
    );
    await denied(h.call('card.issue', { tenantId: t, memberId: other.memberId, kind: 'download' }, who), 'permission-denied');
    await denied(h.call('members.getPii', { tenantId: t, memberId: other.memberId }, who), 'permission-denied');
  });

  it('carteirinha suspensa não emite token', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    await h.call('members.setStatus', { tenantId: h.tenantId, memberId, status: 'suspenso', reason: 'teste' }, h.actors.presidente);
    await denied(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who), 'failed-precondition');
  });
});

describe('convites', () => {
  it('exige o e-mail certo', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, actor('intruso', { email: 'intruso@teste.local' })), 'permission-denied');
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, actor('nova', { email: 'nova.secretaria@teste.local', emailVerified: false })), 'permission-denied');
  });

  it('exige o token certo', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    await denied(h.call('invites.accept', { tenantId: h.tenantId, inviteId: inv.inviteId, token: 'x'.repeat(43) }, actor('nova', { email: 'nova.secretaria@teste.local' })), 'permission-denied');
  });

  it('é de uso único', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    const nova = actor('nova', { email: 'nova.secretaria@teste.local' });
    await h.call('invites.accept', { tenantId: h.tenantId, ...inv }, nova);
    const ms = (await h.store.get<MembershipDoc>(P.membership(h.tenantId, 'nova')))!;
    expect(ms.roleIds).toContain('secretario');
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, nova), 'failed-precondition');
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, actor('nova2', { email: 'nova.secretaria@teste.local' })), 'failed-precondition');
  });

  it('expira', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    h.clock.advance(7 * 86400_000 + 1000);
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, actor('nova', { email: 'nova.secretaria@teste.local' })), 'failed-precondition');
  });

  it('cancelado não vale', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    await h.call('invites.revoke', { tenantId: h.tenantId, id: inv.inviteId }, h.actors.presidente);
    await denied(h.call('invites.accept', { tenantId: h.tenantId, ...inv }, actor('nova', { email: 'nova.secretaria@teste.local' })), 'failed-precondition');
  });

  it('o token do convite não fica gravado', async () => {
    const h = await makeTestTenant();
    const inv = await inviteFor(h, 'nova.secretaria@teste.local');
    expect(JSON.stringify(h.store.dump())).not.toContain(inv.token);
  });

  it('papel da diretoria só por quem aprova papéis', async () => {
    const h = await makeTestTenant();
    // secretário tem papeis: ver e criar, mas não aprovar
    await denied(h.call('invites.create', { tenantId: h.tenantId, email: 'x@teste.local', roleIds: ['presidente'] }, h.actors.secretario), 'permission-denied');
    await expect(h.call('invites.create', { tenantId: h.tenantId, email: 'x@teste.local', roleIds: ['socio'] }, h.actors.secretario)).resolves.toBeTruthy();
  });
});

describe('sociedade suspensa e último administrador', () => {
  it('sociedade suspensa bloqueia as operações dos membros', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    await h.call('platform.updateTenant', { tenantId: h.tenantId, status: 'suspensa', reason: 'teste de suspensão' }, h.actors.master);
    await denied(h.call('members.export', { tenantId: h.tenantId, purpose: 'teste de acesso' }, h.actors.presidente), 'failed-precondition');
    await denied(h.call('card.issue', { tenantId: h.tenantId, memberId, kind: 'rotativo' }, who), 'failed-precondition');
    await h.call('platform.updateTenant', { tenantId: h.tenantId, status: 'ativa' }, h.actors.master);
    await expect(h.call('members.export', { tenantId: h.tenantId, purpose: 'teste de acesso' }, h.actors.presidente)).resolves.toBeTruthy();
  });

  it('o último administrador não pode ser removido nem rebaixado', async () => {
    const h = await makeTestTenant();
    await denied(h.call('memberships.revoke', { tenantId: h.tenantId, uid: 'presidente' }, h.actors.presidente), 'failed-precondition');
    await denied(h.call('memberships.setRoles', { tenantId: h.tenantId, uid: 'presidente', roleIds: ['socio'] }, h.actors.presidente), 'failed-precondition');
    // Com um segundo administrador, a remoção passa
    await h.call('memberships.setRoles', { tenantId: h.tenantId, uid: 'secretario', roleIds: ['vice'] }, h.actors.presidente);
    await expect(h.call('memberships.revoke', { tenantId: h.tenantId, uid: 'presidente' }, h.actors.secretario)).resolves.toBeTruthy();
  });

  it('o papel de presidente não perde a gestão de papéis', async () => {
    const h = await makeTestTenant();
    await denied(h.call('roles.save', { tenantId: h.tenantId, id: 'presidente', name: 'Presidente', perms: { socios: ['ver'] }, board: true }, h.actors.presidente), 'failed-precondition');
  });

  it('acesso revogado vale na hora', async () => {
    const h = await makeTestTenant();
    await h.call('memberships.revoke', { tenantId: h.tenantId, uid: 'tesoureiro' }, h.actors.presidente);
    await denied(h.call('generic.save', { tenantId: h.tenantId, collection: 'costCenters', data: { name: 'Centro novo', kind: 'geral', active: true } }, h.actors.tesoureiro), 'permission-denied');
  });

  it('acesso de suporte expira sozinho', async () => {
    const h = await makeTestTenant();
    await h.call('platform.supportAccess', { tenantId: h.tenantId, reason: 'investigar erro relatado', hours: 1 }, h.actors.master);
    await expect(h.call('members.getPii', { tenantId: h.tenantId, memberId: 'qualquer' }, h.actors.master)).rejects.toMatchObject({ code: 'not-found' });
    h.clock.advance(3600_000 + 1000);
    await denied(h.call('members.getPii', { tenantId: h.tenantId, memberId: 'qualquer' }, h.actors.master), 'permission-denied');
  });
});

describe('isolamento entre sociedades nas operações', () => {
  async function twoTenants() {
    const h = await makeTestTenant('sociedade-a');
    const b = await h.call<{ tenantId: string }>('platform.createTenant', { name: 'Sociedade B', slug: 'sociedade-b', planId: 'completo', adminEmails: ['pres.b@teste.local'] }, h.actors.master);
    const { memberId } = await makeMember(h);
    return { h, tenantB: b.tenantId, memberA: memberId };
  }

  it('ator da sociedade A não age na sociedade B', async () => {
    const { h, tenantB } = await twoTenants();
    const B = tenantB;
    await denied(h.call('members.export', { tenantId: B, purpose: 'teste de acesso' }, h.actors.presidente), 'permission-denied');
    await denied(h.call('tenant.update', { tenantId: B, name: 'Tomada por A' }, h.actors.presidente), 'permission-denied');
    await denied(h.call('roles.save', { tenantId: B, name: 'Papel de A', perms: {}, board: false }, h.actors.presidente), 'permission-denied');
    await denied(h.call('invites.create', { tenantId: B, email: 'x@teste.local', roleIds: ['presidente'] }, h.actors.presidente), 'permission-denied');
    await denied(h.call('generic.save', { tenantId: B, collection: 'events', data: {} }, h.actors.diretor_eventos), 'permission-denied');
    await denied(h.call('portaria.checkin', { tenantId: B, token: 'x'.repeat(43) }, h.actors.portaria), 'permission-denied');
  });

  it('não se usa id de sócio de A com o tenantId de B', async () => {
    const { h, tenantB, memberA } = await twoTenants();
    await denied(h.call('members.getPii', { tenantId: tenantB, memberId: memberA }, h.actors.presidente), 'permission-denied');
    await denied(h.call('members.approve', { tenantId: tenantB, memberId: memberA }, h.actors.presidente), 'permission-denied');
  });

  it('o sócio de A não usa a carteirinha em B', async () => {
    const { h, tenantB, memberA } = await twoTenants();
    await denied(h.call('card.issue', { tenantId: tenantB, memberId: memberA, kind: 'rotativo' }, actor('socio1')), 'permission-denied');
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: h.tenantId, memberId: memberA, kind: 'rotativo' }, actor('socio1'));
    const r = await h.call<{ status: string }>('card.verify', { slug: 'sociedade-b', token: tok.token }, null);
    expect(r.status).toBe('invalido');
  });
});
