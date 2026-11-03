/** Patrocinadores (cotas, contratos, vencimentos) e clube de vantagens com parceiros. */
import { useState } from 'react';
import { Gift, Handshake } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { addDaysKey, formatDate } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import type { EventDoc } from '../../shared/types.ts';
import { Badge, PageHeader, Tabs } from '../../ui/index.tsx';
import { CrudPage, type CrudConfig } from './CrudPage.tsx';

export default function SponsorsPage() {
  const t = useTenant();
  const [tab, setTab] = useState<'patrocinios' | 'beneficios'>('patrocinios');
  const today = todayIn(t.tenant.timezone);
  const soon = addDaysKey(today, 30);
  const events = useList<EventDoc>(P.events(t.tenantId), { orderBy: [['start', 'desc']], limit: 100 });

  const sponsors: CrudConfig = {
    collection: 'sponsors',
    title: 'Patrocinadores',
    singular: 'patrocinador',
    icon: <Handshake className="w-5 h-5" />,
    query: { orderBy: [['contractEnd', 'asc']] },
    defaults: () => ({ name: '', tier: '', amountCents: 0, contractStart: today, contractEnd: addDaysKey(today, 365), counterparts: '', eventId: '' }),
    fields: [
      { key: 'name', label: 'Patrocinador', type: 'text', required: true, max: 150 },
      { key: 'tier', label: 'Cota', type: 'text', max: 60, placeholder: 'Ouro, prata, apoio cultural' },
      { key: 'amountCents', label: 'Valor', type: 'money' },
      { key: 'eventId', label: 'Evento (se for patrocínio de um evento)', type: 'select', optional: true, options: events.data.map(e => ({ value: e.id, label: e.name })) },
      { key: 'contractStart', label: 'Início do contrato', type: 'date', required: true },
      { key: 'contractEnd', label: 'Fim do contrato', type: 'date', required: true },
      { key: 'counterparts', label: 'Contrapartidas', type: 'textarea', max: 2000 },
    ],
    columns: [
      { key: 'n', label: 'Patrocinador', render: s => <div><div className="font-medium">{String(s.name)}</div><div className="text-xs text-muted">{String(s.tier || '')}</div></div> },
      { key: 'v', label: 'Valor', render: s => formatBRL(Number(s.amountCents)) },
      {
        key: 'f',
        label: 'Vencimento',
        render: s => {
          const end = String(s.contractEnd);
          return (
            <span className="flex items-center gap-2">
              {formatDate(end)}
              {end < today ? <Badge>Encerrado</Badge> : end <= soon ? <Badge tone="warn">Vence em breve</Badge> : null}
            </span>
          );
        },
      },
    ],
    emptyText: 'Cadastre as empresas parceiras, cotas e contrapartidas.',
  };

  const benefits: CrudConfig = {
    collection: 'benefits',
    title: 'Clube de vantagens',
    singular: 'benefício',
    icon: <Gift className="w-5 h-5" />,
    query: { orderBy: [['partner', 'asc']] },
    searchKeys: ['partner', 'description'],
    defaults: () => ({ partner: '', description: '', discount: '', validUntil: '', active: true }),
    fields: [
      { key: 'partner', label: 'Parceiro', type: 'text', required: true, max: 150 },
      { key: 'discount', label: 'Desconto', type: 'text', max: 60, placeholder: 'Ex.: 10% à vista' },
      { key: 'validUntil', label: 'Válido até', type: 'date', optional: true },
      { key: 'active', label: 'Visível para os sócios', type: 'toggle' },
      { key: 'description', label: 'Como usar', type: 'textarea', max: 1000 },
    ],
    columns: [
      { key: 'p', label: 'Parceiro', render: b => <span className="font-medium">{String(b.partner)}</span> },
      { key: 'd', label: 'Desconto', render: b => String(b.discount || '') },
      { key: 'a', label: 'Situação', render: b => (!b.active ? <Badge>Oculto</Badge> : b.validUntil && String(b.validUntil) < today ? <Badge tone="warn">Vencido</Badge> : <Badge tone="ok">Ativo</Badge>) },
    ],
    emptyText: 'Ofereça descontos de parceiros aos sócios. Eles veem a lista em Benefícios.',
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Patrocínios e benefícios" subtitle="Cotas, contratos e vencimentos, e o clube de vantagens dos sócios." />
      <Tabs tabs={[{ id: 'patrocinios', label: 'Patrocinadores' }, { id: 'beneficios', label: 'Clube de vantagens' }]} value={tab} onChange={setTab} />
      {tab === 'patrocinios' ? <CrudPage config={sponsors} embedded /> : <CrudPage config={benefits} embedded />}
    </div>
  );
}
