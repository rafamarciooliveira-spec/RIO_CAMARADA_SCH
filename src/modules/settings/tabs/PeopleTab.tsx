/** Papéis (matriz de permissões por módulo), pessoas com acesso e convites. */
import { useMemo, useState } from 'react';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { useList, useOp, useSession } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { ACTIONS, MODULES, type Action, type ModuleId, type Perms } from '../../../shared/modules.ts';
import { P } from '../../../shared/paths.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import type { InviteDoc, MembershipDoc, RoleDoc } from '../../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Notice, Select, Tabs, Toggle, useConfirm } from '../../../ui/index.tsx';

const ACTION_LABEL: Record<Action, string> = { ver: 'Ver', criar: 'Criar', editar: 'Editar', aprovar: 'Aprovar', exportar: 'Exportar' };

export function PeopleTab() {
  const [tab, setTab] = useState<'papeis' | 'pessoas' | 'convites'>('pessoas');
  return (
    <div className="space-y-3">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'pessoas', label: 'Pessoas com acesso' },
          { id: 'convites', label: 'Convites' },
          { id: 'papeis', label: 'Papéis e permissões' },
        ]}
      />
      {tab === 'papeis' && <Roles />}
      {tab === 'pessoas' && <People />}
      {tab === 'convites' && <Invites />}
    </div>
  );
}

