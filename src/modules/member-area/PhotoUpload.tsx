/** Envio da foto da carteirinha (do próprio sócio ou de um dependente). Reduz para 600 px e tira o EXIF. */
import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useData, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { randomId, resizeImage } from '../../utils/image.ts';
import { Notice } from '../../ui/index.tsx';

export function PhotoUpload({ memberId, hasPhoto, label, onDone }: { memberId: string; hasPhoto: boolean; label?: string; onDone?: () => void }) {
  const t = useTenant();
  const { client, demo } = useData();
  const { run } = useOp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      if (demo) throw new Error('Na demonstração a foto não é enviada.');
      if (f.size > 15 * 1024 * 1024) throw new Error('Foto grande demais (máximo de 15 MB).');
      const blob = await resizeImage(f, 600, 'image/jpeg', 0.85);
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
  return (
    <div className="space-y-2">
      <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-on-brand cursor-pointer ${busy ? 'opacity-50' : ''}`}>
        <Camera className="w-4 h-4" aria-hidden />
        {busy ? 'Enviando...' : label || (hasPhoto ? 'Trocar foto' : 'Enviar foto')}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0])} />
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
