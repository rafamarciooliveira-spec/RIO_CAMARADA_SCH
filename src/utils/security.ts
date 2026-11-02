/**
 * Security, 24-hour verification token generation, and membership expiration helpers
 */

import { maskCPF } from './cpf.ts';

/**
 * Returns dynamic default expiry (e.g. December 31st of the next year).
 * No longer fixed hardcoded to 2027-10-31.
 */
export function getDefaultOfficialExpiry(): string {
  const nextYear = new Date().getFullYear() + 1;
  return `${nextYear}-12-31`;
}

export const DEFAULT_OFFICIAL_EXPIRY = getDefaultOfficialExpiry();

/**
 * Generates strictly sequential, non-repeating membership number:
 * SOC-000001, SOC-000002, SOC-000003...
 */
export function generateNextMembershipNumber(existingMembers: { membershipNumber?: string }[]): string {
  let maxSeq = 0;
  for (const m of existingMembers) {
    if (!m.membershipNumber) continue;
    const match = m.membershipNumber.trim().match(/^SOC-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  return `SOC-${String(nextSeq).padStart(6, '0')}`;
}

export function generateViewToken(memberId?: string | null): {
  token: string;
  generatedAt: string;
  expiresAt: string;
} {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const safeId = (memberId && typeof memberId === 'string') ? memberId : `mem_${Date.now().toString(36)}`;
  const randomSalt = Math.random().toString(36).substring(2, 10).toUpperCase();
  const token = `AUTH-${safeId.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomSalt}`;

  return {
    token,
    generatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
}

export function checkViewTokenStatus(generatedAtIso?: string | null): {
  isValid: boolean;
  generatedDateStr: string;
  expiryDateStr: string;
  remainingMs: number;
  formattedRemaining: string;
  isExpired: boolean;
} {
  if (!generatedAtIso || typeof generatedAtIso !== 'string') {
    return {
      isValid: false,
      generatedDateStr: '--/--/---- --:--',
      expiryDateStr: '--/--/---- --:--',
      remainingMs: 0,
      formattedRemaining: '00h 00m 00s',
      isExpired: true,
    };
  }

  const generatedTime = new Date(generatedAtIso).getTime();
  if (isNaN(generatedTime)) {
    return {
      isValid: false,
      generatedDateStr: '--/--/---- --:--',
      expiryDateStr: '--/--/---- --:--',
      remainingMs: 0,
      formattedRemaining: '00h 00m 00s',
      isExpired: true,
    };
  }

  const expiryTime = generatedTime + 24 * 60 * 60 * 1000;
  const now = Date.now();
  const diff = expiryTime - now;

  const isValid = diff > 0 && generatedTime <= now + 60000; // allow small clock skew
  const remainingMs = Math.max(0, diff);

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const pad = (n: number) => n.toString().padStart(2, '0');

  const generatedDate = new Date(generatedTime);
  const expiryDate = new Date(expiryTime);

  let generatedDateStr = '--/--/---- --:--';
  let expiryDateStr = '--/--/---- --:--';
  try {
    generatedDateStr = generatedDate.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    expiryDateStr = expiryDate.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (e) {}

  return {
    isValid,
    generatedDateStr,
    expiryDateStr,
    remainingMs,
    formattedRemaining: `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
    isExpired: !isValid,
  };
}

export function checkOfficialCardStatus(validUntilStr?: string | null): {
  isExpired: boolean;
  formattedDate: string;
  daysRemaining: number;
} {
  const safeStr = (typeof validUntilStr === 'string' && validUntilStr.trim()) ? validUntilStr.trim() : DEFAULT_OFFICIAL_EXPIRY;
  const parts = safeStr.split('-');
  let expiryDate: Date;
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10) || (new Date().getFullYear() + 1);
    const m = (parseInt(parts[1], 10) || 12) - 1;
    const d = parseInt(parts[2], 10) || 31;
    expiryDate = new Date(y, m, d, 23, 59, 59);
  } else {
    const parsed = new Date(safeStr);
    expiryDate = isNaN(parsed.getTime()) ? new Date(new Date().getFullYear() + 1, 11, 31, 23, 59, 59) : parsed;
  }

  const now = new Date();
  const isExpired = now.getTime() > expiryDate.getTime();
  const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let formattedDate = safeStr;
  try {
    formattedDate = expiryDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch (e) {}

  return {
    isExpired,
    formattedDate,
    daysRemaining: Math.max(0, daysRemaining),
  };
}

const OFFLINE_CARD_STORAGE_KEY = 'associacao_offline_card_v1';

export function saveOfflineCard(member: any, template: any): {
  success: boolean;
  expiresAt: string;
  savedAt: string;
} {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const offlineSecurityCode = `OFFLINE-${member.id?.slice(0, 5).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Store ONLY necessary fields for card display, strictly masking CPF and excluding raw sensitive PII
    const sanitizedMember = {
      id: member.id,
      fullName: member.fullName,
      cpf: maskCPF(member.cpf),
      category: member.category || 'SÓCIO',
      membershipNumber: member.membershipNumber || '',
      photoUrl: member.photoUrl || '',
      status: member.status,
      validUntil: member.validUntil,
      lastGeneratedAt: member.lastGeneratedAt,
      lastViewToken: member.lastViewToken || offlineSecurityCode,
    };

    const sanitizedTemplate = {
      name: template?.name || 'Padrão',
      associationName: template?.associationName || 'Associação',
      primaryColor: template?.primaryColor || '#059669',
      secondaryColor: template?.secondaryColor || '#065f46',
      accentColor: template?.accentColor || '#fbbf24',
      textColor: template?.textColor || '#ffffff',
      backgroundPattern: template?.backgroundPattern || 'guilloche',
      logoUrl: template?.logoUrl || '',
      logoSize: template?.logoSize || 76,
      logoBgTransparent: template?.logoBgTransparent !== false,
      orientation: template?.orientation || 'vertical',
      nameFontSize: template?.nameFontSize || 'md',
    };

    const offlineData = {
      member: sanitizedMember,
      template: sanitizedTemplate,
      savedAt: now.toISOString(),
      expiresAt,
      token: sanitizedMember.lastViewToken,
      offlineSecurityCode,
    };

    localStorage.setItem(OFFLINE_CARD_STORAGE_KEY, JSON.stringify(offlineData));
    // Trigger local storage event so other components immediately know
    window.dispatchEvent(new CustomEvent('offline_card_updated'));
    return {
      success: true,
      expiresAt,
      savedAt: now.toISOString(),
    };
  } catch (err) {
    console.warn('Erro ao salvar carteirinha no armazenamento offline:', err);
    return {
      success: false,
      expiresAt: '',
      savedAt: '',
    };
  }
}

export function getOfflineSavedCard(): {
  card: any | null;
  isValid: boolean;
  isExpired: boolean;
  remainingMs: number;
  formattedRemaining: string;
  savedDateStr: string;
  expiryDateStr: string;
} {
  try {
    const raw = localStorage.getItem(OFFLINE_CARD_STORAGE_KEY);
    if (!raw) {
      return {
        card: null,
        isValid: false,
        isExpired: true,
        remainingMs: 0,
        formattedRemaining: '00h 00m 00s',
        savedDateStr: '',
        expiryDateStr: '',
      };
    }

    const data = JSON.parse(raw);
    const now = Date.now();
    const expiryTime = new Date(data.expiresAt).getTime();
    const remainingMs = Math.max(0, expiryTime - now);
    const isExpired = remainingMs <= 0;

    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');

    return {
      card: data,
      isValid: !isExpired,
      isExpired,
      remainingMs,
      formattedRemaining: `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`,
      savedDateStr: new Date(data.savedAt).toLocaleString('pt-BR'),
      expiryDateStr: new Date(data.expiresAt).toLocaleString('pt-BR'),
    };
  } catch (e) {
    return {
      card: null,
      isValid: false,
      isExpired: true,
      remainingMs: 0,
      formattedRemaining: '00h 00m 00s',
      savedDateStr: '',
      expiryDateStr: '',
    };
  }
}

export function clearOfflineSavedCard(): void {
  try {
    localStorage.removeItem(OFFLINE_CARD_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('offline_card_updated'));
  } catch (e) {
    // ignore
  }
}
