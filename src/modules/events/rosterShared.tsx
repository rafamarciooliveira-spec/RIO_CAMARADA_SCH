/** Escala de trabalho: quadro por dia (sócio e organização) e o texto para o grupo de WhatsApp. */
import { useState } from 'react';
import { Check, CheckCircle2, Clock, Plus, UserMinus, X } from 'lucide-react';
import { useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { canManageRoster, sortSlots } from '../../shared/rosters.ts';
import type { MemberDoc, RosterDoc, RosterSlot } from '../../shared/types.ts';
import { Badge, Button, cx, Input, Select } from '../../ui/index.tsx';

export type Roster = RosterDoc & { id: string };

const weekday = (date: string) => {
  const w = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Agrupa por dia e nome do turno (Tarde, Noite), na ordem da escala */
export function groupSlots(slots: RosterSlot[]): { key: string; date: string; label?: string; slots: RosterSlot[] }[] {
  const out: { key: string; date: string; label?: string; slots: RosterSlot[] }[] = [];
  for (const s of sortSlots(slots)) {
    const key = `${s.date}|${s.label || ''}`;
    const g = out.find(x => x.key === key);
    if (g) g.slots.push(s);
    else out.push({ key, date: s.date, label: s.label, slots: [s] });
  }
  return out;
}

export const missing = (slots: RosterSlot[]) => slots.reduce((n, s) => n + Math.max(0, s.needed - s.people.length), 0);

/** Texto no formato que o grupo já usa: "● 11/11 *Quarta-feira* ✅", "1 pessoa para Arma", horário e nomes */
export function rosterWhatsappText(r: Pick<RosterDoc, 'title' | 'slots'>): string {
  const ok = '✅';
  const lines: string[] = [`*${r.title}*`, ''];
  for (const g of groupSlots(r.slots)) {
    const done = g.slots.every(s => s.people.length >= s.needed && s.people.every(p => p.confirmed));
    lines.push(`● ${dm(g.date)} *${weekday(g.date)}${g.label ? ` (${g.label})` : ''}*${done ? ` ${ok}` : ''}`);
    for (const s of g.slots) {
      const full = s.people.length >= s.needed;
      lines.push(`${s.needed} ${s.needed === 1 ? 'pessoa' : 'pessoas'} para ${s.role}${full ? ` ${ok}` : ''}`);
      lines.push(`${s.start} às ${s.end}`);
      for (const p of s.people) lines.push(`${p.name}${p.confirmed ? ` ${ok}` : ''}`);
      if (!full) lines.push(`(falta${s.needed - s.people.length > 1 ? 'm' : ''} ${s.needed - s.people.length})`);
      lines.push('');
    }
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Quadro da escala. mode "socio": entrar e sair da vaga; "gestor": também pôr nomes, confirmar e tirar */
export function RosterBoard({ r, mode }: { r: Roster; mode: 'socio' | 'gestor' }) {
  const t = useTenant();
  const session = useSession();
  const uid = session.user?.uid;
  const { run, busy } = useOp();
  const manage = mode === 'gestor' && canManageRoster(r, uid);
  const open = r.status === 'aberta';
  const [adding, setAdding] = useState('');
  const members = useList<MemberDoc>(manage && t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 2000 });
  const groups = groupSlots(r.slots);
  if (!groups.length) return <p className="text-sm text-muted">Nenhum turno ainda.</p>;
  return (
    <div className="space-y-4">
      {groups.map(g => {
        const left = missing(g.slots);
        return (
          <section key={g.key} className="rounded-2xl border border-line bg-surface overflow-hidden" aria-label={`${dm(g.date)} ${weekday(g.date)}`}>
            <header className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-line">
              <span className="font-semibold">
                {dm(g.date)} {weekday(g.date)}
                {g.label ? ` · ${g.label}` : ''}
              </span>
              <span className="ml-auto">{left ? <Badge tone="warn">Faltam {left}</Badge> : <Badge tone="ok">Completo</Badge>}</span>
            </header>
            <ul className="divide-y divide-line">
              {g.slots.map(s => {
                const mine = s.people.find(p => p.uid && p.uid === uid);
                const full = s.people.length >= s.needed;
                return (
                  <li key={s.id} className="px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">{s.role}</span>
                      <span className="text-xs text-muted inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" aria-hidden />
                        {s.start} às {s.end}
                      </span>
                      <span className="text-xs text-muted">
                        {s.people.length} de {s.needed}
                      </span>
                      {mode === 'socio' && open && (
                        <span className="ml-auto">
                          {mine ? (
                            <Button size="sm" variant="ghost" disabled={busy} icon={<UserMinus className="w-3.5 h-3.5" />} onClick={() => run('rosters.signup', { tenantId: t.tenantId, id: r.id, slotId: s.id, leave: true }, { success: 'Você saiu deste turno.' })}>
                              Sair
                            </Button>
                          ) : !full ? (
                            <Button size="sm" disabled={busy} icon={<Plus className="w-3.5 h-3.5" />} onClick={() => run('rosters.signup', { tenantId: t.tenantId, id: r.id, slotId: s.id }, { success: 'Inscrição feita. Obrigado!' })}>
                              Quero ajudar
                            </Button>
                          ) : null}
                        </span>
                      )}
                    </div>
                    {s.people.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {s.people.map(p => (
                          <li key={p.key} className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm', p.confirmed ? 'border-ok/40 bg-ok/10' : 'border-line', p.uid === uid && 'font-semibold')}>
                            {p.confirmed && <CheckCircle2 className="w-3.5 h-3.5 text-ok" aria-label="Confirmado" />}
                            {p.name}
                            {manage && (
                              <>
                                <button type="button" className="p-0.5 rounded hover:bg-surface-2 cursor-pointer" aria-label={p.confirmed ? `Desconfirmar ${p.name}` : `Confirmar ${p.name}`} disabled={busy} onClick={() => run('rosters.assign', { tenantId: t.tenantId, id: r.id, slotId: s.id, action: p.confirmed ? 'desconfirmar' : 'confirmar', key: p.key })}>
                                  <Check className={cx('w-3.5 h-3.5', p.confirmed ? 'text-muted' : 'text-ok')} />
                                </button>
                                <button type="button" className="p-0.5 rounded hover:bg-surface-2 text-bad cursor-pointer" aria-label={`Tirar ${p.name}`} disabled={busy} onClick={() => run('rosters.assign', { tenantId: t.tenantId, id: r.id, slotId: s.id, action: 'tirar', key: p.key })}>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {manage && !full && (adding === s.id ? (
                      <AddPerson members={members.data} onCancel={() => setAdding('')} onAdd={async (p) => {
                        if (await run('rosters.assign', { tenantId: t.tenantId, id: r.id, slotId: s.id, action: 'adicionar', ...p })) setAdding('');
                      }} />
                    ) : (
                      <Button size="sm" variant="ghost" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAdding(s.id)}>
                        Pôr um nome
                      </Button>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AddPerson({ members, onAdd, onCancel }: { members: (MemberDoc & { id: string })[]; onAdd: (p: { memberId?: string; name?: string }) => void; onCancel: () => void }) {
  const t = useTenant();
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const ok = memberId || name.trim().length >= 2;
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {members.length > 0 && (
        <Select aria-label={t.labels.member} value={memberId} onChange={e => setMemberId(e.target.value)} className="sm:w-64">
          <option value="">Escolher {t.labels.member.toLowerCase()}...</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </Select>
      )}
      {!memberId && <Input aria-label="Nome" placeholder={members.length ? 'ou escreva o nome' : 'Nome da pessoa'} value={name} maxLength={150} onChange={e => setName(e.target.value)} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={!ok} onClick={() => onAdd(memberId ? { memberId } : { name: name.trim() })}>
          Pôr na escala
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
