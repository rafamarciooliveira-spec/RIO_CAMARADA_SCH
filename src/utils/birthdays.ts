/**
 * Birthday calculations and filters adhering strictly to:
 * - Brasília Timezone (America/Sao_Paulo)
 * - Leap year: 29/02 celebrated on 28/02 in non-leap years
 * - Year crossover: late December through early January
 * - Privacy: NEVER calculates or exposes age/year to public members
 */

import { Member } from '../types/index.ts';

// Get current date in Brasília timezone (UTC-3)
export function getBrasiliaDate(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  // Brasília is UTC-3 (standard)
  const brasiliaOffset = -3 * 3600000;
  return new Date(utc + brasiliaOffset);
}

// Check if a year is leap year
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export interface ParsedBirthday {
  day: number;
  month: number; // 1-12
  effectiveDay: number;
  effectiveMonth: number;
  displayFormatted: string; // "15 de Outubro"
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function parseMemberBirthday(birthDateIsoOrBr: string, referenceYear?: number): ParsedBirthday | null {
  if (!birthDateIsoOrBr) return null;

  let d = 0;
  let m = 0;

  const str = birthDateIsoOrBr.trim();
  if (str.includes('-')) {
    // YYYY-MM-DD
    const parts = str.split('-');
    if (parts.length >= 3) {
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    }
  } else if (str.includes('/')) {
    // DD/MM/YYYY
    const parts = str.split('/');
    if (parts.length >= 2) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
    }
  }

  if (isNaN(d) || isNaN(m) || d <= 0 || m <= 0 || m > 12) return null;

  const currentYear = referenceYear || getBrasiliaDate().getFullYear();
  let effectiveDay = d;
  let effectiveMonth = m;

  // Feb 29 rule: If born on 29/02 and current year is NOT a leap year, celebrate on 28/02
  if (d === 29 && m === 2) {
    if (!isLeapYear(currentYear)) {
      effectiveDay = 28;
      effectiveMonth = 2;
    }
  }

  const monthName = MONTH_NAMES[m - 1] || '';
  const displayFormatted = `${d.toString().padStart(2, '0')} de ${monthName}`;

  return {
    day: d,
    month: m,
    effectiveDay,
    effectiveMonth,
    displayFormatted,
  };
}

// Check if birthday is TODAY
export function isBirthdayToday(birthDateStr: string): boolean {
  const b = parseMemberBirthday(birthDateStr);
  if (!b) return false;

  const today = getBrasiliaDate();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;

  return b.effectiveDay === currentDay && b.effectiveMonth === currentMonth;
}

// Check if birthday is THIS WEEK (Monday to Sunday)
export function isBirthdayThisWeek(birthDateStr: string): boolean {
  const today = getBrasiliaDate();
  const currentYear = today.getFullYear();
  const b = parseMemberBirthday(birthDateStr, currentYear);
  if (!b) return false;

  // Determine Monday of current week
  const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
  const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Check candidate in current year
  const bDateCurrentYear = new Date(currentYear, b.effectiveMonth - 1, b.effectiveDay);
  if (bDateCurrentYear >= monday && bDateCurrentYear <= sunday) return true;

  // Check candidate in next year (for crossover weeks near end of December)
  const bDateNextYear = new Date(currentYear + 1, b.effectiveMonth - 1, b.effectiveDay);
  if (bDateNextYear >= monday && bDateNextYear <= sunday) return true;

  // Check candidate in previous year (for crossover weeks in early January)
  const bDatePrevYear = new Date(currentYear - 1, b.effectiveMonth - 1, b.effectiveDay);
  if (bDatePrevYear >= monday && bDatePrevYear <= sunday) return true;

  return false;
}

// Check if birthday is in the NEXT 7 DAYS (from today inclusive)
export function isBirthdayNext7Days(birthDateStr: string): boolean {
  const today = getBrasiliaDate();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  const b = parseMemberBirthday(birthDateStr, currentYear);
  if (!b) return false;

  const in7Days = new Date(today);
  in7Days.setDate(today.getDate() + 7);
  in7Days.setHours(23, 59, 59, 999);

  // Current year candidate
  const candCurrent = new Date(currentYear, b.effectiveMonth - 1, b.effectiveDay);
  if (candCurrent >= today && candCurrent <= in7Days) return true;

  // Next year candidate (e.g. Dec 29 checking into Jan 3)
  const candNext = new Date(currentYear + 1, b.effectiveMonth - 1, b.effectiveDay);
  if (candNext >= today && candNext <= in7Days) return true;

  return false;
}

// Check if birthday is in a specific month (1-12)
export function isBirthdayInMonth(birthDateStr: string, targetMonth: number): boolean {
  const b = parseMemberBirthday(birthDateStr);
  if (!b) return false;
  return b.month === targetMonth;
}

// Generate WhatsApp link for congratulations
export function getWhatsAppCongratulationsUrl(phone: string, memberName: string, associationName: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return '';

  const firstName = memberName.split(' ')[0] || memberName;
  const message = `Olá ${firstName}! 🎉 Parabéns pelo seu aniversário! Desejamos muitas felicidades, saúde e realizações em nome de toda a diretoria e família da ${associationName}! 🎯🎂`;

  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
