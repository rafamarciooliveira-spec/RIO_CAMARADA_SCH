/** Exibição do organograma nos três estilos. Usado no portal e na página pública. */
import { Fragment, useMemo, useState } from 'react';
import { Crown } from 'lucide-react';
import type { OrgChartDoc, OrgPosition } from '../../shared/types.ts';
import { cx, EmptyState, Tabs } from '../../ui/index.tsx';
import { orderedGroups } from './groups.ts';

function initials(name?: string) {
  return (name || '?').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function Person({ p, big = false, fluid = false }: { p: OrgPosition; big?: boolean; fluid?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-2xl border bg-surface text-center flex flex-col items-center',
        big ? 'p-5 border-accent/60 shadow-lg shadow-black/30 min-w-44' : fluid ? 'p-2 sm:p-3 border-line w-full min-w-0' : 'p-3 border-line min-w-36',
        p.highlight && !big && 'border-accent/50'
      )}
    >
      {p.highlight && <Crown className={cx('text-accent', big ? 'w-7 h-7 mb-1' : 'w-4 h-4 mb-1')} aria-hidden />}
      <div className={cx('rounded-full bg-brand text-on-brand flex items-center justify-center font-bold', big ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm')} aria-hidden>
        {initials(p.personName)}
      </div>
      <div className={cx('mt-2 font-semibold leading-tight break-words max-w-full', big ? 'text-base' : 'text-sm')}>{p.personName || 'A definir'}</div>
      <div className={cx('text-muted break-words max-w-full', big ? 'text-sm' : 'text-xs')}>{p.title}</div>
    </div>
  );
}

function sortPos(a: OrgPosition, b: OrgPosition) {
  return a.order - b.order || a.title.localeCompare(b.title, 'pt-BR');
}

/**
 * Montagem em linhas: cargos da mesma linha lado a lado, e quem fica "abaixo de" outro cargo
 * (o vice abaixo do titular) vai na mesma coluna, logo embaixo. Sem linha nem "abaixo de", null.
 */
function Rows({ list }: { list: OrgPosition[] }) {
  const sorted = [...list].sort(sortPos);
  const ids = new Set(sorted.map(p => p.id));
  const kids = new Map<string, OrgPosition[]>();
  for (const p of sorted) if (p.under && p.under !== p.id && ids.has(p.under)) kids.set(p.under, [...(kids.get(p.under) || []), p]);
  const tops = sorted.filter(p => !(p.under && p.under !== p.id && ids.has(p.under)));
  if (!kids.size && !tops.some(p => p.row)) return null;
  const rows = new Map<number, OrgPosition[]>();
  for (const p of tops) rows.set(p.row || 1000, [...(rows.get(p.row || 1000) || []), p]);
  const Stack = ({ p, seen }: { p: OrgPosition; seen: Set<string> }) => (
    <>
      <Person p={p} fluid />
      {(kids.get(p.id) || [])
        .filter(k => !seen.has(k.id))
        .map(k => (
          <Fragment key={k.id}>
            <span className="w-px h-3 bg-line" aria-hidden />
            <Stack p={k} seen={new Set([...seen, k.id])} />
          </Fragment>
        ))}
    </>
  );
  return (
    <div className="space-y-4">
      {[...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([k, line]) => (
          <div key={k} className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
            {line.map(p => (
              <div key={p.id} className="flex flex-col items-center w-[calc(33.333%-0.375rem)] min-w-[4.75rem] sm:w-44">
                <Stack p={p} seen={new Set([p.id])} />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function Groups({ positions }: { positions: OrgPosition[] }) {
  const groups = new Map<string, OrgPosition[]>();
  for (const p of [...positions].sort(sortPos)) groups.set(p.group, [...(groups.get(p.group) || []), p]);
  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([g, list]) => (
        <section key={g}>
          {groups.size > 1 && <h3 className="text-xs uppercase tracking-wider text-muted mb-2">{g}</h3>}
          {Rows({ list }) || <div className="flex flex-wrap gap-3">{list.map(p => <Person key={p.id} p={p} />)}</div>}
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

export function Styled({ style, positions }: { style: OrgChartDoc['style']; positions: OrgPosition[] }) {
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
