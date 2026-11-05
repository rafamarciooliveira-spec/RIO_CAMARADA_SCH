/**
 * Prestação de contas: os números do modelo enviado pela tesouraria (setembro/2025) precisam
 * fechar igual. Entradas 28.265,11, saídas 7.726,68, saldo anterior 44.986,75, saldo atual 65.525,18.
 */
import { describe, expect, it } from 'vitest';
import { accPeriodLabel, buildAccountability, monthsBetween } from '../src/shared/finance/accountability.ts';
import { accountsOpenedAt } from '../src/shared/finance/reports.ts';
import type { LedgerEntryDoc } from '../src/shared/types.ts';

const chart = [
  { id: 'r_fin', code: '1.1', name: 'Rendimentos', kind: 'receita' as const },
  { id: 'r_fest', code: '1.2', name: 'Festas e eventos', kind: 'receita' as const },
  { id: 'r_soc', code: '1.3', name: 'Sócios', kind: 'receita' as const },
  { id: 'r_alu', code: '1.4', name: 'Aluguel do salão', kind: 'receita' as const },
  { id: 'd_fix', code: '2.1', name: 'Contas fixas', kind: 'despesa' as const },
  { id: 'd_obra', code: '2.2', name: 'Obras e manutenção', kind: 'despesa' as const },
  { id: 'd_ban', code: '2.3', name: 'Banco', kind: 'despesa' as const },
];

let n = 0;
const e = (date: string, accountId: string, direction: 'entrada' | 'saida', reais: number, chartAccountId: string, description: string, extra: Partial<LedgerEntryDoc> = {}) => ({
  id: `e${++n}`,
  number: n,
  date,
  periodKey: date.slice(0, 7),
  accountId,
  direction,
  amountCents: Math.round(reais * 100),
  chartAccountId,
  description,
  status: 'lancado' as const,
  ...extra,
});

const set = [
  e('2025-09-01', 'cc', 'entrada', 155.82, 'r_fin', 'Rendimentos bancários Sicredi'),
  e('2025-09-02', 'cc', 'entrada', 110, 'r_fest', 'Ingressos Baile Lampião Pix'),
  e('2025-09-03', 'cc', 'entrada', 215, 'r_fest', 'Reembolso ASCTVI (etapa do tiro)'),
  e('2025-09-03', 'cc', 'entrada', 68, 'r_soc', 'Anuidade (Pix)'),
  e('2025-09-04', 'cc', 'entrada', 300, 'r_soc', 'Entrada Novos Sócios Pix'),
  e('2025-09-08', 'cc', 'entrada', 4000, 'r_fest', 'Festa do Colono (Pix)', { costCenterId: 'colono' }),
  e('2025-09-09', 'cc', 'entrada', 5067.12, 'r_fest', 'Festa do Colono (Pix)', { costCenterId: 'colono' }),
  e('2025-09-10', 'caixa', 'entrada', 16498.5, 'r_fest', 'Festa do Colono (Dinheiro depósito)', { costCenterId: 'colono' }),
  e('2025-09-12', 'cc', 'entrada', 1500, 'r_alu', 'Aluguel do Salão (Aniversário)'),
  e('2025-09-13', 'cc', 'entrada', 350.67, 'r_fest', 'Vendas no Cartão Crédito Baile Lampião'),
  e('2025-09-15', 'cc', 'saida', 179.7, 'd_fix', 'FSC Comunicações (internet)'),
  e('2025-09-15', 'cc', 'saida', 456.6, 'd_fix', 'Fatura Energia Elétrica'),
  e('2025-09-15', 'cc', 'saida', 68.29, 'd_fix', 'Fatura Água'),
  e('2025-09-16', 'cc', 'saida', 3805.5, 'd_obra', 'Marmoraria (granito p balcão)', { costCenterId: 'colono' }),
  e('2025-09-17', 'cc', 'saida', 990, 'd_obra', 'Materiais de Construção'),
  e('2025-09-18', 'caixa', 'saida', 1350, 'd_obra', 'Serviços de Pedreiros'),
  e('2025-09-18', 'caixa', 'saida', 375, 'd_obra', 'Serviços de Pinturas'),
  e('2025-09-19', 'cc', 'saida', 154.5, 'd_obra', 'JKL Materiais de Construção'),
  e('2025-09-20', 'cc', 'saida', 302.09, 'd_obra', 'Vistoria Bombeiros'),
  e('2025-09-22', 'cc', 'saida', 25, 'd_ban', 'Cesta de Relacionamentos Sicredi'),
  e('2025-09-22', 'cc', 'saida', 20, 'd_ban', 'Aplicação Cotas Capital Sicredi'),
  // Dinheiro que só mudou de lugar: não é entrada nem saída
  e('2025-09-25', 'caixa', 'saida', 10000, 'transferencia', 'Depósito do caixa no banco', { transferId: 't1' }),
  e('2025-09-25', 'cc', 'entrada', 10000, 'transferencia', 'Depósito do caixa no banco', { transferId: 't1' }),
  // Aguardando a segunda aprovação: fica de fora
  e('2025-09-28', 'cc', 'saida', 5000, 'd_obra', 'Telhado', { status: 'aguardando_aprovacao' }),
  // Lançamento de outubro (depois do período)
  e('2025-10-02', 'cc', 'entrada', 100, 'r_soc', 'Anuidade (Pix)'),
];

