/**
 * Brazilian CPF validation and formatting utility (LGPD and accuracy compliance)
 */

export function cleanCPF(cpf?: string | null): string {
  if (!cpf || typeof cpf !== 'string') return '';
  return cpf.replace(/\D/g, '');
}

export function formatCPF(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  const digits = cleanCPF(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function maskCPF(cpf?: string | null): string {
  if (!cpf || typeof cpf !== 'string') return '***.***.***-**';
  const digits = cleanCPF(cpf);
  if (digits.length === 0) return '***.***.***-**';
  if (digits.length < 11) return formatCPF(cpf);
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

export function validateCPF(cpf?: string | null): boolean {
  if (!cpf || typeof cpf !== 'string') return false;
  const clean = cleanCPF(cpf);
  if (clean.length !== 11) return false;

  // Disallow known invalid sequences (e.g. 00000000000, 11111111111)
  if (/^(\d)\1{10}$/.test(clean)) return false;

  // Check first digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  // Check second digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}
