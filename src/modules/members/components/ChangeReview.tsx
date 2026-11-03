/** Pedido de alteração do sócio (dados ou retirada de dependente) para a diretoria aprovar ou recusar. */
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../../shared/dates.ts';
import type { MemberChangeDoc, MemberDoc } from '../../../shared/types.ts';
import { Button, Loading, Textarea } from '../../../ui/index.tsx';

export function ChangeReview({ m }: { m: MemberDoc & { id: string } }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [reason, setReason] = useState('');
  const list = useList<MemberChangeDoc>(m.changePending ? P.memberChanges(t.tenantId, m.id) : null, { where: [['status', '==', 'pendente']], limit: 1 });
  if (!m.changePending) return null;
  if (list.loading) return <Loading />;
  const c = list.data[0];
  if (!c) return null;
  const decide = (approve: boolean) =>
    run('members.reviewChange', { tenantId: t.tenantId, memberId: m.id, changeId: c.id, approve, ...(reason.trim() ? { reason: reason.trim() } : {}), requestId: `${c.id}_${approve}` }, { success: approve ? 'Alteração aprovada.' : 'Pedido recusado e sócio avisado.' });
  const rows: [string, string, string][] = [];
  if (c.fullName) rows.push(['Nome', c.before.fullName, c.fullName]);
  if (c.birthDate) rows.push(['Nascimento', c.before.birthDate ? formatDate(c.before.birthDate) : 'Não informado', formatDate(c.birthDate)]);
  if (c.cpfMasked) rows.push(['CPF', c.before.cpfMasked || 'Não informado', c.cpfMasked]);
  return (
    <section className="space-y-3 p-3 rounded-xl border border-info/50 bg-info/5">
      <h3 className="font-semibold text-sm">{c.kind === 'remover' ? 'Pedido para retirar este dependente' : 'Pedido de alteração do cadastro'}</h3>
      <p className="text-xs text-muted">Enviado em {formatDateTime(c.at, t.tenant.timezone)}. Nada muda até você aprovar.</p>
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted text-left">
              <th className="font-normal py-1">Campo</th>
              <th className="font-normal py-1">Hoje</th>
              <th className="font-normal py-1">Pedido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, a, b]) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 text-muted">{k}</td>
                <td className="py-1.5">{a}</td>
                <td className="py-1.5 font-semibold">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.note && <p className="text-sm">Observação do sócio: {c.note}</p>}
      <Textarea aria-label="Motivo da recusa" value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="Motivo, se for recusar (o sócio recebe este texto)" />
      <div className="flex flex-wrap gap-2">
        <Button icon={<Check className="w-4 h-4" />} loading={busy} onClick={() => decide(true)}>
          {c.kind === 'remover' ? 'Aprovar a retirada' : 'Aprovar alteração'}
        </Button>
        <Button variant="secondary" icon={<X className="w-4 h-4" />} loading={busy} disabled={reason.trim().length < 3} onClick={() => decide(false)}>
          Recusar
        </Button>
      </div>
    </section>
  );
}
