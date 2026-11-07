/** Organograma na área do sócio: só para consultar. A edição fica na diretoria (OrgChartAdminPage). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberDoc, OrgChartDoc, OrgGroup, OrgPosition, OrgChartStyle, RoleDoc } from '../../shared/types.ts';
import { orderedGroups } from './groups.ts';
import { societyType } from '../../shared/societyTypes.ts';
import { Button, Card, Field, Input, Loading, Notice, PageHeader, Select, Toggle, useConfirm } from '../../ui/index.tsx';
import { OrgChartView } from './OrgChartView.tsx';
import { MandatesGallery } from './Handover.tsx';

const STYLES: { id: OrgChartStyle; label: string; hint: string }[] = [
  { id: 'arvore', label: 'Árvore (hierarquia)', hint: 'Cada cargo abaixo do seu superior. Bom para clubes e times.' },
  { id: 'cartoes', label: 'Cartões por grupo', hint: 'Diretoria, direção artística, conselho, cada grupo numa linha.' },
  { id: 'corte', label: 'Corte (majestades em destaque)', hint: 'Rei, rainha e cargos de honra em destaque no topo. Bom para tiro e bolão.' },
];

let seq = 0;
const newId = () => `cargo_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function Editor({ chart, onClose }: { chart: OrgChartDoc; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<OrgChartDoc>(() => ({ ...chart, groups: orderedGroups(chart) }));
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 500 });
  const canRoles = t.can('papeis', 'aprovar');
  const roles = useList<RoleDoc>(canRoles ? P.roles(t.tenantId) : null, { limit: 50 });
  const saved = new Map(chart.positions.map(p => [p.id, p]));
  const groups = draft.groups || [];
  const roleName = (id?: string) => roles.data.find(r => r.id === id)?.name || id || '';

  const setPos = (id: string, patch: Partial<OrgPosition>) => setDraft(d => ({ ...d, positions: d.positions.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
  const setGroups = (list: OrgGroup[]) => setDraft(d => ({ ...d, groups: list.map((g, i) => ({ ...g, order: i + 1 })) }));
  const inGroup = (name: string) => draft.positions.filter(p => p.group === name).sort((a, b) => a.order - b.order);

  /** Sobe ou desce o cargo dentro da aba */
  const move = (id: string, dir: -1 | 1) =>
    setDraft(d => {
      const pos = d.positions.find(p => p.id === id)!;
      const list = d.positions.filter(p => p.group === pos.group).sort((a, b) => a.order - b.order);
      const i = list.findIndex(p => p.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      const a = list[i].order;
      const b = list[j].order === a ? a + dir : list[j].order;
      return { ...d, positions: d.positions.map(p => (p.id === list[i].id ? { ...p, order: b } : p.id === list[j].id ? { ...p, order: a } : p)) };
    });
  const moveGroup = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= groups.length) return;
    const list = [...groups];
    [list[i], list[j]] = [list[j], list[i]];
    setGroups(list);
  };
  const renameGroup = (old: string, name: string) =>
    setDraft(d => ({ ...d, groups: (d.groups || []).map(g => (g.name === old ? { ...g, name } : g)), positions: d.positions.map(p => (p.group === old ? { ...p, group: name } : p)) }));
  const addPosition = (group: string) =>
    setDraft(d => ({ ...d, positions: [...d.positions, { id: newId(), title: 'Novo cargo', group, order: Math.max(0, ...d.positions.map(p => p.order)) + 1, highlight: false }] }));
  const addGroup = () => {
    let name = 'Nova aba';
    for (let k = 2; groups.some(g => g.name === name); k++) name = `Nova aba ${k}`;
    setDraft(d => ({
      ...d,
      groups: [...(d.groups || []), { name, order: (d.groups || []).length + 1 }],
      positions: [...d.positions, { id: newId(), title: 'Novo cargo', group: name, order: Math.max(0, ...d.positions.map(p => p.order)) + 1, highlight: false }],
    }));
  };
  const removePosition = (id: string) =>
    setDraft(d => {
      const positions = d.positions.filter(x => x.id !== id).map(x => (x.parentId === id ? { ...x, parentId: undefined } : x));
      return { ...d, positions, groups: (d.groups || []).filter(g => positions.some(p => p.group === g.name)) };
    });

  const restore = async () => {
    const ok = await confirm({ title: 'Restaurar cargos sugeridos', text: `Troca a lista atual pelos cargos sugeridos para "${societyType(t.tenant.societyType).label}". As pessoas indicadas serão retiradas.`, confirmLabel: 'Restaurar' });
    if (!ok) return;
    const r = await run<{ style: OrgChartStyle; positions: OrgPosition[] }>('orgchart.preset', { tenantId: t.tenantId });
    if (r) setDraft(d => ({ ...d, style: r.style, positions: r.positions, groups: orderedGroups({ positions: r.positions }) }));
  };

  // Quem ocupa cargo numa aba com acesso novo passa a ter esse acesso: avisar antes de salvar
  const accessNews = draft.positions.filter(p => {
    const g = groups.find(x => x.name === p.group);
    const eff = g?.roleId || (p.roleFromGroup ? undefined : p.roleId);
    return saved.get(p.id)?.memberId && (saved.get(p.id)?.roleId || '') !== (eff || '');
  });

  const save = async () => {
    if (accessNews.length) {
      const ok = await confirm({
        title: 'Mudar o acesso de quem já ocupa cargo',
        text: `${accessNews.map(p => `${p.personName || 'Quem ocupa'} (${p.title})`).join(', ')}: o acesso ao portal muda junto com o salvamento. Quem ganha um acesso novo recebe um aviso.`,
        confirmLabel: 'Salvar e mudar acessos',
      });
      if (!ok) return;
    }
    const positions = draft.positions.map(p => ({
      ...p,
      title: p.title.trim(),
      group: p.group.trim() || 'Diretoria',
      personName: p.personName?.trim() || undefined,
      memberId: p.memberId || undefined,
      parentId: p.parentId || undefined,
      roleId: p.roleId || undefined,
    }));
    const r = await run(
      'orgchart.save',
      { tenantId: t.tenantId, style: draft.style, title: draft.title, positions, groups: groups.map(g => ({ name: g.name.trim(), order: g.order, ...(g.roleId ? { roleId: g.roleId } : {}) })), tabs: draft.tabs !== false, showOnPublicPage: draft.showOnPublicPage },
      { success: 'Organograma salvo.' }
    );
    if (r) onClose();
  };

  return (
    <Card className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="1. Título">{id => <Input id={id} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />}</Field>
        <Field label="2. Estilo" hint={STYLES.find(s => s.id === draft.style)?.hint}>
          {id => (
            <Select id={id} value={draft.style} onChange={e => setDraft({ ...draft, style: e.target.value as OrgChartStyle })}>
              {STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <div className="space-y-2">
        <Toggle label="3. Mostrar cada grupo numa aba (Diretoria, Majestades do tiro, Beleza...)" checked={draft.tabs !== false} onChange={v => setDraft({ ...draft, tabs: v })} />
        <Toggle label="4. Mostrar na página pública da sociedade" checked={draft.showOnPublicPage} onChange={v => setDraft({ ...draft, showOnPublicPage: v })} />
      </div>

      <div className="space-y-1">
        <div className="text-sm font-semibold">5. Abas e cargos</div>
        <p className="text-xs text-muted">
          Cada aba junta um grupo de cargos. Numa aba de diretoria, escolha o nível de acesso ao portal: todos os cargos dela recebem esse acesso (por exemplo, a diretoria executiva vê mais que a diretoria).
          {canRoles && (
            <>
              {' '}Os níveis de acesso e o que cada um vê ficam em{' '}
              <Link to={t.to('configuracoes')} className="underline font-semibold">Configurações, Papéis e pessoas</Link>.
            </>
          )}
        </p>
      </div>

      {groups.map((g, gi) => (
        <section key={gi} className="rounded-2xl border border-line bg-bg p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label={`Nome da aba ${gi + 1}`} className="flex-1 min-w-40 font-semibold" value={g.name} maxLength={60} onChange={e => renameGroup(g.name, e.target.value)} />
            <div className="flex items-center">
              <button type="button" aria-label="Aba para cima" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Aba para baixo" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
            </div>
          </div>
          {canRoles && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Acesso de quem está nesta aba
              <Select aria-label={`Acesso da aba ${g.name}`} className="w-full sm:w-56" value={g.roleId || ''} onChange={e => setGroups(groups.map((x, k) => (k === gi ? { ...x, roleId: e.target.value || undefined } : x)))}>
                <option value="">Cada cargo define o seu</option>
                {roles.data.filter(r => r.id !== 'socio').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </label>
          )}
          <div className="space-y-2">
            {inGroup(g.name).map((p, i, list) => (
              <div key={p.id} className="grid gap-2 p-3 rounded-xl border border-line bg-surface sm:grid-cols-[1fr_1fr_auto]">
                <Input aria-label="Cargo" value={p.title} onChange={e => setPos(p.id, { title: e.target.value })} placeholder="Nome do cargo" />
                {p.roleId || saved.get(p.id)?.roleId ? (
                  <div className="text-sm px-3 py-2 rounded-lg bg-surface-2 text-muted truncate" title="Cargo com acesso: troque o ocupante em Passar o cargo">
                    {p.personName || 'Vago'} · troca em Passar o cargo
                  </div>
                ) : members.data.length > 0 ? (
                  <Select aria-label="Quem ocupa" value={p.memberId || ''} onChange={e => {
                    const m = members.data.find(x => x.id === e.target.value);
                    setPos(p.id, { memberId: m?.id, personName: m?.fullName || p.personName });
                  }}>
                    <option value="">{p.personName && !p.memberId ? p.personName : 'Escolha o sócio (ou digite abaixo)'}</option>
                    {members.data.map(m => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                  </Select>
                ) : (
                  <Input aria-label="Quem ocupa" value={p.personName || ''} onChange={e => setPos(p.id, { personName: e.target.value })} placeholder="Nome de quem ocupa" />
                )}
                <div className="flex items-center gap-1 justify-end">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(p.id, -1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                  <button type="button" aria-label="Descer" disabled={i === list.length - 1} onClick={() => move(p.id, 1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
                  <button type="button" aria-label="Remover cargo" onClick={() => removePosition(p.id)} className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="sm:col-span-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {members.data.length > 0 && !p.memberId && !(p.roleId || saved.get(p.id)?.roleId) && (
                    <Input aria-label="Nome livre" className="sm:max-w-64" value={p.personName || ''} onChange={e => setPos(p.id, { personName: e.target.value })} placeholder="Ou digite um nome (sem cadastro)" />
                  )}
                  <Toggle label="Destaque (coroa)" checked={p.highlight} onChange={v => setPos(p.id, { highlight: v })} />
                  <label className="flex items-center gap-2 text-sm">
                    Aba
                    <Select aria-label="Aba do cargo" className="w-44" value={p.group} onChange={e => setPos(p.id, { group: e.target.value })}>
                      {groups.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
                    </Select>
                  </label>
                  {canRoles && !g.roleId && (
                    <label className="flex items-center gap-2 text-sm">
                      Acesso no portal
                      <Select aria-label="Acesso ligado ao cargo" className="w-48" value={p.roleFromGroup ? '' : p.roleId || ''} onChange={e => setPos(p.id, { roleId: e.target.value || undefined, roleFromGroup: undefined })}>
                        <option value="">Só no organograma</option>
                        {roles.data.filter(r => r.id !== 'socio').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </Select>
                    </label>
                  )}
                  {g.roleId && <span className="text-xs text-muted">Acesso da aba: {roleName(g.roleId)}</span>}
                  {draft.style === 'arvore' && (
                    <label className="flex items-center gap-2 text-sm">
                      Abaixo de
                      <Select aria-label="Superior" className="w-48" value={p.parentId || ''} onChange={e => setPos(p.id, { parentId: e.target.value || undefined })}>
                        <option value="">Ninguém (topo)</option>
                        {draft.positions.filter(x => x.id !== p.id).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
                      </Select>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => addPosition(g.name)}>Cargo nesta aba</Button>
        </section>
      ))}

      {accessNews.length > 0 && <Notice tone="warn">Ao salvar, muda o acesso ao portal de: {accessNews.map(p => `${p.personName || 'quem ocupa'} (${p.title})`).join(', ')}.</Notice>}

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addGroup}>Nova aba</Button>
          <Button variant="ghost" icon={<RotateCcw className="w-4 h-4" />} onClick={restore}>Cargos sugeridos</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Salvar organograma</Button>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted mb-3">Prévia</div>
        <OrgChartView chart={draft} />
      </div>
    </Card>
  );
}

export function useChartDoc() {
  const t = useTenant();
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const doc: OrgChartDoc = chart.data || { style: societyType(t.tenant.societyType).orgStyle, title: t.labels.board, positions: [], showOnPublicPage: false, updatedAt: '' };
  return { loading: chart.loading, saved: !!chart.data, doc };
}

export default function OrgChartPage() {
  const t = useTenant();
  const { loading, doc } = useChartDoc();
  if (loading) return <Loading />;
  return (
    <>
      <PageHeader title={doc.title || 'Organograma'} subtitle={`Quem é quem na ${t.tenant.shortName || t.tenant.name}.`} />
      <div className="space-y-5">
        <OrgChartView chart={doc} />
        <MandatesGallery />
      </div>
    </>
  );
}
