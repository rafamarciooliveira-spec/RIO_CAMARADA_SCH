/** Financeiro: livro caixa imutável, dupla aprovação, estorno, períodos, cobranças, webhook, OFX e rotinas. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { listOps, runDailyJobs } from '../../src/shared/core/ops.ts';
import { dre, trialBalance, cashFlowByMonth } from '../../src/shared/finance/reports.ts';
import type { ChargeDoc, FinAccountDoc, LedgerEntryDoc, MemberDoc, DashboardStats } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

async function balance(h: H, acc = 'caixa') {
  return (await h.store.get<FinAccountDoc>(`${P.accounts(h.tenantId)}/${acc}`))!.balanceCents;
}
async function ledger(h: H) {
  return (await h.store.query<LedgerEntryDoc>(P.ledger(h.tenantId))).map(r => ({ ...r.data, id: r.id }));
}
function post(h: H, data: Record<string, unknown>, who = h.actors.tesoureiro) {
  return h.call<{ id: string; number: number; status: string }>(
    'ledger.post',
    { tenantId: h.tenantId, date: '2026-11-02', accountId: 'caixa', direction: 'entrada', amountCents: 10000, chartAccountId: 'c1_01', description: 'Doação', ...data },
    who
  );
}

describe('livro caixa', () => {
  it('numera em sequência, atualiza saldo e painel', async () => {
    const h = await makeTestTenant();
    const a = await post(h, {});
    const b = await post(h, { direction: 'saida', amountCents: 2500, chartAccountId: 'c2_01', description: 'Luz' });
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(await balance(h)).toBe(7500);
    const st = (await h.store.get<DashboardStats>(P.stats(h.tenantId)))!;
    expect(st.finance).toMatchObject({ balanceCents: 7500, monthInCents: 10000, monthOutCents: 2500 });
  });

  it('confere a natureza da conta e as permissões', async () => {
    const h = await makeTestTenant();
    await expect(post(h, { chartAccountId: 'c2_01' })).rejects.toThrow(/receita/);
    await expect(post(h, {}, h.actors.conselho_fiscal)).rejects.toThrow(/papel/);
    await expect(post(h, {}, h.actors.estranho)).rejects.toThrow();
    await expect(post(h, { attachments: ['tenants/outra/attachments/x.pdf'] })).rejects.toThrow(/Anexo/);
  });

  it('dupla aprovação: saída alta fica pendente e só outra pessoa aprova', async () => {
    const h = await makeTestTenant();
    await h.store.update(P.settings(h.tenantId), { doubleApprovalAboveCents: 50000 });
    await post(h, { amountCents: 100000 });
    const big = await post(h, { direction: 'saida', amountCents: 60000, chartAccountId: 'c2_06', description: 'Reforma' });
    expect(big.status).toBe('aguardando_aprovacao');
    expect(await balance(h)).toBe(100000);
    await expect(h.call('ledger.approve', { tenantId: h.tenantId, entryId: big.id }, h.actors.tesoureiro)).rejects.toThrow(/outra pessoa/);
    await h.call('ledger.approve', { tenantId: h.tenantId, entryId: big.id }, h.actors.presidente);
    expect(await balance(h)).toBe(40000);
    const small = await post(h, { direction: 'saida', amountCents: 50000, chartAccountId: 'c2_06', description: 'Pintura' });
    expect(small.status).toBe('lancado');
    const other = await post(h, { direction: 'saida', amountCents: 70000, chartAccountId: 'c2_06', description: 'Telhado' });
    await h.call('ledger.reject', { tenantId: h.tenantId, entryId: other.id, reason: 'Sem orçamento' }, h.actors.presidente);
    expect(await balance(h)).toBe(-10000);
    const rows = await ledger(h);
    expect(rows.find(r => r.id === other.id)!.status).toBe('recusado');
  });

  it('estorno cria lançamento oposto, marca o original e zera o efeito nos relatórios', async () => {
    const h = await makeTestTenant();
    const a = await post(h, { amountCents: 4000 });
    const before = (await ledger(h))[0];
    const r = await h.call<{ ids: string[] }>('ledger.reverse', { tenantId: h.tenantId, entryId: a.id, reason: 'Lançado em duplicidade' }, h.actors.tesoureiro);
    expect(await balance(h)).toBe(0);
    const rows = await ledger(h);
    expect(rows).toHaveLength(2);
    const orig = rows.find(x => x.id === a.id)!;
    const rev = rows.find(x => x.id === r.ids[0])!;
    expect(orig.reversedBy).toBe(rev.id);
    expect(rev).toMatchObject({ reversalOf: a.id, direction: 'saida', amountCents: 4000, number: 2 });
    // Nada do original mudou além da marcação
    const { reversedBy: _x, ...rest } = orig;
    expect(rest).toEqual(before);
    await expect(h.call('ledger.reverse', { tenantId: h.tenantId, entryId: a.id, reason: 'de novo por engano' }, h.actors.tesoureiro)).rejects.toThrow(/já foi estornado/);
    await expect(h.call('ledger.reverse', { tenantId: h.tenantId, entryId: rev.id, reason: 'estorno do estorno' }, h.actors.tesoureiro)).rejects.toThrow(/não pode ser estornado/);
    const chart = (await h.store.query<{ code: string; name: string; kind: 'receita' | 'despesa' }>(P.chart(h.tenantId))).map(c => ({ ...c.data, id: c.id }));
    expect(dre(rows, chart).resultadoCents).toBe(0);
    expect(cashFlowByMonth(rows)[0].netCents).toBe(0);
  });

  it('transferência gera dois lançamentos e o estorno desfaz as duas pernas', async () => {
    const h = await makeTestTenant();
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'finAccounts', data: { name: 'Banco', type: 'banco', openingBalanceCents: 0, active: true } }, h.actors.tesoureiro);
    const banco = (await h.store.query<FinAccountDoc>(P.accounts(h.tenantId))).find(r => r.data.name === 'Banco')!.id;
    await post(h, { amountCents: 9000 });
    const tr = await h.call<{ ids: string[] }>('ledger.transfer', { tenantId: h.tenantId, fromAccountId: 'caixa', toAccountId: banco, amountCents: 5000, date: '2026-11-02', description: 'Depósito' }, h.actors.tesoureiro);
    expect(await balance(h)).toBe(4000);
    expect(await balance(h, banco)).toBe(5000);
    const st = (await h.store.get<DashboardStats>(P.stats(h.tenantId)))!;
    expect(st.finance.monthInCents).toBe(9000);
    await h.call('ledger.reverse', { tenantId: h.tenantId, entryId: tr.ids[1], reason: 'Depósito não feito' }, h.actors.tesoureiro);
    expect(await balance(h)).toBe(9000);
    expect(await balance(h, banco)).toBe(0);
  });

  it('período fechado bloqueia lançamentos; reabrir exige motivo e fica auditado', async () => {
    const h = await makeTestTenant();
    await post(h, { date: '2026-10-15' });
    await h.call('periods.close', { tenantId: h.tenantId, periodKey: '2026-10' }, h.actors.tesoureiro);
    const p = await h.store.get<{ totals: { inCents: number } }>(P.period(h.tenantId, '2026-10'));
    expect(p!.totals.inCents).toBe(10000);
    await expect(post(h, { date: '2026-10-20' })).rejects.toThrow(/fechado/);
    await expect(h.call('periods.reopen', { tenantId: h.tenantId, periodKey: '2026-10', reason: '' }, h.actors.tesoureiro)).rejects.toThrow();
    await h.call('periods.reopen', { tenantId: h.tenantId, periodKey: '2026-10', reason: 'Nota fiscal atrasada' }, h.actors.tesoureiro);
    await post(h, { date: '2026-10-20' });
    const audit = await h.store.query<{ action: string }>(P.audit(h.tenantId), { where: [['action', '==', 'periods.reopened']] });
    expect(audit).toHaveLength(1);
    await expect(h.call('periods.close', { tenantId: h.tenantId, periodKey: '2027-01' }, h.actors.tesoureiro)).rejects.toThrow(/não começou/);
  });

  it('não existe operação que apague ou edite lançamento', async () => {
    const h = await makeTestTenant();
    const a = await post(h, {});
    const names = listOps();
    expect(names.filter(n => /^ledger\./.test(n)).sort()).toEqual(['ledger.approve', 'ledger.post', 'ledger.reject', 'ledger.reverse', 'ledger.transfer']);
    await expect(h.call('generic.delete', { tenantId: h.tenantId, collection: 'ledger', id: a.id }, h.actors.presidente)).rejects.toThrow();
    await expect(h.call('generic.save', { tenantId: h.tenantId, collection: 'ledger', id: a.id, data: { amountCents: 1 } }, h.actors.presidente)).rejects.toThrow();
    await expect(h.call('generic.delete', { tenantId: h.tenantId, collection: 'finAccounts', id: 'caixa' }, h.actors.presidente)).rejects.toThrow(/desative/);
    expect(await ledger(h)).toHaveLength(1);
  });
});

describe('cobranças', () => {
  it('lote da competência não duplica e respeita categoria', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    const r1 = await h.call<{ created: number; dueDate: string }>('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-11', discountCents: 500 }, h.actors.tesoureiro);
    expect(r1.created).toBe(1);
    expect(r1.dueDate).toBe('2026-11-10');
    const r2 = await h.call<{ created: number; skipped: number }>('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-11' }, h.actors.tesoureiro);
    expect(r2).toMatchObject({ created: 0, skipped: 1 });
    const c = (await h.store.query<ChargeDoc>(P.charges(h.tenantId)))[0].data;
    expect(c).toMatchObject({ memberId, amountCents: 3000, discountCents: 500, kind: 'recorrente', status: 'aberta', competence: '2026-11' });
    // Categoria isenta não gera cobrança
    await h.store.update(P.member(h.tenantId, memberId), { categoryId: 'benemerito' });
    const r3 = await h.call<{ created: number }>('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-12' }, h.actors.tesoureiro);
    expect(r3.created).toBe(0);
  });

  it('atraso: vence, vira em atraso, suspende a carteirinha e volta para ativo após a baixa', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const tok = await h.call<{ token: string }>('card.issue', { tenantId: h.tenantId, memberId, kind: 'download' }, who);
    await h.call('charges.generateBatch', { tenantId: h.tenantId, competence: '2026-09' }, h.actors.tesoureiro);
    await runDailyJobs(h.env, h.tenantId);
    const charge = (await h.store.query<ChargeDoc>(P.charges(h.tenantId)))[0];
    expect(charge.data.status).toBe('vencida');
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!.status).toBe('em_atraso');
    h.clock.set('2026-11-10T12:00:00.000Z'); // 61 dias de atraso
    await runDailyJobs(h.env, h.tenantId);
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!.status).toBe('suspenso');
    const v = await h.call<{ status: string }>('card.verify', { slug: h.tenant.slug, token: tok.token }, null);
    expect(v.status).toBe('suspenso');
    const st = (await h.store.get<DashboardStats>(P.stats(h.tenantId)))!;
    expect(st.finance).toMatchObject({ overdueCount: 1, overdueCents: 3000 });

    const paid = await h.call<{ receiptNumber: number; paidAmountCents: number }>(
      'charges.pay',
      { tenantId: h.tenantId, chargeId: charge.id, accountId: 'caixa', method: 'dinheiro', paidOn: '2026-11-10' },
      h.actors.tesoureiro
    );
    // 2% de multa (60) + 1% ao mês por 61 dias (61)
    expect(paid).toMatchObject({ receiptNumber: 1, paidAmountCents: 3000 + 60 + 61 });
    const c = (await h.store.get<ChargeDoc>(charge.path))!;
    expect(c).toMatchObject({ status: 'paga', lateFeeCents: 60, interestCents: 61, method: 'dinheiro', receiptNumber: 1 });
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!.status).toBe('ativo');
    expect(await balance(h)).toBe(3121);
    const e = (await ledger(h))[0];
    expect(e).toMatchObject({ chargeId: charge.id, chartAccountId: 'c1_01', direction: 'entrada' });
    await expect(h.call('charges.pay', { tenantId: h.tenantId, chargeId: charge.id, accountId: 'caixa', method: 'pix', paidOn: '2026-11-10' }, h.actors.tesoureiro)).rejects.toThrow(/já foi paga/);
    await expect(h.call('charges.cancel', { tenantId: h.tenantId, chargeId: charge.id, reason: 'teste de cancelamento' }, h.actors.tesoureiro)).rejects.toThrow(/Estorne/);
    // Estorno do recebimento reabre a cobrança
    await h.call('ledger.reverse', { tenantId: h.tenantId, entryId: e.id, reason: 'Cheque devolvido' }, h.actors.tesoureiro);
    expect((await h.store.get<ChargeDoc>(charge.path))!.status).toBe('vencida');
  });

  it('suspensão manual da diretoria não é desfeita pela rotina', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await h.call('members.setStatus', { tenantId: h.tenantId, memberId, status: 'suspenso', reason: 'Decisão do conselho' }, h.actors.presidente);
    await runDailyJobs(h.env, h.tenantId);
    expect((await h.store.get<MemberDoc>(P.member(h.tenantId, memberId)))!.status).toBe('suspenso');
  });

  it('sócio gera o Pix da própria cobrança; outra pessoa não', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    await h.store.update(P.settings(h.tenantId), { pixKey: 'tesouraria@sociedade.org' });
    const { id } = await h.call<{ id: string }>('charges.create', { tenantId: h.tenantId, memberId, description: 'Taxa do baile', amountCents: 5000, dueDate: '2026-11-20' }, h.actors.tesoureiro);
    const pay = await h.call<{ pixCopyPaste: string; sandbox: boolean; externalId: string }>('charges.createPayment', { tenantId: h.tenantId, chargeId: id }, who);
    expect(pay.sandbox).toBe(true);
    expect(pay.pixCopyPaste).toContain('tesouraria@sociedade.org');
    expect(pay.pixCopyPaste).toContain('SOCIEDADE TESTE');
    expect(pay.pixCopyPaste).toContain('540550.00');
    const again = await h.call<{ externalId: string }>('charges.createPayment', { tenantId: h.tenantId, chargeId: id }, who);
    expect(again.externalId).toBe(pay.externalId);
    await expect(h.call('charges.createPayment', { tenantId: h.tenantId, chargeId: id }, h.actors.portaria)).rejects.toThrow();
  });

  it('webhook: só interno, idempotente por evento', async () => {
    const h = await makeTestTenant();
    const { memberId, who } = await makeMember(h);
    const { id } = await h.call<{ id: string }>('charges.create', { tenantId: h.tenantId, memberId, description: 'Taxa', amountCents: 2000, dueDate: '2026-11-20' }, h.actors.tesoureiro);
    const pay = await h.call<{ externalId: string }>('charges.createPayment', { tenantId: h.tenantId, chargeId: id }, who);
    const ev = { tenantId: h.tenantId, eventId: 'evt-1', externalId: pay.externalId, type: 'paid', paidAmountCents: 2000, paidAt: '2026-11-02T15:00:00Z' };
    await expect(h.call('finance.applyPaymentEvent', ev, h.actors.presidente)).rejects.toThrow(/interna/);
    const r1 = await h.call<{ result: string }>('finance.applyPaymentEvent', ev, null, { internal: true });
    const r2 = await h.call<{ duplicate: boolean }>('finance.applyPaymentEvent', ev, null, { internal: true });
    expect(r1.result).toBe('paga');
    expect(r2.duplicate).toBe(true);
    expect(await ledger(h)).toHaveLength(1);
    expect(await balance(h)).toBe(2000);
    const r3 = await h.call<{ result: string }>('finance.applyPaymentEvent', { ...ev, eventId: 'evt-2' }, null, { internal: true });
    expect(r3.result).toBe('ja_paga');
    expect(await ledger(h)).toHaveLength(1);
  });

  it('régua de lembretes: D-3 uma vez, só com consentimento', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await h.call('charges.create', { tenantId: h.tenantId, memberId, description: 'Taxa', amountCents: 2000, dueDate: '2026-11-04' }, h.actors.tesoureiro);
    await runDailyJobs(h.env, h.tenantId);
    await runDailyJobs(h.env, h.tenantId);
    let c = (await h.store.query<ChargeDoc>(P.charges(h.tenantId)))[0].data;
    expect(c.reminders.map(r => r.kind)).toEqual(['d-3']);
    h.clock.set('2026-11-04T12:00:00.000Z');
    await runDailyJobs(h.env, h.tenantId);
    h.clock.set('2026-11-09T12:00:00.000Z');
    await runDailyJobs(h.env, h.tenantId);
    c = (await h.store.query<ChargeDoc>(P.charges(h.tenantId)))[0].data;
    expect(c.reminders.map(r => r.kind)).toEqual(['d-3', 'd0', 'd+5']);
    const out = await h.store.query<{ template: string }>(P.outbox(h.tenantId), { where: [['template', '==', 'lembrete']] });
    expect(out).toHaveLength(3);
  });

  it('sem consentimento de comunicação não há lembrete', async () => {
    const h = await makeTestTenant();
    const who = actor('semconsent');
    const { memberId } = await h.call<{ memberId: string }>(
      'members.apply',
      { tenantId: h.tenantId, data: { fullName: 'Sem Contato Pereira', categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } },
      who
    );
    await h.call('members.approve', { tenantId: h.tenantId, memberId }, h.actors.presidente);
    await h.call('charges.create', { tenantId: h.tenantId, memberId, description: 'Taxa', amountCents: 2000, dueDate: '2026-11-04' }, h.actors.tesoureiro);
    await runDailyJobs(h.env, h.tenantId);
    const c = (await h.store.query<ChargeDoc>(P.charges(h.tenantId)))[0].data;
    expect(c.reminders).toHaveLength(0);
  });
});

describe('extrato e conciliação', () => {
  const ofx = `<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103<TRNAMT>100.00<FITID>F1<MEMO>Pix</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-25.00<FITID>F2<MEMO>Tarifa</STMTTRN>
</BANKTRANLIST></OFX>`;

  it('importa sem duplicar e concilia por sugestão única', async () => {
    const h = await makeTestTenant();
    const a = await post(h, {});
    const r1 = await h.call<{ imported: number }>('finance.importStatement', { tenantId: h.tenantId, accountId: 'caixa', ofx }, h.actors.tesoureiro);
    const r2 = await h.call<{ imported: number; duplicates: number }>('finance.importStatement', { tenantId: h.tenantId, accountId: 'caixa', ofx }, h.actors.tesoureiro);
    expect(r1.imported).toBe(2);
    expect(r2).toMatchObject({ imported: 0, duplicates: 2 });
    const auto = await h.call<{ matched: number }>('finance.reconcile', { tenantId: h.tenantId, autoAccountId: 'caixa' }, h.actors.tesoureiro);
    expect(auto.matched).toBe(1);
    const lines = await h.store.query<{ fitId: string; matchedEntryId?: string }>(P.statementLines(h.tenantId));
    expect(lines.find(l => l.data.fitId === 'F1')!.data.matchedEntryId).toBe(a.id);
    const f2 = lines.find(l => l.data.fitId === 'F2')!;
    await expect(h.call('finance.reconcile', { tenantId: h.tenantId, lineId: f2.id, entryId: a.id }, h.actors.tesoureiro)).rejects.toThrow(/diferente/);
    await expect(h.call('finance.importStatement', { tenantId: h.tenantId, accountId: 'caixa', ofx: 'nada de extrato aqui' }, h.actors.tesoureiro)).rejects.toThrow(/OFX/);
  });
});

describe('aceite: relatórios conciliam com os saldos', () => {
  it('balancete e fluxo batem com os saldos das contas depois de tudo', async () => {
    const h = await makeTestTenant();
    const { memberId } = await makeMember(h);
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'finAccounts', data: { name: 'Banco', type: 'banco', openingBalanceCents: 50000, active: true } }, h.actors.tesoureiro);
    const banco = (await h.store.query<FinAccountDoc>(P.accounts(h.tenantId))).find(r => r.data.name === 'Banco')!.id;
    await post(h, { amountCents: 12345 });
    const d = await post(h, { direction: 'saida', amountCents: 2345, chartAccountId: 'c2_02', description: 'Conserto' });
    await h.call('ledger.reverse', { tenantId: h.tenantId, entryId: d.id, reason: 'Valor errado' }, h.actors.tesoureiro);
    await post(h, { direction: 'saida', amountCents: 3000, chartAccountId: 'c2_02', description: 'Conserto certo', accountId: banco });
    await h.call('ledger.transfer', { tenantId: h.tenantId, fromAccountId: banco, toAccountId: 'caixa', amountCents: 7000, date: '2026-11-02', description: 'Saque' }, h.actors.tesoureiro);
    const { id } = await h.call<{ id: string }>('charges.create', { tenantId: h.tenantId, memberId, description: 'Taxa', amountCents: 2000, dueDate: '2026-11-20' }, h.actors.tesoureiro);
    await h.call('charges.pay', { tenantId: h.tenantId, chargeId: id, accountId: banco, method: 'pix', paidOn: '2026-11-02' }, h.actors.tesoureiro);

    const entries = await ledger(h);
    const accounts = (await h.store.query<FinAccountDoc>(P.accounts(h.tenantId))).map(r => ({ ...r.data, id: r.id }));
    const tb = trialBalance(entries, accounts);
    for (const acc of accounts) expect(tb.rows.find(r => r.accountId === acc.id)!.finalCents).toBe(acc.balanceCents);
    const chart = (await h.store.query<{ code: string; name: string; kind: 'receita' | 'despesa' }>(P.chart(h.tenantId))).map(c => ({ ...c.data, id: c.id }));
    const r = dre(entries, chart);
    expect(r.resultadoCents).toBe(tb.total.finalCents - tb.total.openingCents);
    expect(r.resultadoCents).toBe(12345 - 3000 + 2000);
    const cf = cashFlowByMonth(entries, { openingCents: tb.total.openingCents });
    expect(cf[cf.length - 1].cumulativeCents).toBe(tb.total.finalCents);
    await runDailyJobs(h.env, h.tenantId);
    const st = (await h.store.get<DashboardStats>(P.stats(h.tenantId)))!;
    expect(st.finance.balanceCents).toBe(tb.total.finalCents);
  });
});
