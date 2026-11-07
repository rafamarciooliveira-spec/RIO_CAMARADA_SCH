/** Exibição do organograma nos três estilos. Usado no portal e na página pública. */
import { useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import type { OrgChartDoc, OrgPosition } from '../../shared/types.ts';
import { cx, EmptyState, Tabs } from '../../ui/index.tsx';
import { orderedGroups } from './groups.ts';

function initials(name?: string) {
  return (name || '?').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function Person({ p, big = false }: { p: OrgPosition; big?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-2xl border bg-surface text-center flex flex-col items-center',
        big ? 'p-5 border-accent/60 shadow-lg shadow-black/30 min-w-44' : 'p-3 border-line min-w-36',
        p.highlight && !big && 'border-accent/50'
      )}
    >
      {p.highlight && <Crown className={cx('text-accent', big ? 'w-7 h-7 mb-1' : 'w-4 h-4 mb-1')} aria-hidden />}
      <div className={cx('rounded-full bg-brand text-on-brand flex items-center justify-center font-bold', big ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm')} aria-hidden>
        {initials(p.personName)}
      </div>
      <div className={cx('mt-2 font-semibold leading-tight', big ? 'text-base' : 'text-sm')}>{p.personName || 'A definir'}</div>
      <div className={cx('text-muted', big ? 'text-sm' : 'text-xs')}>{p.title}</div>
    </div>
  );
}

function sortPos(a: OrgPosition, b: OrgPosition) {
  return a.order - b.order || a.title.localeCompare(b.title, 'pt-BR');
}

function Groups({ positions }: { positions: OrgPosition[] }) {
  const groups = new Map<string, OrgPosition[]>();
  for (const p of [...positions].sort(sortPos)) groups.set(p.group, [...(groups.get(p.group) || []), p]);
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([g, list]) => (
        <section key={g}>
          {groups.size > 1 && <h3 className="text-xs uppercase tracking-wider text-muted mb-2">{g}</h3>}
          <div className="flex flex-wrap gap-3">{list.map(p => <Person key={p.id} p={p} />)}</div>
        </section>
      ))}
    </div>
  );
}

function Tree({ positions }: { positions: OrgPosition[] }) {
  const byParent = new Map<string, OrgPosition[]>();
  for (const p of [...positions].sort(sortPos)) {
    const k = p.parentId && positions.some(x => x.id === p.parentId) ? p.parentId : '__raiz';
    byParent.set(k, [...(byParent.get(k) || []), p]);
  }
  const Node = ({ p, depth }: { p: OrgPosition; depth: number }) => {
    const kids = byParent.get(p.id) || [];
    return (
      <li className="flex flex-col items-center">
        <Person p={p} big={depth === 0} />
        {kids.length > 0 && (
          <>
            <span className="w-px h-4 bg-line" aria-hidden />
            <ul className="flex flex-wrap justify-center gap-3 pt-4 border-t border-line relative">
              {kids.map(k => <Node key={k.id} p={k} depth={depth + 1} />)}
            </ul>
          </>
        )}
      </li>
    );
  };
  const roots = byParent.get('__raiz') || [];
  return (
    <div className="overflow-x-auto custom-scrollbar pb-2">
      <ul className="flex flex-wrap justify-center gap-6 min-w-fit">{roots.map(r => <Node key={r.id} p={r} depth={0} />)}</ul>
    </div>
  );
}

function Court({ positions }: { positions: OrgPosition[] }) {
  const highlights = positions.filter(p => p.highlight).sort(sortPos);
  const others = positions.filter(p => !p.highlight);
  // Destaques por grupo, na ordem dos cargos (ex.: Tiro, depois Schützenfest)
  const hg = new Map<string, OrgPosition[]>();
  for (const p of highlights) hg.set(p.group, [...(hg.get(p.group) || []), p]);
  return (
    <div className="space-y-8">
      {highlights.length > 0 && (
        <div className="rounded-3xl p-6 border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent space-y-5">
          {[...hg.entries()].map(([g, list]) => (
            <div key={g} className="space-y-2">
              {hg.size > 1 && <h3 className="text-xs uppercase tracking-wider text-accent text-center">{g}</h3>}
              <div className="flex flex-wrap justify-center gap-4">{list.map(p => <Person key={p.id} p={p} big />)}</div>
            </div>
          ))}
        </div>
      )}
      <Groups positions={others} />
    </div>
  );
}

function Styled({ style, positions }: { style: OrgChartDoc['style']; positions: OrgPosition[] }) {
  if (style === 'arvore') return <Tree positions={positions} />;
  if (style === 'corte') return <Court positions={positions} />;
  return <Groups positions={positions} />;
}

export function OrgChartView({ chart }: { chart: OrgChartDoc | null }) {
  const groups = useMemo(() => (chart ? orderedGroups(chart) : []), [chart]);
  const [tab, setTab] = useState('');
  if (!chart || chart.positions.length === 0) return <EmptyState title="Organograma ainda não montado" text="A diretoria pode cadastrar os cargos e quem ocupa cada um." />;
  if (chart.tabs === false || groups.length < 2) return <Styled style={chart.style} positions={chart.positions} />;
  // Uma aba por grupo (Diretoria, Majestades do tiro, Beleza...); dentro dela, o estilo escolhido
  const current = groups.some(g => g.name === tab) ? tab : groups[0].name;
  return (
    <div>
      <Tabs tabs={groups.map(g => ({ id: g.name, label: g.name }))} value={current} onChange={setTab} />
      <Styled style={chart.style} positions={chart.positions.filter(p => p.group === current)} />
    </div>
  );
}
