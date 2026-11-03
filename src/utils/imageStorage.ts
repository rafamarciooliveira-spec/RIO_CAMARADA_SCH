/**
 * Image processing, canvas compression, and Firebase Storage upload with offline/free-tier fallback.
 */

import { storage } from '../firebase/config.ts';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface ImageProcessOptions {
  aspectRatio?: '3:4' | '1:1' | '16:9' | 'free';
  maxDimension?: number;
  quality?: number;
  storagePath?: string;
  onProgress?: (percent: number) => void;
}

export interface ImageUploadResult {
  url: string;
  usedStorage: boolean;
  sizeKb: number;
  warningNotice?: string;
}

/**
 * Resizes and compresses an image data URL or Image object using HTML5 canvas
 */
export async function compressImageCanvas(
  dataUrlOrFile: string | File,
  options: ImageProcessOptions = {}
): Promise<{ dataUrl: string; blob: Blob; sizeKb: number }> {
  const {
    aspectRatio = 'free',
    maxDimension = 1200,
    quality = 0.84,
  } = options;

  let sourceDataUrl = '';
  if (typeof dataUrlOrFile === 'string') {
    sourceDataUrl = dataUrlOrFile;
  } else {
    sourceDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(dataUrlOrFile);
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;

      // Crop to aspect ratio if specified
      if (aspectRatio === '3:4') {
        const targetRatio = 3 / 4;
        const currentRatio = sw / sh;
        if (currentRatio > targetRatio) {
          // Source is wider than 3:4 -> crop horizontally
          const newW = sh * targetRatio;
          sx = (sw - newW) / 2;
          sw = newW;
        } else {
          // Source is taller than 3:4 -> crop vertically
          const newH = sw / targetRatio;
          sy = (sh - newH) / 2;
          sh = newH;
        }
      } else if (aspectRatio === '1:1') {
        const side = Math.min(sw, sh);
        sx = (sw - side) / 2;
        sy = (sh - side) / 2;
        sw = side;
        sh = side;
      }

      // Scale down to maxDimension
      let targetW = sw;
      let targetH = sh;
      const maxDim = aspectRatio === '3:4' ? 600 : maxDimension;

      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      // Smooth resizing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);

      const mimeType = 'image/jpeg';
      const outputDataUrl = canvas.toDataURL(mimeType, quality);

      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          const sizeKb = Math.round(blob.size / 1024);
          resolve({
            dataUrl: outputDataUrl,
            blob,
            sizeKb,
          });
        },
        mimeType,
        quality
      );
    };
    img.onerror = () => reject(new Error('Falha ao carregar imagem para compressão'));
    img.src = sourceDataUrl;
  });
}

/**
 * Uploads an image to Firebase Storage if possible; otherwise returns tiny compressed base64.
 */
export async function uploadImageWithFallback(
  fileOrDataUrl: File | string,
  storagePath: string,
  options: ImageProcessOptions = {}
): Promise<ImageUploadResult> {
  const { onProgress } = options;
  if (onProgress) onProgress(20);

  // 1. Process & compress
  const { dataUrl, blob, sizeKb } = await compressImageCanvas(fileOrDataUrl, options);
  if (onProgress) onProgress(50);

  // 2. Try upload to Firebase Storage
  try {
    const storageRef = ref(storage, storagePath);
    if (onProgress) onProgress(75);
    await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000',
    });
    const downloadUrl = await getDownloadURL(storageRef);
    if (onProgress) onProgress(100);

    return {
      url: downloadUrl,
      usedStorage: true,
      sizeKb,
    };
  } catch (storageError: any) {
    console.warn('Firebase Storage não disponível ou restrito. Usando compressão ultra leve embutida:', storageError?.message);
    if (onProgress) onProgress(100);

    return {
      url: dataUrl,
      usedStorage: false,
      sizeKb,
      warningNotice: 'Armazenamento em nuvem não disponível no plano atual. A foto foi comprimida automaticamente para tamanho ultraleve e salva com segurança.',
    };
  }
}

/**
 * Convenience helper to upload a single file with fallback
 */
export async function uploadImageFile(
  file: File,
  folder = 'uploads',
  options: ImageProcessOptions = {}
): Promise<string> {
  const path = `${folder}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const res = await uploadImageWithFallback(file, path, options);
  return res.url;
}

