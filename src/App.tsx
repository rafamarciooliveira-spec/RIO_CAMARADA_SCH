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
import { useHomepageSettings, EditBlockModal } from './components/EditableHomepageBlock.tsx';
import { Member, HomepageSettings } from './types/index.ts';
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
  Edit3,
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
  const isAdmin = activeRole === 'admin' || isBoardMember;
  const { settings: homepageSettings, updateSetting: updateHomepageSetting } = useHomepageSettings();
  const [editingBlock, setEditingBlock] = useState<{
    field: keyof HomepageSettings;
    title: string;
    label: string;
    initial: string;
    multiline?: boolean;
  } | null>(null);

  const getDisplaySubtitle = () => {
    if (homepageSettings.associationSubtitle && homepageSettings.associationSubtitle.trim()) {
      return homepageSettings.associationSubtitle;
    }
    const templateSubtitle = activeTemplate?.associationSubtitle;
    if (templateSubtitle && !templateSubtitle.includes('Associação Esportiva e Cultural Rio Camarada')) {
      return templateSubtitle;
    }
    return 'Schroeder SC, fundado em 21 de Julho de 1955';
  };

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
          <div className="py-8 px-4 sm:px-6 max-w-5xl mx-auto space-y-8 sm:space-y-10">
            {/* Public Tab Navigation */}
            <div className="flex items-center justify-center">
              <div className="flex flex-wrap items-center justify-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl shadow-md max-w-full">
                <button
                  onClick={() => setPublicTab('home')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
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
              <div className="space-y-10 sm:space-y-12">
                {/* Header: Prominent Logo, Society Name & Portal Title */}
                <div className="text-center max-w-2xl mx-auto space-y-4">
                  {/* Society Logo - Large & Highly Visible */}
                  <div className="relative inline-block mx-auto">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-emerald-500/20 via-zinc-900 to-zinc-950 border-2 border-emerald-500/40 p-3.5 shadow-2xl shadow-emerald-950/60 flex items-center justify-center">
                      <AssociationLogo
                        logoKeyOrUrl={activeTemplate?.logoUrl}
                        className="w-full h-full object-contain filter drop-shadow-md"
                      />
                    </div>
                  </div>

                  {/* Society Name */}
                  <div className="space-y-1">
                    <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight uppercase">
                      {activeTemplate?.associationName || 'Associação Rio Camarada'}
                    </h1>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-xs sm:text-sm text-zinc-400 font-medium">
                        {getDisplaySubtitle()}
                      </p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingBlock({
                              field: 'associationSubtitle',
                              title: 'Editar Subtítulo da Sociedade',
                              label: 'Texto exibido abaixo do nome da sociedade',
                              initial: getDisplaySubtitle(),
                              multiline: false,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-emerald-400 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md px-1.5 py-0.5 transition-colors cursor-pointer"
                          title="Customizar subtítulo da sociedade"
                        >
                          <Edit3 className="w-3 h-3 text-emerald-400" />
                          <span>Editar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Portal Badge */}
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Portal do Associado</span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
                    Bem-vindo ao espaço digital oficial da nossa Sociedade. Acesse sua conta abaixo para interagir com a comunidade, acompanhar novidades e serviços.
                  </p>
                </div>

                {/* Local para Fazer Login (Dedicated Login Card) */}
                <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md mx-auto space-y-5">
                  <div className="text-center space-y-1 border-b border-zinc-800 pb-4">
                    <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      Acesso ao Portal
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Entre com sua Conta Google ou com seu e-mail e senha
                    </p>
                  </div>

                  {/* Google Login Button */}
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Entrar com a Conta Google</span>
                  </button>

                  <div className="relative flex items-center justify-center py-1">
                    <div className="border-t border-zinc-800 w-full" />
                    <span className="bg-zinc-900 px-3 text-[11px] text-zinc-500 font-semibold uppercase tracking-wider shrink-0">
                      ou com e-mail e senha
                    </span>
                  </div>

                  {/* Email & Password Login Button */}
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm tracking-wide transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Entrar com E-mail e Senha</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Register and Forgot Password Links */}
                  <div className="pt-2 text-center space-y-2 text-xs">
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer block mx-auto"
                    >
                      Esqueceu sua senha? <span className="underline font-semibold">Recuperar acesso</span>
                    </button>
                    <div className="text-zinc-500 text-[11px] pt-1 border-t border-zinc-800/80">
                      Ainda não é associado?{' '}
                      <button
                        onClick={() => setShowAuthModal(true)}
                        className="text-emerald-400 hover:underline font-bold cursor-pointer"
                      >
                        Solicitar filiação à sociedade
                      </button>
                    </div>
                  </div>
                </div>

                {/* Society Highlights (Pillars without mentioning card/validity) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
                  <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-2xl space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Tradição & Tiro Esportivo</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Preservação da cultura germânica, práticas de tiro ao alvo de precisão e estande oficial em Schroeder/SC.
                    </p>
                  </div>

                  <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-2xl space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Eventos & Convivência</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Festas de Rei e Rainha, torneios esportivos, encontros festivos e integração das famílias da comunidade.
                    </p>
                  </div>

                  <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-2xl space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-white text-sm">Privacidade & Transparência</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Ambiente seguro com conformidade à LGPD. Seus dados cadastrais protegidos pela infraestrutura Google Cloud.
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
          <div className="flex items-center gap-2.5">
            <AssociationLogo logoKeyOrUrl={activeTemplate?.logoUrl} className="w-5 h-5 text-emerald-400" />
            <span className="text-zinc-300 font-bold">
              {activeTemplate?.associationName || 'Associação Rio Camarada'}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400 font-medium">Portal do Associado</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>
              {homepageSettings.footerNotice ||
                'Em estrita conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018). Dados protegidos em trânsito e em repouso pela infraestrutura do Google Cloud.'}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() =>
                  setEditingBlock({
                    field: 'footerNotice',
                    title: 'Editar Texto do Rodapé',
                    label: 'Texto de rodapé e nota de conformidade',
                    initial:
                      homepageSettings.footerNotice ||
                      'Em estrita conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018). Dados protegidos em trânsito e em repouso pela infraestrutura do Google Cloud.',
                    multiline: false,
                  })
                }
                className="text-zinc-500 hover:text-emerald-400 p-0.5 transition-colors cursor-pointer"
                title="Editar rodapé"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
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

      {/* Edit Homepage Block Modal for Admins */}
      {editingBlock && (
        <EditBlockModal
          title={editingBlock.title}
          fieldLabel={editingBlock.label}
          initialValue={editingBlock.initial}
          multiline={editingBlock.multiline}
          isOpen={true}
          onClose={() => setEditingBlock(null)}
          onSave={async newVal => {
            await updateHomepageSetting(editingBlock.field, newVal, currentUser?.email || 'Administrador');
            await dialog.alert({
              title: 'Texto Atualizado',
              message: 'O texto foi salvo com sucesso e atualizado no Portal.',
              variant: 'success',
            });
          }}
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
