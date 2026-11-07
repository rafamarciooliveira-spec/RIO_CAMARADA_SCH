/**
 * Portal da sociedade (/{slug}/...). Mesmo componente no real e na demonstração.
 * Rotas públicas: entrada, validação do QR, convite, proposta de sócio e página pública.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Bell, X, ChevronsUpDown, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle.tsx';
import { TenantProvider, useTenant } from './TenantContext.tsx';
import { useData, useList, useOp, useSession } from './DataContext.tsx';
import { PAGES, type PageDef } from '../modules/registry.tsx';
import { P } from '../shared/paths.ts';
import type { NotificationDoc, UserDoc } from '../shared/types.ts';
import { AssociationLogo } from '../components/AssociationLogos.tsx';
import { Badge, Button, cx, ErrorState, Loading, lockScroll, Notice } from '../ui/index.tsx';
import { useDoc } from './DataContext.tsx';
import { formatDateTime } from '../shared/dates.ts';

const LoginPage = React.lazy(() => import('../modules/auth/LoginPage.tsx'));
const AcceptInvitePage = React.lazy(() => import('../modules/auth/AcceptInvitePage.tsx'));
const VerifyPage = React.lazy(() => import('../modules/card/VerifyPage.tsx'));
const ApplyPage = React.lazy(() => import('../modules/members/ApplyPage.tsx'));
const PublicPage = React.lazy(() => import('../modules/public/PublicTenantPage.tsx'));

export function visiblePages(t: ReturnType<typeof useTenant>, area: PageDef['area']): PageDef[] {
  return PAGES.filter(p => {
    if (p.area !== area) return false;
    if (p.module && !t.moduleOn(p.module)) return false;
    if (p.needsMember && !t.member) return false;
    if (p.perm && !t.can(p.perm[0], p.perm[1])) return false;
    // Botões que a diretoria escondeu do menu do sócio
    if (area === 'socio' && t.settings?.memberMenuHidden?.includes(p.path)) return false;
    return true;
  });
}

/** Logado sem ficha de sócio nesta sociedade (ex.: diretoria e administrador geral): atalho para se cadastrar */
function SelfMemberBanner() {
  const session = useSession();
  const { basePath } = useData();
  const t = useTenant();
  const location = useLocation();
  if (basePath || !session.user || t.member || location.pathname.endsWith('/cadastro')) return null;
  return (
    <div className="mb-4 p-3 rounded-2xl border border-accent/50 bg-accent/5 flex flex-wrap items-center gap-3">
      <div className="text-sm flex-1 min-w-48">
        A sua conta <strong>{session.user.email}</strong> ainda não tem ficha de {t.labels.member.toLowerCase()} na {t.tenant.shortName || t.tenant.name}.
        {t.can('socios', 'aprovar') && ' Como você é da diretoria, a ficha já entra aprovada.'}
      </div>
      <Link to={t.to('cadastro')} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand text-on-brand">
        Adicionar-me como {t.labels.member.toLowerCase()}
      </Link>
    </div>
  );
}

