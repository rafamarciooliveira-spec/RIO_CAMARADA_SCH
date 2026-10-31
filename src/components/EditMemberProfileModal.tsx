import React, { useState } from 'react';
import { Member } from '../types/index.ts';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { doc, updateDoc } from 'firebase/firestore';
import { formatDateBR, maskDateBR, dateBRToISO, isValidDateBR } from '../utils/date.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { saveOfflineCard } from '../utils/security.ts';
import {
  User,
  Calendar,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80',
];

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member;
  onSuccess?: () => void;
}

export const EditMemberProfileModal: React.FC<EditModalProps> = ({
  isOpen,
  onClose,
  member,
  onSuccess,
}) => {
  const { activeTemplate } = useAuth();
  const [fullName, setFullName] = useState(member.fullName || '');
  const [birthDateBR, setBirthDateBR] = useState(() => formatDateBR(member.birthDate, ''));
  const [photoUrl, setPhotoUrl] = useState(member.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2.5 * 1024 * 1024) {
        setErrorMsg('A foto deve ter no máximo 2.5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    if (!birthDateBR || !isValidDateBR(birthDateBR)) {
      setErrorMsg('Por favor, informe uma data de nascimento válida no padrão brasileiro (DD/MM/AAAA).');
      return;
    }

    setSaving(true);

    try {
      const normalizedDate = dateBRToISO(birthDateBR);
      const path = 'members';
      const updatedFields = {
        fullName: fullName.trim(),
        birthDate: normalizedDate,
        photoUrl: photoUrl || '',
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, path, member.id), updatedFields);

      // Sincroniza também com o cartão salvo offline se houver
      if (activeTemplate) {
        saveOfflineCard(
          {
            ...member,
            ...updatedFields,
          },
          activeTemplate
        );
      }

      triggerPushNotification(
        '✅ Cadastro Atualizado!',
        'Seu nome, data de nascimento e foto foram salvos com sucesso no banco de dados.',
        'approval'
      );

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Erro ao salvar dados do sócio:', err);
      handleFirestoreError(err, OperationType.UPDATE, `members/${member.id}`);
      setErrorMsg('Erro ao salvar no banco de dados. Verifique a conexão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto animate-scale-in text-zinc-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-inner">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Editar Meus Dados de Sócio
              </h3>
              <p className="text-xs text-zinc-400">
                Altere seu nome, ano/data de nascimento e troque sua foto oficial.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2.5 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <strong className="block font-bold">Salvo no Banco de Dados com Sucesso!</strong>
                <span className="opacity-90">Sua carteirinha digital já foi atualizada.</span>
              </div>
            </div>
          )}

          {/* 1. TROCA DE FOTO 3X4 */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Camera className="w-4 h-4" /> Foto do Sócio (Troca de Foto)
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-20 h-24 rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-zinc-900 shrink-0 shadow-lg relative group">
                {photoUrl ? (
                  <img src={photoUrl} alt="Foto do Sócio" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 text-xs font-mono">
                    <User className="w-8 h-8 opacity-40 mb-1" />
                    <span>Sem Foto</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1 text-center sm:text-left">
                <span className="text-xs font-semibold text-white block">
                  Foto para a Carteirinha Digital
                </span>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Selecione uma imagem com boa iluminação (formato 3x4 ou selfie nítida).
                </p>

                <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer hover:scale-102">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Escolher Nova Foto do Celular</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Avatares Rápidos de Teste */}
            <div className="pt-2 border-t border-zinc-800/80">
              <span className="text-[10px] uppercase font-mono text-zinc-500 block mb-1.5">
                Ou selecione uma foto da galeria rápida:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_AVATARS.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoUrl(url)}
                    className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      photoUrl === url
                        ? 'border-emerald-400 scale-110 shadow-md ring-1 ring-emerald-400'
                        : 'border-zinc-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. NOME COMPLETO */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Nome Completo Oficial *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Digite seu nome completo..."
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-medium"
            />
          </div>

          {/* 3. DATA / ANO DE NASCIMENTO */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Data / Ano de Nascimento (Padrão Brasil) *
              </label>
              {birthDateBR && (
                <span className="text-[11px] font-mono">
                  {isValidDateBR(birthDateBR) ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Padrão BR (DD/MM/AAAA)
                    </span>
                  ) : (
                    <span className="text-amber-400">Preencha DD/MM/AAAA</span>
                  )}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                required
                maxLength={10}
                value={birthDateBR}
                onChange={e => setBirthDateBR(maskDateBR(e.target.value))}
                placeholder="DD/MM/AAAA (ex: 15/04/1985)"
                className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-mono"
              />

              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                <label className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer" title="Selecionar no calendário">
                  <Calendar className="w-4 h-4" />
                  <input
                    type="date"
                    onChange={e => {
                      if (e.target.value) {
                        setBirthDateBR(formatDateBR(e.target.value));
                      }
                    }}
                    className="sr-only"
                    tabIndex={-1}
                  />
                </label>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              Altere o dia, mês e o ano de nascimento conforme seu documento oficial.
            </span>
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all cursor-pointer disabled:opacity-50 hover:scale-102"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Salvando no Banco...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações no Banco de Dados</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