function Roles() {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const roles = useList<RoleDoc>(P.roles(t.tenantId), { limit: 50 });
  const [editing, setEditing] = useState<{ id?: string; name: string; perms: Perms; board: boolean; system?: boolean } | null>(null);
  const canEdit = t.can('papeis', 'aprovar');
  const toggle = (m: ModuleId, a: Action, on: boolean) => {
    if (!editing) return;
    const cur = new Set(editing.perms[m] || []);
    if (on) {
      cur.add(a);
      cur.add('ver');
    } else {
      cur.delete(a);
      if (a === 'ver') cur.clear();
    }
    setEditing({ ...editing, perms: { ...editing.perms, [m]: ACTIONS.filter(x => cur.has(x)) } });
  };
  const save = async () => {
    if (!editing) return;
    const perms = Object.fromEntries(Object.entries(editing.perms).filter(([, a]) => a && a.length));
    const r = await run('roles.save', { tenantId: t.tenantId, ...(editing.id ? { id: editing.id } : {}), name: editing.name.trim(), perms, board: editing.board }, { success: 'Papel salvo. As permissões valem na hora para quem tem este papel.' });
    if (r) setEditing(null);
  };
  const remove = async (r: RoleDoc & { id: string }) => {
    if (!(await confirm({ title: 'Apagar papel', text: `O papel "${r.name}" será apagado. Só é possível se ninguém estiver com ele.`, confirmLabel: 'Apagar', danger: true }))) return;
    await run('roles.delete', { tenantId: t.tenantId, id: r.id }, { success: 'Papel apagado.' });
  };
  if (roles.loading) return <Loading />;
  return (
    <div className="space-y-3">
      {!canEdit && <Notice>Seu papel pode ver, mas não alterar os papéis.</Notice>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {roles.data.map(r => (
          <Card key={r.id} className="p-3! flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{r.name}</div>
              <div className="flex gap-1 mt-1">
                {r.board && <Badge tone="brand">{t.labels.board}</Badge>}
                {r.system && <Badge>Padrão</Badge>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setEditing({ id: r.id, name: r.name, perms: { ...r.perms }, board: r.board, system: r.system })}>
                {canEdit ? 'Editar' : 'Ver'}
              </Button>
              {canEdit && !r.system && <Button size="sm" variant="ghost" aria-label={`Apagar ${r.name}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => remove(r)} />}
            </div>
          </Card>
        ))}
      </div>
      {canEdit && (
        <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing({ name: '', perms: {}, board: true })}>
          Novo papel
        </Button>
      )}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Papel: ${editing.name}` : 'Novo papel'}
          size="xl"
          footer={
            canEdit && (
              <>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button loading={busy} disabled={editing.name.trim().length < 2} onClick={save}>
                  Salvar papel
                </Button>
              </>
            )
          }
        >
          <fieldset disabled={!canEdit} className="space-y-3 min-w-0">
            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <Field label="Nome">{id => <Input id={id} value={editing.name} maxLength={60} onChange={e => setEditing({ ...editing, name: e.target.value })} />}</Field>
              <Toggle checked={editing.board} onChange={v => setEditing({ ...editing, board: v })} label={`Faz parte da ${t.labels.board.toLowerCase()}`} />
            </div>
            <div className="overflow-x-auto custom-scrollbar rounded-xl border border-line">
              <table className="w-full text-sm">
                <caption className="sr-only">Permissões por módulo</caption>
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2">
                      Módulo
                    </th>
                    {ACTIONS.map(a => (
                      <th key={a} scope="col" className="px-2 py-2">
                        {ACTION_LABEL[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {MODULES.map(m => (
                    <tr key={m.id}>
                      <th scope="row" className="text-left font-normal px-3 py-1.5 whitespace-nowrap">
                        {m.label}
                      </th>
                      {ACTIONS.map(a => (
                        <td key={a} className="text-center px-2 py-1.5">
                          <input type="checkbox" aria-label={`${m.label}: ${ACTION_LABEL[a]}`} checked={!!editing.perms[m.id]?.includes(a)} onChange={e => toggle(m.id, a, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted">"Dados pessoais (CPF)" libera ver contato e revelar CPF, sempre com registro na auditoria.</p>
          </fieldset>
        </Modal>
      )}
    </div>
  );
}

function People() {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const list = useList<MembershipDoc>(P.memberships(t.tenantId), { where: [['active', '==', true]], limit: 300 });
  const roles = useList<RoleDoc>(P.roles(t.tenantId), { limit: 50 });
  const [filter, setFilter] = useState<'diretoria' | 'todos'>('diretoria');
  const [edit, setEdit] = useState<(MembershipDoc & { id: string }) | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const canEdit = t.can('papeis', 'aprovar');
  const roleName = (id: string) => roles.data.find(r => r.id === id)?.name || id;
  const rows = list.data.filter(m => filter === 'todos' || m.board || m.roleIds.some(r => r !== 'socio'));
  const save = async () => {
    if (!edit) return;
    const r = await run('memberships.setRoles', { tenantId: t.tenantId, uid: edit.uid || edit.id, roleIds: sel }, { success: 'Papéis atualizados.' });
    if (r) setEdit(null);
  };
  const revoke = async (m: MembershipDoc & { id: string }) => {
    const ok = await confirm({ title: 'Tirar o acesso', text: `${m.displayName || m.email} perde o acesso ao portal desta sociedade na hora. O cadastro de ${t.labels.member.toLowerCase()}, se houver, continua.`, confirmLabel: 'Tirar acesso', danger: true });
    if (ok) await run('memberships.revoke', { tenantId: t.tenantId, uid: m.uid || m.id }, { success: 'Acesso removido.' });
  };
  if (list.loading) return <Loading />;
  return (
    <div className="space-y-3">
      <Select aria-label="Filtro" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="sm:w-64">
        <option value="diretoria">Com papel na gestão</option>
        <option value="todos">Todos com acesso</option>
      </Select>
      {rows.length === 0 ? (
        <EmptyState title="Ninguém nesta lista" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map(m => (
            <li key={m.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {m.displayName || m.email} {m.support && <Badge tone="warn">Suporte</Badge>}
                </div>
                <div className="text-xs text-muted truncate">{m.email}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.roleIds.map(r => (
                    <Badge key={r} tone={r === 'socio' ? 'neutral' : 'brand'}>
                      {roleName(r)}
                    </Badge>
                  ))}
                </div>
              </div>
              {canEdit && !m.support && (m.uid || m.id) !== session.user?.uid && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => (setEdit(m), setSel(m.roleIds))}>
                    Papéis
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => revoke(m)}>
                    Tirar acesso
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">Na troca de gestão, ajuste os papéis aqui ou em Gestões e mandatos. Você não pode mudar o seu próprio papel.</p>
      {edit && (
        <Modal
          open
          onClose={() => setEdit(null)}
          title={`Papéis de ${edit.displayName || edit.email}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Cancelar
              </Button>
              <Button loading={busy} disabled={!sel.length} onClick={save}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-2">
            {roles.data.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sel.includes(r.id)} disabled={!sel.includes(r.id) && sel.length >= 5} onChange={e => setSel(s => (e.target.checked ? [...s, r.id] : s.filter(x => x !== r.id)))} />
                {r.name}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Invites() {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const list = useList<InviteDoc>(P.invites(t.tenantId), { orderBy: [['createdAt', 'desc']], limit: 50 });
  const roles = useList<RoleDoc>(P.roles(t.tenantId), { limit: 50 });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('secretario');
  const [link, setLink] = useState('');
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const canInvite = t.can('papeis', 'criar');
  const create = async () => {
    setLink('');
    const r = await run<{ link?: string; mailStatus: string }>('invites.create', { tenantId: t.tenantId, email: email.trim(), roleIds: [role] }, { success: 'Convite criado.' });
    if (r) {
      setEmail('');
      if (r.link) setLink(r.link);
    }
  };
  const revoke = async (i: InviteDoc & { id: string }) => {
    if (await confirm({ title: 'Cancelar convite', text: `O link enviado para ${i.emailLower} deixa de funcionar.`, confirmLabel: 'Cancelar convite', danger: true })) await run('invites.revoke', { tenantId: t.tenantId, id: i.id }, { success: 'Convite cancelado.' });
  };
  const state = (i: InviteDoc) => (i.revokedAt ? ['Cancelado', 'neutral'] : i.usedAt ? ['Aceito', 'ok'] : i.expiresAt < nowIso ? ['Vencido', 'warn'] : ['Aguardando', 'info']) as [string, 'neutral' | 'ok' | 'warn' | 'info'];
  return (
    <div className="space-y-3">
      {canInvite && (
        <Card className="space-y-2">
          <div className="grid sm:grid-cols-[1fr_220px_auto] gap-2 items-end">
            <Field label="E-mail">{id => <Input id={id} type="email" value={email} maxLength={120} onChange={e => setEmail(e.target.value)} />}</Field>
            <Field label="Papel">
              {id => (
                <Select id={id} value={role} onChange={e => setRole(e.target.value)}>
                  {roles.data.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button icon={<Mail className="w-4 h-4" />} loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={create}>
              Convidar
            </Button>
          </div>
          <p className="text-[11px] text-muted">O convite vale 7 dias e só pode ser aceito pela conta com este e-mail.</p>
          {link && (
            <Notice tone="warn">
              O e-mail não saiu de verdade neste ambiente. Envie este link para a pessoa: <span className="font-mono text-xs break-all">{link}</span>
            </Notice>
          )}
        </Card>
      )}
      {list.loading ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <EmptyState title="Nenhum convite enviado" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.data.map(i => {
            const [label, tone] = state(i);
            return (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.emailLower}</div>
                  <div className="text-xs text-muted">
                    {i.roleIds.map(r => roles.data.find(x => x.id === r)?.name || r).join(', ')} · vence {formatDateTime(i.expiresAt, t.tenant.timezone)}
                  </div>
                </div>
                <Badge tone={tone}>{label}</Badge>
                {canInvite && label === 'Aguardando' && (
                  <Button size="sm" variant="ghost" onClick={() => revoke(i)}>
                    Cancelar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
