/** Contas, plano de contas e centros de custo (contas e plano não se apagam, só desativam). */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import type { ChartAccountDoc, CostCenterDoc, FinAccountDoc } from '../../../shared/types.ts';
import { Badge, Button, Field, Input, Loading, Modal, Money, MoneyInput, Section, Select, Table, Toggle, type Column } from '../../../ui/index.tsx';
import { useFinanceCatalog } from '../common.tsx';

type Kind = 'finAccounts' | 'chartAccounts' | 'costCenters';
type Editing = { kind: Kind; id?: string; data: Record<string, unknown> } | null;

export default function AccountsTab() {
  const t = useTenant();
  const cat = useFinanceCatalog();
  const [edit, setEdit] = useState<Editing>(null);
  const canCreate = t.can('financeiro', 'criar');
  const canEdit = t.can('financeiro', 'editar');
  if (cat.loading) return <Loading />;

  const accCols: Column<FinAccountDoc & { id: string }>[] = [
    { key: 'n', label: 'Conta', render: a => <span className="font-medium">{a.name}</span> },
    { key: 't', label: 'Tipo', render: a => (a.type === 'caixa' ? 'Caixa' : a.type === 'banco' ? 'Banco' : 'Pix'), hideOnMobile: true },
    { key: 's', label: 'Saldo', className: 'text-right', render: a => <Money cents={a.balanceCents || 0} /> },
    { key: 'a', label: 'Situação', render: a => (a.active === false ? <Badge>Desativada</Badge> : <Badge tone="ok">Ativa</Badge>) },
  ];
  const chartCols: Column<ChartAccountDoc & { id: string }>[] = [
    { key: 'c', label: 'Código', render: c => <span className="tabular-nums">{c.code}</span> },
    { key: 'n', label: 'Nome', render: c => c.name },
    { key: 'k', label: 'Natureza', render: c => <Badge tone={c.kind === 'receita' ? 'ok' : 'warn'}>{c.kind === 'receita' ? 'Receita' : 'Despesa'}</Badge> },
  ];
  const ccCols: Column<CostCenterDoc & { id: string }>[] = [
    { key: 'n', label: 'Centro de custo', render: c => c.name },
    { key: 'k', label: 'Tipo', render: c => ({ geral: 'Geral', evento: 'Evento', projeto: 'Projeto', edital: 'Edital' })[c.kind] || c.kind, hideOnMobile: true },
    { key: 'a', label: 'Situação', render: c => (c.active === false ? <Badge>Desativado</Badge> : <Badge tone="ok">Ativo</Badge>) },
  ];
  const addBtn = (kind: Kind, data: Record<string, unknown>) =>
    canCreate ? (
      <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ kind, data })}>
        Adicionar
      </Button>
    ) : undefined;
  const open = (kind: Kind) => (canEdit ? (r: { id: string }) => setEdit({ kind, id: r.id, data: { ...r } }) : undefined);

  return (
    <div className="space-y-8">
      <Section title="Contas (caixa, banco, Pix)" actions={addBtn('finAccounts', { name: '', type: 'banco', openingBalanceCents: 0, active: true })}>
        <Table rows={cat.accounts.data} columns={accCols} onRowClick={open('finAccounts')} />
      </Section>
      <Section title="Plano de contas" actions={addBtn('chartAccounts', { code: '', name: '', kind: 'despesa' })}>
        <Table rows={cat.chart.data} columns={chartCols} onRowClick={open('chartAccounts')} />
      </Section>
      <Section title="Centros de custo" actions={addBtn('costCenters', { name: '', kind: 'projeto', active: true })}>
        <Table rows={cat.costCenters.data} columns={ccCols} onRowClick={open('costCenters')} />
      </Section>
      {edit && <EditModal edit={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditModal({ edit, onClose }: { edit: NonNullable<Editing>; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [d, setD] = useState<Record<string, unknown>>(edit.data);
  const set = (k: string, v: unknown) => setD(x => ({ ...x, [k]: v }));
  const pickFields: Record<Kind, string[]> = {
    finAccounts: edit.id ? ['name', 'type', 'active'] : ['name', 'type', 'openingBalanceCents', 'active'],
    chartAccounts: ['code', 'name', 'kind'],
    costCenters: ['name', 'kind', 'active'],
  };
  const save = async () => {
    const data = Object.fromEntries(pickFields[edit.kind].map(k => [k, typeof d[k] === 'string' ? String(d[k]).trim() : d[k]]));
    const r = await run('generic.save', { tenantId: t.tenantId, collection: edit.kind, ...(edit.id ? { id: edit.id } : {}), data }, { success: 'Salvo.' });
    if (r) onClose();
  };
  const title = { finAccounts: 'Conta', chartAccounts: 'Conta do plano', costCenters: 'Centro de custo' }[edit.kind];
  const valid = String(d.name || '').trim().length >= 2 && (edit.kind !== 'chartAccounts' || String(d.code || '').trim());
  return (
    <Modal
      open
      onClose={onClose}
      title={edit.id ? `Editar ${title.toLowerCase()}` : `Nova ${title.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!valid} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      {edit.kind === 'chartAccounts' && (
        <Field label="Código" required hint="Ex.: 2.07">
          {id => <Input id={id} value={String(d.code || '')} maxLength={20} onChange={e => set('code', e.target.value)} />}
        </Field>
      )}
      <Field label="Nome" required>
        {id => <Input id={id} value={String(d.name || '')} maxLength={120} onChange={e => set('name', e.target.value)} />}
      </Field>
      {edit.kind === 'finAccounts' && (
        <>
          <Field label="Tipo">
            {id => (
              <Select id={id} value={String(d.type)} onChange={e => set('type', e.target.value)}>
                <option value="caixa">Caixa</option>
                <option value="banco">Banco</option>
                <option value="pix">Pix</option>
              </Select>
            )}
          </Field>
          {!edit.id && (
            <Field label="Saldo de abertura" hint="Saldo da conta no dia em que começa a ser usada aqui. Depois não muda.">
              {id => <MoneyInput id={id} value={Number(d.openingBalanceCents) || 0} onChange={v => set('openingBalanceCents', v)} />}
            </Field>
          )}
        </>
      )}
      {edit.kind === 'chartAccounts' && (
        <Field label="Natureza">
          {id => (
            <Select id={id} value={String(d.kind)} onChange={e => set('kind', e.target.value)} disabled={!!edit.id}>
              <option value="receita">Receita</option>
              <option value="despesa">Despesa</option>
            </Select>
          )}
        </Field>
      )}
      {edit.kind === 'costCenters' && (
        <Field label="Tipo">
          {id => (
            <Select id={id} value={String(d.kind)} onChange={e => set('kind', e.target.value)}>
              <option value="geral">Geral</option>
              <option value="evento">Evento</option>
              <option value="projeto">Projeto</option>
              <option value="edital">Edital</option>
            </Select>
          )}
        </Field>
      )}
      {edit.kind !== 'chartAccounts' && <Toggle checked={d.active !== false} onChange={v => set('active', v)} label={d.active !== false ? 'Ativa para novos lançamentos' : 'Desativada (histórico preservado)'} />}
      {edit.kind !== 'costCenters' && <p className="text-[11px] text-muted">Contas e plano de contas não são apagados, para não quebrar o histórico do livro caixa.</p>}
    </Modal>
  );
}
