/** Funções puras: leitor OFX e relatórios financeiros. */
import { describe, expect, it } from 'vitest';
import { ofxAmount, ofxDate, parseOfx } from '../../src/shared/ofx.ts';
import { budgetVsActual, cashFlowByMonth, delinquency, dre, suggestMatches, trialBalance } from '../../src/shared/finance/reports.ts';
import type { LedgerEntryDoc } from '../../src/shared/types.ts';

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>001<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261015120000[-3:BRT]
<TRNAMT>150.00
<FITID>A1
<MEMO>PIX RECEBIDO JOAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261016
<TRNAMT>-89,90
<FITID>A2
<NAME>CELESC
<MEMO>Conta de luz &amp; taxa
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261017
<TRNAMT>-10.00
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const XML = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261101</DTPOSTED><TRNAMT>1,234.56</TRNAMT><FITID>X9</FITID><MEMO>Deposito</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('OFX', () => {
  it('lê SGML sem fechamento de tags, vírgula decimal e entidades', () => {
    const st = parseOfx(SGML);
    expect(st.bankId).toBe('001');
    expect(st.accountNumber).toBe('12345-6');
    expect(st.transactions).toHaveLength(3);
    expect(st.transactions[0]).toMatchObject({ fitId: 'A1', date: '2026-10-15', amountCents: 15000, type: 'CREDIT' });
    expect(st.transactions[1]).toMatchObject({ fitId: 'A2', amountCents: -8990, memo: 'CELESC Conta de luz & taxa' });
    // Sem FITID: identificador sintético estável
    const again = parseOfx(SGML);
    expect(st.transactions[2].fitId).toMatch(/^sint_20261017_/);
    expect(again.transactions[2].fitId).toBe(st.transactions[2].fitId);
  });

  it('lê XML com milhar', () => {
    const st = parseOfx(XML);
    expect(st.transactions[0]).toMatchObject({ fitId: 'X9', date: '2026-11-01', amountCents: 123456 });
  });

  it('valores e datas', () => {
    expect(ofxAmount('1.234,56')).toBe(123456);
    expect(ofxAmount('-0.1')).toBe(-10);
    expect(ofxAmount('abc')).toBeNull();
    expect(ofxDate('20261399')).toBeNull();
    expect(parseOfx('texto qualquer').transactions).toHaveLength(0);
  });
});

let seq = 0;
function e(p: Partial<LedgerEntryDoc>): LedgerEntryDoc {
  seq++;
  const date = p.date || '2026-10-05';
  return {
    id: p.id || `e${seq}`,
    number: seq,
    date,
    periodKey: date.slice(0, 7),
    accountId: 'caixa',
    direction: 'entrada',
    amountCents: 1000,
    chartAccountId: 'c1_01',
    description: 'x',
    attachments: [],
    status: 'lancado',
    approvals: [],
    createdBy: 'u',
    createdAt: '2026-10-05T00:00:00Z',
    ...p,
  } as LedgerEntryDoc;
}

const chart = [
  { id: 'c1_01', code: '1.01', name: 'Mensalidades', kind: 'receita' as const },
  { id: 'c2_01', code: '2.01', name: 'Água, luz e telefone', kind: 'despesa' as const },
];

