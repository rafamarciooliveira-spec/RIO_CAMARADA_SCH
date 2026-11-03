/** Anexos: envio para o Storage pela camada de dados (pdf ou imagem até 10 MB) e lista com abertura. */
import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useData, useFileUrl } from './DataContext.tsx';
import { Button, useToast } from '../ui/index.tsx';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

function ext(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() || '';
  if (/^(pdf|png|jpe?g|webp)$/.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  return file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1] || 'bin';
}

export function uuid(): string {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Sobe um arquivo e devolve o caminho no Storage (ou null se recusado) */
export function useUpload() {
  const { client } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, folder: string, allowed = ALLOWED): Promise<string | null> => {
    if (!allowed.includes(file.type)) {
      toast.show('Envie um arquivo PDF ou imagem (PNG, JPG ou WEBP).', 'erro');
      return null;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show('O arquivo passa de 10 MB.', 'erro');
      return null;
    }
    setBusy(true);
    try {
      const path = `${folder.replace(/\/$/, '')}/${uuid()}.${ext(file)}`;
      await client.upload(path, file, file.type);
      return path;
    } catch {
      toast.show('Não foi possível enviar o arquivo. Tente de novo.', 'erro');
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

export function FileLink({ path, label }: { path: string; label?: string }) {
  const url = useFileUrl(path);
  const name = label || path.split('/').pop() || 'arquivo';
  if (!url) return <span className="text-xs text-muted">{name}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent underline break-all">
      {name}
    </a>
  );
}

/** Campo de anexos: tenants/{t}/attachments/{modulo}/{uuid}.{ext} */
export function AttachmentsField({ tenantId, module, value, onChange, max = 10, disabled }: { tenantId: string; module: string; value: string[]; onChange: (v: string[]) => void; max?: number; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {value.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
            <FileLink path={p} label={`Anexo ${i + 1}`} />
            {!disabled && (
              <button type="button" aria-label={`Remover anexo ${i + 1}`} className="p-1 rounded hover:bg-surface-2 cursor-pointer" onClick={() => onChange(value.filter(x => x !== p))}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && value.length < max && (
        <>
          <input
            ref={ref}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label="Escolher arquivo para anexar"
            onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const p = await upload(f, `tenants/${tenantId}/attachments/${module}`);
              if (p) onChange([...value, p]);
            }}
          />
          <Button type="button" size="sm" variant="secondary" loading={busy} icon={<Paperclip className="w-4 h-4" />} onClick={() => ref.current?.click()}>
            Anexar arquivo
          </Button>
          <p className="text-[11px] text-muted">PDF ou imagem, até 10 MB.</p>
        </>
      )}
    </div>
  );
}
