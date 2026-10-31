/**
 * Logo Color Extraction & Palette Generator
 * Analyzes uploaded association logo images or vector presets
 * to produce brand-harmonized color palettes for the digital card.
 */

export interface ExtractedLogoPalette {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  detectedSwatches: string[];
  sourceName: string;
}

// Preset vector emblems mappings to authentic corporate/heraldic palettes
const PRESET_EMBLEM_PALETTES: Record<string, ExtractedLogoPalette> = {
  shield: {
    primaryColor: '#0f172a',
    secondaryColor: '#1e293b',
    accentColor: '#fbbf24',
    textColor: '#ffffff',
    detectedSwatches: ['#0f172a', '#1e293b', '#3b82f6', '#fbbf24', '#ffffff'],
    sourceName: 'Brasão Imperial',
  },
  heart: {
    primaryColor: '#4c0519',
    secondaryColor: '#881337',
    accentColor: '#f43f5e',
    textColor: '#ffffff',
    detectedSwatches: ['#4c0519', '#881337', '#e11d48', '#f43f5e', '#ffe4e6'],
    sourceName: 'Ação Social & Apoio',
  },
  landmark: {
    primaryColor: '#1e1b4b',
    secondaryColor: '#312e81',
    accentColor: '#818cf8',
    textColor: '#ffffff',
    detectedSwatches: ['#1e1b4b', '#312e81', '#4338ca', '#818cf8', '#e0e7ff'],
    sourceName: 'Institucional Cívico',
  },
  scale: {
    primaryColor: '#18181b',
    secondaryColor: '#27272a',
    accentColor: '#eab308',
    textColor: '#ffffff',
    detectedSwatches: ['#18181b', '#27272a', '#ca8a04', '#eab308', '#fef08a'],
    sourceName: 'Direito & Justiça',
  },
  award: {
    primaryColor: '#064e3b',
    secondaryColor: '#022c22',
    accentColor: '#10b981',
    textColor: '#ffffff',
    detectedSwatches: ['#022c22', '#064e3b', '#059669', '#10b981', '#d1fae5'],
    sourceName: 'Medalha de Honra',
  },
  crown: {
    primaryColor: '#3b0764',
    secondaryColor: '#581c87',
    accentColor: '#f59e0b',
    textColor: '#ffffff',
    detectedSwatches: ['#3b0764', '#581c87', '#7e22ce', '#f59e0b', '#fde68a'],
    sourceName: 'Coroa & Nobreza',
  },
  flame: {
    primaryColor: '#431407',
    secondaryColor: '#7c2d12',
    accentColor: '#f97316',
    textColor: '#ffffff',
    detectedSwatches: ['#431407', '#7c2d12', '#c2410c', '#f97316', '#ffedd5'],
    sourceName: 'Chama Olímpica / Social',
  },
  globe: {
    primaryColor: '#082f49',
    secondaryColor: '#075985',
    accentColor: '#38bdf8',
    textColor: '#ffffff',
    detectedSwatches: ['#082f49', '#075985', '#0284c7', '#38bdf8', '#e0f2fe'],
    sourceName: 'Rede Global / Unidade',
  },
  users: {
    primaryColor: '#064e3b',
    secondaryColor: '#047857',
    accentColor: '#34d399',
    textColor: '#ffffff',
    detectedSwatches: ['#064e3b', '#047857', '#059669', '#34d399', '#a7f3d0'],
    sourceName: 'União Comunitária',
  },
  trees: {
    primaryColor: '#14532d',
    secondaryColor: '#166534',
    accentColor: '#84cc16',
    textColor: '#ffffff',
    detectedSwatches: ['#14532d', '#166534', '#15803d', '#84cc16', '#ecfccb'],
    sourceName: 'Ecológica & Sustentável',
  },
  building: {
    primaryColor: '#172554',
    secondaryColor: '#1e3a8a',
    accentColor: '#60a5fa',
    textColor: '#ffffff',
    detectedSwatches: ['#172554', '#1e3a8a', '#2563eb', '#60a5fa', '#dbeafe'],
    sourceName: 'Grêmio / Sede Social',
  },
  sparkles: {
    primaryColor: '#2e1065',
    secondaryColor: '#4c1d95',
    accentColor: '#a855f7',
    textColor: '#ffffff',
    detectedSwatches: ['#2e1065', '#4c1d95', '#6d28d9', '#a855f7', '#ede9fe'],
    sourceName: 'Estrela / Excelência',
  },
};

