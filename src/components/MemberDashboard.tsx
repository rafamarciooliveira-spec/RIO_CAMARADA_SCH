import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { db } from '../firebase/config.ts';
import { doc, updateDoc, setDoc, collection, query, where, limit, onSnapshot, getDoc } from 'firebase/firestore';
import { EmailDispatchRecord, RejectionEmailTemplate } from '../types/index.ts';
import { replaceTemplateVariables, DEFAULT_REJECTION_SUBJECT, DEFAULT_REJECTION_BODY } from '../utils/emailTemplate.ts';
import { DigitalCard } from './DigitalCard.tsx';
import { MemberRegistrationForm } from './MemberRegistrationForm.tsx';
import { VerificationModal } from './VerificationModal.tsx';
import { generateViewToken, checkViewTokenStatus, checkOfficialCardStatus, DEFAULT_OFFICIAL_EXPIRY, saveOfflineCard } from '../utils/security.ts';
import { maskCPF } from '../utils/cpf.ts';
import { requestPushPermission, getPushPermissionStatus } from '../utils/pushNotification.ts';
import { OfflineCardModal } from './OfflineCardModal.tsx';
import { FullScreenCardModal } from './FullScreenCardModal.tsx';
import { EditMemberProfileModal } from './EditMemberProfileModal.tsx';
import { EventsCalendarView } from './EventsCalendarView.tsx';
import { CultureArticlesView } from './CultureArticlesView.tsx';
import { SocialLinksView } from './SocialLinksView.tsx';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Bell,
  ShieldCheck,
  Edit3,
  Calendar,
  Sparkles,
  Download,
  Info,
  Crown,
  User,
  FlaskConical,
  HardDriveDownload,
  ShieldAlert,
  Mail,
  ChevronDown,
  ChevronUp,
  Maximize2,
  CalendarDays,
  BookOpen,
  Share2,
} from 'lucide-react';