// Saldos ATUAIS das contas (depois de outubro), como o servidor guarda
const accountsNow = [
  { id: 'cc', name: 'Conta corrente', type: 'banco' as const, institution: 'Sicredi', openingBalanceCents: 0, balanceCents: 0 },
  { id: 'poup', name: 'Poupança', type: 'poupanca' as const, institution: 'Sicredi', openingBalanceCents: 0, balanceCents: 534705 },
  { id: 'cdi', name: 'Aplicação CDI', type: 'aplicacao' as const, institution: 'Sicredi', openingBalanceCents: 0, balanceCents: 1224496 },
  { id: 'caixa', name: 'Caixa', type: 'caixa' as const, openingBalanceCents: 0, balanceCents: 0 },
];

describe('prestação de contas do mês', () => {
  // Saldo anterior por conta em 01/09: corrente 21.000,00, poupança, CDI e caixa 6.394,74 (soma 44.986,75)
  const opening = { cc: 2100000, poup: 534705, cdi: 1224496, caixa: 639474 };
  const signed = (id: string) => set.filter(x => x.accountId === id && x.status === 'lancado').reduce((s, x) => s + (x.direction === 'entrada' ? x.amountCents : -x.amountCents), 0);
  const now = accountsNow.map(a => ({ ...a, balanceCents: opening[a.id as keyof typeof opening] + signed(a.id) }));
  const accounts = accountsOpenedAt(now, set, '2025-09-01');
  const r = buildAccountability(set, accounts, chart, { kind: 'periodo', from: '2025-09-01', to: '2025-09-30', grouping: 'historico' });

  it('fecha igual ao modelo da tesouraria', () => {
    expect(r.totals.inCents).toBe(2826511);
    expect(r.totals.outCents).toBe(772668);
    expect(r.openingCents).toBe(4498675);
    expect(r.closingCents).toBe(6552518);
    // Soma dos totais: entradas + saldo anterior = saídas + saldo atual
    expect(r.totals.inCents + r.openingCents).toBe(r.totals.outCents + r.closingCents);
    expect(r.totals.inCents + r.openingCents).toBe(7325186);
  });
  it('composição do saldo bate com o saldo atual e mostra o banco junto do nome', () => {
    expect(r.accounts.reduce((s, x) => s + x.finalCents, 0)).toBe(r.closingCents);
    expect(r.accounts.find(x => x.accountId === 'poup')?.name).toBe('Poupança Sicredi');
  });
  it('agrupa o mesmo histórico (as duas entradas Pix da festa viram uma linha)', () => {
    const festa = r.lines.find(l => l.label === 'Festa do Colono (Pix)');
    expect(festa?.inCents).toBe(906712);
    expect(festa?.count).toBe(2);
    expect(r.lines.findIndex(l => l.outCents > 0)).toBeGreaterThan(r.lines.findIndex(l => l.inCents > 0));
  });
  it('transferência fica à parte e pendente fica de fora com aviso', () => {
    expect(r.transfers).toEqual([{ label: 'Depósito do caixa no banco', date: '2025-09-25', cents: 1000000 }]);
    expect(r.lines.some(l => l.label.includes('Depósito'))).toBe(false);
    expect(r.pending).toEqual({ count: 1, cents: 500000 });
  });
  it('de onde veio e para onde foi, do maior para o menor', () => {
    expect(r.receitas[0]).toEqual({ name: 'Festas e eventos', cents: 2624129 });
    expect(r.despesas[0].name).toBe('Obras e manutenção');
  });
  it('um por lançamento traz a data e o favorecido', () => {
    const r2 = buildAccountability([e('2025-09-05', 'cc', 'saida', 50, 'd_fix', 'Gás', { counterparty: 'Distribuidora' })], accounts, chart, { kind: 'periodo', from: '2025-09-01', to: '2025-09-30', grouping: 'lancamento' });
    expect(r2.lines[0]).toMatchObject({ label: 'Gás (Distribuidora)', date: '2025-09-05', outCents: 5000 });
  });
  it('estorno diminui a natureza do original', () => {
    const orig = e('2025-09-05', 'cc', 'saida', 80, 'd_fix', 'Conta errada');
    const rev = e('2025-09-06', 'cc', 'entrada', 80, 'd_fix', 'Conta errada', { reversalOf: orig.id });
    const r3 = buildAccountability([orig, rev], accounts, chart, { kind: 'periodo', from: '2025-09-01', to: '2025-09-30', grouping: 'plano' });
    expect(r3.totals).toEqual({ inCents: 0, outCents: 0 });
    expect(r3.lines).toEqual([]);
  });
});

describe('prestação de contas de evento', () => {
  it('só os lançamentos do centro de custo, com o lucro', () => {
    const r = buildAccountability(set, accountsNow, chart, { kind: 'evento', from: '2000-01-01', to: '2999-12-31', grouping: 'historico', costCenter: { id: 'colono' } });
    expect(r.totals.inCents).toBe(2556562);
    expect(r.totals.outCents).toBe(380550);
    expect(r.resultCents).toBe(2556562 - 380550);
    expect(r.openingCents).toBe(0);
    expect(r.accounts.map(a => a.accountId).sort()).toEqual(['caixa', 'cc']);
  });
});

describe('rótulo do período', () => {
  it('mês, meses, ano e datas soltas', () => {
    expect(accPeriodLabel('2025-09-01', '2025-09-30')).toBe('Setembro/2025');
    expect(accPeriodLabel('2026-01-01', '2026-03-31')).toBe('Janeiro a Março/2026');
    expect(accPeriodLabel('2026-01-01', '2026-12-31')).toBe('Ano de 2026');
    expect(accPeriodLabel('2025-11-01', '2026-02-28')).toBe('Novembro/2025 a Fevereiro/2026');
    expect(accPeriodLabel('2025-09-05', '2025-09-20')).toBe('05/09/2025 a 20/09/2025');
    expect(monthsBetween('2025-11-01', '2026-02-28')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});
