export type MemberStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'expirado';

export type CardOrientation = 'horizontal' | 'vertical';
export type CardPattern = 'guilloche' | 'waves' | 'mesh' | 'geometric' | 'clean';

export interface CustomCardField {
  id: string;
  label: string;
  value: string;
  visible?: boolean;
}

export const MEMBER_CATEGORIES = [
  'Sócio Efetivo',
  'Membro da Diretoria',
  'Membro Diretoria Executiva',
] as const;

export type MemberCategory = (typeof MEMBER_CATEGORIES)[number] | string;

export function normalizeMemberCategory(category?: string | null): (typeof MEMBER_CATEGORIES)[number] {
  if (!category) return 'Sócio Efetivo';
  const clean = category.trim().toUpperCase();
  if (
    clean === 'DIRETORIA EXECUTIVA' ||
    clean === 'MEMBRO DIRETORIA EXECUTIVA' ||
    clean === 'MEMBRO DA DIRETORIA EXECUTIVA'
  ) {
    return 'Membro Diretoria Executiva';
  }
  if (
    clean === 'DIRETORIA' ||
    clean === 'MEMBRO DA DIRETORIA' ||
    clean === 'SOMENTE DIRETORIA'
  ) {
    return 'Membro da Diretoria';
  }
  return 'Sócio Efetivo';
}

export interface Member {
  id: string;
  userId: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  membershipNumber?: string;
  category: MemberCategory;
  status: MemberStatus;
  rejectionReason?: string;
  lgpdConsent: boolean;
  lgpdConsentDate: string;
  // Granular LGPD consents
  allowBirthdayPublic?: boolean;
  birthdayConsentDate?: string;
  allowEventPhotos?: boolean;
  eventPhotosConsentDate?: string;
  allowSocialMediaPhotos?: boolean;
  socialMediaPhotosConsentDate?: string;
  allowCommunications?: boolean;
  communicationsConsentDate?: string;
  consentVersion?: string;
  // Minor under 18 protection
  isMinor?: boolean;
  parentName?: string;
  parentCpf?: string;
  parentAuthorized?: boolean;
  validUntil: string; // Defaults to "2027-10-31" or calculated
  renewalCount: number;
  lastGeneratedAt?: string;
  lastViewToken?: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: 'superadmin' | 'diretoria_executiva' | 'diretoria' | 'admin' | 'gestor' | 'tesoureiro' | 'conselho_fiscal';
  category?: 'DIRETORIA EXECUTIVA' | 'DIRETORIA' | 'TESOUREIRO' | 'CONSELHO FISCAL';
  addedBy?: string;
  createdAt: string;
}

export type InfoAlignment = 'center' | 'left' | 'right' | 'justify';
export type FontSizeOption = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

