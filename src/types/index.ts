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

export interface CardTemplate {
  id: string;
  name: string;
  associationName: string;
  associationSubtitle: string;
  logoUrl: string;
  logoSize?: number; // Size in pixels (default: 76, range: 48-140)
  logoPosition?: 'left' | 'center';
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
