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
