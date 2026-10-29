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
import { DigitalCard } from './components/DigitalCard.tsx';
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

// Hero sample card preview
const HERO_SAMPLE: Member = {
  id: 'preview_hero',
  userId: 'usr_hero',
  fullName: 'Dr. Roberto Mendes de Oliveira',
  cpf: '123.456.789-00',
  birthDate: '1985-04-12',
  email: 'roberto.mendes@associacao.org.br',
  phone: '(11) 99876-5432',
  photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  category: 'MEMBRO DA DIRETORIA',
  status: 'aprovado',
  lgpdConsent: true,
  lgpdConsentDate: new Date().toISOString(),
  validUntil: '2027-10-31',
  renewalCount: 0,
  lastGeneratedAt: new Date().toISOString(),
  lastViewToken: 'AUTH-SAMPLE-24H',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

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
      <main className="flex-1">
        {currentUser ? (
          activeRole === 'admin' ? (
            <AdminDashboard />
          ) : (
            <MemberDashboard />
          )
        ) : (
          /* Landing Hero / Public Presentation */
          <div className="py-12 px-4 sm:px-6 max-w-6xl mx-auto space-y-16">
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

            {/* Interactive Card Stage Preview */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-12 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
              <div className="w-full max-w-md mb-4 flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <Sparkles className="w-4 h-4" /> Modelo de Carteirinha da Associação
                </span>
                <span className="font-mono text-[11px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-300">
                  {activeTemplate.name}
                </span>
              </div>

              <DigitalCard member={HERO_SAMPLE} template={activeTemplate} />

              <div className="mt-6 text-center text-xs text-zinc-400 max-w-md">
                👆 Esta credencial digital possui selo dinâmico de <strong>24 horas</strong> para impedir falsificações
                por captura de tela e validade estatutária oficial até <strong>31 de Outubro de 2027</strong>.
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
            <AssociationLogo logoKeyOrUrl={activeTemplate.logoUrl} className="w-4 h-4 text-emerald-400" />
            <span className="text-zinc-400">{activeTemplate.associationName}</span>
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
