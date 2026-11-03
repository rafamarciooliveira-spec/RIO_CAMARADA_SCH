/** Fechamento de período: depois de fechado, nenhum lançamento entra com data no mês. Reabrir exige motivo. */
import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { monthsBack, periodLabel, todayIn } from '../../../app/formHelpers.ts';
import { P } from '../../../shared/paths.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import type { PeriodDoc } from '../../../shared/types.ts';
import { Badge, Button, Field, Loading, Modal, Money, Textarea, useConfirm } from '../../../ui/index.tsx';

export default function PeriodsTab() {
  const t = useTenant();
  const confirm = useConfirm();
  const { run, busy } = useOp();
  const periods = useList<PeriodDoc>(P.periods(t.tenantId));
  const [reopen, setReopen] = useState('');
  const [reason, setReason] = useState('');
  const canApprove = t.can('financeiro', 'aprovar');
  const months = monthsBack(todayIn(t.tenant.timezone).slice(0, 7), 12);
  if (periods.loading) return <Loading />;
  const byKey = new Map(periods.data.map(p => [p.id, p]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Feche cada mês depois de conferir os lançamentos e a conciliação. Os totais ficam guardados no fechamento.</p>
      <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
        {months.map(m => {
          const p = byKey.get(m);
          const last = p?.history?.[p.history.length - 1];
          return (
            <li key={m} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between px-4 py-3">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {periodLabel(m)} {p?.closed ? <Badge tone="ok">Fechado</Badge> : <Badge>Aberto</Badge>}
                </div>
                {p?.totals && (
                  <div className="text-xs text-muted">
                    Receitas <Money cents={p.totals.inCents} /> · Despesas <Money cents={p.totals.outCents} />
                  </div>
                )}
                {last && (
                  <div className="text-[11px] text-muted">
                    {last.action === 'fechado' ? 'Fechado' : 'Reaberto'} em {formatDateTime(last.at, t.tenant.timezone)}
                    {last.reason ? `: ${last.reason}` : ''}
                  </div>
                )}
              </div>
              {canApprove &&
                (p?.closed ? (
                  <Button size="sm" variant="secondary" icon={<LockOpen className="w-4 h-4" />} onClick={() => (setReopen(m), setReason(''))}>
                    Reabrir
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    icon={<Lock className="w-4 h-4" />}
                    loading={busy}
                    onClick={async () => {
                      const ok = await confirm({ title: `Fechar ${periodLabel(m)}?`, text: 'Depois de fechado, nenhum lançamento novo entra com data neste mês. Lançamentos pendentes de aprovação impedem o fechamento.', confirmLabel: 'Fechar período' });
                      if (ok) await run('periods.close', { tenantId: t.tenantId, periodKey: m }, { success: 'Período fechado.' });
                    }}
                  >
                    Fechar
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!reopen}
        onClose={() => setReopen('')}
        title={`Reabrir ${periodLabel(reopen)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopen('')}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 5}
              onClick={async () => {
                if (await run('periods.reopen', { tenantId: t.tenantId, periodKey: reopen, reason: reason.trim() }, { success: 'Período reaberto.' })) setReopen('');
              }}
            >
              Reabrir período
            </Button>
          </>
        }
      >
        <Field label="Motivo" required hint="Fica registrado no período e na auditoria.">
          {id => <Textarea id={id} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  );
}
