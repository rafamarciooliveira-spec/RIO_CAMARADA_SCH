/** Patrimônio e acervo: inventário por tipo, empréstimo e devolução, manutenção e acervo histórico. */
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { formatDate } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import type { AssetDoc } from '../../shared/types.ts';
import { Badge, Button, Field, Input, Section, Select } from '../../ui/index.tsx';
import { CrudPage, opts, type CrudConfig, type Doc } from './CrudPage.tsx';

const KIND = { traje: 'Trajes', instrumento: 'Instrumentos', trofeu: 'Troféus', livro: 'Biblioteca', equipamento: 'Equipamentos', acervo: 'Acervo histórico', outro: 'Outros' };
const KIND_ONE = { traje: 'Traje', instrumento: 'Instrumento', trofeu: 'Troféu', livro: 'Livro', equipamento: 'Equipamento', acervo: 'Peça de acervo', outro: 'Outro' };
const COND = { otimo: 'Ótimo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim' };

export default function AssetsPage() {
  const t = useTenant();
  const [kind, setKind] = useState('');
  const today = todayIn(t.tenant.timezone);
  const config: CrudConfig = {
    collection: 'assets',
    title: 'Patrimônio e acervo',
    subtitle: 'Inventário, empréstimos, manutenção e acervo histórico digital.',
    singular: 'item',
    icon: <Package className="w-5 h-5" />,
    query: { orderBy: [['code', 'asc']] },
    searchKeys: ['name', 'code', 'location'],
    filter: r => !kind || r.kind === kind,
    defaults: () => ({ code: '', name: '', kind: kind || 'traje', location: '', condition: 'bom', valueCents: 0, historical: false }),
    createExtra: () => ({ maintenance: [] }),
    fields: [
      { key: 'code', label: 'Código (etiqueta)', type: 'text', max: 40 },
      { key: 'name', label: 'Nome', type: 'text', required: true, max: 150 },
      { key: 'kind', label: 'Tipo', type: 'select', options: opts(KIND_ONE) },
      { key: 'location', label: 'Onde fica', type: 'text', max: 150 },
      { key: 'condition', label: 'Estado', type: 'select', options: opts(COND) },
      { key: 'valueCents', label: 'Valor estimado', type: 'money' },
      { key: 'historical', label: 'Faz parte do acervo histórico (não sai por empréstimo)', type: 'toggle' },
    ],
    columns: [
      { key: 'c', label: 'Código', render: a => <span className="tabular-nums">{String(a.code || '')}</span>, hideOnMobile: true },
      { key: 'n', label: 'Item', render: a => <div><div className="font-medium">{String(a.name)}</div><div className="text-xs text-muted">{KIND_ONE[a.kind as keyof typeof KIND_ONE]} · {String(a.location || '')}</div></div> },
      { key: 'v', label: 'Valor', render: a => formatBRL(Number(a.valueCents)), hideOnMobile: true },
      {
        key: 's',
        label: 'Situação',
        render: a => {
          const loan = a.loan as AssetDoc['loan'];
          if (loan) return <Badge tone={loan.due < today ? 'bad' : 'warn'}>{loan.due < today ? 'Empréstimo atrasado' : 'Emprestado'}</Badge>;
          return a.historical ? <Badge tone="brand">Acervo</Badge> : <Badge tone="ok">Disponível</Badge>;
        },
      },
    ],
    toolbar: (
      <Select aria-label="Filtrar por tipo" value={kind} onChange={e => setKind(e.target.value)} className="sm:w-52">
        <option value="">Todos os tipos</option>
        {Object.entries(KIND).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </Select>
    ),
    detail: row => <AssetDetail a={row as unknown as AssetDoc & Doc} />,
    emptyText: 'Cadastre trajes, instrumentos, troféus, livros e peças do acervo.',
  };
  return <CrudPage config={config} />;
}

function AssetDetail({ a }: { a: AssetDoc & Doc }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const today = todayIn(t.tenant.timezone);
  const canEdit = t.can('patrimonio', 'editar');
  const [loan, setLoan] = useState({ to: '', since: today, due: today });
  const [ret, setRet] = useState({ condition: a.condition, note: '' });
  const [maint, setMaint] = useState({ date: today, note: '' });
  return (
    <div className="space-y-5 border-t border-line pt-4">
      <Section title="Empréstimo">
        {a.loan ? (
          <div className="space-y-2">
            <p className="text-sm">
              Com <strong>{a.loan.to}</strong> desde {formatDate(a.loan.since)}, devolução prevista em{' '}
              <span className={a.loan.due < today ? 'text-bad font-semibold' : ''}>{formatDate(a.loan.due)}</span>.
            </p>
            {canEdit && (
              <div className="grid sm:grid-cols-[10rem_1fr_auto] gap-2 items-end">
                <Field label="Estado na devolução">
                  {id => (
                    <Select id={id} value={ret.condition} onChange={e => setRet({ ...ret, condition: e.target.value as AssetDoc['condition'] })}>
                      {Object.entries(COND).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Observação">{id => <Input id={id} value={ret.note} maxLength={300} onChange={e => setRet({ ...ret, note: e.target.value })} />}</Field>
                <Button loading={busy} onClick={() => run('assets.return', { tenantId: t.tenantId, assetId: a.id, condition: ret.condition, ...(ret.note.trim() ? { note: ret.note.trim() } : {}) }, { success: 'Devolução registrada.' })}>
                  Registrar devolução
                </Button>
              </div>
            )}
          </div>
        ) : a.historical ? (
          <p className="text-sm text-muted">Peça do acervo histórico: não sai por empréstimo.</p>
        ) : canEdit ? (
          <div className="grid sm:grid-cols-[1fr_9rem_9rem_auto] gap-2 items-end">
            <Field label="Emprestar para">{id => <Input id={id} value={loan.to} maxLength={150} onChange={e => setLoan({ ...loan, to: e.target.value })} />}</Field>
            <Field label="Retirada">{id => <Input id={id} type="date" value={loan.since} onChange={e => setLoan({ ...loan, since: e.target.value })} />}</Field>
            <Field label="Devolver até">{id => <Input id={id} type="date" value={loan.due} onChange={e => setLoan({ ...loan, due: e.target.value })} />}</Field>
            <Button loading={busy} disabled={loan.to.trim().length < 2 || loan.due < loan.since} onClick={() => run('assets.loan', { tenantId: t.tenantId, assetId: a.id, to: loan.to.trim(), since: loan.since, due: loan.due }, { success: 'Empréstimo registrado.' })}>
              Emprestar
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Disponível.</p>
        )}
        {(a.loanHistory || []).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Histórico de empréstimos ({a.loanHistory!.length})</summary>
            <ul className="mt-2 space-y-1">
              {[...a.loanHistory!].reverse().map((h, i) => (
                <li key={i} className="text-xs">
                  {h.to}: {formatDate(h.since)} a {formatDate(h.returnedAt)}
                  {h.note ? ` (${h.note})` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>
      <Section title="Manutenção">
        <ul className="space-y-1 text-sm">
          {(a.maintenance || []).map((m, i) => (
            <li key={i}>
              <span className="text-muted">{formatDate(m.date)}:</span> {m.note}
            </li>
          ))}
          {!a.maintenance?.length && <li className="text-muted">Nenhum registro.</li>}
        </ul>
        {canEdit && (
          <div className="grid sm:grid-cols-[9rem_1fr_auto] gap-2 items-end">
            <Field label="Data">{id => <Input id={id} type="date" value={maint.date} onChange={e => setMaint({ ...maint, date: e.target.value })} />}</Field>
            <Field label="O que foi feito">{id => <Input id={id} value={maint.note} maxLength={300} onChange={e => setMaint({ ...maint, note: e.target.value })} />}</Field>
            <Button
              variant="secondary"
              loading={busy}
              disabled={!maint.note.trim()}
              onClick={async () => {
                const list = [...(a.maintenance || []), { date: maint.date, note: maint.note.trim() }].slice(-200);
                if (await run('generic.save', { tenantId: t.tenantId, collection: 'assets', id: a.id, data: { maintenance: list } }, { success: 'Manutenção registrada.' })) setMaint({ date: today, note: '' });
              }}
            >
              Registrar
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}
