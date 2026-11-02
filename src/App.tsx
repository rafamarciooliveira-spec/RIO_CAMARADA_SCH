/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { DialogProvider, useAppDialog } from './context/DialogContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Navbar } from './components/Navbar.tsx';
import { MemberDashboard } from './components/MemberDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal.tsx';
import { NotificationToastContainer } from './components/NotificationToast.tsx';
import { VerificationModal } from './components/VerificationModal.tsx';
import { AssociationLogo } from './components/AssociationLogos.tsx';
import { EventsCalendarView } from './components/EventsCalendarView.tsx';
import { CultureArticlesView } from './components/CultureArticlesView.tsx';
import { SocialLinksView } from './components/SocialLinksView.tsx';
import { Member } from './types/index.ts';
import { db } from './firebase/config.ts';
import { doc, getDoc } from 'firebase/firestore';
import {
  ShieldCheck,
  UserCheck,
  Clock,
  Sparkles,
  Award,
  Layers,
  Calendar,
  Lock,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  Share2,
  Home,
  AlertCircle,
} from 'lucide-react';

function MainContent() {
  const {
    currentUser,
    activeRole,
    isBoardMember,
    mustChangePassword,
    loading,
    activeTemplate,
    sendVerificationEmail,
    reloadUser,
  } = useAuth();
  const dialog = useAppDialog();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [publicVerifyMember, setPublicVerifyMember] = useState<Member | null>(null);
  const [publicTab, setPublicTab] = useState<'home' | 'events' | 'culture' | 'socials'>('home');

  // Check URL query parameters for public QR code scan (/validar?id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const memberId = params.get('id');

    if (action === 'validar' && memberId) {
      // Prioritize publicCards collection (strictly sanitized, 0 PII)
      getDoc(doc(db, 'publicCards', memberId)).then(docSnap => {
        if (docSnap.exists()) {
          setPublicVerifyMember({ ...docSnap.data(), id: docSnap.id } as Member);
        } else {
          // Fallback to members if accessible by current session
          getDoc(doc(db, 'members', memberId)).then(memSnap => {
            if (memSnap.exists()) {
              setPublicVerifyMember({ ...memSnap.data(), id: memSnap.id } as Member);
            }
          }).catch(() => {});
        }
      }).catch(() => {
        // Fallback to members if accessible
        getDoc(doc(db, 'members', memberId)).then(memSnap => {
          if (memSnap.exists()) {
            setPublicVerifyMember({ ...memSnap.data(), id: memSnap.id } as Member);
          }
        }).catch(err => {
          console.warn('Erro ao verificar carteirinha:', err);
        });
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono tracking-wider">Iniciando Portal do Associado...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      <Navbar onOpenAuthModal={() => setShowAuthModal(true)} />
      <NotificationToastContainer />

      {/* Email Verification Banner */}
      {currentUser && !currentUser.emailVerified && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-md z-30">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Confirmação de E-mail Pendente:</strong> Um link de ativação foi enviado para <strong>{currentUser.email}</strong>. Administradores precisam de e-mail verificado para ter permissão no banco de dados.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await sendVerificationEmail();
                  await dialog.alert({
                    title: 'Confirmação Reenviada',
                    message: 'E-mail de confirmação reenviado com sucesso! Verifique sua caixa de entrada e spam.',
                    variant: 'success',
                  });
                } catch (e: any) {
                  await dialog.alert({
                    title: 'Erro ao Reenviar',
                    message: 'Erro ao reenviar: ' + (e.message || 'Tente novamente em instantes.'),
                    variant: 'danger',
                  });
                }
              }}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
            >
              Reenviar Confirmação
            </button>
            <button
              onClick={async () => {
                await reloadUser();
              }}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg text-[11px] transition-colors cursor-pointer border border-zinc-700"
              title="Atualizar status após clicar no link do e-mail"
            >
              Já confirmei
            </button>
          </div>
        </div>
      )}

      {/* Main View Router */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {currentUser ? (
          (activeRole === 'admin' && isBoardMember) ? (
            <ErrorBoundary resetKey="admin" fallbackTitle="Painel de Administração">
              <AdminDashboard />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary resetKey="member" fallbackTitle="Painel do Associado">
              <MemberDashboard />
            </ErrorBoundary>
          )
        ) : (
          /* Landing Hero / Public Presentation with Tabs */
          <div className="py-8 px-4 sm:px-6 max-w-6xl mx-auto space-y-8 sm:space-y-12">
            {/* Public Tab Navigation */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl overflow-x-auto shadow-md">
                <button
                  onClick={() => setPublicTab('home')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    publicTab === 'home'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Home className="w-4 h-4 text-emerald-400" />
                  <span>Início</span>
                </button>

                <button
                  onClick={() => setPublicTab('events')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    publicTab === 'events'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>Eventos da Sociedade</span>
                </button>

                <button
                  onClick={() => setPublicTab('culture')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    publicTab === 'culture'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span>Espaço Cultural</span>
                </button>

                <button
                  onClick={() => setPublicTab('socials')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    publicTab === 'socials'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Share2 className="w-4 h-4 text-pink-400" />
                  <span>Redes Sociais</span>
                </button>
              </div>
            </div>

            {publicTab === 'events' && <EventsCalendarView />}
            {publicTab === 'culture' && <CultureArticlesView />}
            {publicTab === 'socials' && <SocialLinksView />}

            {publicTab === 'home' && (
              <div className="space-y-12 sm:space-y-16">
                {/* Hero Top */}
                <div className="text-center max-w-3xl mx-auto space-y-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Gestão Completa de Associação Sem Fins Lucrativos</span>
                  </div>

                  <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
                    Portal do Associado & <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300">
                      Carteirinha Digital Inteligente
                    </span>
                  </h1>

                  <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                    Plataforma oficial com conformidade total à <strong>LGPD</strong>, emissão e validação da carteirinha digital do associado,
                    selo de visualização seguro de 24 horas e validade oficial até <strong>Outubro de 2027</strong>.
                  </p>

                  {/* Action Buttons: Unified Sócio Entry */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-102"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Acessar Portal do Sócio / Cadastrar</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick Shortcut Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setPublicTab('events')}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ver Calendário de Eventos</span>
                    </button>

                    <button
                      onClick={() => setPublicTab('culture')}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>História & Tradições de Schroeder</span>
                    </button>

                    <button
                      onClick={() => setPublicTab('socials')}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5 text-pink-400" />
                      <span>Redes Sociais Oficiais</span>
                    </button>
                  </div>
                </div>

            {/* Secure Portal Access Banner (Card is only displayed after login) */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl max-w-3xl mx-auto text-center space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div className="space-y-2 max-w-xl mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Identificação Digital Segura & Exclusiva
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  A carteirinha digital da associação é pessoal, intransferível e protegida nos termos da LGPD.
                  Para visualizar seu documento oficial com foto, selo dinâmico de 24 horas e QR Code de autenticidade, acesse sua conta.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-7 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-950/60 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>Fazer Login para Ver Carteirinha</span>
                </button>
              </div>

              <div className="pt-4 border-t border-zinc-800/80 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Ambiente Protegido por Criptografia
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Selo Dinâmico de 24 Horas
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Conformidade LGPD
                </span>
              </div>
            </div>

            {/* Features Pillar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-white text-base">Comprovante de 24h & Antifraude</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Cada abertura da carteirinha gera um carimbo e token criptográfico com validade de 24 horas,
                  assegurando que o associado está em dia com a entidade.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-white text-base">Validade Outubro/2027 + Renovação</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Validade oficial até 31 de Outubro de 2027. Após esta data, o sistema exige uma nova solicitação e
                  aprovação do gestor para prorrogação por mais 1 ano.
                </p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-white text-base">Formatador de Carteirinhas & Templates</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  O administrador conta com total personalização: troca de cores, logotipo, orientação vertical ou
                  horizontal, campos personalizados e biblioteca de modelos salvos.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
  </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AssociationLogo logoKeyOrUrl={activeTemplate?.logoUrl} className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400">{activeTemplate?.associationName || 'Portal do Associado'}</span>
          </div>
          <div>
            Em estrita conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Force Password Change on First Login Modal */}
      <ForcePasswordChangeModal isOpen={mustChangePassword} />

      {/* Public QR Scanner Modal */}
      {publicVerifyMember && (
        <VerificationModal
          member={publicVerifyMember}
          template={activeTemplate}
          onClose={() => setPublicVerifyMember(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <DialogProvider>
        <AuthProvider>
          <MainContent />
        </AuthProvider>
      </DialogProvider>
    </ErrorBoundary>
  );
}
