/** Biblioteca de documentos (gestão): pastas, visibilidade, versões, validade com alerta e envio de arquivos. */
import { useRef, useState } from 'react';
import { BookOpen, Upload } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { LibraryDocDoc } from '../../shared/types.ts';
import { todayIn } from '../../app/formHelpers.ts';
import { FileLink, useUpload } from '../../app/uploads.tsx';
import { addDaysKey, formatDate } from '../../shared/dates.ts';
import { Badge, Button, Field, Select } from '../../ui/index.tsx';
import { CrudPage, opts, type CrudConfig } from './CrudPage.tsx';

export const DOC_KIND = { estatuto: 'Estatuto', regimento: 'Regimento interno', ata: 'Ata', certidao: 'Certidão', alvara: 'Alvará', seguro: 'Seguro', contrato: 'Contrato', outro: 'Outro' };
export const VISIBILITY = { publico: 'Público', socios: 'Sócios', diretoria: 'Só diretoria' };

export default function LibraryAdminPage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const soon = addDaysKey(today, 30);
  const [folder, setFolder] = useState('');
  const all = useList<LibraryDocDoc>(P.library(t.tenantId));
  const folders = [...new Set(all.data.map(d => d.folder).filter(Boolean))].sort();
  const config: CrudConfig = {
    collection: 'library',
    title: 'Biblioteca de documentos',
    subtitle: 'Estatuto, regimento, certidões, alvarás, seguros e contratos, com validade e alerta de vencimento.',
    singular: 'documento',
    icon: <BookOpen className="w-5 h-5" />,
    query: { orderBy: [['folder', 'asc']] },
    searchKeys: ['name', 'folder'],
    filter: r => !folder || r.folder === folder,
    defaults: () => ({ name: '', folder: 'Geral', visibility: 'diretoria', kind: 'outro', expiresAt: '', version: 1 }),
    fields: [
      { key: 'name', label: 'Nome', type: 'text', required: true, max: 200 },
      { key: 'folder', label: 'Pasta', type: 'text', max: 80, hint: 'Ex.: Institucional, Certidões, Editais/Nome do projeto' },
      { key: 'kind', label: 'Tipo', type: 'select', options: opts(DOC_KIND) },
      { key: 'visibility', label: 'Quem vê', type: 'select', options: opts(VISIBILITY) },
      { key: 'expiresAt', label: 'Validade (certidões, alvarás, seguros)', type: 'date', optional: true, hint: 'A diretoria recebe alerta 30 dias antes.' },
    ],
    toData: (form, row) => {
      const changedFile = !!form.filePath && form.filePath !== row?.filePath;
      return {
        ...Object.fromEntries(Object.entries(form).filter(([k]) => ['name', 'folder', 'kind', 'visibility', 'expiresAt'].includes(k) && form[k] !== '')),
        ...(form.filePath ? { filePath: form.filePath } : {}),
        version: row ? Number(row.version || 1) + (changedFile && row.filePath ? 1 : 0) : 1,
      };
    },
    formExtra: (form, set, row) => <FileField tenantId={t.tenantId} value={String(form.filePath || '')} onChange={p => set({ filePath: p })} version={Number(row?.version || 1)} hadFile={!!row?.filePath} />,
    columns: [
      { key: 'n', label: 'Documento', render: d => <div><div className="font-medium">{String(d.name)}</div><div className="text-xs text-muted">{String(d.folder || '')} · v{String(d.version || 1)}</div></div> },
      { key: 'v', label: 'Quem vê', render: d => VISIBILITY[d.visibility as keyof typeof VISIBILITY], hideOnMobile: true },
      {
        key: 'e',
        label: 'Validade',
        render: d => {
          const e = d.expiresAt ? String(d.expiresAt) : '';
          if (!e) return <span className="text-muted text-xs">Sem validade</span>;
          return (
            <span className="flex items-center gap-2">
              {formatDate(e)}
              {e < today ? <Badge tone="bad">Vencido</Badge> : e <= soon ? <Badge tone="warn">Vence em breve</Badge> : null}
            </span>
          );
        },
      },
    ],
    emptyText: 'Guarde aqui os documentos oficiais da sociedade.',
  };
  return (
    <CrudPage
      config={{
        ...config,
        toolbar: (
          <Select aria-label="Filtrar por pasta" value={folder} onChange={e => setFolder(e.target.value)} className="sm:w-52">
            <option value="">Todas as pastas</option>
            {folders.map(f => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        ),
      }}
    />
  );
}

function FileField({ tenantId, value, onChange, version, hadFile }: { tenantId: string; value: string; onChange: (p: string) => void; version: number; hadFile: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useUpload();
  return (
    <Field label="Arquivo" hint={hadFile ? `Enviar um arquivo novo cria a versão ${version + 1}.` : 'PDF ou imagem, até 10 MB.'}>
      {() => (
        <div className="flex flex-wrap items-center gap-3">
          {value && <FileLink path={value} label="Abrir arquivo atual" />}
          <input
            ref={ref}
            type="file"
            className="sr-only"
            aria-label="Escolher arquivo do documento"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const p = await upload(f, `tenants/${tenantId}/library`);
              if (p) onChange(p);
            }}
          />
          <Button type="button" size="sm" variant="secondary" loading={busy} icon={<Upload className="w-4 h-4" />} onClick={() => ref.current?.click()}>
            {value ? 'Trocar arquivo' : 'Enviar arquivo'}
          </Button>
        </div>
      )}
    </Field>
  );
}
