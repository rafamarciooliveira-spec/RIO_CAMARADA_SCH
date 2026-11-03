/** Direitos do titular: pedidos, cópia dos dados sem CPF aberto, resolução e retenção automática. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';

describe('privacidade', () => {
  it('meus dados: perfil, consentimentos e histórico, com CPF mascarado', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const d = await h.call<Record<string, unknown>>('privacy.myData', { tenantId: h.tenantId, memberId }, who);
    const text = JSON.stringify(d);
    expect(text).not.toContain('52998224725');
    expect(text).not.toContain('529.982.247-25');
    expect(text).not.toContain('cpfEnc');
    expect(text).not.toContain('cpfHmac');
    expect((d.personal as { cpfMasked: string }).cpfMasked).toBe('***.982.247-**');
    expect((d.consents as unknown[]).length).toBe(4);
    expect((d.statusHistory as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect((d.profile as { fullName: string }).fullName).toBe('Pessoa de Teste Silva');
  });

  it('outra pessoa não pega meus dados nem abre pedido por mim', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await expect(h.call('privacy.myData', { tenantId: h.tenantId, memberId }, h.actors.secretario)).rejects.toThrow();
    await expect(h.call('privacy.request', { tenantId: h.tenantId, memberId, kind: 'acesso', details: '' }, h.actors.presidente)).rejects.toThrow();
  });

  it('pedido duplicado em andamento é barrado', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    await h.call('privacy.request', { tenantId: h.tenantId, memberId, kind: 'correcao', details: 'Telefone errado' }, who);
    await expect(h.call('privacy.request', { tenantId: h.tenantId, memberId, kind: 'correcao', details: 'De novo' }, who)).rejects.toThrow(/andamento/);
  });

  it('eliminação concluída anonimiza e preserva cobranças', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    await h.store.set(`${P.charges(h.tenantId)}/c1`, { memberId, memberUid: who.uid, memberName: 'Pessoa', description: 'Mensalidade', amountCents: 3000, discountCents: 0, dueDate: '2026-10-10', status: 'paga', kind: 'recorrente', reminders: [], createdAt: '2026-10-01T00:00:00Z' });
    const { id } = await h.call<{ id: string }>('privacy.request', { tenantId: h.tenantId, memberId, kind: 'eliminacao', details: 'Quero sair' }, who);
    // tesoureiro não tem permissão de dados pessoais
    await expect(h.call('privacy.resolve', { tenantId: h.tenantId, id, status: 'concluida', response: 'ok' }, h.actors.tesoureiro)).rejects.toThrow();
    // secretário vê PII mas não aprova? tem socios ALL e pii ver: pode
    const r = await h.call<{ anonymized: boolean }>('privacy.resolve', { tenantId: h.tenantId, id, status: 'concluida', response: 'Concluído.' }, h.actors.secretario);
    expect(r.anonymized).toBe(true);
    const m = await h.store.get<{ fullName: string; status: string }>(P.member(h.tenantId, memberId));
    expect(m?.status).toBe('desligado');
    expect(m?.fullName).not.toContain('Pessoa');
    expect(await h.store.get(P.memberPii(h.tenantId, memberId))).toBeNull();
    expect(await h.store.get(`${P.charges(h.tenantId)}/c1`)).not.toBeNull();
    const req = await h.store.get<{ status: string; response: string }>(`${P.privacyRequests(h.tenantId)}/${id}`);
    expect(req?.status).toBe('concluida');
    expect(req?.response).toMatch(/prazo legal/);
    await expect(h.call('privacy.resolve', { tenantId: h.tenantId, id, status: 'negada', response: 'mudei de ideia' }, h.actors.secretario)).rejects.toThrow();
  });

  it('negar exige explicação e revogação desliga consentimentos opcionais', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const { id } = await h.call<{ id: string }>('privacy.request', { tenantId: h.tenantId, memberId, kind: 'revogacao', details: 'Não quero mais e-mails' }, who);
    await expect(h.call('privacy.resolve', { tenantId: h.tenantId, id, status: 'negada', response: 'não' }, h.actors.presidente)).rejects.toThrow();
    await h.call('privacy.resolve', { tenantId: h.tenantId, id, status: 'concluida', response: 'Feito.' }, h.actors.presidente);
    const pii = await h.store.get<{ consents: { purpose: string; granted: boolean }[] }>(P.memberPii(h.tenantId, memberId));
    const last = (p: string) => pii!.consents.filter(c => c.purpose === p).pop()!.granted;
    expect(last('comunicacao')).toBe(false);
    expect(last('imagem')).toBe(false);
    expect(last('cadastro')).toBe(true);
  });

  it('retenção anonimiza desligados só depois do prazo', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await h.call('members.setStatus', { tenantId: h.tenantId, memberId, status: 'desligado', reason: 'pediu desligamento' }, h.actors.presidente);
    await runDailyJobs(h.env, h.tenantId);
    expect((await h.store.get<{ anonymizedAt?: string }>(P.member(h.tenantId, memberId)))?.anonymizedAt).toBeUndefined();
    h.clock.advance(5 * 366 * 86400_000);
    const res = await runDailyJobs(h.env, h.tenantId);
    expect(res.find(r => r.job === 'retencao_inativos')?.ok).toBe(true);
    const m = await h.store.get<{ anonymizedAt?: string; fullName: string }>(P.member(h.tenantId, memberId));
    expect(m?.anonymizedAt).toBeTruthy();
    expect(await h.store.get(P.memberPii(h.tenantId, memberId))).toBeNull();
  });
});

describe('opções do formulário', () => {
  it('quem ainda não é sócio recebe só categorias e campos, sem modelos de e-mail nem chave Pix', async () => {
    const h = await makeTestTenant();
    const r = await h.call<Record<string, unknown>>('members.formOptions', { tenantId: h.tenantId }, h.actors.estranho);
    expect(Object.keys(r).sort()).toEqual(['approvalRequired', 'categories', 'customFields']);
    expect((r.categories as unknown[]).length).toBeGreaterThan(0);
    await expect(h.call('members.formOptions', { tenantId: h.tenantId }, null)).rejects.toThrow();
  });
});
