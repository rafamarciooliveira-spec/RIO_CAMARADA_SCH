/** Prestação de contas publicada pelo servidor, aviso no quadro, assinatura e nomes no lugar dos ids. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { AccountabilityDoc, AuditDoc, MemberHistoryDoc, NoticeDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;
const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

function post(h: H, data: Record<string, unknown>) {
  return h.call('ledger.post', { tenantId: h.tenantId, date: '2026-10-05', accountId: 'caixa', direction: 'entrada', amountCents: 10000, chartAccountId: 'c1_01', description: 'Doação', ...data }, h.actors.tesoureiro);
}

const base = (h: H) => ({ tenantId: h.tenantId, kind: 'periodo', from: '2026-10-01', to: '2026-10-31', grouping: 'historico', title: 'Prestação de contas Outubro/2026', audience: 'socios', signers: [] as { name: string; role: string; uid?: string }[] });

describe('prestação de contas', () => {
  it('servidor calcula, congela, põe no quadro e o sócio só vê a publicada', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    await post(h, {});
    await post(h, { direction: 'saida', amountCents: 2500, chartAccountId: 'c2_01', description: 'Luz' });
    await denied(h.call('accountability.publish', base(h), who), 'permission-denied');
    await denied(h.call('accountability.publish', base(h), h.actors.conselho_fiscal), 'permission-denied');
    const r = await h.call<{ id: string }>('accountability.publish', { ...base(h), signers: [{ name: 'Conselho', role: 'Conselho fiscal', uid: 'conselho_fiscal' }] }, h.actors.tesoureiro);
    const doc = (await h.store.get<AccountabilityDoc>(P.accountability(h.tenantId, r.id)))!;
    expect(doc.report.totals).toEqual({ inCents: 10000, outCents: 2500 });
    expect(doc.report.closingCents).toBe(7500);
    expect(doc.periodLabel).toBe('Outubro/2026');
    expect(doc.publishedByName).toBeTruthy();
    expect(doc.signerUids).toEqual(['conselho_fiscal']);
    const notice = (await h.store.get<NoticeDoc>(P.notice(h.tenantId, doc.noticeId!)))!;
    expect(notice.link).toEqual({ label: 'Ver a prestação de contas', to: `prestacao-de-contas/${r.id}` });
    expect(notice.body).toContain('R$');
    // Lançamento depois da publicação não muda o que foi publicado
    await post(h, { amountCents: 99900, description: 'Depois' });
    expect((await h.store.get<AccountabilityDoc>(P.accountability(h.tenantId, r.id)))!.report.closingCents).toBe(7500);
    // Só quem foi indicado assina, uma vez
    await denied(h.call('accountability.sign', { tenantId: h.tenantId, id: r.id }, h.actors.presidente), 'permission-denied');
    await h.call('accountability.sign', { tenantId: h.tenantId, id: r.id }, h.actors.conselho_fiscal);
    await h.call('accountability.sign', { tenantId: h.tenantId, id: r.id }, h.actors.conselho_fiscal);
    expect((await h.store.get<AccountabilityDoc>(P.accountability(h.tenantId, r.id)))!.signatures).toHaveLength(1);
    // Retirar tira o aviso do quadro
    await h.call('accountability.withdraw', { tenantId: h.tenantId, id: r.id, reason: 'Lançamento duplicado' }, h.actors.tesoureiro);
    expect(await h.store.get(P.notice(h.tenantId, doc.noticeId!))).toBeNull();
    expect((await h.store.get<AccountabilityDoc>(P.accountability(h.tenantId, r.id)))!.status).toBe('retirado');
  });

  it('evento junta só o centro de custo; período vazio não publica', async () => {
    const h = await makeTestTenant();
    await denied(h.call('accountability.publish', base(h), h.actors.tesoureiro), 'failed-precondition');
    const { id: festa } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'costCenters', data: { name: 'Festa do Colono', kind: 'evento', active: true } }, h.actors.tesoureiro);
    await post(h, { costCenterId: festa, amountCents: 50000, description: 'Ingressos' });
    await post(h, { amountCents: 7000, description: 'Anuidade' });
    const r = await h.call<{ id: string }>('accountability.publish', { ...base(h), kind: 'evento', costCenterId: festa, from: '2000-01-01', to: '2999-12-31', audience: 'diretoria' }, h.actors.tesoureiro);
    const doc = (await h.store.get<AccountabilityDoc>(P.accountability(h.tenantId, r.id)))!;
    expect(doc.report.totals.inCents).toBe(50000);
    expect(doc.periodLabel).toBe('Festa do Colono');
    expect(doc.noticeId).toBeUndefined(); // só diretoria: nada no quadro
  });
});

describe('nomes no lugar dos identificadores', () => {
  it('histórico e auditoria gravam o nome; diretoria resolve os antigos', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    const hist = await h.store.query<MemberHistoryDoc>(P.memberHistory(h.tenantId, memberId));
    // Quem se cadastrou e quem aprovou aparecem pelo nome da conta (no teste, o nome é o próprio id)
    expect(hist.map(x => x.data.byName).sort()).toEqual(['presidente', 'socio1']);
    const audit = await h.store.query<AuditDoc>(P.audit(h.tenantId));
    expect(audit.every(a => typeof a.data.actorName === 'string' && a.data.actorName.length > 0)).toBe(true);
    const r = await h.call<{ names: Record<string, string> }>('people.names', { tenantId: h.tenantId, ids: ['tesoureiro', memberId, 'sistema'] }, h.actors.presidente);
    expect(r.names[memberId]).toBe('Pessoa de Teste Silva');
    expect(r.names.sistema).toBe('Rotina automática');
    expect(r.names.tesoureiro).toBeTruthy();
  });
  it('sócio comum não consulta nomes', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    await denied(h.call('people.names', { tenantId: h.tenantId, ids: ['tesoureiro'] }, who), 'permission-denied');
  });
});
