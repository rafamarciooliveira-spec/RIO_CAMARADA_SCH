export type MemberStatus = 'pendente' | 'aprovado' | 'rejeitado' | 'expirado';

export type CardOrientation = 'horizontal' | 'vertical';
export type CardPattern = 'guilloche' | 'waves' | 'mesh' | 'geometric' | 'clean';

export interface CustomCardField {
  id: string;
  label: string;
  value: string;
  visible?: boolean;
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
  category: 'SÓCIO' | 'MEMBRO DA DIRETORIA' | string;
  status: MemberStatus;
  rejectionReason?: string;
  lgpdConsent: boolean;
  lgpdConsentDate: string;
  validUntil: string; // Defaults to "2027-10-31"
  renewalCount: number;
  lastGeneratedAt?: string;
  lastViewToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  role: 'superadmin' | 'admin' | 'gestor';
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
  content: string; // rich markdown / paragraphs
  summary: string;
  imageUrl?: string;
  order: number;
  highlighted?: boolean;
  published: boolean;
  updatedAt: string;
  updatedBy?: string;
}

