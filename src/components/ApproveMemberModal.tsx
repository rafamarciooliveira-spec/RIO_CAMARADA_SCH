import React, { useState } from 'react';
import { Member, MEMBER_CATEGORIES, MemberCategory, normalizeMemberCategory } from '../types/index.ts';
import { maskCPF } from '../utils/cpf.ts';
import { formatDateBR, maskDateBR, dateBRToISO, isValidDateBR } from '../utils/date.ts';
import { getDefaultOfficialExpiry } from '../utils/security.ts';
import {
  CheckCircle2,
  Crown,
  User,
  ShieldCheck,
  Upload,
  AlertCircle,
  Calendar,
  X,
  Hash,
} from 'lucide-react';

interface ApproveModalProps {
  member: Member;
  suggestedMembershipNumber?: string;
  onConfirmApprove: (updatedData: {
    category: MemberCategory;
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    photoUrl?: string;
    validUntil?: string;
    membershipNumber?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const ApproveMemberModal: React.FC<ApproveModalProps> = ({
  member,
  suggestedMembershipNumber,
  onConfirmApprove,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MemberCategory>(
    normalizeMemberCategory(member.category)
  );

  const [fullName, setFullName] = useState(member.fullName);
  const [birthDateBR, setBirthDateBR] = useState(formatDateBR(member.birthDate));
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || '');
  const [membershipNumber, setMembershipNumber] = useState(
    member.membershipNumber && member.membershipNumber.startsWith('SOC-')
      ? member.membershipNumber
      : (suggestedMembershipNumber || 'SOC-000001')
  );
  const [validUntil, setValidUntil] = useState(
    member.validUntil || getDefaultOfficialExpiry()
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('A foto deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const res = ev.target?.result as string;
      if (res) setPhotoUrl(res);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      await onConfirmApprove({
        category: selectedCategory,
        fullName: fullName.trim(),
        birthDate: dateBRToISO(birthDateBR),
        photoUrl,
        validUntil: validUntil.trim(),
        membershipNumber: membershipNumber.trim(),
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao homologar cadastro.');
    } finally {
      setSaving(false);
    }
  };

  // Close modal on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md cursor-pointer animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto relative cursor-default animate-scale-in"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-4 mb-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Homologar Cadastro de Associado</h3>
            <p className="text-xs text-zinc-400">
              Defina a categoria oficial do associado para emissão da carteirinha digital.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-6">
          {/* CATEGORY SELECTION: Sócio Efetivo vs Membro da Diretoria vs Membro Diretoria Executiva */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
              Classificação na Associação (Definida Exclusivamente pelo Administrador) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Option 1: Sócio Efetivo */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Sócio Efetivo')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                  selectedCategory === 'Sócio Efetivo'
                    ? 'border-emerald-500 bg-emerald-950/40 shadow-lg ring-1 ring-emerald-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedCategory === 'Sócio Efetivo'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    <User className="w-4 h-4" />
                  </div>
                  <h4 className="font-extrabold text-xs text-white">Sócio Efetivo</h4>
                </div>
                <p className="text-[10px] text-zinc-400 leading-snug">
                  Associado geral com carteirinha oficial e acesso a eventos, estandes e cultura.
                </p>
              </button>

              {/* Option 2: Membro da Diretoria */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Membro da Diretoria')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                  selectedCategory === 'Membro da Diretoria'
                    ? 'border-sky-500 bg-sky-950/40 shadow-lg ring-1 ring-sky-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedCategory === 'Membro da Diretoria'
                        ? 'bg-sky-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-extrabold text-xs text-white">Membro da Diretoria</h4>
                </div>
                <p className="text-[10px] text-zinc-400 leading-snug">
                  Diretoria com acesso a fiscalização, validação de carteirinhas e gestão.
                </p>
              </button>

              {/* Option 3: Membro Diretoria Executiva */}
              <button
                type="button"
                onClick={() => setSelectedCategory('Membro Diretoria Executiva')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                  selectedCategory === 'Membro Diretoria Executiva'
                    ? 'border-amber-500 bg-amber-950/40 shadow-lg ring-1 ring-amber-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedCategory === 'Membro Diretoria Executiva'
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    <Crown className="w-4 h-4" />
                  </div>
                  <h4 className="font-extrabold text-xs text-white">Membro Diretoria Executiva</h4>
                </div>
                <p className="text-[10px] text-zinc-400 leading-snug">
                  Gestão executiva ativa com poderes de homologação e aprovação de associados.
                </p>
              </button>
            </div>
          </div>

          {/* MATRÍCULA SEQUENCIAL & DATA DE VALIDADE EDITÁVEL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-zinc-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                Matrícula Sequencial Oficial *
              </label>
              <input
                type="text"
                value={membershipNumber}
                onChange={e => setMembershipNumber(e.target.value)}
                placeholder="SOC-000001"
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-300 font-bold outline-hidden focus:border-emerald-500"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Gerada em sequência sem repetir (SOC-000001, SOC-000002...).
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Data de Validade da Carteirinha *
              </label>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-white outline-hidden focus:border-emerald-500"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Defina o vencimento individual deste associado.
              </span>
            </div>
          </div>

          {/* DEDICATED PHOTO ADJUSTMENT / VERIFICATION */}
          <div className="pt-3 border-t border-zinc-800">
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
              Foto 3x4 do Associado
            </label>
            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800">
              <div className="w-16 h-20 rounded-xl overflow-hidden border-2 border-emerald-500/40 bg-zinc-900 shrink-0 shadow-md">
                {photoUrl ? (
                  <img src={photoUrl} alt="Foto 3x4" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-mono">
                    Sem Foto
                  </div>
                )}
              </div>

              <div className="space-y-1.5 flex-1">
                <span className="text-xs font-semibold text-white block">
                  Foto para a Carteirinha Oficial
                </span>
                <p className="text-[11px] text-zinc-400">
                  O administrador pode substituir ou ajustar a foto antes de aprovar:
                </p>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium cursor-pointer border border-zinc-700 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Substituir Foto 3x4</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* EDIT MEMBER PERSONAL DATA IF NECESSARY */}
          <div className="pt-3 border-t border-zinc-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
              Conferência dos Dados Pessoais
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Data de Nascimento (DD/MM/AAAA)</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={10}
                    value={birthDateBR}
                    onChange={e => setBirthDateBR(maskDateBR(e.target.value))}
                    placeholder="DD/MM/AAAA"
                    className="w-full pl-3 pr-8 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <label className="text-zinc-400 hover:text-emerald-400 cursor-pointer" title="Selecionar no calendário">
                      <Calendar className="w-3.5 h-3.5" />
                      <input
                        type="date"
                        onChange={e => e.target.value && setBirthDateBR(formatDateBR(e.target.value))}
                        className="sr-only"
                        tabIndex={-1}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 font-mono bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800">
              <span>CPF (Titular): {maskCPF(member.cpf)}</span> • <span>E-mail: {member.email}</span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {saving ? 'Homologando...' : `Aprovar como ${selectedCategory}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
