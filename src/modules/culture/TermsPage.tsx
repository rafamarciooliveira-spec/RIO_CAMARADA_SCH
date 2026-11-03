/** Gestões e mandatos: histórico das diretorias e aviso de transição segura de acessos a cada posse. */
import { Link } from 'react-router-dom';
import { Crown, Plus, Trash2 } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { addMonthsKey, formatDate } from '../../shared/dates.ts';
import type { MemberDoc, RoleDoc, TermDoc } from '../../shared/types.ts';
import { Badge, Button, Input, Notice, Section, Select } from '../../ui/index.tsx';
import { CrudPage, type CrudConfig } from './CrudPage.tsx';

type BoardRow = TermDoc['board'][number];
const slug = (s: string) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60) || 'cargo';

export default function TermsPage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const roles = useList<RoleDoc>(t.can('papeis', 'ver') ? P.roles(t.tenantId) : null);
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 2000 });
  const config: CrudConfig = {
    collection: 'terms',
    title: 'Gestões e mandatos',
    subtitle: 'Histórico das diretorias. Na posse, a transição de acessos é feita em Configurações.',
    singular: 'gestão',
    icon: <Crown className="w-5 h-5" />,
    query: { orderBy: [['start', 'desc']] },
    defaults: () => ({ name: '', start: today, end: addMonthsKey(today, 24), current: false, board: [] }),
    fields: [
      { key: 'name', label: 'Nome da gestão', type: 'text', required: true, max: 120, placeholder: 'Ex.: Gestão 2027 a 2028' },
      { key: 'start', label: 'Início do mandato', type: 'date', required: true },
      { key: 'end', label: 'Fim do mandato', type: 'date', required: true },
      { key: 'current', label: 'É a gestão atual', type: 'toggle' },
    ],
    toData: form => ({
      name: form.name,
      start: form.start,
      end: form.end,
      current: !!form.current,
      board: ((form.board as BoardRow[]) || []).filter(b => b.name.trim()).map(b => ({ ...(b.memberId ? { memberId: b.memberId } : {}), name: b.name.trim(), roleId: b.roleId || slug(b.roleName), roleName: b.roleName.trim() || 'Cargo' })),
    }),
    formExtra: (form, set, row) => {
      const board = (form.board as BoardRow[]) || [];
      const upd = (i: number, p: Partial<BoardRow>) => set({ board: board.map((b, k) => (k === i ? { ...b, ...p } : b)) });
      const becomingCurrent = !!form.current && !row?.current;
      return (
        <div className="space-y-4">
          {becomingCurrent && (
            <Notice tone="warn">
              Ao marcar esta gestão como atual, a anterior deixa de ser a atual. Os acessos ao portal NÃO mudam sozinhos: revise quem entra e quem sai da diretoria em{' '}
              <Link to={t.to('configuracoes')} className="underline font-semibold">
                Configurações, aba Papéis e pessoas
              </Link>
              , removendo os papéis de quem deixou o cargo e convidando os novos membros.
            </Notice>
          )}
          <Section
            title="Composição da diretoria"
            actions={
              <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => set({ board: [...board, { name: '', roleId: '', roleName: '' }] })}>
                Cargo
              </Button>
            }
          >
            {board.length === 0 && <p className="text-sm text-muted">Inclua presidente, vice, tesouraria, secretaria, conselho fiscal e demais cargos.</p>}
            {board.map((b, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                {roles.data.length ? (
                  <Select aria-label={`Cargo ${i + 1}`} value={b.roleId} onChange={e => upd(i, { roleId: e.target.value, roleName: roles.data.find(r => r.id === e.target.value)?.name || '' })}>
                    <option value="">Cargo...</option>
                    {roles.data
                      .filter(r => r.board)
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </Select>
                ) : (
                  <Input aria-label={`Cargo ${i + 1}`} placeholder="Cargo" value={b.roleName} maxLength={60} onChange={e => upd(i, { roleName: e.target.value, roleId: '' })} />
                )}
                {members.data.length ? (
                  <Select
                    aria-label={`Pessoa no cargo ${i + 1}`}
                    value={b.memberId || ''}
                    onChange={e => {
                      const m = members.data.find(x => x.id === e.target.value);
                      upd(i, { memberId: e.target.value || undefined, name: m?.fullName || b.name });
                    }}
                  >
                    <option value="">{b.name || 'Pessoa...'}</option>
                    {members.data.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input aria-label={`Pessoa no cargo ${i + 1}`} placeholder="Nome" value={b.name} maxLength={150} onChange={e => upd(i, { name: e.target.value })} />
                )}
                <Button variant="ghost" aria-label={`Remover cargo ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ board: board.filter((_, k) => k !== i) })} />
              </div>
            ))}
          </Section>
        </div>
      );
    },
    columns: [
      { key: 'n', label: 'Gestão', render: x => <span className="font-medium">{String(x.name)}</span> },
      { key: 'p', label: 'Mandato', render: x => `${formatDate(String(x.start))} a ${formatDate(String(x.end))}` },
      { key: 'b', label: 'Diretoria', render: x => `${(x.board as unknown[] | undefined)?.length || 0} cargo(s)`, hideOnMobile: true },
      { key: 'c', label: '', render: x => (x.current ? <Badge tone="ok">Atual</Badge> : String(x.end) < today ? <Badge>Encerrada</Badge> : null) },
    ],
    emptyText: 'Registre as gestões da sociedade para manter o histórico das diretorias.',
  };
  return <CrudPage config={config} />;
}
