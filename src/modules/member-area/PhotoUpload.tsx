/**
 * Foto da carteirinha (do próprio sócio ou de um dependente): tirar agora, escolher da galeria
 * ou usar a foto da conta Google. Reduz para 600 px e tira os dados de localização (EXIF).
 */
import { useState } from 'react';
import { Camera, ImageIcon, UserRound } from 'lucide-react';
import { useData, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { randomId, resizeImage } from '../../utils/image.ts';
import { Notice } from '../../ui/index.tsx';

/** Foto do Google em tamanho maior, desenhada no canvas e devolvida como JPEG */
async function googlePhoto(url: string): Promise<Blob> {
  const big = url.replace(/=s\d+(-c)?$/, '=s600-c');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = big;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((ok, bad) => c.toBlob(b => (b ? ok(b) : bad(new Error('sem imagem'))), 'image/jpeg', 0.9));
}

export function PhotoUpload({ memberId, hasPhoto, own = true, onDone }: { memberId: string; hasPhoto: boolean; label?: string; own?: boolean; onDone?: () => void }) {
  const t = useTenant();
  const session = useSession();
  const { client, demo } = useData();
  const { run } = useOp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (get: () => Promise<Blob>) => {
    setBusy(true);
    setError('');
    try {
      if (demo) throw new Error('Na demonstração a foto não é enviada.');
      const blob = await resizeImage(await get(), 600, 'image/jpeg', 0.85);
      const path = `tenants/${t.tenantId}/members/${memberId}/photo/${randomId()}.jpg`;
      await client.upload(path, blob, 'image/jpeg');
      if (await run('members.setPhoto', { tenantId: t.tenantId, memberId, path }, { success: 'Foto enviada.' })) onDone?.();
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(/unauthorized|permission/i.test(msg) ? 'Sem permissão para enviar a foto agora. Avise a diretoria.' : msg || 'Não foi possível enviar a foto.');
    } finally {
      setBusy(false);
    }
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return setError('Foto grande demais (máximo de 15 MB).');
    send(async () => f);
  };
  const btn = `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`;
  const google = own ? session.user?.photoURL : undefined;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className={`${btn} bg-brand text-on-brand`}>
          <Camera className="w-4 h-4" aria-hidden />
          {busy ? 'Enviando...' : 'Tirar foto agora'}
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
        </label>
        <label className={`${btn} bg-surface-2 border border-line`}>
          <ImageIcon className="w-4 h-4" aria-hidden />
          {hasPhoto ? 'Trocar pela galeria' : 'Escolher da galeria'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
        </label>
        {google && (
          <button type="button" className={`${btn} bg-surface-2 border border-line`} disabled={busy} onClick={() => send(() => googlePhoto(google)).catch(() => undefined)}>
            <UserRound className="w-4 h-4" aria-hidden />
            Usar a foto da conta Google
          </button>
        )}
      </div>
      {error && <Notice tone="bad">{error.includes('sem imagem') || error.includes('decode') ? 'Não foi possível usar a foto do Google. Tire uma foto ou escolha da galeria.' : error}</Notice>}
    </div>
  );
}
