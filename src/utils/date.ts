/**
 * Brazilian Date Formatter & Masking Utilities (LGPD & Padrão Nacional)
 * Format: DD/MM/AAAA (Dia / Mês / Ano)
 */

/**
 * Converts any date representation (YYYY-MM-DD, ISO, Timestamp, Date)
 * into Brazilian standard DD/MM/AAAA format without UTC timezone day-shift bugs.
 */
export function formatDateBR(val?: string | null | { seconds?: number } | Date, fallback = 'Não informado'): string {
  if (!val) return fallback;

  // Handle Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return fallback;
    return val.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  }

  // Handle Firestore Timestamp object { seconds, nanoseconds }
  if (typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
    try {
      const d = new Date(val.seconds * 1000);
      if (isNaN(d.getTime())) return fallback;
      return d.toLocaleDateString('pt-BR');
    } catch {
      return fallback;
    }
  }

  const str = String(val).trim();
  if (!str) return fallback;

  // If already in DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // If in YYYY-MM-DD format (standard HTML date input value)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
  }

  // Fallback to Date parser
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
  } catch {}

  return str || fallback;
}

/**
 * Masks input string into Brazilian date pattern: DD/MM/AAAA
 */
export function maskDateBR(val: string): string {
  if (!val) return '';
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

/**
 * Converts a Brazilian DD/MM/AAAA string to ISO YYYY-MM-DD for standard date storage
 */
export function dateBRToISO(val: string): string {
  if (!val) return '';
  const cleaned = val.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
    const [day, month, year] = cleaned.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

/**
 * Converts an ISO YYYY-MM-DD to DD/MM/AAAA
 */
export function isoToDateBR(val: string): string {
  return formatDateBR(val, '');
}

/**
 * Validates a Brazilian date string (DD/MM/AAAA)
 */
export function isValidDateBR(val: string): boolean {
  if (!val) return false;
  const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    // Check if ISO format
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      return isValidDayMonthYear(d, m, y);
    }
    return false;
  }

  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  return isValidDayMonthYear(d, m, y);
}

function isValidDayMonthYear(day: number, month: number, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}
