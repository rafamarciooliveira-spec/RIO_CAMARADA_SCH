/** Organograma na área da diretoria: editar cargos (nome, grupo, novos cargos) e passar o cargo. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../../app/TenantContext.tsx';
import { Button, Loading, Notice, PageHeader } from '../../ui/index.tsx';
import { OrgChartView } from './OrgChartView.tsx';
import { HandoverPanel, MandatesGallery } from './Handover.tsx';
import { useChartDoc } from './OrgChartPage.tsx';
import { Editor } from './Editor.tsx';

export default function OrgChartAdminPage() {
  const t = useTenant();
  const { loading, saved, doc } = useChartDoc();
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [t.tenantId]);
  if (loading) return <Loading />;
  return (
    <>
      <PageHeader
        title="Organograma"
        subtitle="Cargos, nomes e quem ocupa cada um. Os sócios veem o organograma só para consulta."
        actions={!editing ? <Button onClick={() => setEditing(true)}>Editar cargos</Button> : undefined}
      />
      {t.moduleOn('mandatos') && (
        <Notice>
          A gestão atual usa estes mesmos cargos: trocar o nome de um cargo ou quem ocupa aqui atualiza a gestão, e o contrário também vale em{' '}
          <Link to={t.to('mandatos')} className="underline font-semibold">
            Gestões e mandatos
          </Link>
          .
        </Notice>
      )}
      <div className="mt-4">
        {editing ? (
          <Editor chart={doc} onClose={() => setEditing(false)} />
        ) : (
          <div className="space-y-5">
            <OrgChartView chart={doc} />
            {saved && <HandoverPanel chart={doc} />}
            <MandatesGallery />
          </div>
        )}
      </div>
    </>
  );
}
