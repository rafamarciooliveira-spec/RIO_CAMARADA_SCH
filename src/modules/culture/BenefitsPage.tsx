/** Clube de vantagens do sócio: benefícios ativos dos parceiros. */
import { Gift } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { BenefitDoc } from '../../shared/types.ts';
import { Badge, Card, EmptyState, ErrorState, Loading, PageHeader } from '../../ui/index.tsx';

export default function BenefitsPage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const list = useList<BenefitDoc>(P.benefits(t.tenantId), { where: [['active', '==', true]], orderBy: [['partner', 'asc']] });
  const rows = list.data.filter(b => !b.validUntil || b.validUntil >= today);
  return (
    <div className="space-y-4">
      <PageHeader title="Benefícios" subtitle={`Descontos de parceiros para quem é ${t.labels.member.toLowerCase()} da ${t.tenant.name}. Apresente sua ${t.labels.card.toLowerCase()}.`} />
      {list.error ? (
        <ErrorState text={list.error} />
      ) : list.loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Gift className="w-5 h-5" />} title="Nenhum benefício disponível agora" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {rows.map(b => (
            <Card key={b.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{b.partner}</h2>
                {b.discount && <Badge tone="brand">{b.discount}</Badge>}
              </div>
              {b.description && <p className="text-sm text-muted whitespace-pre-line">{b.description}</p>}
              {b.validUntil && <p className="text-xs text-muted">Válido até {formatDate(b.validUntil)}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
