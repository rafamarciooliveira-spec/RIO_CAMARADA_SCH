/** Transferência de sócio entre filiais da federação: pedir (origem) e aprovar (destino). */
import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { formatDateTime } from '../../../shared/dates.ts';
import type { FedTransferDoc, MemberDoc } from '../../../shared/types.ts';
import { Badge, Button, Field, Select, Textarea } from '../../../ui/index.tsx';

interface BranchInfo {
  id: string;
  name: string;
  networkCard: boolean;
  branches: { id: string; name: string }[];
}

export function useBranchInfo() {
  const t = useTenant();
  const { run } = useOp();
  const [info, setInfo] = useState<BranchInfo | null>(null);
  useEffect(() => {
    if (!t.tenant.federationId) return setInfo(null);
    run<BranchInfo | null>('federation.branchInfo', { tenantId: t.tenantId }, { silent: true }).then(r => setInfo(r || null));
  }, [run, t.tenantId, t.tenant.federationId]);
  return info;
}

/** No detalhe do sócio (titular aprovado): mandar para outra filial */
export function TransferAction({ m }: { m: MemberDoc & { id: string } }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const info = useBranchInfo();
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  if (!info || m.dependentOf || !['aprovado', 'ativo', 'em_atraso'].includes(m.status) || !info.branches.length) return null;
  return (
    <section className="space-y-2 p-3 rounded-xl border border-line">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4" />
        Transferir para outra filial da {info.name}
      </h3>
      <p className="text-xs text-muted">A filial de destino aprova. O sócio leva a data de entrada e os dependentes, e o cadastro daqui fica como desligado.</p>
      <Field label="Filial de destino">
        {id => (
          <Select id={id} value={to} onChange={e => setTo(e.target.value)}>
            <option value="">Escolha...</option>
            {info.branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Textarea aria-label="Observação" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Observação para a filial de destino (opcional)" />
      <Button
        variant="secondary"
        loading={busy}
        disabled={!to}
        onClick={async () => {
          if (await run('federation.transferRequest', { tenantId: t.tenantId, memberId: m.id, toTenantId: to, ...(note.trim() ? { note: note.trim() } : {}), requestId: `${m.id}_${to}` }, { success: 'Pedido enviado para a filial de destino.' })) {
            setTo('');
            setNote('');
          }
        }}
      >
        Pedir a transferência
      </Button>
    </section>
  );
}

/** Na lista de sócios: transferências que chegam (para aprovar) e as que saíram */
export function TransfersSection() {
  const t = useTenant();
  const { run, busy } = useOp();
  const [rows, setRows] = useState<FedTransferDoc[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [cat, setCat] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    if (!t.tenant.federationId) return;
    setRows((await run<FedTransferDoc[]>('federation.transfers', { tenantId: t.tenantId }, { silent: true })) || []);
  }, [run, t.tenantId, t.tenant.federationId]);
  useEffect(() => {
    load();
  }, [load]);
  const incoming = rows.filter(r => r.toTenantId === t.tenantId && r.status === 'pendente');
  const outgoing = rows.filter(r => r.fromTenantId === t.tenantId && r.status === 'pendente');
  if (!incoming.length && !outgoing.length) return null;
  const cats = (t.settings?.categories || []).filter(c => c.id !== 'dependente');
  const canApprove = t.can('socios', 'aprovar');
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-info">Transferências entre filiais</h2>
      {incoming.map(r => (
        <div key={r.id} className="p-3 rounded-xl border border-info/50 space-y-2">
          <div className="text-sm">
            <strong>{r.memberName}</strong> vem da <strong>{r.fromTenantName}</strong>
            {r.dependents > 0 && ` com ${r.dependents} dependente(s)`} · {formatDateTime(r.requestedAt, t.tenant.timezone)}
          </div>
          {r.note && <p className="text-xs text-muted">Observação: {r.note}</p>}
          {canApprove && (
            <>
              <div className="grid sm:grid-cols-2 gap-2">
                <Select aria-label="Categoria aqui" value={cat[r.id] || ''} onChange={e => setCat({ ...cat, [r.id]: e.target.value })}>
                  <option value="">Mesma categoria, se existir aqui</option>
                  {cats.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Textarea aria-label="Motivo da recusa" value={reason[r.id] || ''} onChange={e => setReason({ ...reason, [r.id]: e.target.value })} placeholder="Motivo, se for recusar" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={busy} onClick={async () => {
                  if (await run('federation.transferDecide', { tenantId: t.tenantId, transferId: r.id, approve: true, ...(cat[r.id] ? { categoryId: cat[r.id] } : {}), requestId: `${r.id}_sim` }, { success: 'Transferência concluída. O sócio já está aqui.' })) load();
                }}>
                  Aprovar e receber
                </Button>
                <Button size="sm" variant="secondary" loading={busy} disabled={(reason[r.id] || '').trim().length < 3} onClick={async () => {
                  if (await run('federation.transferDecide', { tenantId: t.tenantId, transferId: r.id, approve: false, reason: reason[r.id].trim(), requestId: `${r.id}_nao` }, { success: 'Transferência recusada.' })) load();
                }}>
                  Recusar
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {outgoing.map(r => (
        <div key={r.id} className="p-3 rounded-xl border border-line text-sm flex flex-wrap items-center gap-2">
          <strong>{r.memberName}</strong> indo para a {r.toTenantName}
          <Badge tone="info">esperando a filial de destino</Badge>
        </div>
      ))}
    </section>
  );
}
