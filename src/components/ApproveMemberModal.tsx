import React, { useState } from 'react';
import { Member } from '../types/index.ts';
import { maskCPF } from '../utils/cpf.ts';
import {
  CheckCircle2,
  Crown,
  User,
  Users,
  ShieldCheck,
  Award,
  Upload,
  AlertCircle,
  Calendar,
  X,
} from 'lucide-react';

interface ApproveModalProps {
  member: Member;
  onConfirmApprove: (updatedData: {
    category: string;
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    photoUrl?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export const ApproveMemberModal: React.FC<ApproveModalProps> = ({
  member,
  onConfirmApprove,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'SÓCIO' | 'MEMBRO DA DIRETORIA' | 'custom'>(
    member.category === 'MEMBRO DA DIRETORIA' ? 'MEMBRO DA DIRETORIA' : 'SÓCIO'
  );
  const [customCategory, setCustomCategory] = useState(
    member.category !== 'SÓCIO' && member.category !== 'MEMBRO DA DIRETORIA' ? member.category : ''
  );

  const [fullName, setFullName] = useState(member.fullName);
  const [birthDate, setBirthDate] = useState(member.birthDate);
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || '');
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
    let finalCategory = selectedCategory as string;
    if (selectedCategory === 'custom') {
      if (!customCategory.trim()) {
        setErrorMsg('Informe o nome do cargo ou categoria personalizada.');
        return;
      }
      finalCategory = customCategory.trim().toUpperCase();
    }

    setSaving(true);
    try {
      await onConfirmApprove({
        category: finalCategory,
        fullName: fullName.trim(),
        birthDate,
        photoUrl,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao homologar cadastro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto relative">
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
          {/* CATEGORY SELECTION: SÓCIO vs MEMBRO DA DIRETORIA */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
              Classificação na Associação (Obrigatório na Aprovação) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: SÓCIO */}
              <button
                type="button"
                onClick={() => setSelectedCategory('SÓCIO')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  selectedCategory === 'SÓCIO'
                    ? 'border-emerald-500 bg-emerald-950/40 shadow-lg ring-1 ring-emerald-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedCategory === 'SÓCIO'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white">SÓCIO</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Associado geral homologado no quadro social com plenos direitos.
                  </p>
                </div>
              </button>

              {/* Option 2: MEMBRO DA DIRETORIA */}
              <button
                type="button"
                onClick={() => setSelectedCategory('MEMBRO DA DIRETORIA')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                  selectedCategory === 'MEMBRO DA DIRETORIA'
                    ? 'border-amber-500 bg-amber-950/40 shadow-lg ring-1 ring-amber-500'
                    : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedCategory === 'MEMBRO DA DIRETORIA'
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white">MEMBRO DA DIRETORIA</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Diretoria executiva, conselho ou presidência da entidade.
                  </p>
                </div>
              </button>
            </div>

            {/* Option 3: Custom / Special Title */}
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="radio"
                  name="catOption"
                  checked={selectedCategory === 'custom'}
                  onChange={() => setSelectedCategory('custom')}
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Outro cargo executivo específico (ex: Presidente, Secretário, Tesoureiro)</span>
              </label>

              {selectedCategory === 'custom' && (
                <input
                  type="text"
                  placeholder="Digite o cargo ou categoria..."
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500 outline-hidden"
                />
              )}
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
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Data de Nascimento</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500 font-mono"
                />
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
              {saving ? 'Homologando...' : `Aprovar como ${selectedCategory === 'custom' ? (customCategory || 'CARGO') : selectedCategory}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
