import React, { useMemo } from 'react';
import {
  FinancialTransaction,
  FinancialAccount,
  FinancialMonthlyClosure,
  FinancialMemberFee,
} from '../types/index.ts';
import {
  Wallet,
  Building2,
  TrendingUp,
  TrendingDown,
  Scale,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Lock,
  ChevronRight,
  BarChart3,
  CreditCard,
} from 'lucide-react';

interface Props {
  transactions: FinancialTransaction[];
  accounts: FinancialAccount[];
  closures: FinancialMonthlyClosure[];
  memberFees: FinancialMemberFee[];
  onNavigateTab: (tab: 'transactions' | 'fees' | 'reports') => void;
  onOpenAccountsModal: () => void;
  canEdit: boolean;
}

export const FinancialDashboardView: React.FC<Props> = ({
  transactions,
  accounts,
  closures,
  memberFees,
  onNavigateTab,
  onOpenAccountsModal,
  canEdit,
}) => {
  // Current month
  const currentMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Compute Balances
  const balanceSummary = useMemo(() => {
    let bankInitial = 0;
    let cashInitial = 0;

    accounts.forEach(a => {
      if (a.type === 'banco') bankInitial += a.initialBalance || 0;
      if (a.type === 'caixa') cashInitial += a.initialBalance || 0;
    });

    let bankMovements = 0;
    let cashMovements = 0;

    transactions.forEach(t => {
      if (t.status === 'pago') {
        const acc = accounts.find(a => a.id === t.accountId);
        const factor = t.type === 'receita' ? 1 : -1;
        const val = t.amount * factor;

        if (acc?.type === 'banco') {
          bankMovements += val;
        } else {
          cashMovements += val;
        }
      }
    });

    const bankBalance = bankInitial + bankMovements;
    const cashBalance = cashInitial + cashMovements;
    const totalBalance = bankBalance + cashBalance;

    return {
      totalBalance,
      bankBalance,
      cashBalance,
    };
  }, [accounts, transactions]);

  // Current Month Income, Expense, Balance
  const currentMonthSummary = useMemo(() => {
    let income = 0;
    let expense = 0;

    transactions.forEach(t => {
      if (t.competenceMonth === currentMonthStr && t.status === 'pago') {
        if (t.type === 'receita') income += t.amount;
        if (t.type === 'despesa') expense += t.amount;
      }
    });

    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [transactions, currentMonthStr]);

  // Overdue Dues Count for Current Year up to current month
  const overdueStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1;
    let overdueCount = 0;
    let overdueMembersSet = new Set<string>();

    memberFees
      .filter(f => f.year === currentYear)
      .forEach(f => {
        for (let m = 1; m <= currentMonthNum; m++) {
          if (!f.months?.[m]?.paid) {
            overdueCount++;
            overdueMembersSet.add(f.memberId);
          }
        }
      });

    return {
      overdueMonthsCount: overdueCount,
      overdueMembersCount: overdueMembersSet.size,
    };
  }, [memberFees]);

  // Last 12 Months Comparison Data
  const last12Months = useMemo(() => {
    const list: { month: string; label: string; income: number; expense: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

      let income = 0;
      let expense = 0;

      transactions.forEach(t => {
        if (t.competenceMonth === mStr && t.status === 'pago') {
          if (t.type === 'receita') income += t.amount;
          if (t.type === 'despesa') expense += t.amount;
        }
      });

      list.push({
        month: mStr,
        label: `${label}/${String(d.getFullYear()).slice(-2)}`,
        income,
        expense,
      });
    }

    return list;
  }, [transactions]);

  // Max value for 12 months chart scaling
  const maxBarValue = useMemo(() => {
    const max = Math.max(
      ...last12Months.map(m => Math.max(m.income, m.expense)),
      1000
    );
    return max;
  }, [last12Months]);

  // Recent 5 transactions
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Top Balances Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total General Balance */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Saldo Disponível Total</span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Scale className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-white mt-3">
            {balanceSummary.totalBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Conta Bancária + Caixa Secretaria</p>
        </div>

        {/* Bank Balance */}
        <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Saldo em Conta Bancária</span>
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-sky-400 mt-3">
            {balanceSummary.bankBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Instituição Bancária Oficial</p>
        </div>

        {/* Cash in Hand */}
        <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400">Caixa Físico (Secretaria)</span>
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-mono font-black text-amber-400 mt-3">
            {balanceSummary.cashBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Recursos em dinheiro em espécie</p>
        </div>
      </div>

      {/* Month Flow & Overdue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Month Incomes */}
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Receitas do Mês Atual</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-mono font-bold text-emerald-400 mt-2">
            {currentMonthSummary.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>

        {/* Month Expenses */}
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Despesas do Mês Atual</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-lg font-mono font-bold text-rose-400 mt-2">
            {currentMonthSummary.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>

        {/* Month Balance */}
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Superávit / Déficit Mês</span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          <div
            className={`text-lg font-mono font-bold mt-2 ${
              currentMonthSummary.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {currentMonthSummary.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>

        {/* Overdue fees */}
        <div
          onClick={() => onNavigateTab('fees')}
          className="bg-zinc-900/40 hover:bg-zinc-800/40 p-4 rounded-xl border border-zinc-800 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Inadimplência de Sócios</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-mono font-bold text-amber-400 mt-2 flex items-center justify-between">
            <span>{overdueStats.overdueMembersCount} sócio(s)</span>
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">{overdueStats.overdueMonthsCount} mensalidade(s) pendente(s)</p>
        </div>
      </div>

      {/* 12 Months Visual Comparison Bar Chart */}
      <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Evolução Financeira dos Últimos 12 Meses
            </h3>
            <p className="text-xs text-zinc-400">Comparativo mensal entre receitas recebidas e despesas pagas</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" /> Receitas
            </span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-sm" /> Despesas
            </span>
          </div>
        </div>

        {/* Bar Chart Bars */}
        <div className="pt-6 pb-2 grid grid-cols-6 sm:grid-cols-12 gap-2 items-end h-48 border-b border-zinc-800">
          {last12Months.map(item => {
            const incomeHeight = Math.min(100, Math.max(4, Math.round((item.income / maxBarValue) * 100)));
            const expenseHeight = Math.min(100, Math.max(4, Math.round((item.expense / maxBarValue) * 100)));

            return (
              <div key={item.month} className="flex flex-col items-center gap-1 h-full justify-end group">
                <div className="w-full flex items-end justify-center gap-1 h-full">
                  {/* Income bar */}
                  <div
                    style={{ height: `${incomeHeight}%` }}
                    className="w-1/2 max-w-[14px] bg-emerald-500 rounded-t-sm group-hover:brightness-125 transition"
                    title={`Receitas ${item.month}: ${item.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                  />
                  {/* Expense bar */}
                  <div
                    style={{ height: `${expenseHeight}%` }}
                    className="w-1/2 max-w-[14px] bg-rose-500 rounded-t-sm group-hover:brightness-125 transition"
                    title={`Despesas ${item.month}: ${item.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 uppercase font-medium mt-1 truncate">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Navigation & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions Card */}
        <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Ações Rápidas</h3>
          <div className="space-y-2">
            <button
              onClick={() => onNavigateTab('transactions')}
              className="w-full p-3 bg-zinc-950/60 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 text-left flex items-center justify-between transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                    Lançamentos Contábeis
                  </h4>
                  <p className="text-[11px] text-zinc-400">Novo lançamento, anexo e estornos</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={() => onNavigateTab('fees')}
              className="w-full p-3 bg-zinc-950/60 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 text-left flex items-center justify-between transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-sky-400 transition">
                    Mensalidades e Anuidades
                  </h4>
                  <p className="text-[11px] text-zinc-400">Controle mensal e chave PIX</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={() => onNavigateTab('reports')}
              className="w-full p-3 bg-zinc-950/60 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 text-left flex items-center justify-between transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-amber-400 transition">
                    Relatórios e Fechamento
                  </h4>
                  <p className="text-[11px] text-zinc-400">Livro caixa, balancete e fechamento</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>

            <button
              onClick={onOpenAccountsModal}
              className="w-full p-3 bg-zinc-950/60 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 text-left flex items-center justify-between transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white group-hover:text-purple-400 transition">
                    Contas e Categorias
                  </h4>
                  <p className="text-[11px] text-zinc-400">Configurar contas bancárias e rubricas</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </button>
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="lg:col-span-2 bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Últimos Lançamentos</h3>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs text-emerald-400 hover:underline"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">Nenhum lançamento recente registrado.</p>
            ) : (
              recentTransactions.map(t => {
                const isExpense = t.type === 'despesa';
                return (
                  <div
                    key={t.id}
                    className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isExpense ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {isExpense ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{t.description}</div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {t.categoryName} • {t.accountName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap shrink-0">
                      <div className={`text-xs font-mono font-bold ${isExpense ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isExpense ? '- ' : '+ '}
                        {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR') : ''}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
