import React, { useState, useMemo } from 'react';
import {
  FinancialTransaction,
  FinancialAccount,
  FinancialCategory,
  FinancialMonthlyClosure,
  FinancialPublishedReport,
} from '../types/index.ts';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import {
  FileSpreadsheet,
  Printer,
  Lock,
  Unlock,
  CheckCircle,
  FileCheck,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Download,
  AlertCircle,
  Share2,
} from 'lucide-react';

interface Props {
  transactions: FinancialTransaction[];
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  closures: FinancialMonthlyClosure[];
  publishedReports: FinancialPublishedReport[];
  canEdit: boolean;
}

export const FinancialReportsView: React.FC<Props> = ({
  transactions,
  accounts,
  categories,
  closures,
  publishedReports,
  canEdit,
}) => {
  const { currentUser, isConselhoFiscal, activeTemplate } = useAuth();
  const dialog = useDialog();

  const [activeReportTab, setActiveReportTab] = useState<'livro_caixa' | 'balancete' | 'fechamento' | 'publicar'>(
    'livro_caixa'
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Publishing report form
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportPeriod, setReportPeriod] = useState('');
  const [reportDocUrl, setReportDocUrl] = useState('');
  const [assemblyDate, setAssemblyDate] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Closing month state
  const [closingNotes, setClosingNotes] = useState('');
  const [closingProcessing, setClosingProcessing] = useState(false);

  // Month transactions
  const monthTransactions = useMemo(() => {
    return transactions
      .filter(t => t.competenceMonth === selectedMonth)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, selectedMonth]);

  // Income / Expense totals for month
  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    monthTransactions.forEach(t => {
      if (t.status === 'pago') {
        if (t.type === 'receita') income += t.amount;
        if (t.type === 'despesa') expense += t.amount;
      }
    });
    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [monthTransactions]);

  // Balancete grouped by category
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { name: string; type: 'receita' | 'despesa'; total: number }>();
    monthTransactions.forEach(t => {
      if (t.status === 'pago') {
        const existing = map.get(t.categoryId) || {
          name: t.categoryName,
          type: t.type,
          total: 0,
        };
        existing.total += t.amount;
        map.set(t.categoryId, existing);
      }
    });
    return Array.from(map.values());
  }, [monthTransactions]);

  // Is active month already closed?
  const existingClosure = useMemo(() => {
    return closures.find(c => c.competenceMonth === selectedMonth);
  }, [closures, selectedMonth]);

  // Perform monthly closure
  const handlePerformClosure = async () => {
    if (!canEdit) return;
    const confirmed = await dialog.confirm(
      `Confirma o fechamento contábil oficial do mês ${selectedMonth}? Isso bloqueará novas edições diretas e registrará o balancete para parecer do Conselho Fiscal.`,
      { title: 'Confirmar Fechamento Mensal' }
    );
    if (!confirmed) return;

    setClosingProcessing(true);
    try {
      const closureRecord: FinancialMonthlyClosure = {
        id: selectedMonth,
        competenceMonth: selectedMonth,
        closedAt: new Date().toISOString(),
        closedByEmail: currentUser?.email || 'admin',
        closedByName: currentUser?.displayName || 'Tesouraria',
        totalIncome: totals.income,
        totalExpense: totals.expense,
        balance: totals.balance,
        notes: closingNotes.trim() || undefined,
      };

      await setDoc(doc(db, 'financialMonthlyClosures', selectedMonth), closureRecord);
      setClosingNotes('');
      await dialog.alert(
        `O mês de competência ${selectedMonth} foi encerrado com sucesso! Os valores foram consolidados para o Conselho Fiscal.`,
        { title: 'Fechamento Homologado' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro ao encerrar mês: ${err.message}`);
    } finally {
      setClosingProcessing(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ['Código', 'Data', 'Tipo', 'Categoria', 'Conta', 'Descrição', 'Fornecedor/Pagador', 'Status', 'Valor (R$)'];
    const rows = monthTransactions.map(t => [
      `"${t.code}"`,
      `"${t.date}"`,
      `"${t.type}"`,
      `"${t.categoryName}"`,
      `"${t.accountName}"`,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${t.entityName.replace(/"/g, '""')}"`,
      `"${t.status}"`,
      t.amount.toFixed(2),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Livro_Caixa_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Publish report to public transparency area for members
  const handlePublishReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!reportTitle.trim() || !reportPeriod.trim()) {
      await dialog.alert('Informe o título e o período do relatório.');
      return;
    }

    setPublishing(true);
    try {
      const id = 'rep_' + Date.now();
      const newRep: FinancialPublishedReport = {
        id,
        title: reportTitle.trim(),
        description: reportDescription.trim() || undefined,
        period: reportPeriod.trim(),
        documentUrl: reportDocUrl.trim() || undefined,
        approvedAtAssemblyDate: assemblyDate.trim() || undefined,
        totalIncome: totals.income,
        totalExpense: totals.expense,
        balance: totals.balance,
        publishedAt: new Date().toISOString(),
        publishedBy: currentUser?.email || 'Tesouraria',
      };

      await setDoc(doc(db, 'financialPublishedReports', id), newRep);
      setReportTitle('');
      setReportDescription('');
      setReportPeriod('');
      setReportDocUrl('');
      setAssemblyDate('');
      await dialog.alert(
        'Relatório publicado com sucesso na área de Prestação de Contas dos Sócios!',
        { title: 'Publicação Concluída' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const associationName = activeTemplate?.associationName || 'Associação Esportiva e Cultural Rio Camarada';

  return (
    <div className="space-y-6">
      {/* Sub tabs and Month Selector */}
      <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveReportTab('livro_caixa')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeReportTab === 'livro_caixa'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            Livro Caixa
          </button>
          <button
            onClick={() => setActiveReportTab('balancete')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeReportTab === 'balancete'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            Balancete Simples
          </button>
          <button
            onClick={() => setActiveReportTab('fechamento')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeReportTab === 'fechamento'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {existingClosure ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            Fechamento Mensal
          </button>
          {canEdit && (
            <button
              onClick={() => setActiveReportTab('publicar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeReportTab === 'publicar'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              Publicar p/ Sócios
            </button>
          )}
        </div>

        {/* Month selector & export triggers */}
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => window.print()}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
            title="Imprimir Relatório"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCsv}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-lg transition"
            title="Exportar Planilha CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4 text-black">
        <h2 className="text-xl font-bold">{associationName}</h2>
        <h3 className="text-base font-semibold mt-1">
          {activeReportTab === 'livro_caixa' ? 'Livro Caixa Mensal' : 'Balancete Financeiro Analítico'}
        </h3>
        <p className="text-xs text-gray-600">
          Competência: {selectedMonth} • Emitido em {new Date().toLocaleDateString('pt-BR')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Total Receitas</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-mono font-bold text-emerald-400 mt-2">
            {totals.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Total Despesas</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-mono font-bold text-rose-400 mt-2">
            {totals.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>

        <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-semibold">Resultado do Mês</span>
            <Scale className="w-4 h-4 text-sky-400" />
          </div>
          <div
            className={`text-xl font-mono font-bold mt-2 ${
              totals.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totals.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>
      </div>

      {/* Report Body */}
      {activeReportTab === 'livro_caixa' && (
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Livro Caixa - Competência {selectedMonth}</h3>
            <span className="text-xs text-zinc-400">{monthTransactions.length} lançamentos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Histórico / Descrição</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Conta</th>
                  <th className="py-3 px-4 text-right">Entradas (R$)</th>
                  <th className="py-3 px-4 text-right">Saídas (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {monthTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      Nenhum lançamento registrado nesta competência.
                    </td>
                  </tr>
                ) : (
                  monthTransactions.map(t => (
                    <tr key={t.id} className="hover:bg-zinc-800/20">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">{t.code}</td>
                      <td className="py-3 px-4">
                        <div className="text-white font-medium">{t.description}</div>
                        <div className="text-[11px] text-zinc-500">{t.entityName}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{t.categoryName}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-zinc-400">{t.accountName}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold text-emerald-400">
                        {t.type === 'receita'
                          ? t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '-'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold text-rose-400">
                        {t.type === 'despesa'
                          ? t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReportTab === 'balancete' && (
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Balancete Analítico por Rubrica</h3>
            <p className="text-xs text-zinc-400">Totalização consolidada das receitas e despesas por grupo contábil</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Receitas */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-emerald-500/20 pb-2">
                1. Receitas Operacionais
              </h4>
              <div className="space-y-2">
                {categoryTotals
                  .filter(c => c.type === 'receita')
                  .map(c => (
                    <div
                      key={c.name}
                      className="p-3 bg-zinc-950/40 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <span className="text-zinc-200 font-medium">{c.name}</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {c.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  ))}
                <div className="p-3 bg-emerald-950/20 rounded-lg border border-emerald-500/30 flex items-center justify-between text-xs font-bold text-white">
                  <span>Subtotal Receitas</span>
                  <span className="font-mono text-emerald-400">
                    {totals.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Despesas */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider border-b border-rose-500/20 pb-2">
                2. Despesas Operacionais e Manutenção
              </h4>
              <div className="space-y-2">
                {categoryTotals
                  .filter(c => c.type === 'despesa')
                  .map(c => (
                    <div
                      key={c.name}
                      className="p-3 bg-zinc-950/40 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <span className="text-zinc-200 font-medium">{c.name}</span>
                      <span className="font-mono font-bold text-rose-400">
                        {c.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  ))}
                <div className="p-3 bg-rose-950/20 rounded-lg border border-rose-500/30 flex items-center justify-between text-xs font-bold text-white">
                  <span>Subtotal Despesas</span>
                  <span className="font-mono text-rose-400">
                    {totals.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeReportTab === 'fechamento' && (
        <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                Fechamento Contábil de {selectedMonth}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                O encerramento do exercício mensal congela a contabilidade e submete os dados ao parecer do Conselho Fiscal.
              </p>
            </div>

            {existingClosure ? (
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-full flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Mês Encerrado e Homologado
              </span>
            ) : (
              <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-full flex items-center gap-1.5">
                <Unlock className="w-4 h-4" /> Mês Aberto para Lançamentos
              </span>
            )}
          </div>

          {existingClosure ? (
            <div className="p-5 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3">
              <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Ata do Fechamento</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-300">
                <div>
                  <span className="text-zinc-500 block">Homologado por:</span>
                  <span className="font-medium text-white">{existingClosure.closedByEmail}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Data e Hora do Fechamento:</span>
                  <span className="font-medium text-white">
                    {new Date(existingClosure.closedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Saldo Final Consolidado:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {existingClosure.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                {existingClosure.notes && (
                  <div>
                    <span className="text-zinc-500 block">Observações do Fechamento:</span>
                    <span className="text-zinc-300 italic">{existingClosure.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            canEdit && (
              <div className="p-5 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-4">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Realizar Fechamento do Mês {selectedMonth}
                </h4>
                <p className="text-xs text-zinc-400">
                  Certifique-se de que todas as receitas e despesas foram lançadas e os comprovantes anexados antes de encerrar o mês.
                </p>
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                    Parecer ou Observações da Tesouraria (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Ex: Conciliação bancária conferida com extrato do BB sem divergências."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={handlePerformClosure}
                  disabled={closingProcessing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition flex items-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  {closingProcessing ? 'Processando Fechamento...' : 'Efetuar Fechamento Contábil'}
                </button>
              </div>
            )
          )}
        </div>
      )}

      {activeReportTab === 'publicar' && canEdit && (
        <form onSubmit={handlePublishReport} className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-400" />
              Publicar Prestação de Contas para os Sócios
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Disponibilize balancetes, atas e pareceres do Conselho Fiscal diretamente na área logada do associado.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Título do Documento *</label>
              <input
                type="text"
                value={reportTitle}
                onChange={e => setReportTitle(e.target.value)}
                placeholder="Ex: Balancete Anual 2025 ou Prestação de Contas 1º Trimestre"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Período de Referência *</label>
              <input
                type="text"
                value={reportPeriod}
                onChange={e => setReportPeriod(e.target.value)}
                placeholder="Ex: Ano 2025 ou Jan a Mar/2026"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                Aprovado em Assembleia Geral em (Data)
              </label>
              <input
                type="date"
                value={assemblyDate}
                onChange={e => setAssemblyDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                Link do Documento / Ata / Parecer (PDF)
              </label>
              <input
                type="url"
                value={reportDocUrl}
                onChange={e => setReportDocUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Descrição e Resumo</label>
            <textarea
              rows={2}
              value={reportDescription}
              onChange={e => setReportDescription(e.target.value)}
              placeholder="Ex: Balancete aprovado por unanimidade na Assembleia Geral Ordinária com parecer favorável do Conselho Fiscal."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={publishing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              {publishing ? 'Publicando...' : 'Publicar na Área dos Sócios'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
