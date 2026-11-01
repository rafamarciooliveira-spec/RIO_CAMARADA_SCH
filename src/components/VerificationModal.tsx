import React from 'react';
import { Member, CardTemplate } from '../types/index.ts';
import { checkViewTokenStatus, checkOfficialCardStatus } from '../utils/security.ts';
import { maskCPF } from '../utils/cpf.ts';
import { AssociationLogo } from './AssociationLogos.tsx';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  User,
  Hash,
  Award,
  AlertTriangle,
} from 'lucide-react';

interface ModalProps {
  member: Member;
  template: CardTemplate;
  onClose: () => void;
}

export const VerificationModal: React.FC<ModalProps> = ({ member, template, onClose }) => {
  const tokenStatus = checkViewTokenStatus(member.lastGeneratedAt);
  const officialStatus = checkOfficialCardStatus(member.validUntil);

  const isFullyValid = member.status === 'aprovado' && !tokenStatus.isExpired && !officialStatus.isExpired;

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-pointer animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-6 shadow-2xl text-zinc-100 overflow-hidden relative cursor-default animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <AssociationLogo logoKeyOrUrl={template.logoUrl} className="w-6 h-6 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-white">{template.associationName}</h3>
              <p className="text-[10px] text-zinc-400">Validação Pública de Credencial Digital</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Big Validation Banner */}
        <div
          className={`p-4 rounded-2xl border text-center mb-5 ${
            isFullyValid
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
              : 'bg-amber-950/60 border-amber-500/50 text-amber-200'
          }`}
        >
          <div className="inline-flex p-3 rounded-full bg-black/20 mb-2">
            {isFullyValid ? (
              <ShieldCheck className="w-10 h-10 text-emerald-400 animate-pulse" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-amber-400" />
            )}
          </div>
          <h4 className="font-extrabold text-lg text-white">
            {isFullyValid ? 'CARTEIRINHA AUTÊNTICA E VÁLIDA' : 'ATENÇÃO NA VALIDAÇÃO'}
          </h4>
          <p className="text-xs opacity-90 mt-1">
            {isFullyValid
              ? 'Sócio homologado no quadro social ativo da associação.'
              : 'Verifique a vigência do token de visualização ou da filiação.'}
          </p>
        </div>

        {/* Member Details */}
        <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800 mb-4">
          <div className="w-16 h-20 rounded-xl overflow-hidden border border-emerald-500/40 bg-zinc-900 shrink-0">
            {member.photoUrl ? (
              <img src={member.photoUrl} alt={member.fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <User className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] uppercase font-mono text-emerald-400 block">Titular</span>
            <h5 className="font-bold text-white text-base truncate">{member.fullName}</h5>
            <div className="text-xs text-zinc-400 font-mono mt-0.5">CPF: {maskCPF(member.cpf)}</div>
            <div className="mt-1">
              {member.category === 'MEMBRO DA DIRETORIA' ? (
                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] bg-amber-400 text-zinc-950 font-black uppercase tracking-wider">
                  MEMBRO DA DIRETORIA
                </span>
              ) : (
                <span className="inline-block px-2.5 py-0.5 rounded text-[10px] bg-zinc-800 text-emerald-300 font-bold uppercase tracking-wider border border-zinc-700">
                  {member.category || 'SÓCIO'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Strict Checks List */}
        <div className="space-y-2 text-xs bg-zinc-950/40 p-3.5 rounded-2xl border border-zinc-800/80 mb-5">
          <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Selo de Visualização (24h)
            </span>
            <span className={`font-mono font-medium ${tokenStatus.isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
              {tokenStatus.isValid ? `Válido (${tokenStatus.formattedRemaining})` : 'Expirado (Reabra o app)'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Data/Hora da Geração
            </span>
            <span className="font-mono text-zinc-200">{tokenStatus.generatedDateStr}</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-zinc-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              Validade Estatutária Oficial
            </span>
            <span className="font-mono text-amber-300 font-semibold">{officialStatus.formattedDate}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors cursor-pointer"
        >
          Fechar Verificação
        </button>
      </div>
    </div>
  );
};
