import React, { useState, useMemo } from 'react';
import {
  FinancialTransaction,
  FinancialAccount,
  FinancialCategory,
  FinancialMonthlyClosure,
  FinancialTransactionType,
} from '../types/index.ts';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { uploadImageFile } from '../utils/imageStorage.ts';
import {
  Plus,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Paperclip,
  RotateCcw,
  Lock,
  Calendar,
  Building2,
  Tag,
  CheckCircle2,
  Clock,
  Eye,
  X,
  FileText,
} from 'lucide-react';

interface Props {
  transactions: FinancialTransaction[];
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  closures: FinancialMonthlyClosure[];
  canEdit: boolean;
}

export const FinancialTransactionsView: React.FC<Props> = ({
  transactions,
  accounts,
  categories,
  closures,
  canEdit,
}) => {
  const { currentUser } = useAuth();
  const dialog = useDialog();

  // Filters
  const [filterType, setFilterType] = useState<'todos' | 'receita' | 'despesa'>('todos');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterAccount, setFilterAccount] = useState<string>('todos');
  const [filterCategory, setFilterCategory] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal New Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [transType, setTransType] = useState<FinancialTransactionType>('receita');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [competenceMonth, setCompetenceMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [entityName, setEntityName] = useState('');
  const [status, setStatus] = useState<'pago' | 'previsto'>('pago');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState<FinancialTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // Receipt Preview Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // Check if active competence month is closed
  const isCurrentMonthClosed = useMemo(() => {
    return closures.some(c => c.competenceMonth === competenceMonth);
  }, [closures, competenceMonth]);

  // Filtered transactions
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterType !== 'todos' && t.type !== filterType) return false;
      if (filterMonth && t.competenceMonth !== filterMonth) return false;
      if (filterAccount !== 'todos' && t.accountId !== filterAccount) return false;
      if (filterCategory !== 'todos' && t.categoryId !== filterCategory) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchEntity = t.entityName.toLowerCase().includes(q);
        const matchCode = t.code.toLowerCase().includes(q);
        if (!matchDesc && !matchEntity && !matchCode) return false;
      }
      return true;
    });
  }, [transactions, filterType, filterMonth, filterAccount, filterCategory, searchQuery]);

  // Submit new transaction
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    if (isCurrentMonthClosed) {
      await dialog.alert(
        `O mês de competência ${competenceMonth} já foi encerrado e auditado pelo conselho fiscal. Não é permitido criar novos lançamentos retroativos normais.`,
        { title: 'Mês Encerrado' }
      );
      return;
    }

    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      await dialog.alert('Informe um valor monetário positivo válido.');
      return;
    }

    if (!categoryId) {
      await dialog.alert('Selecione uma categoria para o lançamento.');
      return;
    }
    if (!accountId) {
      await dialog.alert('Selecione a conta de destino/origem.');
      return;
    }

    const selCategory = categories.find(c => c.id === categoryId);
    const selAccount = accounts.find(a => a.id === accountId);

    setUploading(true);
    try {
      let attachmentUrl: string | undefined = undefined;
      let attachmentName: string | undefined = undefined;

      if (attachmentFile) {
        attachmentName = attachmentFile.name;
        // Upload image or file
        attachmentUrl = await uploadImageFile(attachmentFile, 'receipts', {
          maxDimension: 1600,
          quality: 0.85,
        });
      }

      const id = 'trans_' + Date.now();
      const code = `LAN-${String(transactions.length + 1).padStart(6, '0')}`;

      const newTrans: FinancialTransaction = {
        id,
        code,
        type: transType,
        amount: val,
        date,
        competenceMonth,
        categoryId,
        categoryName: selCategory?.name || 'Geral',
        accountId,
        accountName: selAccount?.name || 'Conta Padrão',
        description: description.trim(),
        entityName: entityName.trim() || (transType === 'receita' ? 'Sócio / Contribuinte' : 'Fornecedor'),
        status,
        attachmentUrl,
        attachmentName,
        isReversed: false,
        createdByEmail: currentUser?.email || 'admin',
        createdByName: currentUser?.displayName || 'Tesouraria',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'financialTransactions', id), newTrans);

      // Reset form
      setAmount('');
      setDescription('');
      setEntityName('');
      setAttachmentFile(null);
      setIsModalOpen(false);
      await dialog.alert(`Lançamento ${code} registrado com sucesso!`, { title: 'Lançamento Gravado' });
    } catch (err: any) {
      await dialog.alert(`Erro ao registrar lançamento: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Perform strictly immutable reversal (estorno)
  const handleConfirmReversal = async () => {
    if (!reversalTarget || !canEdit) return;
    if (!reversalReason.trim()) {
      await dialog.alert('Informe a justificativa formal para o estorno deste lançamento.');
      return;
    }

    setReversing(true);
    try {
      const reversalId = 'trans_rev_' + Date.now();
      const reversalCode = `EST-${reversalTarget.code}`;
      const revType: FinancialTransactionType = reversalTarget.type === 'receita' ? 'despesa' : 'receita';

      // 1. Create counter-balancing reversal transaction
      const reversalTrans: FinancialTransaction = {
        id: reversalId,
        code: reversalCode,
        type: revType,
        amount: reversalTarget.amount,
        date: new Date().toISOString().split('T')[0],
        competenceMonth: reversalTarget.competenceMonth,
        categoryId: reversalTarget.categoryId,
        categoryName: `[ESTORNO] ${reversalTarget.categoryName}`,
        accountId: reversalTarget.accountId,
        accountName: reversalTarget.accountName,
        description: `ESTORNO DE ${reversalTarget.code}: ${reversalReason.trim()} (${reversalTarget.description})`,
        entityName: reversalTarget.entityName,
        status: 'pago',
        isReversal: true,
        reversedFromId: reversalTarget.id,
        createdByEmail: currentUser?.email || 'admin',
        createdByName: currentUser?.displayName || 'Tesoureiro',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'financialTransactions', reversalId), reversalTrans);

      // 2. Mark original transaction as reversed with audit log
      await updateDoc(doc(db, 'financialTransactions', reversalTarget.id), {
        isReversed: true,
        reversedById: reversalId,
        reversalReason: reversalReason.trim(),
        updatedAt: new Date().toISOString(),
      });

      setReversalTarget(null);
      setReversalReason('');
      await dialog.alert(
        `O lançamento ${reversalTarget.code} foi estornado com sucesso através do lançamento compensatório ${reversalCode}. Os registros históricos e contábeis foram preservados conforme normas de auditoria.`,
        { title: 'Estorno Realizado' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro ao estornar: ${err.message}`);
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-400" />
              Livro de Lançamentos
              <span className="text-xs px-2.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-normal">
                {filtered.length} registro(s)
              </span>
            </h2>
          </div>

          {canEdit && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition"
            >
              <Plus className="w-4 h-4" /> Novo Lançamento
            </button>
          )}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Mês de Competência */}
          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Mês de Competência</label>
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Tipo</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="todos">Todos os tipos</option>
              <option value="receita">Receitas (+)</option>
              <option value="despesa">Despesas (-)</option>
            </select>
          </div>

          {/* Conta */}
          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Conta / Caixa</label>
            <select
              value={filterAccount}
              onChange={e => setFilterAccount(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="todos">Todas as contas</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Categoria</label>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="todos">Todas as categorias</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Busca */}
          <div>
            <label className="text-[11px] text-zinc-400 font-semibold block mb-1">Buscar</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Descrição, fornecedor..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Nenhum lançamento encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Código / Data</th>
                  <th className="py-3 px-4">Descrição / Fornecedor</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Conta</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Valor (R$)</th>
                  <th className="py-3 px-4 text-center">Comprovante</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map(t => {
                  const isExpense = t.type === 'despesa';
                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-zinc-800/30 transition ${
                        t.isReversed ? 'opacity-60 bg-red-950/10' : t.isReversal ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Código e Data */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-white flex items-center gap-1.5">
                          {isExpense ? (
                            <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          {t.code}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        </div>
                      </td>

                      {/* Descrição e Fornecedor */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-white flex items-center gap-2">
                          <span className={t.isReversed ? 'line-through text-zinc-400' : ''}>{t.description}</span>
                          {t.isReversed && (
                            <span className="px-1.5 py-0.2 bg-red-500/20 text-red-400 text-[10px] rounded font-bold">
                              ESTORNADO
                            </span>
                          )}
                          {t.isReversal && (
                            <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-400 text-[10px] rounded font-bold">
                              LCTO. DE ESTORNO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          {t.entityName} • <span className="text-zinc-500">{t.createdByEmail}</span>
                        </div>
                        {t.reversalReason && (
                          <div className="text-[10px] text-red-300 italic mt-0.5">
                            Motivo do estorno: {t.reversalReason}
                          </div>
                        )}
                      </td>

                      {/* Categoria */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px] font-medium">
                          {t.categoryName}
                        </span>
                      </td>

                      {/* Conta */}
                      <td className="py-3 px-4 whitespace-nowrap text-zinc-400">{t.accountName}</td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.status === 'pago'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {t.status === 'pago' ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          {t.status === 'pago' ? 'Liquidado' : 'Previsto'}
                        </span>
                      </td>

                      {/* Valor */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-bold">
                        <span className={isExpense ? 'text-rose-400' : 'text-emerald-400'}>
                          {isExpense ? '- ' : '+ '}
                          {t.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </td>

                      {/* Comprovante */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        {t.attachmentUrl ? (
                          <button
                            onClick={() => setPreviewReceiptUrl(t.attachmentUrl || null)}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition"
                            title="Visualizar Comprovante"
                          >
                            <Paperclip className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-zinc-600 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Ações (Estorno) */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        {canEdit && !t.isReversed && !t.isReversal ? (
                          <button
                            onClick={() => {
                              setReversalTarget(t);
                              setReversalReason('');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                            title="Realizar estorno auditado deste lançamento"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Estornar
                          </button>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: New Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" /> Registrar Lançamento Financeiro
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Type Switch */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setTransType('receita')}
                  className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                    transType === 'receita'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" /> Receita (Entrada)
                </button>
                <button
                  type="button"
                  onClick={() => setTransType('despesa')}
                  className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                    transType === 'despesa'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4" /> Despesa (Saída)
                </button>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Valor em Reais (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Data do Lançamento *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Competence Month and Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Mês de Competência *</label>
                  <input
                    type="month"
                    value={competenceMonth}
                    onChange={e => setCompetenceMonth(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                  {isCurrentMonthClosed && (
                    <span className="text-[10px] text-red-400 font-bold block mt-1">
                      ⚠️ Atenção: Mês encerrado!
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Status de Liquidação *</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="pago">Liquidado / Pago</option>
                    <option value="previsto">Previsto (A pagar / receber)</option>
                  </select>
                </div>
              </div>

              {/* Account and Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Conta / Caixa *</label>
                  <select
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Selecione a conta...</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 font-semibold">Categoria *</label>
                  <select
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    <option value="">Selecione a categoria...</option>
                    {categories
                      .filter(c => c.type === transType)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Entity and Description */}
              <div>
                <label className="text-[11px] text-zinc-400 font-semibold">
                  {transType === 'receita' ? 'Pagador / Associado / Origem' : 'Fornecedor / Beneficiário'}
                </label>
                <input
                  type="text"
                  value={entityName}
                  onChange={e => setEntityName(e.target.value)}
                  placeholder={transType === 'receita' ? 'Ex: Mensalidade de Sócio ou Patrocinador' : 'Ex: Fornecedor de Alvos ou Celesc'}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-semibold">Descrição Detalhada *</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Compra de 500 alvos olímpicos para treino de sábado"
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {/* Receipt attachment */}
              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                  Anexo de Comprovante (Foto ou Documento)
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      setAttachmentFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Comprovantes são arquivados com compressão segura para auditoria do Conselho Fiscal.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-md"
                >
                  {uploading ? 'Gravando e Anexando...' : 'Confirmar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reversal (Estorno) */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 bg-rose-950/20 flex items-center justify-between">
              <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-400" /> Estorno Auditado de Lançamento
              </h3>
              <button
                onClick={() => setReversalTarget(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 text-xs space-y-1">
                <div>
                  <span className="text-zinc-500">Lançamento:</span>{' '}
                  <strong className="text-white font-mono">{reversalTarget.code}</strong>
                </div>
                <div>
                  <span className="text-zinc-500">Descrição:</span>{' '}
                  <span className="text-zinc-300">{reversalTarget.description}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Valor:</span>{' '}
                  <strong className="text-emerald-400 font-mono">
                    {reversalTarget.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
              </div>

              <div className="text-xs text-zinc-300 leading-relaxed">
                Por normas contábeis e de governança da Sociedade, <strong>registros não podem ser apagados</strong>. O estorno criará automaticamente um contra-lançamento compensatório e manterá todo o histórico auditável pelo Conselho Fiscal.
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                  Justificativa Formal do Estorno *
                </label>
                <textarea
                  rows={3}
                  value={reversalReason}
                  onChange={e => setReversalReason(e.target.value)}
                  placeholder="Ex: Lançamento duplicado por engano na data 10/11 ou comprovante incorreto."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="px-4 py-2 bg-zinc-800 text-white text-xs font-semibold rounded-lg hover:bg-zinc-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReversal}
                  disabled={reversing}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
                >
                  {reversing ? 'Processando Estorno...' : 'Confirmar Estorno'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Receipt Preview */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="max-w-3xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-emerald-400" /> Comprovante Anexado
              </h4>
              <button
                onClick={() => setPreviewReceiptUrl(null)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center flex-1 bg-zinc-950">
              {previewReceiptUrl.startsWith('data:image') || previewReceiptUrl.includes('.jpg') || previewReceiptUrl.includes('.png') || previewReceiptUrl.includes('.webp') ? (
                <img
                  src={previewReceiptUrl}
                  alt="Comprovante"
                  className="max-h-[70vh] object-contain rounded-lg shadow-lg"
                />
              ) : (
                <iframe
                  src={previewReceiptUrl}
                  title="Documento Comprovante"
                  className="w-full h-[70vh] rounded-lg border-0"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
