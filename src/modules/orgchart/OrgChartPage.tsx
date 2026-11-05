/** Organograma na área do sócio: só para consultar. A edição fica na diretoria (OrgChartAdminPage). */
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberDoc, OrgChartDoc, OrgPosition, OrgChartStyle, RoleDoc } from '../../shared/types.ts';
import { societyType } from '../../shared/societyTypes.ts';
import { Button, Card, Field, Input, Loading, PageHeader, Select, Toggle, useConfirm } from '../../ui/index.tsx';
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
  const [draft, setDraft] = useState<OrgChartDoc>(chart);
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 500 });
  const setPos = (id: string, patch: Partial<OrgPosition>) => setDraft(d => ({ ...d, positions: d.positions.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
  const move = (id: string, dir: -1 | 1) =>
    setDraft(d => {
      const list = [...d.positions].sort((a, b) => a.order - b.order);
      const i = list.findIndex(p => p.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, positions: list.map((p, k) => ({ ...p, order: k + 1 })) };
    });
  const sorted = [...draft.positions].sort((a, b) => a.order - b.order);
  const canRoles = t.can('papeis', 'aprovar');
  const roles = useList<RoleDoc>(canRoles ? P.roles(t.tenantId) : null, { limit: 50 });
  const saved = new Map(chart.positions.map(p => [p.id, p]));
  const restore = async () => {
    const ok = await confirm({ title: 'Restaurar cargos sugeridos', text: `Troca a lista atual pelos cargos sugeridos para "${societyType(t.tenant.societyType).label}". As pessoas indicadas serão retiradas.`, confirmLabel: 'Restaurar' });
    if (!ok) return;
    const r = await run<{ style: OrgChartStyle; positions: OrgPosition[] }>('orgchart.preset', { tenantId: t.tenantId });
    if (r) setDraft(d => ({ ...d, style: r.style, positions: r.positions }));
  };
  const save = async () => {
    const positions = draft.positions.map(p => ({
      ...p,
      personName: p.personName?.trim() || undefined,
      memberId: p.memberId || undefined,
      parentId: p.parentId || undefined,
      roleId: p.roleId || undefined,
    }));
    const r = await run('orgchart.save', { tenantId: t.tenantId, style: draft.style, title: draft.title, positions, showOnPublicPage: draft.showOnPublicPage }, { success: 'Organograma salvo.' });
    if (r) onClose();
  };
  return (
    <Card className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Título">{id => <Input id={id} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />}</Field>
        <Field label="Estilo" hint={STYLES.find(s => s.id === draft.style)?.hint}>
          {id => (
            <Select id={id} value={draft.style} onChange={e => setDraft({ ...draft, style: e.target.value as OrgChartStyle })}>
              {STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Toggle label="Mostrar na página pública da sociedade" checked={draft.showOnPublicPage} onChange={v => setDraft({ ...draft, showOnPublicPage: v })} />
      <div className="space-y-2">
        {sorted.map((p, i) => (
          <div key={p.id} className="grid gap-2 p-3 rounded-xl border border-line bg-bg sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input aria-label="Cargo" value={p.title} onChange={e => setPos(p.id, { title: e.target.value })} placeholder="Cargo" />
            <Input aria-label="Grupo" value={p.group} onChange={e => setPos(p.id, { group: e.target.value })} placeholder="Grupo" />
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
              <button type="button" aria-label="Descer" disabled={i === sorted.length - 1} onClick={() => move(p.id, 1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" aria-label="Remover cargo" onClick={() => setDraft(d => ({ ...d, positions: d.positions.filter(x => x.id !== p.id && true).map(x => (x.parentId === p.id ? { ...x, parentId: undefined } : x)) }))} className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="sm:col-span-4 flex flex-wrap items-center gap-4">
              {members.data.length > 0 && !p.memberId && (
                <Input aria-label="Nome livre" className="sm:max-w-64" value={p.personName || ''} onChange={e => setPos(p.id, { personName: e.target.value })} placeholder="Ou digite um nome (sem cadastro)" />
              )}
              <Toggle label="Destaque (coroa)" checked={p.highlight} onChange={v => setPos(p.id, { highlight: v })} />
              {canRoles && (
                <label className="flex items-center gap-2 text-sm">
                  Acesso no portal
                  <Select
                    aria-label="Acesso ligado ao cargo"
                    className="w-48"
                    value={p.roleId || ''}
                    disabled={!!saved.get(p.id)?.memberId && !!saved.get(p.id)?.roleId}
                    onChange={e => setPos(p.id, { roleId: e.target.value || undefined })}
                  >
                    <option value="">Só no organograma</option>
                    {roles.data.filter(r => r.id !== 'socio').map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
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
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setDraft(d => ({ ...d, positions: [...d.positions, { id: newId(), title: 'Novo cargo', group: 'Diretoria', order: d.positions.length + 1, highlight: false }] }))}>Novo cargo</Button>
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
