/** Documentos para o sócio: estatuto, regimento e demais documentos permitidos, e as atas publicadas. */
import { useState } from 'react';
import { FileText, ScrollText } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { FileLink } from '../../app/uploads.tsx';
import { minutePdf } from '../../app/pdf.ts';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { LibraryDocDoc, MinuteDoc } from '../../shared/types.ts';
import { Button, Card, EmptyState, ErrorState, Loading, PageHeader, SearchBox, Section, Tabs } from '../../ui/index.tsx';
import { DOC_KIND } from './LibraryAdminPage.tsx';

export default function LibraryPage() {
  const t = useTenant();
  const [tab, setTab] = useState<'docs' | 'atas'>('docs');
  const [q, setQ] = useState('');
  const vis = t.board ? ['publico', 'socios', 'diretoria'] : ['publico', 'socios'];
  const docs = useList<LibraryDocDoc>(P.library(t.tenantId), { where: [['visibility', 'in', vis]], orderBy: [['folder', 'asc']] });
  const minutes = useList<MinuteDoc>(t.moduleOn('atas') ? P.minutes(t.tenantId) : null, { where: [['published', '==', true]], orderBy: [['updatedAt', 'desc']], limit: 200 });
  const term = q.trim().toLowerCase();
  const rows = docs.data.filter(d => !term || d.name.toLowerCase().includes(term) || d.folder.toLowerCase().includes(term));
  const groups = new Map<string, typeof rows>();
  for (const d of rows) groups.set(d.folder || 'Geral', [...(groups.get(d.folder || 'Geral') || []), d]);
  const mins = minutes.data.filter(m => !term || m.title.toLowerCase().includes(term) || m.number.includes(term));

  return (
    <div className="space-y-4">
      <PageHeader title="Documentos" subtitle="Estatuto, regimento, atas publicadas e demais documentos da sociedade." />
      {t.moduleOn('atas') && <Tabs tabs={[{ id: 'docs', label: 'Documentos' }, { id: 'atas', label: 'Atas publicadas', count: minutes.data.length }]} value={tab} onChange={setTab} />}
      <SearchBox value={q} onChange={setQ} placeholder="Buscar documento" />
      {tab === 'docs' ? (
        docs.error ? (
          <ErrorState text={docs.error} />
        ) : docs.loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileText className="w-5 h-5" />} title="Nenhum documento disponível" />
        ) : (
          [...groups.entries()].map(([folder, list]) => (
            <Section key={folder} title={folder}>
              <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
                {list.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted">
                        {DOC_KIND[d.kind]} · versão {d.version}
                        {d.expiresAt ? ` · válido até ${formatDate(d.expiresAt)}` : ''}
                      </div>
                    </div>
                    {d.filePath ? <FileLink path={d.filePath} label="Abrir" /> : <span className="text-xs text-muted">Sem arquivo</span>}
                  </li>
                ))}
              </ul>
            </Section>
          ))
        )
      ) : minutes.loading ? (
        <Loading />
      ) : mins.length === 0 ? (
        <EmptyState icon={<ScrollText className="w-5 h-5" />} title="Nenhuma ata publicada" />
      ) : (
        <div className="space-y-2">
          {mins.map(m => (
            <Card key={m.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">Ata nº {m.number}</div>
                <div className="text-xs text-muted truncate">{m.title}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => minutePdf(t.tenant, m)}>
                PDF
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
