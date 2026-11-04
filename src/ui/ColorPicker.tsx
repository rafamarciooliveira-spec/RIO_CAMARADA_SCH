/**
 * Campo de cor com conta-gotas: toque num ponto da logo para pegar a cor exata
 * (funciona no celular) ou, no navegador que tiver, pegue de qualquer lugar da tela.
 */
import { useEffect, useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { Button, Input, Modal } from './index.tsx';

interface EyeDropperCtor {
  new (): { open(): Promise<{ sRGBHex: string }> };
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

export function ColorPicker({ id, value, onChange, imageSrc, label }: { id?: string; value: string; onChange: (v: string) => void; imageSrc?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const native = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined;
  const hasImage = !!imageSrc && /^(https?:|data:|blob:)/.test(imageSrc);
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-line bg-transparent cursor-pointer shrink-0" />
      <Input aria-label={`${label} em hexadecimal`} value={value} maxLength={7} className="font-mono text-xs" onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)} />
      {(hasImage || native) && (
        <button
          type="button"
          aria-label={`Conta-gotas para ${label}`}
          title="Conta-gotas"
          className="p-2 rounded-lg border border-line hover:bg-surface-2 cursor-pointer shrink-0"
          onClick={async () => {
            if (hasImage) return setOpen(true);
            try {
              const r = await new native!().open();
              onChange(r.sRGBHex);
            } catch {
              /* cancelado */
            }
          }}
        >
          <Pipette className="w-4 h-4" />
        </button>
      )}
      {open && hasImage && <PickFromImage src={imageSrc!} label={label} native={native} onPick={c => (onChange(c), setOpen(false))} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PickFromImage({ src, label, native, onPick, onClose }: { src: string; label: string; native?: EyeDropperCtor; onPick: (c: string) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = canvas.current;
      if (!c) return;
      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height);
    };
    img.onerror = () => setError('Não foi possível abrir a logo para pegar a cor.');
    img.src = src;
  }, [src]);
  const colorAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * c.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * c.height);
    try {
      const [R, G, B, A] = c.getContext('2d')!.getImageData(x, y, 1, 1).data;
      return A < 10 ? '' : `#${hex(R)}${hex(G)}${hex(B)}`;
    } catch {
      setError('Esta imagem não permite pegar a cor. Envie a logo de novo pelo botão Enviar imagem.');
      return '';
    }
  };
  return (
    <Modal open onClose={onClose} title={`Conta-gotas: ${label}`}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Toque no ponto da logo com a cor que você quer.</p>
        <div className="rounded-xl p-3 flex justify-center" style={{ background: 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 16px 16px' }}>
          <canvas
            ref={canvas}
            className="max-w-full h-auto cursor-crosshair touch-none"
            onPointerMove={e => setHover(colorAt(e))}
            onPointerDown={e => {
              const c = colorAt(e);
              if (c) onPick(c);
            }}
          />
        </div>
        {hover && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-6 h-6 rounded border border-line" style={{ background: hover }} />
            <span className="font-mono">{hover}</span>
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        {native && (
          <Button type="button" variant="secondary" size="sm" icon={<Pipette className="w-4 h-4" />} onClick={async () => {
            try {
              onPick((await new native().open()).sRGBHex);
            } catch {
              /* cancelado */
            }
          }}>
            Pegar de outro lugar da tela
          </Button>
        )}
      </div>
    </Modal>
  );
}
