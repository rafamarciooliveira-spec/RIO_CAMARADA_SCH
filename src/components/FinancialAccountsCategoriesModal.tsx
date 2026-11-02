import React, { useState } from 'react';
import {
  FinancialAccount,
  FinancialCategory,
  FinancialTransactionType,
  FinancialAccountType,
} from '../types/index.ts';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { X, Plus, Trash2, Wallet, Building2, Tag, Check, AlertCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: FinancialAccount[];
  categories: FinancialCategory[];
  canEdit: boolean;
}

export const FinancialAccountsCategoriesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  accounts,
  categories,
  canEdit,
}) => {
  const { currentUser } = useAuth();
  const dialog = useDialog();
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories'>('accounts');

  // New account form
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState<FinancialAccountType>('banco');
  const [accountInitialBalance, setAccountInitialBalance] = useState('0');
  const [accountBankName, setAccountBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountPixKey, setAccountPixKey] = useState('');

  // New category form
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<FinancialTransactionType>('receita');

  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!accountName.trim()) {
      await dialog.alert('Informe o nome da conta bancária ou caixa.');
      return;
    }

    setSaving(true);
    try {
      const id = 'acc_' + Date.now();
      const initialBal = parseFloat(accountInitialBalance) || 0;
      const newAcc: FinancialAccount = {
        id,
        name: accountName.trim(),
        type: accountType,
        initialBalance: initialBal,
        currentBalance: initialBal,
        bankName: accountBankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        pixKey: accountPixKey.trim() || undefined,
        active: true,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'financialAccounts', id), newAcc);
      setAccountName('');
      setAccountInitialBalance('0');
      setAccountBankName('');
      setAccountNumber('');
      setAccountPixKey('');
    } catch (err: any) {
      await dialog.alert(`Erro ao cadastrar conta: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (acc: FinancialAccount) => {
    if (!canEdit) return;
    const confirmed = await dialog.confirm(
      `Deseja realmente desativar a conta "${acc.name}"?`,
      { title: 'Confirmar Exclusão de Conta' }
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'financialAccounts', acc.id));
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!categoryName.trim()) {
      await dialog.alert('Informe o nome da categoria.');
      return;
    }

    setSaving(true);
    try {
      const id = 'cat_' + Date.now();
      const newCat: FinancialCategory = {
        id,
        name: categoryName.trim(),
        type: categoryType,
        active: true,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'financialCategories', id), newCat);
      setCategoryName('');
    } catch (err: any) {
      await dialog.alert(`Erro ao criar categoria: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (cat: FinancialCategory) => {
    if (!canEdit) return;
    const confirmed = await dialog.confirm(
      `Deseja excluir a categoria "${cat.name}"?`,
      { title: 'Confirmar Exclusão' }
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'financialCategories', cat.id));
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Contas e Categorias Financeiras</h2>
              <p className="text-xs text-zinc-400">Configure as contas bancárias, caixas físicos e rubricas de receita e despesa</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-5 pt-4 flex gap-2 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'accounts'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Contas Bancárias e Caixas ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`pb-3 px-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'categories'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Tag className="w-4 h-4" />
            Categorias de Receita e Despesa ({categories.length})
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {activeTab === 'accounts' && (
            <div className="space-y-6">
              {/* Add form if allowed */}
              {canEdit ? (
                <form onSubmit={handleAddAccount} className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-400" /> Cadastrar Nova Conta ou Caixa
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Nome Identificador *</label>
                      <input
                        type="text"
                        value={accountName}
                        onChange={e => setAccountName(e.target.value)}
                        placeholder="Ex: Banco do Brasil ou Caixa Secretaria"
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Tipo *</label>
                      <select
                        value={accountType}
                        onChange={e => setAccountType(e.target.value as FinancialAccountType)}
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="banco">Conta Bancária</option>
                        <option value="caixa">Caixa Físico em Dinheiro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Saldo Inicial (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={accountInitialBalance}
                        onChange={e => setAccountInitialBalance(e.target.value)}
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Chave PIX da Sociedade</label>
                      <input
                        type="text"
                        value={accountPixKey}
                        onChange={e => setAccountPixKey(e.target.value)}
                        placeholder="Ex: CNPJ, e-mail ou chave aleatória"
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                    >
                      {saving ? 'Cadastrando...' : 'Salvar Conta'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 bg-zinc-800/40 rounded-xl text-xs text-zinc-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Visualização somente leitura para o Conselho Fiscal.
                </div>
              )}

              {/* Accounts List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Contas Cadastradas</h3>
                {accounts.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">Nenhuma conta cadastrada.</p>
                ) : (
                  accounts.map(acc => (
                    <div
                      key={acc.id}
                      className="p-3.5 bg-zinc-950/40 rounded-xl border border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-800 text-emerald-400 rounded-lg">
                          {acc.type === 'banco' ? <Building2 className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            {acc.name}
                            <span className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full capitalize">
                              {acc.type}
                            </span>
                          </h4>
                          {acc.pixKey && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                              PIX: <span className="text-emerald-400 font-mono">{acc.pixKey}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-zinc-500 block">Saldo Inicial</span>
                          <span className="text-xs font-bold text-zinc-300">
                            {acc.initialBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteAccount(acc)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Excluir conta"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-6">
              {canEdit && (
                <form onSubmit={handleAddCategory} className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 space-y-3">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-400" /> Cadastrar Nova Categoria
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Nome da Categoria *</label>
                      <input
                        type="text"
                        value={categoryName}
                        onChange={e => setCategoryName(e.target.value)}
                        placeholder="Ex: Material Esportivo, Taxas"
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium">Tipo *</label>
                      <select
                        value={categoryType}
                        onChange={e => setCategoryType(e.target.value as FinancialTransactionType)}
                        className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="receita">Receita (Entrada)</option>
                        <option value="despesa">Despesa (Saída)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                    >
                      {saving ? 'Adicionando...' : 'Salvar Categoria'}
                    </button>
                  </div>
                </form>
              )}

              {/* Categorias Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Receitas */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Receitas (Entradas)
                  </h4>
                  <div className="space-y-1.5">
                    {categories
                      .filter(c => c.type === 'receita')
                      .map(cat => (
                        <div
                          key={cat.id}
                          className="px-3 py-2 bg-zinc-950/40 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-200 font-medium">{cat.name}</span>
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="text-zinc-500 hover:text-red-400 p-1"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Despesas */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Despesas (Saídas)
                  </h4>
                  <div className="space-y-1.5">
                    {categories
                      .filter(c => c.type === 'despesa')
                      .map(cat => (
                        <div
                          key={cat.id}
                          className="px-3 py-2 bg-zinc-950/40 rounded-lg border border-zinc-800 flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-200 font-medium">{cat.name}</span>
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="text-zinc-500 hover:text-red-400 p-1"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
