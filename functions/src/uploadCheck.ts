/**
 * Conferência de uploads no servidor (trigger do Storage): tipo REAL pelos bytes iniciais
 * e tamanho por pasta. As regras do Storage conferem o tipo declarado; aqui conferimos o conteúdo.
 * Funções puras para poder testar sem emulador.
 */

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const MB = 1024 * 1024;
const IMAGES: SniffedType[] = ['image/jpeg', 'image/png', 'image/webp'];
const DOCS: SniffedType[] = [...IMAGES, 'application/pdf'];

export interface UploadPolicy {
  area: 'publico' | 'foto' | 'anexo' | 'biblioteca' | 'manual';
  maxBytes: number;
  types: SniffedType[];
}

/** Política da pasta; null = pasta que o cliente não grava (arquivos do próprio servidor) */
export function policyFor(path: string): UploadPolicy | null {
  if (path.includes('..') || path.includes('//')) return { area: 'anexo', maxBytes: 0, types: [] };
  if (/^tenants\/[^/]+\/public\/.+/.test(path)) return { area: 'publico', maxBytes: 2 * MB, types: IMAGES };
  if (/^tenants\/[^/]+\/members\/[^/]+\/photo\/[^/]+$/.test(path)) return { area: 'foto', maxBytes: 2 * MB, types: IMAGES };
  if (/^tenants\/[^/]+\/attachments\/[^/]+\/[^/]+$/.test(path)) return { area: 'anexo', maxBytes: 10 * MB, types: DOCS };
  if (/^tenants\/[^/]+\/library\/[^/]+$/.test(path)) return { area: 'biblioteca', maxBytes: 15 * MB, types: DOCS };
  if (/^tenants\/[^/]+\/handbook\/[^/]+$/.test(path)) return { area: 'manual', maxBytes: 15 * MB, types: ['application/pdf'] };
  return null;
}

/** Identifica o tipo pelos bytes mágicos (16 primeiros bastam) */
export function sniff(head: Uint8Array): SniffedType | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

function ascii(b: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...b.slice(from, to));
}

export type UploadVerdict = { ok: true } | { ok: false; reason: 'tamanho' | 'tipo' | 'tipo_declarado' | 'caminho' };

export function judgeUpload(path: string, size: number, declaredType: string | undefined, head: Uint8Array): UploadVerdict | null {
  const policy = policyFor(path);
  if (!policy) return null;
  if (policy.maxBytes === 0) return { ok: false, reason: 'caminho' };
  if (size <= 0 || size > policy.maxBytes) return { ok: false, reason: 'tamanho' };
  const real = sniff(head);
  if (!real || !policy.types.includes(real)) return { ok: false, reason: 'tipo' };
  if ((declaredType || '').toLowerCase() !== real) return { ok: false, reason: 'tipo_declarado' };
  return { ok: true };
}
