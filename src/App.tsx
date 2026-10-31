/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Navbar } from './components/Navbar.tsx';
import { MemberDashboard } from './components/MemberDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { NotificationToastContainer } from './components/NotificationToast.tsx';
import { VerificationModal } from './components/VerificationModal.tsx';
import { AssociationLogo } from './components/AssociationLogos.tsx';
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
} from 'lucide-react';

function MainContent() {
  const { currentUser, activeRole, loading, activeTemplate } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [publicVerifyMember, setPublicVerifyMember] = useState<Member | null>(null);

  // Check URL query parameters for public QR code scan (/validar?id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const memberId = params.get('id');

    if (action === 'validar' && memberId) {
      getDoc(doc(db, 'members', memberId)).then(docSnap => {
        if (docSnap.exists()) {
          setPublicVerifyMember({ ...docSnap.data(), id: docSnap.id } as Member);
        }
      }).catch(err => {
        console.warn('Erro ao verificar documento público:', err);
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

      {/* Main View Router */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {currentUser ? (
          activeRole === 'admin' ? (
            <ErrorBoundary resetKey="admin" fallbackTitle="Painel de Administração">
              <AdminDashboard />
            </ErrorBoundary>
          ) : (
            <ErrorBoundary resetKey="member" fallbackTitle="Painel do Associado">
              <MemberDashboard />
            </ErrorBoundary>
          )
        ) : (
          /* Landing Hero / Public Presentation */
          <div className="py-12 px-4 sm:px-6 max-w-6xl mx-auto space-y-12 sm:space-y-16">
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
                Plataforma com conformidade total à <strong>LGPD</strong>, dupla visualização para
                <strong> Administrador</strong> e <strong>Sócio</strong>, aprovação cadastral em tempo real,
                selo de visualização seguro de 24 horas e validade oficial até <strong>Outubro de 2027</strong>.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-wide shadow-xl shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-102"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Cadastrar-se como Sócio</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-sm transition-all border border-zinc-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Acesso de Administrador</span>
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
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