export interface CardTemplate {
  id: string;
  name: string;
  associationName: string;
  associationSubtitle: string;
  logoUrl: string;
  logoSize?: number; // Size in pixels (default: 76, range: 48-140)
  logoPosition?: 'left' | 'center';
  logoBgTransparent?: boolean; // Fundo transparente da logo (sem quadrado branco/opaco)
  infoAlignment?: InfoAlignment; // Alinhamento das informações (centralizado, esquerda, direita, justificado)
  nameFontSize?: FontSizeOption; // Tamanho da fonte do nome do associado
  detailsFontSize?: 'xs' | 'sm' | 'base'; // Tamanho da fonte dos dados adicionais
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  orientation: CardOrientation;
  backgroundPattern: CardPattern;
  showQrCode: boolean;
  showPhoto: boolean;
  showCpf: boolean;
  showBirthDate: boolean;
  showCategory: boolean;
  showSecurityStamp: boolean;
  customFields: CustomCardField[];
  signatureLabel: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface OfflineSavedCard {
  member: Member;
  template: CardTemplate;
  savedAt: string;
  expiresAt: string;
  token: string;
  offlineSecurityCode: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'status_change' | 'approval' | 'rejection' | 'expiration' | 'system';
  read: boolean;
  createdAt: string;
}

export type ViewRole = 'admin' | 'member';

export interface RejectionEmailTemplate {
  id: string; // 'rejection_email'
  subject: string;
  body: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface EmailDispatchRecord {
  id: string;
  toEmail: string;
  toName: string;
  memberId: string;
  userId: string;
  subject: string;
  body: string;
  status: 'enviado' | 'pendente';
  sentAt: string;
}

export type SocietyEventType = 'sociedade' | 'terceiro';

export interface SocietyEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  type: SocietyEventType;
  notes?: string;
  location?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export type SocialPlatform = 'facebook' | 'instagram' | 'youtube' | 'whatsapp' | 'tiktok' | 'website' | 'other';

export interface SocialLink {
  id: string;
  platform: SocialPlatform;
  title: string;
  url: string;
  username?: string;
  description?: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CultureCategory =
  | 'tiro_ao_alvo'
  | 'festas_de_rei'
  | 'modalidades'
  | 'schutzenfest'
  | 'sociedade_rio_camarada'
  | 'outros';

export interface CultureArticle {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  category: CultureCategory;
  categoryLabel: string;
  content: string; // HTML rich content
  summary: string;
  imageUrl?: string;
  order: number;
  highlighted?: boolean;
  published: boolean;
  draftContent?: string;
  draftSavedAt?: string;
  updatedAt: string;
  updatedBy?: string;
}

// PEDIDO 3: Editable Homepage Blocks
export interface HomepageSettings {
  id: string; // 'homepage'
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  associationSubtitle?: string;
  aboutTitle: string;
  aboutText: string;
  associationAddress: string;
  associationCnpj: string;
  associationPhone: string;
  associationEmail: string;
  footerNotice: string;
  updatedAt: string;
  updatedBy?: string;
}

// PEDIDO 4: News Module
export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  imageUrl?: string;
  tags: string[];
  status: 'rascunho' | 'publicada';
  highlighted: boolean;
  publishedAt: string;
  createdAt: string;
  createdBy: string;
}

export interface NewsKeywordConfig {
  id: string; // 'news_keywords'
  enabled: boolean;
  keywords: string[];
  lastCheckedAt?: string;
}

// PEDIDO 5: Financial Module
export type FinancialTransactionType = 'receita' | 'despesa';
export type FinancialAccountType = 'caixa' | 'banco';

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  initialBalance: number;
  currentBalance: number;
  bankName?: string;
  accountNumber?: string;
  pixKey?: string;
  active: boolean;
  updatedAt: string;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: FinancialTransactionType;
  icon?: string;
  active: boolean;
  updatedAt: string;
}

export interface FinancialTransaction {
  id: string;
  code: string; // e.g. "LAN-000123"
  type: FinancialTransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  competenceMonth: string; // YYYY-MM
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  description: string;
  entityName: string; // Fornecedor ou Pagador
  status: 'pago' | 'previsto';
  attachmentUrl?: string;
  attachmentName?: string;
  isReversal?: boolean;
  reversedFromId?: string;
  isReversed?: boolean;
  reversedById?: string;
  reversalReason?: string;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialMonthlyClosure {
  id: string; // YYYY-MM
  competenceMonth: string;
  closedAt: string;
  closedByEmail: string;
  closedByName: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  notes?: string;
}

export interface MemberFeeMonth {
  paid: boolean;
  paidAt?: string;
  amount?: number;
  transactionId?: string;
}

export interface FinancialMemberFee {
  id: string; // memberId_year
  memberId: string;
  memberName: string;
  memberCpf: string;
  year: number;
  months: Record<number, MemberFeeMonth>; // 1-12
  updatedAt: string;
}

export interface FinancialPublishedReport {
  id: string;
  title: string;
  description?: string;
  period: string; // e.g. "Ano 2025" ou "1º Trimestre/2026"
  documentUrl?: string;
  approvedAtAssemblyDate?: string; // DD/MM/AAAA ou YYYY-MM-DD
  totalIncome: number;
  totalExpense: number;
  balance: number;
  publishedAt: string;
  publishedBy: string;
}

// PEDIDO 6: Privacy, DPO & Data Requests
export interface PrivacyDpoSettings {
  id: string; // 'privacy_dpo'
  dpoName: string;
  dpoEmail: string;
  dpoPhone: string;
  dpoAddress: string;
  updatedAt: string;
  updatedBy?: string;
}

export type DataRequestType = 'copia_dados' | 'retificacao' | 'revogacao_consentimento' | 'exclusao_dados';
export type DataRequestStatus = 'pendente' | 'em_analise' | 'atendido' | 'rejeitado';

export interface DataSubjectRequest {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  memberCpf: string;
  type: DataRequestType;
  details?: string;
  status: DataRequestStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedByEmail?: string;
  resolutionNotes?: string;
}

export type ThemeMode = 'dark' | 'light';


