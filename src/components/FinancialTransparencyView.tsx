import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { FinancialPublishedReport, FinancialMonthlyClosure } from '../types/index.ts';
import {
  Scale,
  FileText,
  Calendar,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Download,
  ExternalLink,
  ShieldCheck,
  Search,
} from 'lucide-react';

export const FinancialTransparencyView: React.FC = () => {
  const [reports, setReports] = useState<FinancialPublishedReport[]>([]);
  const [closures, setClosures] = useState<FinancialMonthlyClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  useEffect(() => {
    const unsubRep = onSnapshot(collection(db, 'financialPublishedReports'), snap => {
      const fetched: FinancialPublishedReport[] = [];
      snap.forEach(d => fetched.push({ ...d.data(), id: d.id } as FinancialPublishedReport));
      fetched.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setReports(fetched);
    });

    const unsubClos = onSnapshot(collection(db, 'financialMonthlyClosures'), snap => {
      const fetched: FinancialMonthlyClosure[] = [];
      snap.forEach(d => fetched.push({ ...d.data(), id: d.id } as FinancialMonthlyClosure));
      fetched.sort((a, b) => b.competenceMonth.localeCompare(a.competenceMonth));
      setClosures(fetched);
      setLoading(false);
    });

    return () => {
      unsubRep();
      unsubClos();
    };
  }, []);

  // Filter closures by selected year
  const yearClosures = useMemo(() => {
    return closures.filter(c => c.competenceMonth.startsWith(String(selectedYear)));
  }, [closures, selectedYear]);

  // Aggregate year totals
  const yearSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    yearClosures.forEach(c => {
      income += c.totalIncome || 0;
      expense += c.totalExpense || 0;
    });
    return {
      income,
      expense,
      balance: income - expense,
    };
  }, [yearClosures]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase().trim();
    return reports.filter(
      r =>
        r.title.toLowerCase().includes(q) ||
        r.period.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [reports, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 p-6 rounded-2xl border border-emerald-500/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              Prestação de Contas e Transparência
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Acompanhe a aplicação dos recursos, balancetes oficiais e pareceres do Conselho Fiscal da Sociedade
            </p>
          </div>
        </div>
      </div>

      {/* LGPD Protection Notice */}
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 leading-relaxed">
          <strong className="text-emerald-400">Privacidade dos Associados Preservada:</strong> Os demonstrativos e balancetes apresentam valores globais consolidados por mês e por categoria contábil. Nomes ou dados de associados pagadores individuais são rigorosamente protegidos conforme a LGPD.
        </div>
      </div>

      {/* Year Consolidations */}
      <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Balanço Consolidado do Exercício
            </h2>
            <p className="text-xs text-zinc-400">Totalização das competências encerradas e homologadas</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400 font-semibold">Exercício:</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
            >
              {[2024, 2025, 2026, 2027, 2028].map(y => (
                <option key={y} value={y}>
                  Ano {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Total de Entradas no Ano</span>
            <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
              {yearSummary.income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Total de Saídas no Ano</span>
            <div className="text-xl font-mono font-bold text-rose-400 mt-1">
              {yearSummary.expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800">
            <span className="text-xs text-zinc-400 font-medium">Superávit Acumulado</span>
            <div
              className={`text-xl font-mono font-bold mt-1 ${
                yearSummary.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {yearSummary.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
        </div>

        {/* Monthly table */}
        <div className="pt-2">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Competências Fechadas em {selectedYear}
          </h3>
          {yearClosures.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              Ainda não há meses encerrados no exercício de {selectedYear}.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-semibold border-b border-zinc-800">
                  <tr>
                    <th className="py-2.5 px-3">Mês</th>
                    <th className="py-2.5 px-3">Receitas</th>
                    <th className="py-2.5 px-3">Despesas</th>
                    <th className="py-2.5 px-3">Saldo</th>
                    <th className="py-2.5 px-3">Encerramento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {yearClosures.map(c => (
                    <tr key={c.id} className="hover:bg-zinc-800/20">
                      <td className="py-2.5 px-3 font-bold text-white">{c.competenceMonth}</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-400">
                        {c.totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-rose-400">
                        {c.totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">
                        {c.balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 text-[11px]">
                        {new Date(c.closedAt).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Library of Published Documents & Reports */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              Biblioteca de Documentos e Pareceres
            </h2>
            <p className="text-xs text-zinc-400">
              Balancetes, atas de assembleia geral e relatórios auditados do Conselho Fiscal
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar documento..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-xs">Carregando documentos...</div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/30 rounded-2xl border border-zinc-800 p-8">
            <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-zinc-300">Nenhum documento publicado no momento</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Os balancetes e pareceres aprovados pela diretoria e assembleia serão listados aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReports.map(rep => (
              <div
                key={rep.id}
                className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20">
                      {rep.period}
                    </span>
                    {rep.approvedAtAssemblyDate && (
                      <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Aprovado em assembleia em {rep.approvedAtAssemblyDate}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white leading-snug">{rep.title}</h3>

                  {rep.description && (
                    <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{rep.description}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-zinc-500">
                    Publicado em {new Date(rep.publishedAt).toLocaleDateString('pt-BR')}
                  </span>

                  {rep.documentUrl ? (
                    <a
                      href={rep.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Visualizar PDF
                    </a>
                  ) : (
                    <span className="text-[11px] text-zinc-500 italic">Disponível na secretaria</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
