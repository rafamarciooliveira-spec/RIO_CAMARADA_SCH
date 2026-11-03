/**
 * CSV seguro para abrir no Excel: separador ";" (padrão brasileiro), aspas escapadas e
 * neutralização de fórmulas (CSV injection): células que começam com = + - @ tab ou CR
 * recebem um apóstrofo na frente.
 */
export function safeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildSafeCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map(r => r.map(safeCsvCell).join(';'));
  // BOM para o Excel reconhecer UTF-8 (acentos)
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
