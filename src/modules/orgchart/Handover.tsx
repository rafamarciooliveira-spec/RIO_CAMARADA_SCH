/** Passagem de cargo (com o acesso ligado a ele) e galeria dos mandatos encerrados. */
import { useState } from 'react';
import { History, Repeat } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate, localDateKey } from '../../shared/dates.ts';
import type { MandateDoc, MemberDoc, OrgChartDoc, OrgPosition, RoleDoc } from '../../shared/types.ts';
import { Button, Card, Field, Input, Modal, Notice, Select, Textarea, Toggle } from '../../ui/index.tsx';

function HandoverModal({ pos, roleName, onClose }: { pos: OrgPosition; roleName?: string; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const members = useList<MemberDoc>(P.members(t.tenantId), { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 500 });
  const [memberId, setMemberId] = useState('');
  const [since, setSince] = useState(localDateKey(new Date(), t.tenant.timezone));
  const [keep, setKeep] = useState(false);
  const [note, setNote] = useState('');
  const chosen = members.data.find(m => m.id === memberId);
  const send = async () => {
    const r = await run(
      'orgchart.handover',
      { tenantId: t.tenantId, positionId: pos.id, ...(memberId ? { memberId } : {}), since, keepOldAccess: keep, ...(note.trim() ? { note: note.trim() } : {}), requestId: `${pos.id}_${memberId || 'vago'}_${since}` },
      { success: memberId ? 'Cargo passado.' : 'Cargo deixado vago.' }
    );
    if (r) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Passar o cargo: ${pos.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={send}>
            {memberId ? 'Confirmar passagem' : 'Deixar vago'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {pos.personName && <p className="text-sm">Hoje: <strong>{pos.personName}</strong>{pos.since ? ` desde ${formatDate(pos.since)}` : ''}.</p>}
        {roleName && (
          <Notice>
            Este cargo leva o acesso <strong>{roleName}</strong> no portal. Quem assume recebe o acesso na hora{keep ? '' : ' e quem sai deixa de ter'}. O sistema não deixa a sociedade sem ninguém que gerencie os acessos.
          </Notice>
        )}
        <Field label="Quem assume">
          {id => (
            <Select id={id} value={memberId} onChange={e => setMemberId(e.target.value)}>
              <option value="">Ninguém (cargo vago)</option>
              {members.data.map(m => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {roleName && chosen && !chosen.uid && <Notice tone="warn">{chosen.displayName} ainda não entrou no portal com a conta Google. Mande o link de cadastro ou um convite antes.</Notice>}
        <Field label="A partir de">{id => <Input id={id} type="date" value={since} onChange={e => setSince(e.target.value)} />}</Field>
        {roleName && pos.memberId && <Toggle checked={keep} onChange={setKeep} label="Quem sai continua com o acesso (por exemplo, para a transição)" />}
        <Field label="Observação (opcional, vai para a galeria)">{id => <Textarea id={id} value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Ex.: eleito na assembleia de 12/03" />}</Field>
      </div>
    </Modal>
  );
}

export function HandoverPanel({ chart }: { chart: OrgChartDoc }) {
  const t = useTenant();
  const roles = useList<RoleDoc>(P.roles(t.tenantId), { limit: 50 });
  const [open, setOpen] = useState<OrgPosition | null>(null);
  const roleName = (id?: string) => roles.data.find(r => r.id === id)?.name;
  const sorted = [...chart.positions].sort((a, b) => a.order - b.order);
  if (!sorted.length) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <Repeat className="w-4 h-4 text-accent" aria-hidden />
        Passagem de cargo
      </div>
      <p className="text-sm text-muted">Use ao fim de um mandato ou numa substituição. Fica registrado na galeria e na auditoria.</p>
      <ul className="divide-y divide-line">
        {sorted.map(p => (
          <li key={p.id} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{p.title}</div>
              <div className="text-xs text-muted truncate">
                {p.personName || 'Vago'}
                {p.roleId && ` · acesso ${roleName(p.roleId) || p.roleId}`}
              </div>
            </div>
            {(!p.roleId || t.can('papeis', 'aprovar')) && (
              <Button size="sm" variant="secondary" onClick={() => setOpen(p)}>
                Passar o cargo
              </Button>
            )}
          </li>
        ))}
      </ul>
      {open && <HandoverModal pos={open} roleName={roleName(open.roleId)} onClose={() => setOpen(null)} />}
    </Card>
  );
}

export function MandatesGallery() {
  const t = useTenant();
  const list = useList<MandateDoc>(P.mandates(t.tenantId), { orderBy: [['to', 'desc']], limit: 60 });
  if (!list.data.length) return null;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <History className="w-4 h-4 text-accent" aria-hidden />
        Galeria de mandatos
      </div>
      <ul className="grid sm:grid-cols-2 gap-2">
        {list.data.map(m => (
          <li key={m.id} className="p-3 rounded-xl border border-line">
            <div className="text-xs text-muted">{m.title}</div>
            <div className="font-medium">{m.personName}</div>
            <div className="text-xs text-muted">
              {m.from ? formatDate(m.from) : 'Início não registrado'} a {formatDate(m.to)}
            </div>
            {m.note && <div className="text-xs mt-1">{m.note}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
