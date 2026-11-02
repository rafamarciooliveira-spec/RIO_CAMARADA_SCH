import React, { useState, useMemo } from 'react';
import { Member, FinancialAccount, FinancialMemberFee } from '../types/index.ts';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { maskCPF } from '../utils/cpf.ts';
import {
  CreditCard,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';

interface Props {
  members: Member[];
  memberFees: FinancialMemberFee[];
  accounts: FinancialAccount[];
  canEdit: boolean;
}

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const FinancialMemberFeesView: React.FC<Props> = ({
  members,
  memberFees,
  accounts,
  canEdit,
}) => {
  const { currentUser } = useAuth();
  const dialog = useDialog();

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Preferred society PIX key from bank accounts
  const pixKey = useMemo(() => {
    const accWithPix = accounts.find(a => a.pixKey);
    return accWithPix?.pixKey || 'financeiro@riocamarada.com.br';
  }, [accounts]);

  // Current month in current year (1-12)
  const currentMonthNum = new Date().getMonth() + 1;
  const isCurrentYear = selectedYear === new Date().getFullYear();

  // Map member fees for quick lookup: `${memberId}_${selectedYear}`
  const feeMap = useMemo(() => {
    const map = new Map<string, FinancialMemberFee>();
    memberFees
      .filter(f => f.year === selectedYear)
      .forEach(f => {
        map.set(f.memberId, f);
      });
    return map;
  }, [memberFees, selectedYear]);

  // Approved members filtered
  const filteredMembers = useMemo(() => {
    return members
      .filter(m => m.status === 'aprovado')
      .filter(m => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = m.fullName.toLowerCase().includes(q);
          const matchCpf = m.cpf.includes(q);
          const matchNum = m.membershipNumber ? m.membershipNumber.toLowerCase().includes(q) : false;
          if (!matchName && !matchCpf && !matchNum) return false;
        }

        if (onlyOverdue) {
          const fee = feeMap.get(m.id);
          const maxCheckMonth = isCurrentYear ? currentMonthNum : 12;
          let hasUnpaidPast = false;
          for (let month = 1; month <= maxCheckMonth; month++) {
            if (!fee?.months?.[month]?.paid) {
              hasUnpaidPast = true;
              break;
            }
          }
          if (!hasUnpaidPast) return false;
        }

        return true;
      });
  }, [members, searchQuery, onlyOverdue, feeMap, isCurrentYear, currentMonthNum]);

  // Toggle paid status for a specific month
  const handleToggleMonthPaid = async (member: Member, monthNum: number, currentPaid: boolean) => {
    if (!canEdit) return;

    try {
      const docId = `${member.id}_${selectedYear}`;
      const existing = feeMap.get(member.id);

      const months = existing?.months ? { ...existing.months } : {};
      months[monthNum] = {
        paid: !currentPaid,
        paidAt: !currentPaid ? new Date().toISOString() : undefined,
      };

      const record: FinancialMemberFee = {
        id: docId,
        memberId: member.id,
        memberName: member.fullName,
        memberCpf: member.cpf,
        year: selectedYear,
        months,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'financialMemberFees', docId), record, { merge: true });
    } catch (err: any) {
      await dialog.alert(`Erro ao atualizar mensalidade: ${err.message}`);
    }
  };

  // Generate annual dues for all approved members
  const handleGenerateYearCharges = async () => {
    if (!canEdit) return;
    const confirmed = await dialog.confirm(
      `Deseja inicializar o mapa de cobrança do ano ${selectedYear} para todos os ${members.filter(m => m.status === 'aprovado').length} sócios aprovados?`,
      { title: 'Gerar Cobranças do Ano' }
    );
    if (!confirmed) return;

    setProcessing(true);
    try {
      let created = 0;
      for (const m of members.filter(m => m.status === 'aprovado')) {
        const docId = `${m.id}_${selectedYear}`;
        if (!feeMap.has(m.id)) {
          const record: FinancialMemberFee = {
            id: docId,
            memberId: m.id,
            memberName: m.fullName,
            memberCpf: m.cpf,
            year: selectedYear,
            months: {},
            updatedAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'financialMemberFees', docId), record);
          created++;
        }
      }
      await dialog.alert(
        `Cobranças de ${selectedYear} preparadas com sucesso! Foram vinculados ${created} novos registros de sócios.`,
        { title: 'Cobranças Geradas' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const copyPixToClipboard = () => {
    navigator.clipboard.writeText(pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with PIX key & Quick actions */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 p-5 rounded-2xl border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Chave PIX Oficial para Mensalidades
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-base font-mono font-bold text-white selection:bg-emerald-500 selection:text-black">
              {pixKey}
            </span>
            <button
              onClick={copyPixToClipboard}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
              title="Copiar Chave PIX"
            >
              {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedPix ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Chave cadastrada para recebimento direto nas contas da Sociedade
          </p>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateYearCharges}
              disabled={processing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              {processing ? 'Gerando...' : `Gerar Cobranças ${selectedYear}`}
            </button>
          </div>
        )}
      </div>

      {/* Filter and year controls */}
      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Year selector */}
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

          {/* Overdue filter */}
          <button
            onClick={() => setOnlyOverdue(!onlyOverdue)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              onlyOverdue
                ? 'bg-rose-500 text-white shadow-md'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Somente Inadimplentes
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por sócio ou CPF..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Member Fees Table (12 months) */}
      <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4 min-w-[200px]">Associado</th>
                {MONTH_SHORT.map((m, idx) => (
                  <th key={m} className="py-3 px-2 text-center min-w-[44px]">
                    <span className={isCurrentYear && idx + 1 === currentMonthNum ? 'text-emerald-400 font-bold' : ''}>
                      {m}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-zinc-500">
                    Nenhum sócio encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMembers.map(m => {
                  const fee = feeMap.get(m.id);
                  return (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white truncate max-w-[220px]">{m.fullName}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          {maskCPF(m.cpf)} • {m.membershipNumber || 'S/N'}
                        </div>
                      </td>
                      {MONTH_SHORT.map((_, idx) => {
                        const monthNum = idx + 1;
                        const paid = fee?.months?.[monthNum]?.paid === true;
                        const isPastOrCurrent = !isCurrentYear || monthNum <= currentMonthNum;

                        return (
                          <td key={monthNum} className="py-3 px-2 text-center">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => handleToggleMonthPaid(m, monthNum, paid)}
                              className={`p-1.5 rounded-lg transition ${
                                paid
                                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                                  : isPastOrCurrent
                                  ? 'bg-rose-500/10 text-rose-400/80 hover:bg-rose-500/20'
                                  : 'bg-zinc-800/40 text-zinc-600 hover:bg-zinc-800'
                              } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                              title={
                                paid
                                  ? `Pago em ${fee?.months?.[monthNum]?.paidAt ? new Date(fee.months[monthNum].paidAt!).toLocaleDateString('pt-BR') : ''}`
                                  : isPastOrCurrent
                                  ? 'Pendente / Em atraso'
                                  : 'A vencer'
                              }
                            >
                              {paid ? (
                                <CheckCircle2 className="w-4 h-4 fill-emerald-500/20" />
                              ) : isPastOrCurrent ? (
                                <XCircle className="w-4 h-4 opacity-70" />
                              ) : (
                                <span className="w-4 h-4 block text-[10px] text-zinc-600 leading-4">•</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
