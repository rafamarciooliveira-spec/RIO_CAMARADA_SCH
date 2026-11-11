/** Entrada por CPF e senha: código da diretoria, primeiro acesso, login, travas e troca de senha. */
import { describe, expect, it } from 'vitest';
import { makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberDoc, MemberPiiDoc, MembershipDoc } from '../../src/shared/types.ts';
import { weakPassword } from '../../src/shared/passwordHash.ts';

const CPF = '529.982.247-25'; // o do makeMember
const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

async function setup() {
  const h = await makeTestTenant();
  // Sócio cadastrado pela secretaria, sem conta (nunca entrou)
  const { memberId } = await h.call<{ memberId: string }>(
    'members.create',
    { tenantId: h.tenantId, data: { fullName: 'Seu Arno Schmitt', cpf: CPF, birthDate: '1948-03-10', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true },
    h.actors.secretario
  );
  return { h, memberId };
}

describe('entrada por CPF e senha', () => {
  it('a diretoria gera o código; a pessoa cria a senha; depois entra com CPF e senha', async () => {
    const { h, memberId } = await setup();
    const t = h.tenantId;
    const r = await h.call<{ code: string; link: string; expiresAt: string }>('access.createCode', { tenantId: t, memberId }, h.actors.secretario);
    expect(r.code).toMatch(/^\d{6}$/);
    expect(r.link).toMatch(/\/primeiro-acesso$/);

    // Código errado conta tentativa; senha fraca é recusada
    await denied(h.call('access.redeem', { tenantId: t, cpf: CPF, code: r.code === '000000' ? '111111' : '000000', password: 'Arno@1948' }, null), 'permission-denied');
    await denied(h.call('access.redeem', { tenantId: t, cpf: CPF, code: r.code, password: '123456' }, null), 'invalid-argument');
    await denied(h.call('access.redeem', { tenantId: t, cpf: CPF, code: r.code, password: '529982' }, null), 'invalid-argument');

    const ok = await h.call<{ email: string }>('access.redeem', { tenantId: t, cpf: CPF, code: r.code, password: 'Jardim48' }, null);
    expect(ok.email).toMatch(/@acesso\.verein\.app$/);
    const m = (await h.store.get<MemberDoc>(P.member(t, memberId)))!;
    expect(m.uid).toBeTruthy();
    const ms = (await h.store.get<MembershipDoc>(P.membership(t, m.uid!)))!;
    expect(ms).toMatchObject({ memberId, active: true });
    expect(ms.roleIds).toContain('socio');
    // O código é de uso único
    await denied(h.call('access.redeem', { tenantId: t, cpf: CPF, code: r.code, password: 'OutraSenha9' }, null), 'permission-denied');

    // Login: CPF com ou sem pontos
    expect((await h.call<{ email: string }>('access.login', { cpf: '52998224725', password: 'Jardim48' }, null)).email).toBe(ok.email);
    await denied(h.call('access.login', { cpf: CPF, password: 'errada1' }, null), 'permission-denied');
    // CPF sem conta responde igual a senha errada (não revela quem tem conta)
    await denied(h.call('access.login', { cpf: '111.444.777-35', password: 'Jardim48' }, null), 'permission-denied');
  });

  it('5 senhas erradas travam por 15 minutos; esqueceu a senha: código novo troca a senha na mesma conta', async () => {
    const { h, memberId } = await setup();
    const t = h.tenantId;
    const c1 = await h.call<{ code: string }>('access.createCode', { tenantId: t, memberId }, h.actors.secretario);
    const first = await h.call<{ email: string }>('access.redeem', { tenantId: t, cpf: CPF, code: c1.code, password: 'Jardim48' }, null);
    for (let i = 0; i < 5; i++) await denied(h.call('access.login', { cpf: CPF, password: `errada${i}x` }, null, { ip: `10.1.0.${i}` }), 'permission-denied');
    await denied(h.call('access.login', { cpf: CPF, password: 'Jardim48' }, null, { ip: '10.2.0.1' }), 'resource-exhausted');
    h.clock.advance(16 * 60_000);
    expect((await h.call<{ email: string }>('access.login', { cpf: CPF, password: 'Jardim48' }, null, { ip: '10.2.0.2' })).email).toBe(first.email);

    const uid = (await h.store.get<MemberDoc>(P.member(t, memberId)))!.uid;
    const c2 = await h.call<{ code: string }>('access.createCode', { tenantId: t, memberId }, h.actors.secretario);
    await h.call('access.redeem', { tenantId: t, cpf: CPF, code: c2.code, password: 'NovaSenha7' }, null);
    expect((await h.store.get<MemberDoc>(P.member(t, memberId)))!.uid).toBe(uid);
    await denied(h.call('access.login', { cpf: CPF, password: 'Jardim48' }, null, { ip: '10.3.0.1' }), 'permission-denied');
    expect((await h.call<{ email: string }>('access.login', { cpf: CPF, password: 'NovaSenha7' }, null, { ip: '10.3.0.2' })).email).toBe(first.email);
  });

  it('código vence em 3 dias; sócio comum não gera; sem CPF no cadastro avisa', async () => {
    const { h, memberId } = await setup();
    const t = h.tenantId;
    // Tesoureiro vê sócios mas não edita cadastro: não gera código
    await denied(h.call('access.createCode', { tenantId: t, memberId }, h.actors.tesoureiro), 'permission-denied');
    const c = await h.call<{ code: string }>('access.createCode', { tenantId: t, memberId }, h.actors.secretario);
    h.clock.advance(73 * 3600_000);
    await denied(h.call('access.redeem', { tenantId: t, cpf: CPF, code: c.code, password: 'Jardim48' }, null), 'failed-precondition');
    const { memberId: semCpf } = await h.call<{ memberId: string }>(
      'members.create',
      { tenantId: t, data: { fullName: 'Sem Documento Silva', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true },
      h.actors.secretario
    );
    await expect(h.call('access.createCode', { tenantId: t, memberId: semCpf }, h.actors.secretario)).rejects.toThrow(/não tem telefone nem CPF/);
  });

  it('senha fácil é recusada com o motivo', () => {
    expect(weakPassword('12345', '')).toMatch(/6 caracteres/);
    expect(weakPassword('111111', '')).toMatch(/repetido/);
    expect(weakPassword('654321', '')).toMatch(/sequência/);
    expect(weakPassword('52998224', '52998224725')).toMatch(/CPF/);
    expect(weakPassword('Jardim48', '52998224725')).toBeNull();
  });
});

describe('vários códigos e ficha sem conta Google', () => {
  it('códigos para vários: quem tem CPF recebe, quem não tem fica de fora com o motivo', async () => {
    const { h, memberId } = await setup();
    const t = h.tenantId;
    const { memberId: semCpf } = await h.call<{ memberId: string }>(
      'members.create',
      { tenantId: t, data: { fullName: 'Dona Hilda Sem Documento', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true },
      h.actors.secretario
    );
    const r = await h.call<{ done: { memberId: string; code: string }[]; skipped: { name: string; reason: string }[] }>('access.createCodes', { tenantId: t, memberIds: [memberId, semCpf] }, h.actors.secretario);
    expect(r.done.map(d => d.memberId)).toEqual([memberId]);
    expect(r.skipped[0]).toMatchObject({ name: 'Dona Hilda Sem Documento' });
    expect(r.skipped[0].reason).toMatch(/CPF/);
    await h.call('access.redeem', { tenantId: t, cpf: CPF, code: r.done[0].code, password: 'Jardim48' }, null);
  });

  it('a própria pessoa se cadastra com CPF e senha, entra para aprovação e já entra com CPF e senha', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    const opts = await h.call<{ enabled: boolean; categories: { id: string }[] }>('members.openFormOptions', { tenantId: t }, null);
    expect(opts.enabled).toBe(true);
    expect(opts.categories.length).toBeGreaterThan(0);
    const data = { fullName: 'Seu Arno Schmitt', cpf: CPF, birthDate: '1948-03-10', categoryId: 'efetivo', phone: '(47) 98888-7777' };
    const consents = { cadastro: true, imagem: false, comunicacao: true, marketing: false };
    await denied(h.call('members.applyOpen', { tenantId: t, data, consents, password: '123456' }, null), 'invalid-argument');
    const r = await h.call<{ email: string; memberId: string }>('members.applyOpen', { tenantId: t, data, consents, password: 'Jardim48' }, null);
    const m = (await h.store.get<MemberDoc>(P.member(t, r.memberId)))!;
    expect(m).toMatchObject({ status: 'pendente', fullName: 'Seu Arno Schmitt' });
    expect(m.uid).toBeTruthy();
    expect((await h.store.get<MembershipDoc>(P.membership(t, m.uid!)))!.memberId).toBe(r.memberId);
    expect((await h.call<{ email: string }>('access.login', { cpf: CPF, password: 'Jardim48' }, null)).email).toBe(r.email);
    // O mesmo CPF não faz outra ficha
    await expect(h.call('members.applyOpen', { tenantId: t, data, consents, password: 'OutraSenha9' }, null, { ip: '10.9.9.9' })).rejects.toThrow(/Já existe um cadastro com este CPF/);
    // A diretoria aprova normalmente
    await h.call('members.approve', { tenantId: t, memberId: r.memberId }, h.actors.presidente);
  });

  it('sociedade que desligou o CPF e senha não aceita a ficha sem Google', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    await h.call('tenant.update', { tenantId: t, loginMethods: { google: true, emailLink: true, cpfPassword: false } }, h.actors.presidente);
    expect((await h.call<{ enabled: boolean }>('members.openFormOptions', { tenantId: t }, null)).enabled).toBe(false);
    await denied(h.call('members.applyOpen', { tenantId: t, data: { fullName: 'Fulano de Tal', cpf: CPF, birthDate: '1950-01-01', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, password: 'Jardim48' }, null), 'failed-precondition');
  });
});

describe('pré-cadastro só com nome e telefone', () => {
  const consents = { cadastro: true, imagem: true, comunicacao: true, marketing: false };
  it('a diretoria cria com nome e telefone; a pessoa entra com telefone e código, completa CPF, nascimento e aceites e depois entra com CPF e senha', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    const pre = await h.call<{ memberId: string; code: string; byPhone: boolean }>('members.preRegister', { tenantId: t, fullName: 'Seu Arno Schmitt', phone: '(47) 99235-1234', categoryId: 'efetivo', approve: true }, h.actors.presidente);
    expect(pre.byPhone).toBe(true);
    expect((await h.store.get<MemberDoc>(P.member(t, pre.memberId)))!).toMatchObject({ preCadastro: true });
    // Com +55 e sem o 9 da frente também acha
    const need = await h.call<{ firstName: string; needCpf: boolean; needBirthDate: boolean; needConsents: boolean }>('access.check', { tenantId: t, login: '+55 47 9235-1234', code: pre.code }, null);
    expect(need).toMatchObject({ firstName: 'Seu', needCpf: true, needBirthDate: true, needConsents: true });
    // Sem o aceite não passa (e o código continua valendo)
    await denied(h.call('access.redeem', { tenantId: t, login: '47992351234', code: pre.code, password: 'Jardim48', data: { cpf: CPF, birthDate: '1948-03-10' } }, null), 'invalid-argument');
    const r = await h.call<{ email: string; memberId: string }>('access.redeem', { tenantId: t, login: '47992351234', code: pre.code, password: 'Jardim48', data: { cpf: CPF, birthDate: '1948-03-10' }, consents }, null);
    expect(r.memberId).toBe(pre.memberId);
    const m = (await h.store.get<MemberDoc>(P.member(t, pre.memberId)))!;
    expect(m.preCadastro).toBeUndefined();
    expect(m.uid).toBeTruthy();
    expect(m.birthMonthDay).toBe('03-10');
    const pii = (await h.store.get<MemberPiiDoc>(P.memberPii(t, pre.memberId)))!;
    expect(pii.cpfMasked).toBeTruthy();
    expect(pii.consents.find(c => c.purpose === 'imagem')?.granted).toBe(true);
    expect((await h.call<{ email: string }>('access.login', { cpf: CPF, password: 'Jardim48' }, null)).email).toBe(r.email);
  });

  it('casal com o mesmo telefone: cada código acha o seu cadastro; código errado não entra', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    const a = await h.call<{ memberId: string; code: string }>('members.preRegister', { tenantId: t, requestId: 'pa', fullName: 'Arno Schmitt', phone: '47 99235-1234', categoryId: 'efetivo' }, h.actors.presidente);
    const b = await h.call<{ memberId: string; code: string }>('members.preRegister', { tenantId: t, requestId: 'pb', fullName: 'Hilda Schmitt', phone: '47 99235-1234', categoryId: 'efetivo' }, h.actors.presidente);
    expect((await h.call<{ firstName: string }>('access.check', { tenantId: t, login: '(47) 99235-1234', code: b.code }, null)).firstName).toBe('Hilda');
    expect((await h.call<{ firstName: string }>('access.check', { tenantId: t, login: '(47) 99235-1234', code: a.code }, null)).firstName).toBe('Arno');
    const bad = ['000000', '111111'].find(c => c !== a.code && c !== b.code)!;
    await denied(h.call('access.check', { tenantId: t, login: '(47) 99235-1234', code: bad }, null), 'permission-denied');
    await denied(h.call('access.check', { tenantId: t, login: '(48) 91111-2222', code: a.code }, null), 'permission-denied');
  });

  it('não deixa usar no primeiro acesso o CPF de quem já tem senha no portal', async () => {
    const { h } = await setup();
    const t = h.tenantId;
    const { memberId } = await h.call<{ memberId: string }>('members.create', { tenantId: t, data: { fullName: 'Seu Arno Schmitt', cpf: '111.444.777-35', birthDate: '1948-03-10', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true }, h.actors.secretario);
    const c = await h.call<{ code: string }>('access.createCode', { tenantId: t, memberId }, h.actors.secretario);
    await h.call('access.redeem', { tenantId: t, cpf: '111.444.777-35', code: c.code, password: 'Jardim48' }, null);
    const pre = await h.call<{ code: string }>('members.preRegister', { tenantId: t, fullName: 'Fulano Esperto', phone: '(47) 98888-0000', categoryId: 'efetivo' }, h.actors.presidente);
    await expect(h.call('access.redeem', { tenantId: t, login: '47988880000', code: pre.code, password: 'Outra1234', data: { cpf: '111.444.777-35', birthDate: '1970-01-01' }, consents }, null)).rejects.toThrow(/já tem senha/);
  });
});

describe('excluir cadastro feito por engano', () => {
  it('exclui o pré-cadastro (some o código e o cadastro); sócio comum não exclui', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    const pre = await h.call<{ memberId: string; code: string }>('members.preRegister', { tenantId: t, fullName: 'Nelson Engano', phone: '(47) 99111-2222', categoryId: 'efetivo', approve: true }, h.actors.presidente);
    await denied(h.call('members.delete', { tenantId: t, memberId: pre.memberId }, h.actors.tesoureiro), 'permission-denied');
    await h.call('members.delete', { tenantId: t, memberId: pre.memberId }, h.actors.presidente);
    expect(await h.store.get(P.member(t, pre.memberId))).toBeNull();
    expect(await h.store.get(P.memberPii(t, pre.memberId))).toBeNull();
    expect(await h.store.get(P.accessCode(t, pre.memberId))).toBeNull();
    await denied(h.call('access.check', { tenantId: t, login: '47991112222', code: pre.code }, null), 'permission-denied');
  });

  it('com dependente não exclui (avisa o motivo)', async () => {
    const h = await makeTestTenant();
    const t = h.tenantId;
    const { memberId } = await h.call<{ memberId: string }>('members.create', { tenantId: t, data: { fullName: 'Titular Com Filho', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false }, approve: true }, h.actors.presidente);
    await h.call('members.addDependent', { tenantId: t, holderId: memberId, data: { fullName: 'Filho Do Titular', categoryId: 'dependente' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } }, h.actors.presidente);
    await expect(h.call('members.delete', { tenantId: t, memberId }, h.actors.presidente)).rejects.toThrow(/dependentes/);
  });
});