describe('relatórios', () => {
  const entries = [
    e({ id: 'r1', amountCents: 10000 }),
    e({ id: 'd1', direction: 'saida', amountCents: 3000, chartAccountId: 'c2_01', date: '2026-10-10' }),
    e({ id: 'r2', amountCents: 5000, date: '2026-11-02' }),
    e({ id: 'r2x', direction: 'saida', amountCents: 5000, date: '2026-11-03', reversalOf: 'r2' }),
    e({ id: 'pend', direction: 'saida', amountCents: 99999, chartAccountId: 'c2_01', status: 'aguardando_aprovacao' }),
    e({ id: 't1', direction: 'saida', amountCents: 2000, chartAccountId: 'transferencia', transferId: 'T', date: '2026-11-04' }),
    e({ id: 't2', direction: 'entrada', amountCents: 2000, chartAccountId: 'transferencia', transferId: 'T', accountId: 'banco', date: '2026-11-04' }),
  ];
  const accounts = [
    { id: 'caixa', name: 'Caixa', openingBalanceCents: 1000 },
    { id: 'banco', name: 'Banco', openingBalanceCents: 0 },
  ];

  it('fluxo de caixa ignora pendentes e transferências; estorno zera o efeito', () => {
    const cf = cashFlowByMonth(entries, { openingCents: 1000 });
    expect(cf).toEqual([
      { periodKey: '2026-10', inCents: 10000, outCents: 3000, netCents: 7000, cumulativeCents: 8000 },
      { periodKey: '2026-11', inCents: 0, outCents: 0, netCents: 0, cumulativeCents: 8000 },
    ]);
  });

  it('DRE por plano de contas', () => {
    const r = dre(entries, chart);
    expect(r.totalReceitasCents).toBe(10000);
    expect(r.totalDespesasCents).toBe(3000);
    expect(r.resultadoCents).toBe(7000);
    expect(r.receitas[0]).toMatchObject({ code: '1.01', cents: 10000 });
  });

  it('balancete concilia com o saldo e com o resultado', () => {
    const tb = trialBalance(entries, accounts);
    const caixa = tb.rows.find(r => r.accountId === 'caixa')!;
    expect(caixa.finalCents).toBe(1000 + 10000 - 3000 + 5000 - 5000 - 2000);
    expect(tb.rows.find(r => r.accountId === 'banco')!.finalCents).toBe(2000);
    expect(tb.total.finalCents - tb.total.openingCents).toBe(dre(entries, chart).resultadoCents);
    const nov = trialBalance(entries, accounts, { from: '2026-11-01' });
    expect(nov.rows.find(r => r.accountId === 'caixa')!.openingCents).toBe(8000);
  });

  it('inadimplência por sócio e por idade', () => {
    const r = delinquency(
      [
        { memberId: 'a', memberName: 'A', status: 'vencida', dueDate: '2026-10-10', amountCents: 3000, discountCents: 0 },
        { memberId: 'a', memberName: 'A', status: 'vencida', dueDate: '2026-07-10', amountCents: 3000, discountCents: 500 },
        { memberId: 'b', memberName: 'B', status: 'aberta', dueDate: '2026-11-01', amountCents: 1500, discountCents: 0 },
        { memberId: 'c', memberName: 'C', status: 'aberta', dueDate: '2026-12-10', amountCents: 1500, discountCents: 0 },
        { memberId: 'd', memberName: 'D', status: 'paga', dueDate: '2026-01-10', amountCents: 1500, discountCents: 0 },
      ],
      '2026-11-02'
    );
    expect(r.count).toBe(3);
    expect(r.totalCents).toBe(3000 + 2500 + 1500);
    expect(r.byMember[0]).toMatchObject({ memberId: 'a', count: 2, oldestDays: 115 });
    expect(r.byAge.map(b => b.count)).toEqual([2, 0, 0, 1]);
  });

  it('orçado x realizado do evento pelo eventId ou centro de custo', () => {
    const ev = [
      e({ id: 'x1', amountCents: 8000, eventId: 'ev1' }),
      e({ id: 'x2', direction: 'saida', amountCents: 2000, chartAccountId: 'c2_01', costCenterId: 'cc1' }),
      e({ id: 'x3', direction: 'saida', amountCents: 500, chartAccountId: 'c2_01', costCenterId: 'cc1', eventId: 'ev1' }),
      e({ id: 'x4', amountCents: 9999 }),
    ];
    const r = budgetVsActual([{ kind: 'receita', plannedCents: 10000 }, { kind: 'despesa', plannedCents: 3000 }], ev, { eventId: 'ev1', costCenterId: 'cc1' });
    expect(r).toEqual({ plannedInCents: 10000, plannedOutCents: 3000, actualInCents: 8000, actualOutCents: 2500, plannedResultCents: 7000, actualResultCents: 5500 });
  });

  it('sugestão de conciliação por valor e data ±3 dias', () => {
    const s = suggestMatches(
      [
        { id: 'l1', accountId: 'caixa', date: '2026-10-07', amountCents: 10000 },
        { id: 'l2', accountId: 'caixa', date: '2026-10-20', amountCents: -3000 },
      ],
      entries
    );
    expect(s).toEqual({ l1: ['r1'] });
  });
});
