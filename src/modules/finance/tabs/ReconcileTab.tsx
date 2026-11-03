/** Conciliação: importa extrato OFX e casa cada linha com um lançamento (sugestão por valor e data ±3 dias). */
import { useMemo, useRef, useState } from 'react';
import { Link2, Unlink, Upload, Wand2 } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { formatDate } from '../../../shared/dates.ts';
import { suggestMatches } from '../../../shared/finance/reports.ts';
import type { LedgerEntryDoc, StatementLineDoc } from '../../../shared/types.ts';
import { Badge, Button, EmptyState, ErrorState, Loading, Money, Notice, Select, Stat, useToast } from '../../../ui/index.tsx';
import { useFinanceCatalog } from '../common.tsx';

export default function ReconcileTab() {
  const t = useTenant();
  const toast = useToast();
  const cat = useFinanceCatalog();
  const { run, busy } = useOp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [acc, setAcc] = useState('');
  const accountId = acc || cat.accounts.data[0]?.id || '';
  const lines = useList<StatementLineDoc>(accountId ? P.statementLines(t.tenantId) : null, { where: [['accountId', '==', accountId]], orderBy: [['date', 'desc']], limit: 300 });
  const entries = useList<LedgerEntryDoc>(accountId ? P.ledger(t.tenantId) : null, { where: [['accountId', '==', accountId]], orderBy: [['date', 'desc']], limit: 1000 });
  const sug = useMemo(() => suggestMatches(lines.data, entries.data), [lines.data, entries.data]);
  const byId = new Map(entries.data.map(e => [e.id, e]));
  const canEdit = t.can('financeiro', 'editar');
  const matched = lines.data.filter(l => l.matchedEntryId).length;

  const importFile = async (file: File) => {
    if (file.size > 3_000_000) return toast.show('O arquivo passa de 3 MB.', 'erro');
    const text = await file.text();
    const r = await run<{ imported: number; duplicates: number }>('finance.importStatement', { tenantId: t.tenantId, accountId, ofx: text });
    if (r) toast.show(`${r.imported} linha(s) importada(s)${r.duplicates ? `, ${r.duplicates} já existia(m)` : ''}.`, 'sucesso');
  };

  if (cat.loading) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Select aria-label="Conta do extrato" value={accountId} onChange={e => setAcc(e.target.value)} className="sm:w-56">
          {cat.accounts.data.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        {canEdit && (
          <div className="flex gap-2 sm:ml-auto">
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.OFX,application/x-ofx,text/plain"
              className="sr-only"
              aria-label="Escolher extrato OFX"
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importFile(f);
              }}
            />
            <Button size="sm" icon={<Upload className="w-4 h-4" />} loading={busy} onClick={() => fileRef.current?.click()}>
              Importar OFX
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Wand2 className="w-4 h-4" />}
              disabled={!Object.keys(sug).length}
              onClick={async () => {
                const r = await run<{ matched: number }>('finance.reconcile', { tenantId: t.tenantId, autoAccountId: accountId });
                if (r) toast.show(`${r.matched} linha(s) conciliada(s) automaticamente.`, 'sucesso');
              }}
            >
              Conciliar sugestões únicas
            </Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Linhas do extrato" value={lines.data.length} />
        <Stat label="Conciliadas" value={`${matched} de ${lines.data.length}`} tone={matched === lines.data.length && matched ? 'ok' : 'warn'} />
      </div>
      {lines.error ? (
        <ErrorState text={lines.error} />
      ) : lines.loading ? (
        <Loading />
      ) : !lines.data.length ? (
        <EmptyState title="Nenhum extrato importado" text="Baixe o extrato OFX no internet banking e importe aqui. Linhas repetidas não são duplicadas." />
      ) : (
        <ul className="space-y-2">
          {lines.data.map(l => {
            const m = l.matchedEntryId ? byId.get(l.matchedEntryId) : null;
            const cands = (sug[l.id] || []).map(id => byId.get(id)!).filter(Boolean);
            return (
              <li key={l.id} className="bg-surface border border-line rounded-2xl p-3 sm:p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{l.memo || 'Sem descrição'}</div>
                    <div className="text-xs text-muted">{formatDate(l.date)}</div>
                  </div>
                  <Money cents={l.amountCents} className={`font-semibold ${l.amountCents >= 0 ? 'text-ok' : 'text-bad'}`} />
                </div>
                {l.matchedEntryId ? (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <Badge tone="ok">Conciliada</Badge>
                      {m ? `Lançamento nº ${m.number}: ${m.description}` : 'Lançamento vinculado'}
                    </span>
                    {canEdit && (
                      <Button size="sm" variant="ghost" icon={<Unlink className="w-3.5 h-3.5" />} onClick={() => run('finance.reconcile', { tenantId: t.tenantId, lineId: l.id, unmatch: true })}>
                        Desfazer
                      </Button>
                    )}
                  </div>
                ) : cands.length ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted">Sugestões:</div>
                    {cands.slice(0, 3).map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">
                          nº {c.number} · {formatDate(c.date)} · {c.description}
                        </span>
                        {canEdit && (
                          <Button size="sm" variant="secondary" icon={<Link2 className="w-3.5 h-3.5" />} onClick={() => run('finance.reconcile', { tenantId: t.tenantId, lineId: l.id, entryId: c.id }, { success: 'Linha conciliada.' })}>
                            Casar
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Notice tone="warn">Sem lançamento correspondente. Lance o movimento no livro caixa e volte aqui.</Notice>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
