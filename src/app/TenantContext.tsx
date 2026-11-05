/**
 * Contexto da sociedade aberta em /{slug}: documento público, vínculo do usuário (papéis),
 * cadastro de sócio, configurações e rótulos. Aplica a identidade visual (cores, fonte, tema).
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { P } from '../shared/paths.ts';
import { can as canPerm, isBoard, type Action, type ModuleId, type Perms } from '../shared/modules.ts';
import { DEFAULT_LABELS, type Labels, type MemberDoc, type MembershipDoc, type SlugDoc, type TenantDoc, type TenantSettings } from '../shared/types.ts';
import { useData, useDoc, useSession } from './DataContext.tsx';
import type { WithId } from '../data/client.ts';
import { userTheme } from '../ui/ThemeToggle.tsx';
import { ErrorState, Loading } from '../ui/index.tsx';

export interface TenantCtx {
  slug: string;
  tenantId: string;
  tenant: WithId<TenantDoc>;
  settings: WithId<TenantSettings> | null;
  membership: WithId<MembershipDoc> | null;
  member: WithId<MemberDoc> | null;
  perms: Perms;
  board: boolean;
  /** A pessoa é da diretoria de verdade (mesmo vendo o portal como sócio) */
  realBoard: boolean;
  /** "Ver como sócio": a tela mostra só o que um sócio sem cargo vê */
  viewAsMember: boolean;
  setViewAsMember(v: boolean): void;
  labels: Labels;
  can(module: ModuleId, action?: Action): boolean;
  moduleOn(module: ModuleId): boolean;
  /** Caminho absoluto dentro do portal da sociedade (respeita a demonstração) */
  to(sub?: string): string;
}

const Ctx = createContext<TenantCtx | null>(null);

export function useTenant(): TenantCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTenant fora do TenantProvider');
  return c;
}

export function useOptionalTenant(): TenantCtx | null {
  return useContext(Ctx);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Contraste WCAG entre duas cores (1 a 21) */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function applyBranding(tenant: TenantDoc | null): void {
  const root = document.documentElement;
  if (!tenant) {
    root.removeAttribute('data-theme');
    ['--sd-brand', '--sd-brand-2', '--sd-accent', '--sd-on-brand', '--sd-font'].forEach(v => root.style.removeProperty(v));
    return;
  }
  const b = tenant.branding;
  // A escolha da própria pessoa (botão do sol e da lua) vence o padrão da sociedade
  root.setAttribute('data-theme', userTheme() || b.theme || 'escuro');
  root.style.setProperty('--sd-brand', b.primaryColor);
  root.style.setProperty('--sd-brand-2', b.secondaryColor);
  root.style.setProperty('--sd-accent', b.accentColor);
  // Texto sobre a cor da marca: escolhe o que tiver contraste AA
  root.style.setProperty('--sd-on-brand', contrastRatio(b.primaryColor, '#ffffff') >= 4.5 ? '#ffffff' : '#111111');
  root.style.setProperty('--sd-font', `'${b.fontFamily || 'Inter'}'`);
  document.title = tenant.name;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { slug = '' } = useParams();
  const { basePath } = useData();
  const session = useSession();
  const slugDoc = useDoc<SlugDoc>(slug ? P.slug(slug.toLowerCase()) : null);
  const tenantId = slugDoc.data?.tenantId || '';
  const tenant = useDoc<TenantDoc>(tenantId ? P.tenant(tenantId) : null);
  const membership = useDoc<MembershipDoc>(tenantId && session.user ? P.membership(tenantId, session.user.uid) : null);
  const active = membership.data && membership.data.active && (!membership.data.expiresAtMs || membership.data.expiresAtMs > Date.now()) ? membership.data : null;
  const member = useDoc<MemberDoc>(tenantId && active?.memberId ? P.member(tenantId, active.memberId) : null);
  const settings = useDoc<TenantSettings>(tenantId && session.user ? P.settings(tenantId) : null);
  // Só muda a tela (o servidor continua checando as permissões de verdade); vale até fechar a aba
  const asKey = `verein:ver-como-socio:${tenantId}`;
  const [asMember, setAsMember] = useState(false);
  useEffect(() => {
    try {
      setAsMember(!!tenantId && sessionStorage.getItem(asKey) === '1');
    } catch {
      setAsMember(false);
    }
  }, [asKey, tenantId]);

  useEffect(() => {
    applyBranding(tenant.data);
    return () => applyBranding(null);
  }, [tenant.data]);

  const value = useMemo<TenantCtx | null>(() => {
    if (!tenant.data) return null;
    const realPerms = active?.perms || {};
    const realBoard = isBoard(realPerms);
    const viewAsMember = realBoard && asMember;
    const perms = viewAsMember ? {} : realPerms;
    const t = tenant.data;
    return {
      slug: t.slug,
      tenantId: t.id || tenantId,
      tenant: t,
      settings: settings.data,
      membership: active,
      member: member.data,
      perms,
      board: isBoard(perms),
      realBoard,
      viewAsMember,
      setViewAsMember: (v: boolean) => {
        try {
          if (v) sessionStorage.setItem(asKey, '1');
          else sessionStorage.removeItem(asKey);
        } catch {
          /* sem armazenamento: vale só nesta tela */
        }
        setAsMember(v);
      },
      labels: { ...DEFAULT_LABELS, ...(t.labels || {}) },
      can: (m, a = 'ver') => t.modules?.[m] !== false && canPerm(perms, m, a),
      moduleOn: m => t.modules?.[m] !== false,
      to: (sub = '') => `${basePath}/${t.slug}${sub ? `/${sub.replace(/^\//, '')}` : ''}`,
    };
  }, [tenant.data, tenantId, settings.data, active, member.data, basePath, asMember, asKey]);

  // Espera o vínculo e o cadastro: sem isso as rotas da diretoria são montadas sem permissão
  // e a pessoa é redirecionada para o início antes de as permissões chegarem
  if (slugDoc.loading || (tenantId && (tenant.loading || membership.loading || member.loading))) return <Loading label="Abrindo a sociedade..." />;
  if (slugDoc.data?.redirectTo) return <Navigate to={`${basePath}/${slugDoc.data.redirectTo}`} replace />;
  if (!slugDoc.data || !value) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <ErrorState text="Não encontramos esta sociedade. Confira o endereço." />
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
