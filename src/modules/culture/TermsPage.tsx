/** Gestões e mandatos: histórico das diretorias. A gestão atual usa os mesmos cargos e pessoas do organograma. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDoc, useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { addMonthsKey, formatDate } from '../../shared/dates.ts';
import type { MemberDoc, OrgChartDoc, OrgPosition, TermDoc } from '../../shared/types.ts';
import { Badge, Button, Input, Notice, Section, Select } from '../../ui/index.tsx';
import { CrudPage, type CrudConfig } from './CrudPage.tsx';

type BoardRow = TermDoc['board'][number];
const slug = (s: string) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 60) || 'cargo';
const norm = (s: string) => slug(s).replace(/_/g, '');
const NEW = '__novo';

/** Cargo da linha no organograma: o ligado, ou o de mesmo nome (gestões gravadas antes da ligação) */
const positionOf = (b: BoardRow, positions: OrgPosition[]) => positions.find(p => p.id === b.positionId) || (!b.positionId ? positions.find(p => norm(p.title) === norm(b.roleName)) : undefined);

function BoardEditor({ board, onChange, positions, members }: { board: BoardRow[]; onChange: (b: BoardRow[]) => void; positions: OrgPosition[]; members: MemberDoc[] }) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const upd = (i: number, p: Partial<BoardRow>) => onChange(board.map((b, k) => (k === i ? { ...b, ...p } : b)));
  const sorted = [...positions].sort((a, b) => a.order - b.order);
  const missing = sorted.filter(p => !board.some(b => positionOf(b, positions)?.id === p.id));
  const fromChart = (p: OrgPosition): BoardRow => ({ positionId: p.id, ...(p.memberId ? { memberId: p.memberId } : {}), name: p.personName || '', roleId: p.roleId || p.id, roleName: p.title });
  return (
    <Section
      title="Composição da diretoria"
      actions={
        <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => onChange([...board, { name: '', roleId: '', roleName: '' }])}>
          Cargo
        </Button>
      }
    >
      {board.length === 0 && <p className="text-sm text-muted">Inclua presidente, vice, tesouraria, secretaria, conselho fiscal e demais cargos.</p>}
      {board.map((b, i) => {
        const pos = positionOf(b, positions);
        const isNew = !pos;
        return (
          <div key={i} className="space-y-2 p-3 rounded-xl border border-line bg-bg">
            <div className="flex gap-2">
              {positions.length > 0 ? (
                <Select
                  aria-label={`Cargo ${i + 1}`}
                  className="flex-1"
                  value={pos?.id || NEW}
                  onChange={e => {
                    const p = positions.find(x => x.id === e.target.value);
                    setRenaming(p ? null : i);
                    // Ao escolher um cargo, já vem quem ocupa no organograma (se a linha ainda não tem pessoa)
                    upd(i, p ? { ...fromChart(p), ...(b.name ? { name: b.name, memberId: b.memberId } : {}) } : { positionId: undefined, roleId: '', roleName: '' });
                  }}
                >
                  {sorted.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                  <option value={NEW}>+ Novo cargo</option>
                </Select>
              ) : null}
              {pos && (
                <Button variant="ghost" aria-label={`Renomear cargo ${i + 1}`} icon={<Pencil className="w-4 h-4" />} onClick={() => setRenaming(renaming === i ? null : i)} />
              )}
              <Button variant="ghost" aria-label={`Remover cargo ${i + 1}`} icon={<Trash2 className="w-4 h-4" />} onClick={() => onChange(board.filter((_, k) => k !== i))} />
            </div>
            {(isNew || renaming === i) && (
              <Input
                aria-label={`Nome do cargo ${i + 1}`}
                placeholder={isNew ? 'Nome do novo cargo' : 'Novo nome do cargo'}
                value={b.roleName}
                maxLength={60}
                autoFocus={renaming === i}
                onChange={e => upd(i, { roleName: e.target.value })}
              />
            )}
            {members.length ? (
              <Select
                aria-label={`Pessoa no cargo ${i + 1}`}
                value={b.memberId || ''}
                onChange={e => {
                  const m = members.find(x => x.id === e.target.value);
                  upd(i, { memberId: m?.id, name: m?.fullName || '' });
                }}
              >
                <option value="">{b.name && !b.memberId ? b.name : 'Vago (ninguém)'}</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            ) : (
              <Input aria-label={`Pessoa no cargo ${i + 1}`} placeholder="Nome (vazio = vago)" value={b.name} maxLength={150} onChange={e => upd(i, { name: e.target.value })} />
            )}
          </div>
        );
      })}
      {missing.length > 0 && (
        <Button size="sm" variant="ghost" icon={<Download className="w-4 h-4" />} onClick={() => onChange([...board, ...missing.map(fromChart)])}>
          Trazer os outros cargos do organograma ({missing.length})
        </Button>
      )}
    </Section>
  );
}

export default function TermsPage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const orgOn = t.moduleOn('organograma');
  const chart = useDoc<OrgChartDoc>(orgOn ? P.orgchart(t.tenantId) : null);
  const positions = chart.data?.positions || [];
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 2000 });
  const config: CrudConfig = {
    collection: 'terms',
    title: 'Gestões e mandatos',
    subtitle: orgOn ? 'Histórico das diretorias. A gestão atual usa os mesmos cargos e pessoas do organograma.' : 'Histórico das diretorias.',
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
      board: ((form.board as BoardRow[]) || [])
        .map(b => {
          const pos = positionOf(b, positions);
          const roleName = (b.roleName || pos?.title || '').trim();
          return { ...(pos ? { positionId: pos.id } : {}), ...(b.memberId ? { memberId: b.memberId } : {}), name: b.name.trim(), roleId: pos?.roleId || pos?.id || b.roleId || slug(roleName), roleName };
        })
        .filter(b => b.roleName && (b.name || b.positionId)),
    }),
    formExtra: (form, set, row) => {
      const board = (form.board as BoardRow[]) || [];
      const becomingCurrent = !!form.current && !row?.current;
      return (
        <div className="space-y-4">
          {!!form.current && orgOn && (
            <Notice tone={becomingCurrent ? 'warn' : 'info'}>
              {becomingCurrent && 'Ao marcar esta gestão como atual, a anterior deixa de ser a atual. '}
              Na gestão atual, os cargos e as pessoas são os mesmos do{' '}
              <Link to={t.to('gestao-organograma')} className="underline font-semibold">
                Organograma
              </Link>
              : cargo novo ou nome trocado aqui aparece lá. Em cargo ligado a um acesso do portal (presidente, tesoureiro...), quem assume recebe o acesso e quem sai perde. Os demais acessos ficam em{' '}
              <Link to={t.to('configuracoes')} className="underline font-semibold">
                Configurações, Papéis e pessoas
              </Link>
              .
            </Notice>
          )}
          <BoardEditor board={board} onChange={b => set({ board: b })} positions={positions} members={members.data} />
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
