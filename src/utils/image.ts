/**
 * Imagens no navegador: redimensiona com canvas (o que também remove EXIF, inclusive GPS)
 * e confere o tipo real pelos primeiros bytes antes de subir.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Tipo real pelos bytes iniciais (não confia na extensão nem no type do arquivo) */
export async function sniffImageType(file: Blob): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Redesenha a imagem em no máximo maxPx no lado maior. Sai sem metadados. */
export async function resizeImage(file: Blob, maxPx: number, type: 'image/jpeg' | 'image/png' = 'image/jpeg', quality = 0.86): Promise<Blob> {
  const real = await sniffImageType(file);
  if (!real) throw new Error('Envie uma imagem JPG, PNG ou WEBP.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Seu navegador não conseguiu processar a imagem.');
    if (type === 'image/jpeg') {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, type, quality));
    if (!blob) throw new Error('Não foi possível converter a imagem.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
