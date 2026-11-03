import React, { useState, useEffect } from 'react';
import {
  FinancialTransaction,
  FinancialAccount,
  FinancialCategory,
  FinancialMonthlyClosure,
  FinancialMemberFee,
  FinancialPublishedReport,
  Member,
} from '../types/index.ts';
import { db } from '../firebase/config.ts';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.tsx';
import { DEFAULT_FINANCIAL_ACCOUNTS, DEFAULT_FINANCIAL_CATEGORIES } from '../data/defaultFinancialData.ts';
import { FinancialDashboardView } from './FinancialDashboardView.tsx';
import { FinancialTransactionsView } from './FinancialTransactionsView.tsx';
import { FinancialMemberFeesView } from './FinancialMemberFeesView.tsx';
import { FinancialReportsView } from './FinancialReportsView.tsx';
import { FinancialAccountsCategoriesModal } from './FinancialAccountsCategoriesModal.tsx';
import {
  DollarSign,
  FileText,
  Users,
  CheckCircle2,
  Settings,
  Lock,
} from 'lucide-react';

interface Props {
  members: Member[];
  initialSubTab?: 'dashboard' | 'transactions' | 'fees' | 'reports';
}

export const AdminFinancialManager: React.FC<Props> = ({
  members,
  initialSubTab = 'dashboard',
}) => {
  const { canManageFinances, isConselhoFiscal } = useAuth();
  const canEdit = canManageFinances && !isConselhoFiscal;

  const [subTab, setSubTab] = useState<'dashboard' | 'transactions' | 'fees' | 'reports'>(initialSubTab);
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  // Financial collections state
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>(DEFAULT_FINANCIAL_ACCOUNTS);
  const [categories, setCategories] = useState<FinancialCategory[]>(DEFAULT_FINANCIAL_CATEGORIES);
  const [closures, setClosures] = useState<FinancialMonthlyClosure[]>([]);
  const [memberFees, setMemberFees] = useState<FinancialMemberFee[]>([]);
  const [publishedReports, setPublishedReports] = useState<FinancialPublishedReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync transactions
  useEffect(() => {
    try {
      const q = query(collection(db, 'financialTransactions'), orderBy('date', 'desc'));
      const unsub = onSnapshot(q, snap => {
        const list: FinancialTransaction[] = [];
        snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialTransaction));
        setTransactions(list);
      }, err => console.warn('Sync transactions err:', err.message));
      return () => unsub();
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // Sync accounts
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'financialAccounts'), snap => {
        if (!snap.empty) {
          const list: FinancialAccount[] = [];
          snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialAccount));
          setAccounts(list);
        } else {
          setAccounts(DEFAULT_FINANCIAL_ACCOUNTS);
        }
      }, () => setAccounts(DEFAULT_FINANCIAL_ACCOUNTS));
      return () => unsub();
    } catch {
      setAccounts(DEFAULT_FINANCIAL_ACCOUNTS);
    }
  }, []);

  // Sync categories
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'financialCategories'), snap => {
        if (!snap.empty) {
          const list: FinancialCategory[] = [];
          snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialCategory));
          setCategories(list);
        } else {
          setCategories(DEFAULT_FINANCIAL_CATEGORIES);
        }
      }, () => setCategories(DEFAULT_FINANCIAL_CATEGORIES));
      return () => unsub();
    } catch {
      setCategories(DEFAULT_FINANCIAL_CATEGORIES);
    }
  }, []);

  // Sync monthly closures
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'financialMonthlyClosures'), snap => {
        const list: FinancialMonthlyClosure[] = [];
        snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialMonthlyClosure));
        setClosures(list);
      }, err => console.warn(err));
      return () => unsub();
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // Sync member fees
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'financialMemberFees'), snap => {
        const list: FinancialMemberFee[] = [];
        snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialMemberFee));
        setMemberFees(list);
      }, err => console.warn(err));
      return () => unsub();
    } catch (e) {
      console.warn(e);
    }
  }, []);

  // Sync published reports
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, 'financialPublishedReports'), snap => {
        const list: FinancialPublishedReport[] = [];
        snap.forEach(d => list.push({ ...d.data(), id: d.id } as FinancialPublishedReport));
        setPublishedReports(list);
        setLoading(false);
      }, () => setLoading(false));
      return () => unsub();
    } catch {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Financial Sub-Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 p-3 rounded-2xl shadow-md">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSubTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'dashboard'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Painel Geral</span>
          </button>

          <button
            onClick={() => setSubTab('transactions')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'transactions'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Lançamentos & Livro Caixa ({transactions.length})</span>
          </button>

          <button
            onClick={() => setSubTab('fees')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'fees'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Mensalidades ({members.length} Sócios)</span>
          </button>

          <button
            onClick={() => setSubTab('reports')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'reports'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Fechamento & Relatórios</span>
          </button>
        </div>

        {canEdit && (
          <button
            onClick={() => setShowAccountsModal(true)}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            <span>Contas & Categorias</span>
          </button>
        )}
      </div>

      {/* Conselho Fiscal Notice */}
      {isConselhoFiscal && (
        <div className="p-3 bg-zinc-900 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Modo Conselho Fiscal Ativo:</strong> Você possui acesso irrestrito para auditoria e fiscalização de todos os saldos, extratos e comprovantes em modo somente leitura.
          </span>
        </div>
      )}

      {/* Sub Views */}
      {subTab === 'dashboard' && (
        <FinancialDashboardView
          transactions={transactions}
          accounts={accounts}
          closures={closures}
          memberFees={memberFees}
          onNavigateTab={tab => setSubTab(tab)}
          onOpenAccountsModal={() => setShowAccountsModal(true)}
          canEdit={canEdit}
        />
      )}

      {subTab === 'transactions' && (
        <FinancialTransactionsView
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          closures={closures}
          canEdit={canEdit}
        />
      )}

      {subTab === 'fees' && (
        <FinancialMemberFeesView
          members={members}
          memberFees={memberFees}
          accounts={accounts}
          canEdit={canEdit}
        />
      )}

      {subTab === 'reports' && (
        <FinancialReportsView
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          closures={closures}
          publishedReports={publishedReports}
          canEdit={canEdit}
        />
      )}

      {/* Modal de Gestão de Contas e Categorias */}
      {showAccountsModal && (
        <FinancialAccountsCategoriesModal
          isOpen={showAccountsModal}
          onClose={() => setShowAccountsModal(false)}
          accounts={accounts}
          categories={categories}
          canEdit={canEdit}
        />
      )}
    </div>
  );
};