function TenantSwitcher() {
  const session = useSession();
  const { basePath } = useData();
  const t = useTenant();
  const user = useDoc<UserDoc>(session.user ? P.user(session.user.uid) : null);
  const others = Object.entries(user.data?.tenants || {}).filter(([id]) => id !== t.tenantId);
  const [open, setOpen] = useState(false);
  // Administrador geral sempre vê o caminho de volta ao painel, mesmo com uma sociedade só
  const isMaster = !!session.user?.master && !basePath;
  // Fora da demonstração sempre aparece: a pessoa pode ser também da diretoria de uma federação
  if (!others.length && !isMaster && basePath) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer" aria-haspopup="menu" aria-expanded={open}>
        Trocar de acesso <ChevronsUpDown className="w-3 h-3" />
      </button>
      {open && (
        <div role="menu" className="absolute z-40 mt-2 w-64 bg-surface border border-line rounded-xl shadow-xl p-1">
          {isMaster && (
            <Link role="menuitem" to="/master" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm hover:bg-surface-2 font-medium">
              Painel da plataforma
            </Link>
          )}
          {others.map(([id, v]) => (
            <Link role="menuitem" key={id} to={`${basePath}/${v.slug}/inicio`} onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm hover:bg-surface-2">
              {v.name}
            </Link>
          ))}
          {!basePath && (
            <Link role="menuitem" to="/entrar" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm hover:bg-surface-2 text-muted border-t border-line mt-1">
              Todos os meus acessos
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationsBell() {
  const t = useTenant();
  const session = useSession();
  const { run } = useOp();
  const list = useList<NotificationDoc>(session.user ? P.notifications(t.tenantId) : null, {
    where: [['uid', '==', session.user?.uid || '-']],
    orderBy: [['createdAt', 'desc']],
    limit: 20,
  });
  const [open, setOpen] = useState(false);
  const unread = list.data.filter(n => !n.read);
  const navigate = useNavigate();
  const location = useLocation();
  const box = useRef<HTMLDivElement>(null);
  // Fecha ao tocar fora, com Esc ou ao trocar de tela (não precisa tocar no sino de novo)
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`Notificações${unread.length ? `, ${unread.length} não lidas` : ''}`} className="relative p-2 rounded-xl hover:bg-surface-2 cursor-pointer">
        <Bell className="w-5 h-5" />
        {unread.length > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-bad text-white text-[10px] font-bold flex items-center justify-center">{unread.length}</span>}
      </button>
      {open && (
        <div className="fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:top-auto sm:right-0 z-40 sm:mt-2 sm:w-80 bg-surface border border-line rounded-xl shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            <span className="text-sm font-semibold">Notificações</span>
            {unread.length > 0 && (
              <button className="text-xs text-accent cursor-pointer" onClick={() => run('notifications.markRead', { tenantId: t.tenantId, ids: unread.map(n => n.id) }, { silent: true })}>
                Marcar como lidas
              </button>
            )}
          </div>
          <div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain custom-scrollbar divide-y divide-line">
            {list.data.length === 0 && <p className="p-4 text-sm text-muted">Nenhuma notificação.</p>}
            {list.data.map(n => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (!n.read) run('notifications.markRead', { tenantId: t.tenantId, ids: [n.id] }, { silent: true });
                  if (n.link) navigate(t.to(n.link));
                }}
                className={cx('w-full text-left px-3 py-2.5 hover:bg-surface-2 cursor-pointer', !n.read && 'bg-accent/5')}
              >
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted line-clamp-2">{n.body}</div>
                <div className="text-[10px] text-muted mt-0.5">{formatDateTime(n.createdAt, t.tenant.timezone)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const t = useTenant();
  const session = useSession();
  const { demo } = useData();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const socio = visiblePages(t, 'socio');
  const diretoria = visiblePages(t, 'diretoria');
  useEffect(() => setMenuOpen(false), [location.pathname]);
  // Menu aberto no celular: trava a rolagem do fundo (inclusive no iOS) até fechar ou tocar fora
  useEffect(() => {
    if (!menuOpen) return;
    const unlock = lockScroll();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const nav = (
    <nav className="space-y-6" aria-label="Menu principal">
      <div>
        <div className="px-3 text-[11px] uppercase tracking-wider text-muted mb-1">Para você</div>
        {socio.map(p => (
          <NavLink key={p.path} to={t.to(p.path)} className={({ isActive }) => cx('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm', isActive ? 'bg-brand text-on-brand' : 'hover:bg-surface-2')}>
            <p.icon className="w-4 h-4 shrink-0" aria-hidden />
            {p.path === 'carteirinha' ? t.labels.card : p.label}
          </NavLink>
        ))}
      </div>
      {diretoria.length > 0 && (
        <div>
          <div className="px-3 text-[11px] uppercase tracking-wider text-muted mb-1">{t.labels.board}</div>
          {diretoria.map(p => (
            <NavLink key={p.path} to={t.to(p.path)} className={({ isActive }) => cx('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm', isActive ? 'bg-brand text-on-brand' : 'hover:bg-surface-2')}>
              <p.icon className="w-4 h-4 shrink-0" aria-hidden />
              {p.path === 'socios' ? t.labels.members : p.label}
            </NavLink>
          ))}
        </div>
      )}
      {t.realBoard && !t.viewAsMember && (
        <button type="button" onClick={() => t.setViewAsMember(true)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm border border-dashed border-line hover:bg-surface-2 cursor-pointer">
          <Eye className="w-4 h-4 shrink-0" aria-hidden />
          Ver como {t.labels.member.toLowerCase()}
        </button>
      )}
    </nav>
  );

  const routes = [...socio, ...diretoria];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-[var(--app-top,0px)] z-30 bg-bg/90 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <button className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-surface-2 cursor-pointer" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
            <Menu className="w-5 h-5" />
          </button>
          <Link to={t.to('inicio')} className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-brand text-on-brand flex items-center justify-center shrink-0">
              <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-5 h-5" />
            </span>
            <span className="font-semibold truncate">{t.tenant.shortName || t.tenant.name}</span>
          </Link>
          <div className="hidden sm:block">
            <TenantSwitcher />
          </div>
          <div className="flex-1" />
          {t.membership?.support && <Badge tone="warn">Acesso de suporte</Badge>}
          <ThemeToggle />
          <NotificationsBell />
          <span className="hidden md:block text-xs text-muted truncate max-w-40">{session.user?.displayName}</span>
          {!demo && (
            <button onClick={() => session.signOut()} className="p-2 rounded-xl hover:bg-surface-2 cursor-pointer" aria-label="Sair">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        <aside className="hidden lg:block w-64 shrink-0 p-4 border-r border-line overflow-y-auto overscroll-contain custom-scrollbar sticky top-[calc(var(--app-top,0px)+3.5rem)] h-[calc(100vh-3.5rem-var(--app-top,0px))]">{nav}</aside>
        {menuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/60 overscroll-contain" onClick={() => setMenuOpen(false)}>
            <aside role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface p-4 overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
              <div className="flex justify-end mb-2">
                <button onClick={() => setMenuOpen(false)} aria-label="Fechar menu" className="p-2 rounded-xl hover:bg-surface-2 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <TenantSwitcher />
              <div className="mt-3">{nav}</div>
            </aside>
          </div>
        )}
        <main className="flex-1 min-w-0 p-4 sm:p-6">
          {t.viewAsMember && (
            <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-info/40 bg-info/10 px-3 py-2 text-sm">
              <Eye className="w-4 h-4 text-info shrink-0" aria-hidden />
              <span className="flex-1 min-w-48">Você está vendo o portal como um {t.labels.member.toLowerCase()} sem cargo: menu, agenda e telas com os mesmos acessos.</span>
              <Button size="sm" variant="secondary" icon={<EyeOff className="w-4 h-4" />} onClick={() => t.setViewAsMember(false)}>
                Voltar para a {t.labels.board.toLowerCase()}
              </Button>
            </div>
          )}
          <SelfMemberBanner />
          <Suspense fallback={<Loading />}>
            <Routes>
              {routes.map(p => (
                <Route key={p.path} path={`${p.path}/*`} element={<p.element />} />
              ))}
              <Route path="*" element={<Navigate to={t.to('inicio')} replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/** Logado mas sem vínculo: convida a fazer a proposta de sócio */
function NoMembership() {
  const t = useTenant();
  const session = useSession();
  return (
    <div className="max-w-lg mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">{t.tenant.name}</h1>
      <Notice>
        Você entrou como <strong>{session.user?.email}</strong>, mas ainda não faz parte desta sociedade.
      </Notice>
      <div className="flex flex-wrap gap-2">
        <Link to={t.to('cadastro')}>
          <Button>Quero ser {t.labels.member.toLowerCase()}</Button>
        </Link>
        <Button variant="secondary" onClick={() => session.signOut()}>
          Entrar com outra conta
        </Button>
      </div>
      <p className="text-xs text-muted">Se você recebeu um convite por e-mail, abra o link do convite para entrar com o papel certo.</p>
    </div>
  );
}

function Gate() {
  const t = useTenant();
  const session = useSession();
  const location = useLocation();
  if (session.loading) return <Loading />;
  if (!session.user) return <Navigate to={t.to(`entrar?volta=${encodeURIComponent(location.pathname)}`)} replace />;
  if (t.tenant.status === 'suspensa' && !t.membership?.support) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <Notice tone="warn">
          <ShieldAlert className="hidden" />
          Esta sociedade está temporariamente suspensa na plataforma. Fale com a {t.labels.board.toLowerCase()}.
        </Notice>
      </div>
    );
  }
  if (!t.membership) return <NoMembership />;
  return <Shell />;
}

function TenantRoutes() {
  return (
    <TenantProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="entrar" element={<LoginPage />} />
          <Route path="v/:token" element={<VerifyPage />} />
          <Route path="convite" element={<AcceptInvitePage />} />
          <Route path="cadastro" element={<ApplyPage />} />
          <Route path="publico" element={<PublicPage />} />
          <Route path="*" element={<Gate />} />
        </Routes>
      </Suspense>
    </TenantProvider>
  );
}

export default function PortalApp() {
  const routes = useMemo(
    () => (
      <Routes>
        <Route path=":slug/*" element={<TenantRoutes />} />
        <Route path="*" element={<ErrorState text="Endereço inválido." />} />
      </Routes>
    ),
    []
  );
  return routes;
}
