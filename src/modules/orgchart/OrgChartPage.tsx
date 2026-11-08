/** Organograma na área do sócio: só para consultar. A edição fica na diretoria (OrgChartAdminPage). */
import { useDoc } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { OrgChartDoc } from '../../shared/types.ts';
import { societyType } from '../../shared/societyTypes.ts';
import { Loading, PageHeader } from '../../ui/index.tsx';
import { OrgChartView } from './OrgChartView.tsx';
import { MandatesGallery } from './Handover.tsx';

export function useChartDoc() {
  const t = useTenant();
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const doc: OrgChartDoc = chart.data || { style: societyType(t.tenant.societyType).orgStyle, title: t.labels.board, positions: [], showOnPublicPage: false, updatedAt: '' };
  return { loading: chart.loading, saved: !!chart.data, doc };
}

export default function OrgChartPage() {
  const t = useTenant();
  const { loading, doc } = useChartDoc();
  if (loading) return <Loading />;
  return (
    <>
      <PageHeader title={doc.title || 'Organograma'} subtitle={`Quem é quem na ${t.tenant.shortName || t.tenant.name}.`} />
      <div className="space-y-5">
        <OrgChartView chart={doc} />
        <MandatesGallery />
      </div>
    </>
  );
}
