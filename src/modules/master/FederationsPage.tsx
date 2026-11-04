/** Federações no painel da plataforma: criar, escolher as filiais e a diretoria da federação. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useOp } from '../../app/DataContext.tsx';
import { normalizeSlug } from '../../shared/slug.ts';
import { formatBRL } from '../../shared/money.ts';
import type { FederationDoc } from '../../shared/types.ts';
import { Badge, Button, EmptyState, Field, Input, Loading, Modal, MoneyInput, Notice, PageHeader, Table, Textarea, Toggle } from '../../ui/index.tsx';

interface TenantLite {
  id: string;
  name: string;
  slug: string;
  federation: string;
}

const blank = { name: '', slug: '', tenantIds: [] as string[], adminEmails: '', networkCard: true, pricePerMemberCents: 240, primaryColor: '#1f3b2d' };

export default function FederationsPage({ tenants }: { tenants: TenantLite[] }) {
  const { run, busy } = useOp();
  const [rows, setRows] = useState<FederationDoc[] | null>(null);
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const reload = async () => setRows((await run<FederationDoc[]>('federation.list', {}, { silent: true })) || []);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!rows) return <Loading />;
  const name = (id: string) => tenants.find(t => t.id === id)?.name || id;
  const save = async () => {
    if (!edit) return;
    const emails = edit.adminEmails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
    const r = await run(
      'federation.save',
      { ...(edit.id ? { id: edit.id } : {}), name: edit.name.trim(), slug: normalizeSlug(edit.slug || edit.name), tenantIds: edit.tenantIds, adminEmails: emails, networkCard: edit.networkCard, pricePerMemberCents: edit.pricePerMemberCents, primaryColor: edit.primaryColor, requestId: `fed_${edit.id || 'nova'}_${Date.now()}` },
      { success: 'Federação salva.' }
    );
    if (r) {
      setEdit(null);
      reload();
    }
  };
  return (
    <>
      <PageHeader
        title="Federações"
        subtitle="Várias sociedades como filiais: diretoria própria, painel só com números, transferência entre filiais e carteirinha aceita na rede."
        actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setEdit({ ...blank })}>Nova federação</Button>}
      />
      <Table
        rows={rows}
        onRowClick={f => setEdit({ id: f.id, name: f.name, slug: f.slug, tenantIds: f.tenantIds, adminEmails: f.adminEmails.join(', '), networkCard: f.networkCard, pricePerMemberCents: f.pricePerMemberCents, primaryColor: f.primaryColor })}
        empty={<EmptyState title="Nenhuma federação ainda" text="Crie uma federação e escolha as sociedades que são filiais dela." />}
        columns={[
          { key: 'n', label: 'Federação', render: f => <div><div className="font-medium">{f.name}</div><div className="text-xs text-muted">/federacao/{f.slug}</div></div> },
          { key: 'f', label: 'Filiais', render: f => f.tenantIds.length },
          { key: 'v', label: 'Por titular', render: f => formatBRL(f.pricePerMemberCents), hideOnMobile: true },
          { key: 'c', label: 'Carteirinha na rede', render: f => <Badge tone={f.networkCard ? 'ok' : 'neutral'}>{f.networkCard ? 'aceita' : 'não'}</Badge>, hideOnMobile: true },
          { key: 'p', label: '', render: f => <Link className="text-xs text-accent" to={`/federacao/${f.slug}`} onClick={e => e.stopPropagation()}>Abrir painel</Link> },
        ]}
      />
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? edit.name : 'Nova federação'} size="lg" footer={<Button loading={busy} disabled={edit.name.trim().length < 3} onClick={save}>Salvar</Button>}>
          <div className="space-y-4">
            <Field label="Nome" required>{id => <Input id={id} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} placeholder="Federação Catarinense de Tiro" />}</Field>
            <Field label="Endereço do painel" hint="Fica em /federacao/endereco">{id => <Input id={id} value={edit.slug} onChange={e => setEdit({ ...edit, slug: normalizeSlug(e.target.value) })} placeholder={normalizeSlug(edit.name)} />}</Field>
            <Field label="Diretoria da federação (e-mails das contas Google)" hint="Separe por vírgula. Essas pessoas veem o painel da federação, sem dados pessoais dos sócios.">
              {id => <Textarea id={id} value={edit.adminEmails} onChange={e => setEdit({ ...edit, adminEmails: e.target.value })} />}
            </Field>
            <div>
              <div className="text-sm font-semibold mb-2">Filiais</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {tenants.map(t => {
                  const other = t.federation && t.federation !== edit.name;
                  return (
                    <Toggle
                      key={t.id}
                      label={other ? `${t.name} (já é de ${t.federation})` : t.name}
                      disabled={!!other && !edit.tenantIds.includes(t.id)}
                      checked={edit.tenantIds.includes(t.id)}
                      onChange={v => setEdit({ ...edit, tenantIds: v ? [...edit.tenantIds, t.id] : edit.tenantIds.filter(x => x !== t.id) })}
                    />
                  );
                })}
              </div>
              {edit.tenantIds.length > 0 && <p className="text-xs text-muted mt-2">Escolhidas: {edit.tenantIds.map(name).join(', ')}</p>}
            </div>
            <Field label="Valor por sócio titular ativo, por mês" hint="Somando todas as filiais. Dependentes não contam.">{id => <MoneyInput id={id} value={edit.pricePerMemberCents} onChange={c => setEdit({ ...edit, pricePerMemberCents: c })} />}</Field>
            <Toggle label="Carteirinha de uma filial vale na portaria das outras" checked={edit.networkCard} onChange={v => setEdit({ ...edit, networkCard: v })} />
            <Notice>A federação nunca vê CPF, contato ou dados dos sócios. Cada filial continua dona do seu cadastro.</Notice>
          </div>
        </Modal>
      )}
    </>
  );
}
