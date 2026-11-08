/**
 * Foto escolhida ANTES de o cadastro existir (ficha de proposta e inclusão de dependente):
 * fica no aparelho, já reduzida para 600 px e sem dados de localização, e sobe depois que o
 * servidor cria o cadastro (as regras do Storage só deixam o dono enviar).
 */
import { useEffect, useState } from 'react';
import { Camera, ImageIcon } from 'lucide-react';
import type { DataClient } from '../../data/client.ts';
import { randomId, resizeImage } from '../../utils/image.ts';
import { cx } from '../../ui/index.tsx';

export function PhotoPick({ value, onChange, error, label = 'Foto para a carteirinha', required }: { value: Blob | null; onChange: (b: Blob | null) => void; error?: string; label?: string; required?: boolean }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!value) return setUrl('');
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setProblem('');
    if (f.size > 15 * 1024 * 1024) return setProblem('Foto grande demais (máximo de 15 MB).');
    setBusy(true);
    try {
      onChange(await resizeImage(f, 600, 'image/jpeg', 0.85));
    } catch (e) {
      setProblem((e as Error).message || 'Não foi possível usar esta foto.');
    } finally {
      setBusy(false);
    }
  };
  const btn = cx('inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer', busy && 'opacity-50 pointer-events-none');
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {label}
        {required && <span className="text-bad"> *</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className={cx('w-20 h-24 rounded-xl border overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center', error ? 'border-bad' : 'border-line')}>
          {url ? <img src={url} alt="Foto escolhida" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-muted" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={cx(btn, 'bg-brand text-on-brand')}>
            <Camera className="w-4 h-4" aria-hidden />
            {busy ? 'Preparando...' : url ? 'Tirar outra' : 'Tirar foto'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          <label className={cx(btn, 'bg-surface-2 border border-line')}>
            <ImageIcon className="w-4 h-4" aria-hidden />
            Galeria
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      <p className="text-xs text-muted">Rosto de frente, sem óculos escuros nem boné. Ela vai na carteirinha.</p>
      {(problem || error) && <p className="text-xs text-bad">{problem || error}</p>}
    </div>
  );
}

/** Sobe a foto escolhida para o cadastro recém-criado e grava no cadastro (members.setPhoto) */
export async function sendPickedPhoto(client: DataClient, call: (op: string, input: object) => Promise<unknown>, tenantId: string, memberId: string, blob: Blob) {
  const path = `tenants/${tenantId}/members/${memberId}/photo/${randomId()}.jpg`;
  await client.upload(path, blob, 'image/jpeg');
  await call('members.setPhoto', { tenantId, memberId, path });
}
