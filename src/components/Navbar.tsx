import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { AssociationLogo } from './AssociationLogos.tsx';
import { UserProfileModal } from './UserProfileModal.tsx';
import { requestPushPermission, getPushPermissionStatus } from '../utils/pushNotification.ts';
import {
  Shield,
  User,
  LogOut,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  X,
  Calendar,
  BookOpen,
  Share2,
  ShieldCheck,
  Sun,
  Moon,
  Newspaper,
  Gift,
  DollarSign,
  Key,
} from 'lucide-react';

interface NavbarProps {
  onOpenAuthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuthModal }) => {
  const {
    currentUser,
    currentMember,
    isAdmin,
    isBoardMember,
    boardRole,
    isSuperAdmin,
    isDiretoriaExecutiva,
    activeRole,
    setActiveRole,
    activePortalTab,
    setActivePortalTab,
    logout,
    notifications,
    markNotificationRead,
    activeTemplate,
    theme,
    toggleTheme,
  } = useAuth();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<NotificationPermission>(getPushPermissionStatus());

  useEffect(() => {
    setPushStatus(getPushPermissionStatus());
  }, []);

  // Close notifications popover on Escape key
  useEffect(() => {
    if (!showNotifMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNotifMenu]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleTogglePush = async () => {
    const res = await requestPushPermission();
    setPushStatus(res);
  };

  const userInitial = (
    currentMember?.fullName?.trim()?.charAt(0) ||
    currentUser?.displayName?.trim()?.charAt(0) ||
    currentUser?.email?.trim()?.charAt(0) ||
    'U'
  ).toUpperCase();

  const userDisplayName =
    currentMember?.fullName?.split(' ')[0] ||
    currentUser?.displayName?.split(' ')[0] ||
    currentUser?.email?.split('@')[0] ||
    'Associado';

  return (
    <>
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/90 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col gap-2">
          {/* 1ª LINHA EXCLUSIVA: LOGO E NOME INTEIRO DA SOCIEDADE */}
          <div className="flex items-center gap-3 w-full">
            <div
              className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/40 flex items-center justify-center shadow-md overflow-hidden p-1.5 shrink-0"
              style={{ color: activeTemplate?.accentColor || '#10b981' }}
            >
              <AssociationLogo logoKeyOrUrl={activeTemplate?.logoUrl} className="w-full h-full object-contain" />
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight leading-snug whitespace-normal break-words">
                {activeTemplate?.associationName || 'Associação Rio Camarada'}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs text-zinc-400">
                <span className="text-emerald-400 font-bold tracking-wide">
                  Portal do Associado
                </span>
                <span className="text-zinc-600 hidden sm:inline">•</span>
                <span className="text-zinc-400 text-[11px] sm:text-xs">
                  {activeTemplate?.associationSubtitle || 'Schroeder SC, fundado em 21 de Julho de 1955'}
                </span>
              </div>
            </div>
          </div>

          {/* 2ª LINHA RESPONSIVA COM FLEX-WRAP: TODOS OS BOTÕES E AÇÕES */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/70 w-full">
            {/* Esquerda: Navegação do Sócio ou Gestão */}
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {currentUser && activeRole === 'member' && (
                <nav className="flex flex-wrap items-center gap-1 bg-zinc-900/90 border border-zinc-800 p-1 rounded-xl">
                  <button
                    onClick={() => setActivePortalTab('card')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'card'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Carteirinha</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('events')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'events'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Agenda</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('news')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'news'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Newspaper className="w-3.5 h-3.5 text-blue-400" />
                    <span>Notícias</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('birthdays')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'birthdays'
                        ? 'bg-pink-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Gift className="w-3.5 h-3.5 text-pink-300" />
                    <span>Aniversários</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('financial')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'financial'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Contas</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('culture')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'culture'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cultura</span>
                  </button>

                  <button
                    onClick={() => setActivePortalTab('socials')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activePortalTab === 'socials'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Redes</span>
                  </button>
                </nav>
              )}

              {/* Seletor de Papéis (Diretoria / Sócio) se for membro da diretoria */}
              {currentUser && isBoardMember && (
                <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-xl shadow-inner">
                  <button
                    onClick={() => setActiveRole('admin')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activeRole === 'admin'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Acessar Painel da Diretoria e Administração"
                  >
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isSuperAdmin ? 'Admin Geral' : isDiretoriaExecutiva ? 'Diretoria Exec.' : 'Diretoria'}</span>
                  </button>

                  <button
                    onClick={() => setActiveRole('member')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      activeRole === 'member'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Visualizar como Sócio"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Sócio</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direita: Avisos, Tema, Botão com Inicial (Meus Dados e Senha) e Sair */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {currentUser ? (
                <>
                  {/* Central de Avisos */}
                  <div className="relative">
                    <button
                      onClick={() => setShowNotifMenu(!showNotifMenu)}
                      className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
                        showNotifMenu
                          ? 'bg-zinc-800 border-emerald-500/50 text-white'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                      title="Avisos e Notificações"
                      aria-label="Abrir central de avisos"
                    >
                      <Bell className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 text-zinc-950 text-[10px] font-black rounded-full flex items-center justify-center animate-bounce">
                          {unreadCount}
                        </span>
                      )}
                    </button>

                    {showNotifMenu && (
                      <div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity"
                        onClick={() => setShowNotifMenu(false)}
                        aria-label="Fechar avisos ao clicar fora"
                      />
                    )}

                    {showNotifMenu && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="fixed left-3 right-3 top-24 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 text-xs text-zinc-200 z-50 animate-scale-in"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="font-bold text-white text-sm truncate">Central de Avisos</span>
                            {unreadCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                {unreadCount} novo{unreadCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {pushStatus !== 'granted' && (
                              <button
                                onClick={handleTogglePush}
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
                              >
                                Ativar Push
                              </button>
                            )}
                            <button
                              onClick={() => setShowNotifMenu(false)}
                              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Fechar tela de avisos"
                              aria-label="Fechar avisos"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                          {notifications.length === 0 ? (
                            <p className="text-zinc-500 text-center py-5">Nenhum aviso ou notificação no momento.</p>
                          ) : (
                            notifications.map(n => {
                              let formattedTime = '';
                              try {
                                if (n.createdAt) {
                                  const d = new Date(n.createdAt);
                                  if (!isNaN(d.getTime())) {
                                    formattedTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                  }
                                }
                              } catch (e) {
                                formattedTime = '';
                              }

                              return (
                                <div
                                  key={n.id}
                                  onClick={() => !n.read && markNotificationRead(n.id)}
                                  className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                    n.read
                                      ? 'bg-zinc-950/40 border-zinc-800/80 text-zinc-400'
                                      : 'bg-emerald-950/30 border-emerald-500/40 text-zinc-100 shadow-xs'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <h5 className="font-bold text-xs text-white leading-tight">{n.title}</h5>
                                    {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1" />}
                                  </div>
                                  <p className="text-[11px] mt-1 opacity-90 leading-normal">{n.message}</p>
                                  {formattedTime && (
                                    <span className="text-[9px] text-zinc-500 mt-1 block font-mono">
                                      {formattedTime}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Alternador de Tema Claro/Escuro */}
                  <button
                    onClick={toggleTheme}
                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors border border-zinc-800 cursor-pointer"
                    title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                    aria-label="Alternar tema"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
                  </button>

                  {/* BOTÃO COM A INICIAL DO NOME: CLIQUE PARA ATUALIZAR DADOS E SENHA */}
                  <button
                    type="button"
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/40 hover:border-emerald-400 transition-all cursor-pointer shadow-xs group"
                    title="Clique para ver e atualizar seus dados pessoais e senha"
                    aria-label="Acessar meus dados e alterar senha"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-600 group-hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center shadow-xs overflow-hidden transition-transform group-hover:scale-105">
                      {currentMember?.photoUrl ? (
                        <img
                          src={currentMember.photoUrl}
                          alt="Foto"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{userInitial}</span>
                      )}
                    </div>
                    <div className="text-left hidden xs:block">
                      <span className="block text-xs font-bold text-white group-hover:text-emerald-300 leading-tight">
                        {userDisplayName}
                      </span>
                      <span className="block text-[10px] text-emerald-400 leading-none">
                        Meus Dados & Senha
                      </span>
                    </div>
                  </button>

                  {/* BOTÃO SAIR */}
                  <button
                    type="button"
                    onClick={logout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-white border border-red-500/30 transition-all cursor-pointer font-bold text-xs"
                    title="Sair do Portal"
                    aria-label="Sair da conta"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair</span>
                  </button>
                </>
              ) : (
                /* Visitante deslogado */
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={toggleTheme}
                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors border border-zinc-800 cursor-pointer"
                    title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                    aria-label="Alternar tema"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
                  </button>
                  <button
                    onClick={onOpenAuthModal}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                  >
                    Entrar no Portal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Modal de Atualização de Dados e Senha */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </>
  );
};
