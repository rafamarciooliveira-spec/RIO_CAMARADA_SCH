/** Modelo da carteirinha (coleção cardTemplates) e utilidades visuais compartilhadas. */
import type React from 'react';

export type CardPattern = 'guilloche' | 'waves' | 'mesh' | 'geometric' | 'clean';

export interface CardTemplateDoc {
  id: string;
  name: string;
  associationName: string;
  associationSubtitle: string;
  logoUrl: string;
  logoSize?: number;
  logoPosition?: 'left' | 'center';
  logoBgTransparent?: boolean;
  infoAlignment?: 'center' | 'left' | 'right' | 'justify';
  nameFontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  detailsFontSize?: 'xs' | 'sm' | 'base';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  orientation: 'horizontal' | 'vertical';
  backgroundPattern: CardPattern;
  showQrCode: boolean;
  showPhoto: boolean;
  showCpf: false;
  showBirthDate: boolean;
  showCategory: boolean;
  showSecurityStamp: boolean;
  customFields: { id: string; label: string; value: string; visible?: boolean }[];
  signatureLabel: string;
  /** Cores próprias para quem ocupa um cargo ou um grupo do organograma (a primeira regra que bater vale) */
  roleThemes?: RoleTheme[];
  /**
   * Quem usa este modelo: cargos ou grupos do organograma (ex.: Diretoria; Rei e Rainha do pássaro).
   * Vazio = modelo geral; o geral em uso é o marcado como Ativo e vale para quem não cai em outro.
   */
  appliesTo?: CardAudience[];
  /**
   * Entidade a que a sociedade é filiada (federação, liga, associação regional), no verso:
   * ex.: "Afiliada à Associação dos Clubes e Sociedades de Tiro do Vale do Itapocu", com a logo dela.
   */
  affiliationText?: string;
  affiliationLogoUrl?: string;
  /** Verso com o histórico de cargos e honrarias do sócio */
  showHonors?: boolean;
  isDefault: boolean;
  updatedAt?: string;
}

/** Campos que o schema genérico aceita (o resto é descartado ao salvar) */
export const TEMPLATE_FIELDS: (keyof CardTemplateDoc)[] = [
  'name',
  'associationName',
  'associationSubtitle',
  'logoUrl',
  'logoSize',
  'logoPosition',
  'logoBgTransparent',
  'infoAlignment',
  'nameFontSize',
  'detailsFontSize',
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'textColor',
  'orientation',
  'backgroundPattern',
  'showQrCode',
  'showPhoto',
  'showCpf',
  'showBirthDate',
  'showCategory',
  'showSecurityStamp',
  'customFields',
  'signatureLabel',
  'roleThemes',
  'appliesTo',
  'showHonors',
  'affiliationText',
  'affiliationLogoUrl',
  'isDefault',
];

export function fallbackTemplate(name: string): CardTemplateDoc {
  return {
    id: 'padrao',
    name: 'Modelo padrão',
    associationName: name,
    associationSubtitle: '',
    logoUrl: 'shield',
    logoSize: 64,
    logoPosition: 'center',
    logoBgTransparent: true,
    infoAlignment: 'center',
    nameFontSize: 'lg',
    detailsFontSize: 'xs',
    primaryColor: '#1f3b2d',
    secondaryColor: '#0f1f17',
    accentColor: '#d4a64a',
    textColor: '#ffffff',
    orientation: 'vertical',
    backgroundPattern: 'guilloche',
    showQrCode: true,
    showPhoto: true,
    showCpf: false,
    showBirthDate: false,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [],
    signatureLabel: 'Diretoria',
    isDefault: true,
  };
}

export const PATTERN_LABEL: Record<CardPattern, string> = {
  guilloche: 'Guilhochê (pontilhado de segurança)',
  waves: 'Linhas diagonais',
  mesh: 'Gradiente suave',
  geometric: 'Geométrico',
  clean: 'Liso',
};

