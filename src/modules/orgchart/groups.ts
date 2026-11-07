/** Abas (grupos) do organograma em ordem: as registradas em chart.groups primeiro, depois as que só aparecem nos cargos. */
import type { OrgChartDoc, OrgGroup } from '../../shared/types.ts';

export function orderedGroups(chart: Pick<OrgChartDoc, 'positions' | 'groups'>): OrgGroup[] {
  const out: OrgGroup[] = [];
  const known = new Map((chart.groups || []).map(g => [g.name, g]));
  const names = new Set(chart.positions.map(p => p.group));
  for (const g of [...(chart.groups || [])].sort((a, b) => a.order - b.order)) if (names.has(g.name) && !out.some(x => x.name === g.name)) out.push(g);
  // Grupo sem registro: entra na ordem do primeiro cargo dele
  const rest = [...chart.positions].sort((a, b) => a.order - b.order).map(p => p.group);
  for (const name of rest) if (!out.some(x => x.name === name)) out.push(known.get(name) || { name, order: 900 + out.length });
  return out.map((g, i) => ({ ...g, order: i + 1 }));
}
