import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { AssociationLogo } from './AssociationLogos.tsx';
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
  } = useAuth();

  const [showNotifMenu, setShowNotifMenu] = useState(false);
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

  return (
    <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand & Association Identity */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-xs overflow-hidden p-1 shrink-0"
            style={{ color: activeTemplate?.accentColor || '#10b981' }}
          >
            <AssociationLogo logoKeyOrUrl={activeTemplate?.logoUrl} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight leading-tight line-clamp-1">
              {activeTemplate?.associationName || 'Portal do Associado'}
            </h1>
            <p className="text-[10px] text-zinc-400 leading-tight">
              Gestão de Sócios & Carteirinha Digital (LGPD)
            </p>
          </div>
        </div>

        {/* Navigation Tabs for Sócios */}
        {currentUser && activeRole === 'member' && (
          <nav className="hidden lg:flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setActivePortalTab('card')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePortalTab === 'card'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Carteirinha</span>
            </button>

            <button
              onClick={() => setActivePortalTab('events')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePortalTab === 'events'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Eventos</span>
            </button>

            <button
              onClick={() => setActivePortalTab('culture')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePortalTab === 'culture'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Cultura</span>
            </button>

            <button
              onClick={() => setActivePortalTab('socials')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activePortalTab === 'socials'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Share2 className="w-3.5 h-3.5 text-pink-400" />
              <span>Redes Sociais</span>
            </button>
          </nav>
        )}

        {/* Center / Right controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <>
              {/* Role Switcher (Diretoria / Sócio) - ONLY VISIBLE IF BOARD MEMBER */}
              {isBoardMember && (
                <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-xl shadow-inner">
                  <button
                    onClick={() => setActiveRole('admin')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeRole === 'admin'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Acessar Gestão e Administração da Associação"
                  >
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">
                      {isSuperAdmin ? 'Admin Geral' : isDiretoriaExecutiva ? 'Diretoria Exec.' : 'Diretoria'}
                    </span>
                    <span className="sm:hidden">Adm</span>
                  </button>

                  <button
                    onClick={() => setActiveRole('member')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeRole === 'member'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title="Visualizar Carteirinha de Sócio"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Sócio</span>
                  </button>
                </div>
              )}

              {/* Push Notifications Bell */}
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

                {/* Click outside backdrop overlay to close automatically */}
                {showNotifMenu && (
                  <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] sm:bg-black/10 transition-opacity"
                    onClick={() => setShowNotifMenu(false)}
                    aria-label="Fechar avisos ao clicar fora"
                  />
                )}

                {/* Notifications / Avisos Popover */}
                {showNotifMenu && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 text-xs text-zinc-200 z-50 animate-scale-in"
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
                          title="Fechar tela de avisos (ou clique fora)"
                          aria-label="Fechar avisos"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
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

              {/* User Email & Logout */}
              <div className="flex items-center gap-2 pl-1 border-l border-zinc-800">
                <div className="w-8 h-8 rounded-full bg-emerald-900/60 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-xs">
                  {currentUser.email?.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Sair da conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              Acessar Portal do Sócio
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