export function patternStyle(p: CardPattern): React.CSSProperties {
  switch (p) {
    case 'guilloche':
      return {
        backgroundImage:
          'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.09) 1px, transparent 1px), radial-gradient(circle at 0% 100%, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '16px 16px, 24px 24px',
      };
    case 'waves':
      return { backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, transparent 2px, transparent 8px)' };
    case 'mesh':
      return { backgroundImage: 'radial-gradient(at 0% 0%, rgba(255,255,255,0.16) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(0,0,0,0.3) 0px, transparent 50%)' };
    case 'geometric':
      return {
        backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(225deg, rgba(255,255,255,0.06) 25%, transparent 25%)',
        backgroundSize: '20px 20px',
      };
    default:
      return {};
  }
}

/** Logo do modelo: chave de ícone, URL ou caminho público do Storage */
export function isStoragePath(v: string | undefined): boolean {
  return !!v && v.startsWith('tenants/');
}

export interface CardAudience {
  match: 'grupo' | 'cargo';
  value: string;
}

export interface RoleTheme {
  id: string;
  match: 'grupo' | 'cargo'; // grupo do organograma (ex.: Majestades) ou um cargo (ex.: Presidente)
  value: string; // o primeiro escolhido (regras antigas tinham um só)
  values?: string[]; // vários cargos ou grupos com a mesma regra (ex.: 1ª e 2ª Princesa)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  /** false = a regra só põe o adesivo, sem mudar as cores */
  applyColors?: boolean;
  /** Adesivo (imagem) que aparece junto da foto: coroa do rei, luva do goleiro, bola do artilheiro... */
  stickerPath?: string;
}

const norm = (x: string) => x.trim().toLowerCase();
/** Cargos ou grupos de uma regra (as antigas guardavam um só em value) */
export const ruleValues = (r: Pick<RoleTheme, 'value' | 'values'>): string[] => (r.values?.length ? r.values : r.value ? [r.value] : []);
const hits = (match: 'grupo' | 'cargo', values: string[], positions: { title: string; group: string }[]) =>
  positions.some(p => values.some(v => norm(match === 'grupo' ? p.group : p.title) === norm(v)));
const matches = (r: RoleTheme, positions: { title: string; group: string }[]) => hits(r.match, ruleValues(r), positions);

/**
 * Modelo de cada pessoa: o modelo cujo público inclui um cargo dela (cargo vale mais que grupo);
 * sem nenhum, o modelo geral Ativo.
 */
export function pickTemplate<T extends CardTemplateDoc>(list: T[], activeId: string, positions: { title: string; group: string }[]): T | undefined {
  let best: { tpl: T; score: number } | undefined;
  for (const tpl of list) {
    for (const a of tpl.appliesTo || []) {
      if (!hits(a.match, [a.value], positions)) continue;
      const score = a.match === 'cargo' ? 2 : 1;
      if (!best || score > best.score) best = { tpl, score };
    }
  }
  return best?.tpl || list.find(x => x.id === activeId) || list.find(x => x.id === 'padrao');
}

/** Cores da carteirinha conforme os cargos que a pessoa ocupa hoje (a primeira regra com cor que combinar vale) */
export function themeFor(t: CardTemplateDoc, positions: { title: string; group: string }[]): CardTemplateDoc {
  const hit = (t.roleThemes || []).find(r => r.applyColors !== false && matches(r, positions));
  return hit ? { ...t, primaryColor: hit.primaryColor, secondaryColor: hit.secondaryColor, accentColor: hit.accentColor, textColor: hit.textColor } : t;
}

/** Adesivos de todas as regras que combinam (até 3, na ordem das regras) */
export function stickersFor(t: CardTemplateDoc, positions: { title: string; group: string }[]): string[] {
  return [...new Set((t.roleThemes || []).filter(r => r.stickerPath && matches(r, positions)).map(r => r.stickerPath!))].slice(0, 3);
}
