import React, { useState, useEffect } from 'react';
import { Member, CardTemplate, RejectionEmailTemplate } from '../types/index.ts';
import { db } from '../firebase/config.ts';
import { doc, getDoc } from 'firebase/firestore';
import {
  DEFAULT_REJECTION_SUBJECT,
  DEFAULT_REJECTION_BODY,
  replaceTemplateVariables,
} from '../utils/emailTemplate.ts';
import {
  AlertTriangle,
  Mail,
  Send,
  X,
  Eye,
  CheckCircle2,
  Sparkles,
  FileText,
  ShieldAlert,
} from 'lucide-react';

interface RejectMemberModalProps {
  member: Member;
  activeTemplate: CardTemplate;
  onConfirmReject: (data: {
    reason: string;
    emailSubject: string;
    emailBody: string;
  }) => Promise<void>;
  onClose: () => void;
}

const COMMON_REJECTION_REASONS = [
  'A foto 3x4 enviada está com baixa nitidez ou não atende aos padrões de identificação.',
  'Divergência entre o nome e o número de CPF informado no cadastro.',
  'Comprovante de identificação incompleto ou ilegível.',
  'Data de nascimento divergente da base cadastral.',
  'Necessário envio de nova foto com fundo neutro e rosto centralizado.',
];

export const RejectMemberModal: React.FC<RejectMemberModalProps> = ({
  member,
  activeTemplate,
  onConfirmReject,
  onClose,
}) => {
  const [reason, setReason] = useState(
    'A foto 3x4 enviada está com baixa nitidez ou não atende aos padrões de identificação.'
  );
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'reason' | 'preview'>('reason');

  // Load configured default template from Firestore
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemSettings', 'rejection_email'));
        if (snap.exists()) {
          const data = snap.data() as RejectionEmailTemplate;
          if (data.subject) setCustomSubject(data.subject);
          if (data.body) setCustomBody(data.body);
        } else {
          setCustomSubject(DEFAULT_REJECTION_SUBJECT);
          setCustomBody(DEFAULT_REJECTION_BODY);
        }
      } catch (err) {
        console.warn('Erro ao carregar template no modal de rejeição:', err);
        setCustomSubject(DEFAULT_REJECTION_SUBJECT);
        setCustomBody(DEFAULT_REJECTION_BODY);
      } finally {
        setLoadingTemplate(false);
      }
    };

    loadTemplate();
  }, []);

  // Compute live rendered email text
  const memberVars = {
    nomeAssociado: member.fullName,
    motivoRejeicao: reason.trim() || 'Ajuste documental solicitado pela administração.',
    nomeAssociacao: activeTemplate.associationName || 'Associação',
    dataSolicitacao: member.createdAt
      ? new Date(member.createdAt).toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR'),
    cpfAssociado: member.cpf,
    emailAssociado: member.email,
  };

  const finalSubject = replaceTemplateVariables(customSubject || DEFAULT_REJECTION_SUBJECT, memberVars);
  const finalBody = replaceTemplateVariables(customBody || DEFAULT_REJECTION_BODY, memberVars);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Por favor, descreva o motivo da não aprovação.');
      return;
    }

    setSending(true);
    try {
      await onConfirmReject({
        reason: reason.trim(),
        emailSubject: finalSubject,
        emailBody: finalBody,
      });
      onClose();
    } catch (err: any) {
      console.error('Erro ao rejeitar associado:', err);
      alert('Erro ao registrar não-aprovação: ' + (err.message || 'Erro inesperado.'));
    } finally {
      setSending(false);
    }
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-red-500/40 rounded-3xl max-w-2xl w-full p-6 shadow-2xl text-zinc-100 flex flex-col max-h-[92vh] overflow-y-auto cursor-default animate-scale-in"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Solicitar Ajuste / Não Aprovar Cadastro
              </h3>
              <p className="text-xs text-zinc-400">
                Associado: <strong className="text-zinc-200">{member.fullName}</strong> ({member.email})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-4 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('reason')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'reason'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>1. Motivo do Ajuste</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'preview'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-emerald-400" />
            <span>2. Visualizar E-mail que Será Enviado</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 flex-1">
          {activeTab === 'reason' && (
            <div className="space-y-4">
              {/* Quick Select Common Reasons */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-2">
                  Selecione um motivo frequente ou digite abaixo:
                </label>
                <div className="space-y-1.5">
                  {COMMON_REJECTION_REASONS.map((comm, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setReason(comm)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs border transition-all cursor-pointer flex items-center justify-between ${
                        reason === comm
                          ? 'bg-red-950/40 border-red-500/50 text-white font-medium'
                          : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <span>{comm}</span>
                      {reason === comm && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-red-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea for specific reason */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 block">
                  Descrição detalhada do motivo / pendência:
                </label>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Escreva a justificativa clara para o associado..."
                  className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-red-500 transition-colors leading-relaxed"
                  required
                />
              </div>

              {/* Dispatch Notice */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Disparo Automático Integrado:</span>
                </div>
                <p>
                  O associado receberá o e-mail oficial com o texto padrão configurado pelo administrador e este motivo inserido dinamicamente, além de uma notificação push na tela do celular.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-700 bg-zinc-950 overflow-hidden shadow-inner text-xs">
                {/* Header */}
                <div className="p-3.5 border-b border-zinc-800 bg-zinc-900/80 space-y-1 text-[11px]">
                  <div>
                    <span className="text-zinc-500 font-semibold">Para: </span>
                    <span className="text-white font-medium">
                      {member.fullName} &lt;{member.email}&gt;
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-semibold">Assunto: </span>
                    <span className="text-amber-400 font-bold">{finalSubject}</span>
                  </div>
                </div>

                {/* Body Preview */}
                <div className="p-4 bg-white text-zinc-900 max-h-72 overflow-y-auto">
                  <div className="text-[12px] leading-relaxed whitespace-pre-line font-sans text-zinc-800">
                    {finalBody}
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-zinc-400 text-center">
                Você pode editar o modelo padrão na aba <strong>"Texto de Rejeição (E-mail)"</strong> no menu superior do administrador.
              </p>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending || loadingTemplate}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Enviando E-mail e Notificação...' : 'Confirmar e Enviar E-mail'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
