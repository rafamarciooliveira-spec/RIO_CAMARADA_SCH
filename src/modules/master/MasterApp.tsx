/**
 * Painel master da plataforma (/master). Exige a claim `master` (concedida por script) e MFA.
 * Não mostra dados pessoais: só agregados. Acesso de suporte exige motivo, prazo e fica auditado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Building2, Flag, Inbox, LayoutDashboard, LogOut, Network, Plus, ScrollText, ShieldCheck, Tags } from 'lucide-react';
import FederationsPage from './FederationsPage.tsx';
import { ThemeToggle } from '../../ui/ThemeToggle.tsx';
import { useData, useList, useOp, useSession, useDoc } from '../../app/DataContext.tsx';
import { P } from '../../shared/paths.ts';
import { MODULES, type ModuleId } from '../../shared/modules.ts';
import type { PlanDoc, PlanRequestDoc } from '../../shared/types.ts';
import { normalizeSlug } from '../../shared/slug.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import { BRAND } from '../../brand.ts';
import { BR_STATES, SOCIETY_TYPES } from '../../shared/societyTypes.ts';
import { Badge, Button, Card, cx, EmptyState, Field, Input, Loading, Modal, MoneyInput, Notice, PageHeader, Select, Stat, Table, Textarea, Toggle, useConfirm } from '../../ui/index.tsx';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: 'ativa' | 'suspensa';
  planId: string;
  planName: string;
  maxMembers: number;
  modules?: Partial<Record<ModuleId, boolean>>;
  createdAt: string;
  membersTotal: number;
  active: number;
  holders: number;
  dependents: number;
  pending: number;
  federation: string;
  monthlyCents: number;
  billingStatus: string;
  billingProvider: string;
  pendingRequest: string | null;
}

interface Overview {
  rows: TenantRow[];
  totals: { tenants: number; active: number; holders: number; monthlyCents: number };
  requests: (PlanRequestDoc & { id: string })[];
}

function useOverview() {
  const { run } = useOp();
  const [data, setData] = useState<Overview | null>(null);
  const reload = async () => {
    const [ov, list] = await Promise.all([run<Overview>('billing.overview', {}, { silent: true }), run<{ id: string; modules: TenantRow['modules'] }[]>('platform.listTenants', {}, { silent: true })]);
    if (!ov) return setData({ rows: [], totals: { tenants: 0, active: 0, holders: 0, monthlyCents: 0 }, requests: [] });
    const mods = new Map((list || []).map(t => [t.id, t.modules]));
    setData({ ...ov, rows: ov.rows.map(r => ({ ...r, modules: mods.get(r.id) || {} })) });
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { data, reload };
}

const BILLING: Record<string, [string, 'ok' | 'warn' | 'bad' | 'neutral']> = {
  ativa: ['em dia', 'ok'],
  atrasada: ['atrasada', 'warn'],
  cancelada: ['cancelada', 'bad'],
  sem_assinatura: ['manual', 'neutral'],
};

function SlugField({ value, onChange, onStatus }: { value: string; onChange: (v: string) => void; onStatus: (ok: boolean) => void }) {
  const { client } = useData();
  const [state, setState] = useState<{ checking: boolean; text: string; ok: boolean }>({ checking: false, text: '', ok: false });
  useEffect(() => {
    const slug = normalizeSlug(value);
    if (!slug) {
      setState({ checking: false, text: '', ok: false });
      onStatus(false);
      return;
    }
    setState(s => ({ ...s, checking: true }));
    // Checagem visual com espera; a reserva de verdade é feita por transação no servidor
    const id = setTimeout(async () => {
      try {
        const r = await client.call<{ available: boolean; reason: string; slug: string }>('platform.checkSlug', { slug });
        setState({ checking: false, ok: r.available, text: r.available ? `${BRAND.domain}/${r.slug} está livre` : r.reason });
        onStatus(r.available);
      } catch {
        setState({ checking: false, ok: false, text: 'Não foi possível checar agora.' });
        onStatus(false);
      }
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label="Endereço (slug)" required hint="Minúsculas, sem acento, letras, números e hífen." error={!state.checking && state.text && !state.ok ? state.text : null}>
      {id => (
        <>
          <Input id={id} value={value} onChange={e => onChange(normalizeSlug(e.target.value))} placeholder="sociedade-de-canto-exemplo" />
          {state.checking && <p className="text-[11px] text-muted mt-1">Verificando...</p>}
          {!state.checking && state.ok && <p className="text-[11px] text-ok mt-1">{state.text}</p>}
        </>
      )}
    </Field>
  );
}

function CreateTenant({ open, onClose, plans, onDone }: { open: boolean; onClose: () => void; plans: PlanDoc[]; onDone: () => void }) {
  const { run, busy } = useOp();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugOk, setSlugOk] = useState(false);
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('SC');
  const [kind, setKind] = useState(SOCIETY_TYPES[0].id);
  const [planId, setPlanId] = useState('');
  const [emails, setEmails] = useState('');
  const [result, setResult] = useState<{ slug: string; invites: { email: string; link: string }[] } | null>(null);
  useEffect(() => {
    if (!open) {
      setStep(1);
      setName('');
      setSlug('');
      setCity('');
      setEmails('');
      setResult(null);
    }
  }, [open]);
  useEffect(() => {
    if (!planId && plans[0]) setPlanId(plans[0].id);
  }, [plans, planId]);
  const adminEmails = emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const create = async () => {
    const r = await run<{ slug: string; invites: { email: string; link: string }[] }>('platform.createTenant', { name, slug, planId, city, state: uf, societyType: kind, adminEmails }, { success: 'Sociedade criada.' });
    if (r) {
      setResult(r);
      onDone();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Nova sociedade" size="lg">
      {result ? (
        <div className="space-y-3">
          <Notice tone="ok">Sociedade criada em {BRAND.domain}/{result.slug}. Os convites de administração vencem em 14 dias.</Notice>
          <p className="text-sm text-muted">Se o e-mail não saiu de verdade (ambiente local), copie os links abaixo e envie para cada pessoa. Cada link é de uso único e exige entrar com o mesmo e-mail.</p>
          {result.invites.map(i => (
            <Card key={i.email} className="space-y-1">
              <div className="text-sm font-semibold">{i.email}</div>
              <code className="block text-[11px] break-all text-muted">{i.link}</code>
            </Card>
          ))}
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 text-xs">
            {['Identificação', 'Plano', 'Administradores'].map((l, i) => (
              <span key={l} className={cx('px-2 py-1 rounded-lg', step === i + 1 ? 'bg-accent text-black font-semibold' : 'bg-surface-2 text-muted')}>
                {i + 1}. {l}
              </span>
            ))}
          </div>
          {step === 1 && (
            <div className="space-y-3">
              <Field label="Nome da sociedade" required>{id => <Input id={id} value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(normalizeSlug(e.target.value)); }} />}</Field>
              <SlugField value={slug} onChange={setSlug} onStatus={setSlugOk} />
              <Field label="Tipo da sociedade" hint="Define rótulos, cargos do organograma, formato das competições e as notícias da região. Tudo pode ser ajustado depois.">
                {id => (
                  <Select id={id} value={kind} onChange={e => setKind(e.target.value)}>
                    {SOCIETY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label="Cidade">{id => <Input id={id} value={city} onChange={e => setCity(e.target.value)} />}</Field>
                <Field label="UF">
                  {id => (
                    <Select id={id} value={uf} onChange={e => setUf(e.target.value)}>
                      {BR_STATES.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <div className="flex justify-end"><Button disabled={name.trim().length < 3 || !slugOk} onClick={() => setStep(2)}>Continuar</Button></div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Field label="Plano">
                {id => (
                  <Select id={id} value={planId} onChange={e => setPlanId(e.target.value)}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} (até {p.maxMembers} sócios)</option>)}
                  </Select>
                )}
              </Field>
              {plans.length === 0 && <Notice tone="warn">Cadastre um plano antes de criar sociedades.</Notice>}
              <div className="flex justify-between"><Button variant="secondary" onClick={() => setStep(1)}>Voltar</Button><Button disabled={!planId} onClick={() => setStep(3)}>Continuar</Button></div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <Field label="E-mails dos administradores (presidência)" hint="Um ou mais, separados por vírgula. Cada um recebe um convite de uso único." required>
                {id => <Textarea id={id} value={emails} onChange={e => setEmails(e.target.value)} placeholder="presidencia@exemplo.org" />}
              </Field>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(2)}>Voltar</Button>
                <Button loading={busy} disabled={adminEmails.length === 0} onClick={create}>Criar sociedade</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function TenantDetail({ row, plans, onClose, onChanged }: { row: TenantRow; plans: PlanDoc[]; onClose: () => void; onChanged: () => void }) {
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(2);
  const toggleStatus = async () => {
    const suspend = row.status === 'ativa';
    const ok = await confirm({
      title: suspend ? 'Suspender sociedade' : 'Reativar sociedade',
      text: suspend ? 'Ninguém da sociedade consegue usar o sistema enquanto estiver suspensa. As carteirinhas param de validar.' : 'A sociedade volta a usar o sistema normalmente.',
      danger: suspend,
      requireText: suspend ? row.slug : undefined,
    });
    if (!ok) return;
    await run('platform.updateTenant', { tenantId: row.id, status: suspend ? 'suspensa' : 'ativa' }, { success: 'Situação atualizada.' });
    onChanged();
  };
  return (
    <Modal open onClose={onClose} title={row.name} size="lg">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Sócios" value={row.membersTotal} />
        <Stat label="Ativos" value={row.active} hint={`Limite ${row.maxMembers.toLocaleString('pt-BR')}`} tone={row.active > row.maxMembers ? 'warn' : undefined} />
        <Stat label="Titulares cobrados" value={row.holders} hint={`${row.dependents} dependente(s)`} />
        <Stat label="Valor do mês" value={formatBRL(row.monthlyCents)} hint={row.federation ? `Pela federação ${row.federation}` : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={row.status === 'ativa' ? 'ok' : 'bad'}>{row.status}</Badge>
        <Badge tone={(BILLING[row.billingStatus] || BILLING.sem_assinatura)[1]}>Assinatura {(BILLING[row.billingStatus] || BILLING.sem_assinatura)[0]}</Badge>
        {row.pending > 0 && <Badge tone="info">{row.pending} cadastro(s) para aprovar</Badge>}
        <span className="text-xs text-muted">{BRAND.domain}/{row.slug}</span>
      </div>
      <Field label="Plano" hint="Trocar o plano liga e desliga os módulos conforme o plano.">
        {id => (
          <Select id={id} value={row.planId} onChange={async e => { await run('platform.updateTenant', { tenantId: row.id, planId: e.target.value }, { success: 'Plano alterado.' }); onChanged(); }}>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
      </Field>
      <div>
        <div className="text-xs font-semibold text-muted mb-2">Módulos ligados</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {MODULES.filter(m => !m.core).map(m => (
            <Toggle key={m.id} label={m.label} checked={row.modules?.[m.id] !== false} onChange={async v => { await run('platform.updateTenant', { tenantId: row.id, modules: { [m.id]: v } }); onChanged(); }} />
          ))}
        </div>
      </div>
      <Card className="space-y-3">
        <div className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Acesso de suporte (leitura)</div>
        <p className="text-xs text-muted">Por padrão a plataforma não vê dados pessoais. O acesso de suporte exige motivo, dura no máximo 8 horas, fica na auditoria e a diretoria é avisada.</p>
        <Field label="Motivo" required>{id => <Textarea id={id} value={reason} onChange={e => setReason(e.target.value)} />}</Field>
        <Field label="Duração (horas)">{id => <Input id={id} type="number" min={1} max={8} value={hours} onChange={e => setHours(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />}</Field>
        <Button variant="secondary" loading={busy} disabled={reason.trim().length < 10} onClick={async () => {
          const r = await run<{ expiresAt: string }>('platform.supportAccess', { tenantId: row.id, reason, hours }, { success: 'Acesso aberto e diretoria avisada.' });
          if (r) setReason('');
        }}>Abrir acesso de suporte</Button>
        <Link className="text-xs text-accent" to={`/${row.slug}/gestao`}>Abrir o portal da sociedade</Link>
      </Card>
      <div className="flex justify-end">
        <Button variant={row.status === 'ativa' ? 'danger' : 'primary'} onClick={toggleStatus}>{row.status === 'ativa' ? 'Suspender' : 'Reativar'}</Button>
      </div>
    </Modal>
  );
}

function TenantsPage() {
  const { data, reload } = useOverview();
  const plans = useList<PlanDoc>(P.plans());
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<TenantRow | null>(null);
  if (!data) return <Loading />;
  const rows = data.rows;
  return (
    <>
      <PageHeader title="Sociedades" subtitle="Plano, situação, sócios e valor de cada sociedade. Só números: nenhum dado pessoal aparece aqui." actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>Nova sociedade</Button>} />
      <Table
        rows={rows}
        onRowClick={r => setOpen(r)}
        empty={<EmptyState title="Nenhuma sociedade ainda" action={<Button onClick={() => setCreating(true)}>Criar a primeira</Button>} />}
        columns={[
          { key: 'n', label: 'Sociedade', render: r => <div><div className="font-medium">{r.name}</div><div className="text-xs text-muted">/{r.slug}</div></div> },
          { key: 's', label: 'Situação', render: r => <div className="flex flex-col gap-1 items-start"><Badge tone={r.status === 'ativa' ? 'ok' : 'bad'}>{r.status}</Badge>{r.pendingRequest && <Badge tone="info">pediu troca</Badge>}</div> },
          { key: 'p', label: 'Plano', render: r => <div><div>{r.planName}</div>{r.federation && <div className="text-xs text-muted">{r.federation}</div>}</div>, hideOnMobile: true },
          { key: 'm', label: 'Ativos', render: r => `${r.active} / ${r.maxMembers.toLocaleString('pt-BR')}`, className: 'tabular-nums', hideOnMobile: true },
          { key: 'h', label: 'Titulares', render: r => r.holders, className: 'tabular-nums' },
          { key: 'v', label: 'Valor/mês', render: r => formatBRL(r.monthlyCents), className: 'tabular-nums' },
          { key: 'b', label: 'Assinatura', render: r => <Badge tone={(BILLING[r.billingStatus] || BILLING.sem_assinatura)[1]}>{(BILLING[r.billingStatus] || BILLING.sem_assinatura)[0]}</Badge>, hideOnMobile: true },
        ]}
      />
      <CreateTenant open={creating} onClose={() => setCreating(false)} plans={plans.data.filter(p => p.active)} onDone={reload} />
      {open && <TenantDetail row={open} plans={plans.data} onClose={() => setOpen(null)} onChanged={async () => { await reload(); setOpen(null); }} />}
    </>
  );
}

function RequestsPage() {
  const { data, reload } = useOverview();
  const plans = useList<PlanDoc>(P.plans());
  const { run, busy } = useOp();
  const [reason, setReason] = useState<Record<string, string>>({});
  if (!data) return <Loading />;
  const name = (id: string) => plans.data.find(p => p.id === id)?.name || id;
  const decide = async (id: string, approve: boolean) => {
    if (await run('billing.decideRequest', { requestId: id, approve, ...(reason[id]?.trim() ? { reason: reason[id].trim() } : {}) }, { success: approve ? 'Plano trocado.' : 'Pedido recusado.' })) reload();
  };
  return (
    <>
      <PageHeader title="Pedidos de troca de plano" subtitle="A diretoria da sociedade pede pelo portal; aprovar troca o plano e os módulos na hora." />
      {data.requests.length === 0 ? (
        <EmptyState title="Nenhum pedido esperando" />
      ) : (
        <div className="space-y-3">
          {data.requests.map(r => (
            <Card key={r.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.tenantName}</div>
                  <div className="text-sm text-muted">{name(r.fromPlanId)} para <strong>{name(r.toPlanId)}</strong>, {r.period} · {formatDateTime(r.at)}</div>
                </div>
              </div>
              {r.note && <p className="text-sm">Observação: {r.note}</p>}
              <Textarea aria-label="Motivo da recusa" value={reason[r.id] || ''} onChange={e => setReason({ ...reason, [r.id]: e.target.value })} placeholder="Motivo, se for recusar" />
              <div className="flex gap-2">
                <Button loading={busy} onClick={() => decide(r.id, true)}>Aprovar e trocar o plano</Button>
                <Button variant="secondary" loading={busy} disabled={(reason[r.id] || '').trim().length < 3} onClick={() => decide(r.id, false)}>Recusar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function FederationsRoute() {
  const { data } = useOverview();
  if (!data) return <Loading />;
  return <FederationsPage tenants={data.rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, federation: r.federation }))} />;
}

function PlansPage() {
  const plans = useList<PlanDoc>(P.plans());
  const { run, busy } = useOp();
  const [edit, setEdit] = useState<PlanDoc | null>(null);
  const blank: PlanDoc = { id: '', name: '', maxMembers: 300, modules: MODULES.map(m => m.id), priceCents: 0, pricePerMemberCents: 0, minMonthlyCents: 0, description: '', highlights: [], active: true };
  return (
    <>
      <PageHeader title="Planos e limites" subtitle="Cobrança por sócio titular ativo, por mês, com valor mínimo. Dependentes não contam." actions={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setEdit(blank)}>Novo plano</Button>} />
      <Table
        rows={plans.data}
        onRowClick={p => setEdit(p)}
        columns={[
          { key: 'n', label: 'Plano', render: p => p.name },
          { key: 'm', label: 'Limite de sócios', render: p => p.maxMembers },
          { key: 'v', label: 'Por titular', render: p => formatBRL(p.pricePerMemberCents || 0) },
          { key: 'min', label: 'Mínimo', render: p => formatBRL(p.minMonthlyCents || 0), hideOnMobile: true },
          { key: 'st', label: 'Stripe', render: p => <Badge tone={p.stripePriceMonthly ? 'ok' : 'neutral'}>{p.stripePriceMonthly ? 'configurado' : 'não'}</Badge>, hideOnMobile: true },
          { key: 'a', label: 'Situação', render: p => <Badge tone={p.active ? 'ok' : 'neutral'}>{p.active ? 'ativo' : 'inativo'}</Badge> },
        ]}
      />
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Plano ${edit.name}` : 'Novo plano'} size="lg" footer={<Button loading={busy} onClick={async () => {
          const id = edit.id || normalizeSlug(edit.name).replace(/-/g, '_') || 'plano';
          const { stripePriceMonthly, stripePriceAnnual, description, ...rest } = edit;
          const r = await run('platform.savePlan', { ...rest, id, ...(description ? { description } : {}), ...(stripePriceMonthly ? { stripePriceMonthly } : {}), ...(stripePriceAnnual ? { stripePriceAnnual } : {}) }, { success: 'Plano salvo.' });
          if (r) setEdit(null);
        }}>Salvar</Button>}>
          <Field label="Nome" required>{id => <Input id={id} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />}</Field>
          <Field label="Limite de sócios">{id => <Input id={id} type="number" value={edit.maxMembers} onChange={e => setEdit({ ...edit, maxMembers: Number(e.target.value) || 1 })} />}</Field>
          <Field label="Descrição curta">{id => <Input id={id} value={edit.description || ''} maxLength={200} onChange={e => setEdit({ ...edit, description: e.target.value })} />}</Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Valor por sócio titular ativo, por mês">{id => <MoneyInput id={id} value={edit.pricePerMemberCents || 0} onChange={c => setEdit({ ...edit, pricePerMemberCents: c })} />}</Field>
            <Field label="Valor mínimo do mês">{id => <MoneyInput id={id} value={edit.minMonthlyCents || 0} onChange={c => setEdit({ ...edit, minMonthlyCents: c })} />}</Field>
          </div>
          <Field label="O que o plano inclui (uma linha por item)" hint="Aparece na tela Plano e cobrança das sociedades.">
            {id => <Textarea id={id} value={(edit.highlights || []).join('\n')} onChange={e => setEdit({ ...edit, highlights: e.target.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 15) })} />}
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Stripe: preço mensal (price_...)" hint="Deixe vazio enquanto o Stripe não estiver ligado.">{id => <Input id={id} value={edit.stripePriceMonthly || ''} onChange={e => setEdit({ ...edit, stripePriceMonthly: e.target.value.trim() })} placeholder="price_..." />}</Field>
            <Field label="Stripe: preço anual (price_...)">{id => <Input id={id} value={edit.stripePriceAnnual || ''} onChange={e => setEdit({ ...edit, stripePriceAnnual: e.target.value.trim() })} placeholder="price_..." />}</Field>
          </div>
          <Toggle label="Plano ativo" checked={edit.active} onChange={v => setEdit({ ...edit, active: v })} />
          <div className="grid sm:grid-cols-2 gap-2">
            {MODULES.map(m => (
              <Toggle key={m.id} label={m.label} disabled={m.core} checked={m.core || edit.modules.includes(m.id)} onChange={v => setEdit({ ...edit, modules: v ? [...edit.modules, m.id] : edit.modules.filter(x => x !== m.id) })} />
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function FlagsPage() {
  const cfg = useDoc<{ flags?: Record<string, boolean> }>('platform/config');
  const { run } = useOp();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [newFlag, setNewFlag] = useState('');
  useEffect(() => setFlags(cfg.data?.flags || {}), [cfg.data]);
  return (
    <>
      <PageHeader title="Feature flags" subtitle="Liga e desliga recursos em teste para toda a plataforma." />
      <Card className="space-y-3">
        {Object.keys(flags).length === 0 && <p className="text-sm text-muted">Nenhuma flag.</p>}
        {Object.entries(flags).map(([k, v]) => <Toggle key={k} label={k} checked={v} onChange={nv => setFlags({ ...flags, [k]: nv })} />)}
        <div className="flex gap-2">
          <Input value={newFlag} onChange={e => setNewFlag(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())} placeholder="nova_flag" />
          <Button variant="secondary" onClick={() => { if (newFlag) setFlags({ ...flags, [newFlag]: false }); setNewFlag(''); }}>Adicionar</Button>
        </div>
        <Button onClick={() => run('platform.setFlags', { flags }, { success: 'Flags salvas.' })}>Salvar</Button>
      </Card>
    </>
  );
}

function AuditPage() {
  const rows = useList<{ action: string; actorUid: string; targetId?: string; at: string }>(P.platformAudit(), { orderBy: [['at', 'desc']], limit: 200 });
  return (
    <>
      <PageHeader title="Trilha de auditoria da plataforma" />
      {rows.loading ? <Loading /> : (
        <Table rows={rows.data} columns={[
          { key: 'a', label: 'Quando', render: r => formatDateTime(r.at) },
          { key: 'b', label: 'Ação', render: r => <code className="text-xs">{r.action}</code> },
          { key: 'c', label: 'Alvo', render: r => r.targetId || '', hideOnMobile: true },
          { key: 'd', label: 'Quem', render: r => <code className="text-xs">{r.actorUid.slice(0, 8)}</code>, hideOnMobile: true },
        ]} />
      )}
    </>
  );
}

function HealthPage() {
  const { data } = useOverview();
  const rows = data?.rows;
  const totals = useMemo(() => ({
    tenants: rows?.length || 0,
    active: rows?.filter(r => r.status === 'ativa').length || 0,
    members: rows?.reduce((a, r) => a + r.membersTotal, 0) || 0,
    holders: data?.totals.holders || 0,
    monthly: data?.totals.monthlyCents || 0,
    requests: data?.requests.length || 0,
  }), [rows, data]);
  return (
    <>
      <PageHeader title="Visão geral" subtitle="Métricas agregadas, sem dados pessoais." />
      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Sociedades" value={totals.tenants} />
        <Stat label="Ativas" value={totals.active} tone="ok" />
        <Stat label="Sócios na plataforma" value={totals.members} />
        <Stat label="Titulares cobrados" value={totals.holders} />
        <Stat label="Faturamento do mês (estimado)" value={formatBRL(totals.monthly)} tone="ok" />
        <Stat label="Pedidos de troca de plano" value={totals.requests} tone={totals.requests ? 'info' : undefined} />
      </div>
      <Card className="mt-4 space-y-2 text-sm">
        <div className="font-semibold">Saúde do sistema</div>
        <p className="text-muted">Erros e desempenho ficam no Cloud Logging e no Error Reporting do projeto (sem dados pessoais nos logs). Alertas de abuso: limites por IP e por usuário nas operações, registrados em rateLimits.</p>
      </Card>
    </>
  );
}

export default function MasterApp() {
  const session = useSession();
  if (session.loading) return <Loading />;
  if (!session.user) {
    return (
      <div className="max-w-sm mx-auto p-6 space-y-4">
        <h1 className="text-xl font-bold">Painel da plataforma</h1>
        <Button className="w-full" onClick={() => session.signInGoogle()}>Entrar com a Conta Google</Button>
      </div>
    );
  }
  if (!session.user.master) {
    return <div className="max-w-md mx-auto p-6"><Notice tone="bad">Esta conta não tem acesso ao painel da plataforma.</Notice></div>;
  }
  const nav = [
    { to: '', label: 'Visão geral', icon: LayoutDashboard },
    { to: 'sociedades', label: 'Sociedades', icon: Building2 },
    { to: 'pedidos', label: 'Pedidos de plano', icon: Inbox },
    { to: 'federacoes', label: 'Federações', icon: Network },
    { to: 'planos', label: 'Planos', icon: Tags },
    { to: 'flags', label: 'Feature flags', icon: Flag },
    { to: 'auditoria', label: 'Auditoria', icon: ScrollText },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <span className="font-display text-lg">{BRAND.name}</span>
          <Badge tone="brand">master</Badge>
          <Link to="/entrar" className="text-xs text-muted hover:text-fg">Trocar de acesso</Link>
          <div className="flex-1" />
          <ThemeToggle />
          <button onClick={() => session.signOut()} aria-label="Sair" className="p-2 rounded-xl hover:bg-surface-2 cursor-pointer"><LogOut className="w-5 h-5" /></button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {nav.map(n => (
            <NavLink key={n.to} end to={`/master/${n.to}`} className={({ isActive }) => cx('flex items-center gap-1.5 px-3 py-2 text-sm border-b-2', isActive ? 'border-accent' : 'border-transparent text-muted')}>
              <n.icon className="w-4 h-4" />{n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <Routes>
          <Route index element={<HealthPage />} />
          <Route path="sociedades" element={<TenantsPage />} />
          <Route path="pedidos" element={<RequestsPage />} />
          <Route path="federacoes" element={<FederationsRoute />} />
          <Route path="planos" element={<PlansPage />} />
          <Route path="flags" element={<FlagsPage />} />
          <Route path="auditoria" element={<AuditPage />} />
        </Routes>
      </main>
    </div>
  );
}
