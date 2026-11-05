/**
 * Ajuda a gerar o PNG/PDF da carteirinha no celular.
 * O iPhone (Safari) não consegue montar a imagem quando a foto do sócio entra no tamanho original
 * (fotos de câmera têm vários MB): por isso as imagens são reduzidas antes, e a montagem roda duas vezes
 * (na primeira o Safari ainda não decodificou as imagens de dentro do desenho).
 */

/** Reduz uma imagem (lado maior até maxPx) para data URL. Se falhar, devolve a original. */
export async function shrinkImage(src: string | null | undefined, maxPx = 360, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<string | null> {
  if (!src || !/^(https?:|blob:)/.test(src)) return src ?? null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // o Storage libera o acesso (cors.json); sem isso o canvas fica bloqueado
    img.src = src;
    await img.decode();
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG guarda a transparência de logos e adesivos; foto vai em JPEG (bem menor)
    return canvas.toDataURL(type, 0.88);
  } catch {
    return src;
  }
}

/** Espera todas as imagens do nó terminarem de carregar (ou falharem) */
export async function waitImages(el: HTMLElement): Promise<void> {
  await Promise.all(
    [...el.querySelectorAll('img')].map(img => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))
  );
}

/** Gera o PNG do nó; tenta de novo com resolução menor se o aparelho não aguentar */
export async function nodeToPng(el: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image');
  const opts = { cacheBust: false, backgroundColor: '#ffffff' };
  let last: unknown;
  for (const pixelRatio of [2, 1.5, 1]) {
    try {
      await toPng(el, { ...opts, pixelRatio }); // 1ª passada: o Safari só decodifica as imagens aqui
      const png = await toPng(el, { ...opts, pixelRatio });
      if (png.length > 5000) return png;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Não foi possível montar a imagem');
}
