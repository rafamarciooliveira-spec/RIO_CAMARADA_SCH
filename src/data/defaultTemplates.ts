import { CardTemplate } from '../types/index.ts';

export const DEFAULT_TEMPLATES: CardTemplate[] = [
  {
    id: 'template_institucional_ouro',
    name: 'Esmeralda & Ouro Institucional',
    associationName: 'Associação Beneficente & Cultural União',
    associationSubtitle: 'Entidade Sem Fins Lucrativos • Fundada em 1984 • CNPJ 12.345.678/0001-90',
    logoUrl: 'shield',
    logoSize: 76,
    logoPosition: 'center',
    logoBgTransparent: true,
    infoAlignment: 'center',
    nameFontSize: 'lg',
    detailsFontSize: 'xs',
    primaryColor: '#064e3b', // emerald-900
    secondaryColor: '#022c22', // emerald-950
    accentColor: '#fbbf24', // amber-400
    textColor: '#ffffff',
    orientation: 'vertical',
    backgroundPattern: 'guilloche',
    showQrCode: true,
    showPhoto: true,
    showCpf: true,
    showBirthDate: true,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [
      { id: 'f2', label: 'Unidade Regional', value: 'Sede Central - SP' }
    ],
    signatureLabel: 'Diretoria Executiva',
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template_safira_tech',
    name: 'Safira & Holo Wave',
    associationName: 'Instituto de Inovação & Apoio Social',
    associationSubtitle: 'Associação Civil Sem Fins Lucrativos • Registro Geral nº 45.892',
    logoUrl: 'globe',
    logoSize: 76,
    logoPosition: 'left',
    primaryColor: '#1e1b4b', // indigo-950
    secondaryColor: '#0f172a', // slate-900
    accentColor: '#38bdf8', // sky-400
    textColor: '#f8fafc',
    orientation: 'horizontal',
    backgroundPattern: 'waves',
    showQrCode: true,
    showPhoto: true,
    showCpf: true,
    showBirthDate: true,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [
      { id: 'f2', label: 'Acesso Digital', value: 'Total / Todos os Polos' }
    ],
    signatureLabel: 'Conselho Deliberativo',
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template_platinum_dark',
    name: 'Carbono & Platina Minimalista',
    associationName: 'Sociedade Filantrópica Horizonte',
    associationSubtitle: 'Organização da Sociedade Civil de Interesse Público',
    logoUrl: 'award',
    logoSize: 76,
    logoPosition: 'left',
    primaryColor: '#18181b', // zinc-900
    secondaryColor: '#09090b', // zinc-950
    accentColor: '#e4e4e7', // zinc-200
    textColor: '#ffffff',
    orientation: 'horizontal',
    backgroundPattern: 'geometric',
    showQrCode: true,
    showPhoto: true,
    showCpf: true,
    showBirthDate: false,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [
      { id: 'f1', label: 'Comissão', value: 'Ética e Compliance' }
    ],
    signatureLabel: 'Presidência',
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template_rubro_dourado',
    name: 'Rubro & Âmbar Esportivo / Cívico',
    associationName: 'Grêmio Recreativo & Comunitário',
    associationSubtitle: 'Associação Esportiva e Assistencial Sem Fins Lucrativos',
    logoUrl: 'flame',
    logoSize: 76,
    logoPosition: 'left',
    primaryColor: '#7f1d1d', // red-900
    secondaryColor: '#450a0a', // red-950
    accentColor: '#f59e0b', // amber-500
    textColor: '#ffffff',
    orientation: 'horizontal',
    backgroundPattern: 'mesh',
    showQrCode: true,
    showPhoto: true,
    showCpf: true,
    showBirthDate: true,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [
      { id: 'f2', label: 'Clube de Campo', value: 'Liberado' }
    ],
    signatureLabel: 'Diretor de Esportes',
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'template_vertical_badge',
    name: 'Crachá Executivo Vertical',
    associationName: 'Federação Solidária Brasileira',
    associationSubtitle: 'Terceiro Setor • Desenvolvimento Humano e Social',
    logoUrl: 'shield',
    logoSize: 84,
    logoPosition: 'center',
    primaryColor: '#0f172a', // slate-900
    secondaryColor: '#1e293b', // slate-800
    accentColor: '#10b981', // emerald-500
    textColor: '#ffffff',
    orientation: 'vertical',
    backgroundPattern: 'guilloche',
    showQrCode: true,
    showPhoto: true,
    showCpf: true,
    showBirthDate: true,
    showCategory: true,
    showSecurityStamp: true,
    customFields: [
      { id: 'f2', label: 'Validade Credencial', value: 'Porte Obrigatório' }
    ],
    signatureLabel: 'Secretaria Geral',
    isDefault: false,
    updatedAt: new Date().toISOString(),
  }
];