/**
 * Converts RGB numbers to HEX string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Calculates saturation of RGB [0..1]
 */
function getSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

/**
 * Calculates perceived brightness (0..255)
 */
function getBrightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Darkens a hex color for elegant card backgrounds
 */
function darkenColor(hex: string, factor = 0.4): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;

  return rgbToHex(r * factor, g * factor, b * factor);
}

/**
 * Extracts colors from an image element or Data URL using HTML5 Canvas
 */
export async function extractPaletteFromLogo(logoKeyOrUrl: string): Promise<ExtractedLogoPalette> {
  // If it's a known preset vector emblem
  if (PRESET_EMBLEM_PALETTES[logoKeyOrUrl]) {
    return PRESET_EMBLEM_PALETTES[logoKeyOrUrl];
  }

  // If not a data URL or valid image URL, return default fallback
  if (!logoKeyOrUrl || (!logoKeyOrUrl.startsWith('data:image') && !logoKeyOrUrl.startsWith('http'))) {
    return PRESET_EMBLEM_PALETTES.shield;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(PRESET_EMBLEM_PALETTES.shield);
            return;
          }

          const size = 64;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);

          const imgData = ctx.getImageData(0, 0, size, size).data;
          const colorMap = new Map<string, { r: number; g: number; b: number; count: number }>();

          for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];
            const a = imgData[i + 3];

            // Ignore transparent pixels or pure white/black extremes
            if (a < 120) continue;
            const brightness = getBrightness(r, g, b);
            if (brightness > 248 || brightness < 10) continue;

            // Quantize to bucket of 24 to aggregate close shades
            const qr = Math.round(r / 24) * 24;
            const qg = Math.round(g / 24) * 24;
            const qb = Math.round(b / 24) * 24;
            const key = `${qr},${qg},${qb}`;

            const entry = colorMap.get(key) || { r: qr, g: qg, b: qb, count: 0 };
            entry.count++;
            colorMap.set(key, entry);
          }

          const sortedColors = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);

          if (sortedColors.length === 0) {
            // Logo was completely monochrome or transparent
            resolve({
              primaryColor: '#0f172a',
              secondaryColor: '#020617',
              accentColor: '#10b981',
              textColor: '#ffffff',
              detectedSwatches: ['#0f172a', '#1e293b', '#10b981', '#ffffff'],
              sourceName: 'Logo Anexada',
            });
            return;
          }

          // Top detected hex swatches (up to 6)
          const swatches = sortedColors.slice(0, 6).map(c => rgbToHex(c.r, c.g, c.b));

          // Most frequent color
          const dominant = sortedColors[0];
          const dominantHex = rgbToHex(dominant.r, dominant.g, dominant.b);

          // Most saturated color (ideal for accent/border/details)
          let mostSaturated = sortedColors[0];
          let maxSat = getSaturation(dominant.r, dominant.g, dominant.b);

          for (const c of sortedColors.slice(0, 10)) {
            const sat = getSaturation(c.r, c.g, c.b);
            const bri = getBrightness(c.r, c.g, c.b);
            // Prefer vibrant colors with good visibility
            if (sat > maxSat && bri > 70 && bri < 225) {
              maxSat = sat;
              mostSaturated = c;
            }
          }
          const accentHex = rgbToHex(mostSaturated.r, mostSaturated.g, mostSaturated.b);

          // Create rich dark backgrounds suited for modern digital credentials
          const dominantBri = getBrightness(dominant.r, dominant.g, dominant.b);
          let primaryHex = dominantHex;
          let secondaryHex = darkenColor(dominantHex, 0.6);

          // If the dominant color is very light, darken it so white text and badges pop
          if (dominantBri > 140) {
            primaryHex = darkenColor(dominantHex, 0.35);
            secondaryHex = darkenColor(dominantHex, 0.18);
          } else if (dominantBri < 40) {
            // Already very dark, give subtle gradient variation
            secondaryHex = '#000000';
          }

          resolve({
            primaryColor: primaryHex,
            secondaryColor: secondaryHex,
            accentColor: accentHex || '#10b981',
            textColor: '#ffffff',
            detectedSwatches: swatches,
            sourceName: 'Logo Anexada',
          });
        } catch {
          resolve(PRESET_EMBLEM_PALETTES.shield);
        }
      };

      img.onerror = () => {
        resolve(PRESET_EMBLEM_PALETTES.shield);
      };

      img.src = logoKeyOrUrl;
    } catch {
      resolve(PRESET_EMBLEM_PALETTES.shield);
    }
  });
}
