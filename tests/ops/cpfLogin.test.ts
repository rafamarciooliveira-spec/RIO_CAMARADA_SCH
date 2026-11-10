/** Entrada por CPF e senha: código da diretoria, primeiro acesso, login, travas e troca de senha. */
import { describe, expect, it } from 'vitest';
import { makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { MemberDoc, MembershipDoc } from '../../src/shared/types.ts';
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
    await expect(h.call('access.createCode', { tenantId: t, memberId: semCpf }, h.actors.secretario)).rejects.toThrow(/não tem CPF/);
  });

  it('senha fácil é recusada com o motivo', () => {
    expect(weakPassword('12345', '')).toMatch(/6 caracteres/);
    expect(weakPassword('111111', '')).toMatch(/repetido/);
    expect(weakPassword('654321', '')).toMatch(/sequência/);
    expect(weakPassword('52998224', '52998224725')).toMatch(/CPF/);
    expect(weakPassword('Jardim48', '52998224725')).toBeNull();
  });
});