function formatDateSafe(val: any, fallback = 'Data recente'): string {
  if (!val) return fallback;
  try {
    let d: Date;
    if (typeof val === 'object' && val !== null && 'seconds' in val) {
      d = new Date(val.seconds * 1000);
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return fallback;
  }
}

function formatDateTimeSafe(val: any, fallback = 'Data recente'): string {
  if (!val) return fallback;
  try {
    let d: Date;
    if (typeof val === 'object' && val !== null && 'seconds' in val) {
      d = new Date(val.seconds * 1000);
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleString('pt-BR');
  } catch {
    return fallback;
  }
}

export const MemberDashboard: React.FC = () => {
  const {
    currentMember,
    activeTemplate,
    currentUser,
    memberLoading,
    activePortalTab,
    setActivePortalTab,
  } = useAuth();
  const [editing, setEditing] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showFullScreenModal, setShowFullScreenModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(getPushPermissionStatus());
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [receivedEmail, setReceivedEmail] = useState<EmailDispatchRecord | null>(null);
  const [showFullEmail, setShowFullEmail] = useState(true);

  // Fetch dispatched rejection email if rejected
  useEffect(() => {
    if (!currentMember || currentMember.status !== 'rejeitado') return;

    try {
      const q = query(
        collection(db, 'emailDispatches'),
        where('memberId', '==', currentMember.id),
        limit(1)
      );

      const unsubscribe = onSnapshot(
        q,
        snap => {
          if (!snap.empty) {
            setReceivedEmail(snap.docs[0].data() as EmailDispatchRecord);
          }
        },
        err => {
          console.warn('Erro ao carregar e-mail de rejeição:', err.message);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn('Listener email dispatch error:', e);
    }
  }, [currentMember?.id, currentMember?.status]);

  // Quick seed helper for testing the Member Dashboard
  const handleSeedApprovedMember = async (category: 'SÓCIO' | 'MEMBRO DA DIRETORIA' = 'SÓCIO') => {
    if (!currentUser) return;
    setSeedingDemo(true);
    try {
      const memberId = `mem_${currentUser.uid}`;
      const { token, generatedAt } = generateViewToken(memberId);
      await setDoc(doc(db, 'members', memberId), {
        id: memberId,
        userId: currentUser.uid,
        fullName: currentMember?.fullName || (currentUser.email ? currentUser.email.split('@')[0].replace('.', ' ') : 'Associado Homologado'),
        cpf: '123.456.789-00',
        birthDate: '1987-08-25',
        email: currentUser.email || 'socio@associacao.org.br',
        phone: '(11) 98765-4321',
        photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
        category,
        status: 'aprovado',
        lgpdConsent: true,
        lgpdConsentDate: new Date().toISOString(),
        validUntil: DEFAULT_OFFICIAL_EXPIRY,
        renewalCount: 0,
        lastGeneratedAt: generatedAt,
        lastViewToken: token,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao gerar sócio de teste:', err);
    } finally {
      setSeedingDemo(false);
    }
  };

  // Switch category between SÓCIO and MEMBRO DA DIRETORIA directly in member view
  const handleToggleMyCategory = async () => {
    if (!currentMember) return;
    const isDiretoria = currentMember.category?.trim().toUpperCase() === 'MEMBRO DA DIRETORIA';
    const newCat = isDiretoria ? 'SÓCIO' : 'MEMBRO DA DIRETORIA';
    try {
      await updateDoc(doc(db, 'members', currentMember.id), {
        category: newCat,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Erro ao alternar categoria:', err);
    }
  };

  // Top tab bar switcher between "Minha Carteirinha", "Calendário de Eventos", "Espaço Cultural" and "Redes Sociais"
  const renderTopNavTabs = () => (
    <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl w-full sm:w-fit overflow-x-auto shadow-md">
      <button
        onClick={() => setActivePortalTab('card')}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
          activePortalTab === 'card'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Minha Carteirinha</span>
      </button>

      <button
        onClick={() => setActivePortalTab('events')}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
          activePortalTab === 'events'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      >
        <Calendar className="w-4 h-4 text-emerald-400" />
        <span>Calendário de Eventos</span>
      </button>

      <button
        onClick={() => setActivePortalTab('culture')}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
          activePortalTab === 'culture'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      >
        <BookOpen className="w-4 h-4 text-amber-400" />
        <span>Espaço Cultural</span>
      </button>

      <button
        onClick={() => setActivePortalTab('socials')}
        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
          activePortalTab === 'socials'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      >
        <Share2 className="w-4 h-4 text-pink-400" />
        <span>Redes Sociais</span>
      </button>
    </div>
  );

  // If user selected Events tab, show the Events Calendar directly
  if (activePortalTab === 'events') {
    return (
      <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
        {renderTopNavTabs()}
        <EventsCalendarView />
      </div>
    );
  }

  // If user selected Culture tab, show Culture Articles directly
  if (activePortalTab === 'culture') {
    return (
      <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
        {renderTopNavTabs()}
        <CultureArticlesView />
      </div>
    );
  }

  // If user selected Socials tab, show Social Links directly
  if (activePortalTab === 'socials') {
    return (
      <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-6">
        {renderTopNavTabs()}
        <SocialLinksView />
      </div>
    );
  }

  // Graceful loading state to prevent flickering empty/example forms on reload
  if (memberLoading && !currentMember) {
    return (
      <div className="py-24 text-center text-zinc-400 space-y-3 max-w-md mx-auto">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono tracking-wider">Conectando aos dados do associado...</p>
      </div>
    );
  }

  // If no member record exists yet, render registration form with quick-test option
  if (!currentMember) {
    return (
      <div className="py-6 px-4 max-w-4xl mx-auto space-y-6">
        {renderTopNavTabs()}

        {/* Helper Banner for Testers and New Visitors */}
        <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-500/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                Modo de Visualização do Sócio
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/40">
                  {currentUser?.email}
                </span>
              </h4>
              <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                Você ainda não possui um cadastro submetido nesta conta. Você pode preencher os dados abaixo para aprovação do administrador ou carregar uma carteirinha homologada instantânea para testar!
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => handleSeedApprovedMember('SÓCIO')}
              disabled={seedingDemo}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <User className="w-3.5 h-3.5" />
              <span>{seedingDemo ? 'Carregando...' : 'Testar Carteirinha (SÓCIO)'}</span>
            </button>

            <button
              onClick={() => handleSeedApprovedMember('MEMBRO DA DIRETORIA')}
              disabled={seedingDemo}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Testar como DIRETORIA</span>
            </button>
          </div>
        </div>

        <MemberRegistrationForm />
      </div>
    );
  }

  // If editing form is opened
  if (editing) {
    return (
      <div className="py-6 px-4">
        <div className="max-w-2xl mx-auto mb-4">
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
          >
            ← Voltar ao painel
          </button>
        </div>
        <MemberRegistrationForm
          isEditing={true}
          initialData={currentMember}
          onSuccess={() => setEditing(false)}
        />
      </div>
    );
  }

  // Ensure fresh 24h view token is generated if member is approved (never crash unhandled)
  const ensureFreshToken = async () => {
    if (!currentMember || !currentMember.id || currentMember.status !== 'aprovado') return;
    const tokenStatus = checkViewTokenStatus(currentMember.lastGeneratedAt);

    if (tokenStatus.isExpired || !currentMember.lastViewToken) {
      setRefreshingToken(true);
      try {
        const { token, generatedAt } = generateViewToken(currentMember.id);
        const path = 'members';
        await updateDoc(doc(db, path, currentMember.id), {
          lastGeneratedAt: generatedAt,
          lastViewToken: token,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Atualização de token de visualização 24h:', err);
      } finally {
        setRefreshingToken(false);
      }
    }
  };

  useEffect(() => {
    ensureFreshToken();
  }, [currentMember?.status]);

  const handleRequestPush = async () => {
    const res = await requestPushPermission();
    setPushStatus(res);
  };

  const handleRequestRenewal = async () => {
    if (!currentMember) return;
    try {
      const path = 'members';
      await updateDoc(doc(db, path, currentMember.id), {
        status: 'pendente',
        updatedAt: new Date().toISOString(),
      });
      alert('Solicitação de renovação enviada para aprovação da administração!');
    } catch (err: any) {
      console.warn('Erro ao solicitar renovação:', err);
      alert('Erro ao enviar solicitação: ' + (err.message || 'Erro temporário de conexão.'));
    }
  };

  const officialStatus = checkOfficialCardStatus(currentMember?.validUntil);
  const tokenStatus = checkViewTokenStatus(currentMember?.lastGeneratedAt);

  const isDiretoria = String(currentMember?.category || '').trim().toUpperCase() === 'MEMBRO DA DIRETORIA';

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Top Nav Switcher */}
      {renderTopNavTabs()}

      {/* Push Notification Opt-in Prompt */}
      {pushStatus !== 'granted' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-200 shadow-md">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Ativar Notificações Push no Aparelho</h4>
              <p className="text-xs text-zinc-400">
                Receba avisos instantâneos com som na tela quando seu cadastro for aprovado ou o status for atualizado.
              </p>
            </div>
          </div>
          <button
            onClick={handleRequestPush}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0 shadow-sm cursor-pointer"
          >
            Permitir Notificações
          </button>
        </div>
      )}

      {/* STATUS: PENDENTE */}
      {currentMember.status === 'pendente' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl text-center max-w-xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Clock className="w-8 h-8 animate-spin" style={{ animationDuration: '6s' }} />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Cadastro em Análise
            </span>
            <h2 className="text-2xl font-bold text-white mt-3">Aguardando Homologação da Diretoria</h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
              Seus dados foram enviados com sucesso e estão na fila de conferência pelo administrador da associação.
              Você receberá uma notificação assim que sua carteirinha for liberada!
            </p>
          </div>

          {/* Workflow Steps Tracker */}
          <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 text-left space-y-3">
            <div className="flex items-center gap-3 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>1. Cadastro preenchido e termo LGPD aceito</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-amber-300 font-medium">
              <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
              <span>2. Análise documental da administração (em andamento)</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />
              <span>3. Emissão da Carteirinha Digital com Selo 24h</span>
            </div>
          </div>

          {/* Member Summary */}
          <div className="text-left text-xs bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80 space-y-1.5 text-zinc-300">
            <div><strong>Nome:</strong> {currentMember.fullName || 'Não informado'}</div>
            <div><strong>CPF:</strong> {maskCPF(currentMember.cpf)}</div>
            <div><strong>Data de Nascimento:</strong> {currentMember.birthDate || 'Não informado'}</div>
            <div><strong>Classificação:</strong> {currentMember.category || 'SÓCIO'}</div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setShowEditProfileModal(true)}
              className="text-xs text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-zinc-800/80 hover:bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700"
            >
              <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Editar Nome, Ano e Foto</span>
            </button>

            <span className="text-zinc-600 hidden sm:inline">•</span>

            <button
              onClick={() => handleSeedApprovedMember('SÓCIO')}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
            >
              Aprovar este cadastro imediatamente (Modo Demonstração)
            </button>
          </div>
        </div>
      )}

      {/* STATUS: REJEITADO */}
      {currentMember.status === 'rejeitado' && (() => {
        const assocName = activeTemplate?.associationName || 'Associação Oficial';
        const fallbackSubject = replaceTemplateVariables(DEFAULT_REJECTION_SUBJECT, {
          nomeAssociacao: assocName,
        });
        const fallbackBody = replaceTemplateVariables(DEFAULT_REJECTION_BODY, {
          nomeAssociado: currentMember.fullName || 'Associado(a)',
          motivoRejeicao: currentMember.rejectionReason || 'Dados divergentes ou pendência de comprovação documental.',
          nomeAssociacao: assocName,
          dataSolicitacao: formatDateSafe(currentMember.createdAt),
          cpfAssociado: maskCPF(currentMember.cpf),
          emailAssociado: currentMember.email || '',
        });

        const displaySubject = receivedEmail?.subject || fallbackSubject;
        const displayBody = receivedEmail?.body || fallbackBody;

        return (
          <div className="bg-zinc-900 border border-red-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-2xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div className="flex-1">
                <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                  Necessita Ajuste Cadastral
                </span>
                <h2 className="text-2xl font-bold text-white mt-2">Cadastro Não Aprovado</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  A diretoria analisou sua solicitação e enviou um comunicado oficial para seu e-mail cadastrado (<strong>{currentMember.email}</strong>).
                </p>
              </div>
            </div>

            {/* Direct motive highlight */}
            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 text-left space-y-1">
              <span className="font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                <ShieldAlert className="w-4 h-4" />
                Motivo Apontado pelo Administrador:
              </span>
              <p className="text-sm font-medium text-white pl-5 leading-relaxed">
                "{currentMember.rejectionReason || 'Ajuste documental solicitado pela administração.'}"
              </p>
            </div>

            {/* Official Dispatched Email Card */}
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 overflow-hidden shadow-xl text-left">
              <div className="bg-zinc-900/90 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    Comunicação Oficial Enviada por E-mail
                  </span>
                </div>
                <button
                  onClick={() => setShowFullEmail(!showFullEmail)}
                  className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{showFullEmail ? 'Ocultar E-mail' : 'Exibir E-mail'}</span>
                  {showFullEmail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {showFullEmail && (
                <div className="p-4 space-y-3">
                  <div className="text-[11px] text-zinc-400 border-b border-zinc-800/80 pb-2 space-y-1 font-mono">
                    <div>
                      <span className="text-zinc-500">De: </span>
                      <span className="text-zinc-300 font-sans">
                        Diretoria da {assocName} &lt;diretoria@associacao.org.br&gt;
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Para: </span>
                      <span className="text-zinc-300 font-sans">
                        {currentMember.fullName || 'Associado(a)'} &lt;{currentMember.email}&gt;
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Assunto: </span>
                      <span className="text-amber-400 font-sans font-bold">{displaySubject}</span>
                    </div>
                    {receivedEmail?.sentAt && (
                      <div className="text-[10px] text-zinc-500 font-sans">
                        Enviado em {formatDateTimeSafe(receivedEmail.sentAt)}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-white text-zinc-900 rounded-xl max-h-64 overflow-y-auto font-sans text-xs leading-relaxed whitespace-pre-line shadow-inner">
                    {displayBody}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setEditing(true)}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
            >
              <Edit3 className="w-4 h-4" />
              <span>Corrigir e Reenviar Cadastro Agora</span>
            </button>
          </div>
        );
      })()}

      {/* STATUS: EXPIRADO (After October 2027) */}
      {currentMember.status === 'expirado' && (
        <div className="bg-zinc-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-xl text-center max-w-xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <Calendar className="w-8 h-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Vigência Expirada
            </span>
            <h2 className="text-2xl font-bold text-white mt-3">Validade da Carteirinha Expirada</h2>
            <p className="text-sm text-zinc-400 mt-2">
              A vigência oficial da sua credencial social atingiu o limite estatutário de <strong>Outubro de 2027</strong>.
              Para reativar a carteirinha por mais 1 (um) ano, solicite uma nova aprovação da administração.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-300 text-left space-y-1">
            <div><strong>Validade anterior:</strong> {officialStatus.formattedDate}</div>
            <div><strong>Renovações realizadas:</strong> {currentMember.renewalCount || 0}</div>
            <div><strong>Status atual:</strong> Aguardando solicitação de prorrogação anual</div>
          </div>

          <button
            onClick={handleRequestRenewal}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Solicitar Renovação da Carteirinha (+1 Ano)</span>
          </button>
        </div>
      )}

      {/* STATUS: APROVADO -> DIGITAL MEMBERSHIP CARD */}
      {currentMember.status === 'aprovado' && (
        <div className="space-y-6">
          {/* Header Title & Status */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Associado Homologado
                </span>

                {isDiretoria ? (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 border border-amber-300 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> MEMBRO DA DIRETORIA
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-zinc-800 text-emerald-300 border border-zinc-700 flex items-center gap-1">
                    <User className="w-3 h-3" /> SÓCIO
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Carteirinha Digital do Associado
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* NOVO: Botão para Visualizar a Carteira no Tamanho Total da Tela do Celular */}
              <button
                onClick={() => setShowFullScreenModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/60 cursor-pointer hover:scale-102"
                title="Visualizar a carteira no tamanho total da tela do celular"
              >
                <Maximize2 className="w-3.5 h-3.5 text-zinc-950" />
                <span>📱 Tela Cheia no Celular</span>
              </button>

              <button
                onClick={() => {
                  if (currentMember) {
                    saveOfflineCard(currentMember, activeTemplate);
                  }
                  setShowOfflineModal(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Salvar carteirinha no aparelho para uso offline sem internet por 24h"
              >
                <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" />
                <span>Salvar Offline (24h)</span>
              </button>

              {/* Quick toggle category for testing */}
              <button
                onClick={handleToggleMyCategory}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700 shadow-xs cursor-pointer"
                title="Alternar entre Sócio e Membro da Diretoria"
              >
                {isDiretoria ? <User className="w-3.5 h-3.5 text-emerald-400" /> : <Crown className="w-3.5 h-3.5 text-amber-400" />}
                <span>Alternar para {isDiretoria ? 'Sócio' : 'Diretoria'}</span>
              </button>

              <button
                onClick={ensureFreshToken}
                disabled={refreshingToken}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700 shadow-xs cursor-pointer"
                title="Gera novo carimbo de segurança 24h"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingToken ? 'animate-spin' : ''}`} />
                <span>Atualizar Carimbo 24h</span>
              </button>

              <button
                onClick={() => setShowEditProfileModal(true)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-zinc-700 shadow-xs cursor-pointer"
                title="Editar Nome, Ano/Data de Nascimento ou Trocar Foto"
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Editar Nome, Ano e Foto</span>
              </button>
            </div>
          </div>

          {/* Card Presentation Stage */}
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
            {/* Background ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

            <DigitalCard
              member={currentMember}
              template={activeTemplate}
              onVerify={() => setShowVerifyModal(true)}
              onOpenFullscreen={() => setShowFullScreenModal(true)}
            />
          </div>

          {/* Security & Expiration Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 24h Verification Token Details */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ShieldCheck className="w-4 h-4" />
                <span>Segurança Dinâmica de Visualização (24h)</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Cada visualização online valida a credencial em tempo real e atualiza o carimbo de 24 horas para uso off-line autônomo,
                evitando fraudes e capturas de tela antigas.
              </p>
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">Última validação online:</span>
                <span className="text-white font-semibold">{tokenStatus.generatedDateStr}</span>
              </div>
            </div>

            {/* Official Expiration (Outubro de 2027) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Calendar className="w-4 h-4" />
                <span>Validade Estatutária Oficial da Associação</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A sua filiação possui vigência oficial garantida até <strong>Outubro de 2027</strong> ({officialStatus.formattedDate}).
                Após essa data, o estatuto exige reavaliação anual pela administração.
              </p>
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500">Dias de vigência restante:</span>
                <span className="text-emerald-400 font-semibold">{officialStatus.daysRemaining} dias</span>
              </div>
            </div>
          </div>

          {/* LGPD Compliance & Privacy Rights Panel */}
          <div className="bg-zinc-900/60 border border-zinc-800/90 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Privacidade & Conformidade LGPD (Lei nº 13.709/2018)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Consentimento Registrado
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Seus dados pessoais (Nome, CPF, Data de Nascimento e Foto) são coletados com base legal de execução de contrato social e finalidade estatutária da associação.
              Você tem direito de consultar, retificar ou solicitar a eliminação dos seus dados nos termos da LGPD.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
              <div><strong>Termo Aceito:</strong> {new Date(currentMember.lgpdConsentDate || currentMember.createdAt).toLocaleDateString('pt-BR')}</div>
              <div><strong>Finalidade:</strong> Emissão de Credencial Social</div>
              <div><strong>Armazenamento:</strong> Firebase Seguro / Criptografado</div>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal for QR / live preview inspection */}
      {showVerifyModal && currentMember && (
        <VerificationModal
          member={currentMember}
          template={activeTemplate}
          onClose={() => setShowVerifyModal(false)}
        />
      )}

      {/* Offline Card Modal (24h Autonomous Card) */}
      {showOfflineModal && currentMember && (
        <OfflineCardModal
          member={currentMember}
          template={activeTemplate}
          onClose={() => setShowOfflineModal(false)}
          onRefreshOnline={ensureFreshToken}
        />
      )}

      {/* Fullscreen Mobile View Modal */}
      {showFullScreenModal && currentMember && (
        <FullScreenCardModal
          isOpen={showFullScreenModal}
          member={currentMember}
          template={activeTemplate}
          onClose={() => setShowFullScreenModal(false)}
          onVerify={() => setShowVerifyModal(true)}
        />
      )}

      {/* Quick Edit Profile Modal (Name, Year/BirthDate, Photo) */}
      {showEditProfileModal && currentMember && (
        <EditMemberProfileModal
          isOpen={showEditProfileModal}
          member={currentMember}
          onClose={() => setShowEditProfileModal(false)}
        />
      )}
    </div>
  );
};
