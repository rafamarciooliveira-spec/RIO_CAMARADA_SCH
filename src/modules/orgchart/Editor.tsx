/**
 * Edição do organograma (diretoria): abas, cargos, quem ocupa, linha e "abaixo de" (vice abaixo do
 * titular), acesso por aba e importação por planilha. Cada aba tem uma chave fixa na edição: trocar o
 * nome não mexe na lista de abas dos cargos (antes cada letra digitada virava uma aba nova na lista).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberDoc, OrgChartDoc, OrgChartStyle, OrgGroup, OrgPosition, RoleDoc } from '../../shared/types.ts';
import { societyType } from '../../shared/societyTypes.ts';
import { Button, Card, Field, Input, Modal, Notice, Select, Toggle, useConfirm, useToast } from '../../ui/index.tsx';
import { orderedGroups } from './groups.ts';
import { Styled } from './OrgChartView.tsx';
import { instructionRows, mergeSheet, norm, parseSheet, SHEET_COLUMNS, templateRows, type MergeResult } from './orgSheet.ts';
import { parseCsv } from '../members/csvParse.ts';
import { roleForTitle } from '../../shared/roleMatch.ts';
import { readXlsx, saveBlob, writeXlsx } from '../../utils/xlsx.ts';

const STYLES: { id: OrgChartStyle; label: string; hint: string }[] = [
  { id: 'cartoes', label: 'Cartões em linhas', hint: 'Cada aba em linhas: cargos da mesma linha lado a lado e o vice logo abaixo do titular.' },
  { id: 'corte', label: 'Corte (majestades em destaque)', hint: 'Cargos com destaque (coroa) grandes no topo; os demais em linhas. Bom para tiro e bolão.' },
  { id: 'arvore', label: 'Árvore (hierarquia)', hint: 'Cada cargo ligado ao seu superior por linhas. Bom para clubes e times.' },
];

let seq = 0;
const newId = (p = 'cargo') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

type EGroup = OrgGroup & { key: string };
interface Draft {
  title: string;
  style: OrgChartStyle;
  tabs: boolean;
  showOnPublicPage: boolean;
  groups: EGroup[];
  positions: OrgPosition[]; // group = chave da aba (EGroup.key) durante a edição
}

function toDraft(chart: Pick<OrgChartDoc, 'positions' | 'groups'>, base: Omit<Draft, 'groups' | 'positions'>, order?: string[]): Draft {
  let list = orderedGroups(chart);
  if (order) list = [...list].sort((a, b) => (order.indexOf(a.name) < 0 ? 999 : order.indexOf(a.name)) - (order.indexOf(b.name) < 0 ? 999 : order.indexOf(b.name)));
  const groups = list.map(g => ({ ...g, key: newId('aba') }));
  const keyOf = new Map(groups.map(g => [g.name, g.key]));
  return { ...base, groups, positions: chart.positions.map(p => ({ ...p, group: keyOf.get(p.group) || groups[0]?.key || '' })) };
}

export function Editor({ chart, onClose }: { chart: OrgChartDoc; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(chart, { title: chart.title, style: chart.style, tabs: chart.tabs !== false, showOnPublicPage: chart.showOnPublicPage })
  );
  const [importing, setImporting] = useState(false);
  const members = useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 500 });
  const canRoles = t.can('papeis', 'aprovar');
  const roles = useList<RoleDoc>(canRoles ? P.roles(t.tenantId) : null, { limit: 50 });
  const saved = new Map(chart.positions.map(p => [p.id, p]));
  const groups = draft.groups;
  const nameOf = (key: string) => groups.find(g => g.key === key)?.name || '';
  const roleName = (id?: string) => roles.data.find(r => r.id === id)?.name || id || '';

  /** O organograma como fica gravado (abas pelo nome) */
  const asChart = useMemo(() => {
    const names = new Map(draft.groups.map(g => [g.key, g.name.trim() || 'Sem nome']));
    return {
      positions: draft.positions.map(p => ({ ...p, group: names.get(p.group) || 'Diretoria' })),
      groups: draft.groups.map(({ key: _key, ...g }) => ({ ...g, name: names.get(_key)! })),
    };
  }, [draft.groups, draft.positions]);

  const setPos = (id: string, patch: Partial<OrgPosition>) => setDraft(d => ({ ...d, positions: d.positions.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
  const setGroup = (key: string, patch: Partial<EGroup>) => setDraft(d => ({ ...d, groups: d.groups.map(g => (g.key === key ? { ...g, ...patch } : g)) }));
  const inGroup = (key: string) => draft.positions.filter(p => p.group === key).sort((a, b) => a.order - b.order);

  // Árvore: "Abaixo de" é o superior (parentId). Cartões e corte: o cargo logo acima na mesma coluna (under)
  const field: 'parentId' | 'under' = draft.style === 'arvore' ? 'parentId' : 'under';
  /** Quem está abaixo deste cargo (direta ou indiretamente): não pode virar o "acima" dele */
  const below = (id: string) => {
    const out = new Set<string>();
    const walk = (x: string) => {
      for (const p of draft.positions) {
        if (p[field] !== x || out.has(p.id)) continue;
        out.add(p.id);
        walk(p.id);
      }
    };
    walk(id);
    return out;
  };

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
  const moveGroup = (i: number, dir: -1 | 1) =>
    setDraft(d => {
      const j = i + dir;
      if (j < 0 || j >= d.groups.length) return d;
      const list = [...d.groups];
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, groups: list.map((g, k) => ({ ...g, order: k + 1 })) };
    });
  const nextOrder = (d: Draft) => Math.max(0, ...d.positions.map(p => p.order)) + 1;
  const addPosition = (key: string) => setDraft(d => ({ ...d, positions: [...d.positions, { id: newId(), title: 'Novo cargo', group: key, order: nextOrder(d), highlight: false }] }));
  const addGroup = () =>
    setDraft(d => {
      let name = 'Nova aba';
      for (let k = 2; d.groups.some(g => g.name === name); k++) name = `Nova aba ${k}`;
      const key = newId('aba');
      return {
        ...d,
        groups: [...d.groups, { key, name, order: d.groups.length + 1 }],
        positions: [...d.positions, { id: newId(), title: 'Novo cargo', group: key, order: nextOrder(d), highlight: false }],
      };
    });
  const removePosition = (id: string) =>
    setDraft(d => {
      const positions = d.positions.filter(x => x.id !== id).map(x => ({ ...x, parentId: x.parentId === id ? undefined : x.parentId, under: x.under === id ? undefined : x.under }));
      return { ...d, positions, groups: d.groups.filter(g => positions.some(p => p.group === g.key)) };
    });

  const restore = async () => {
    const ok = await confirm({ title: 'Restaurar cargos sugeridos', text: `Troca a lista atual pelos cargos sugeridos para "${societyType(t.tenant.societyType).label}". As pessoas indicadas serão retiradas.`, confirmLabel: 'Restaurar' });
    if (!ok) return;
    const r = await run<{ style: OrgChartStyle; positions: OrgPosition[] }>('orgchart.preset', { tenantId: t.tenantId });
    if (r) setDraft(d => toDraft({ positions: r.positions }, { title: d.title, style: r.style, tabs: d.tabs, showOnPublicPage: d.showOnPublicPage }));
  };

  /** Planilha lida: junta com o que está na tela (ainda não grava) */
  const applyImport = (res: MergeResult) =>
    setDraft(d => {
      const roleOf = new Map(asChart.groups.map(g => [g.name, g.roleId]));
      return toDraft(
        { positions: res.positions, groups: res.groupOrder.map((name, i) => ({ name, order: i + 1, ...(roleOf.get(name) ? { roleId: roleOf.get(name) } : {}) })) },
        { title: d.title, style: d.style === 'arvore' ? 'cartoes' : d.style, tabs: d.tabs, showOnPublicPage: d.showOnPublicPage },
        res.groupOrder
      );
    });

  // Cargo com papel de mesmo nome (Secretário(a), Tesoureiro(a)...) ainda "Só no organograma": oferece ligar o acesso,
  // para que pôr alguém no cargo (aqui, na gestão ou em Passar o cargo) já dê as permissões e tirar quem sai
  const linkable = canRoles
    ? draft.positions
        .filter(p => !p.roleId && !p.accessOff && !groups.find(g => g.key === p.group)?.roleId)
        .map(p => ({ p, role: roleForTitle(p.title, roles.data) }))
        .filter((x): x is { p: OrgPosition; role: RoleDoc & { id: string } } => !!x.role)
    : [];
  // Pode ligar: cargo vago, ou ocupado por sócio que já entra no portal. Nome digitado sem cadastro, não
  const occupantOk = (p: OrgPosition) => (p.memberId ? !!members.data.find(m => m.id === p.memberId)?.uid : !p.personName?.trim());
  const waitReason = (p: OrgPosition) => (p.memberId ? 'ainda não entrou no portal' : 'nome sem cadastro de sócio');
  const linkReady = linkable.filter(x => occupantOk(x.p));
  const linkWaiting = linkable.filter(x => !occupantOk(x.p));
  const autoRole = (p: OrgPosition) => linkReady.find(x => x.p.id === p.id)?.role.id;

  // Quem ocupa cargo numa aba com acesso novo passa a ter esse acesso: avisar antes de salvar
  const accessNews = draft.positions.filter(p => {
    const g = groups.find(x => x.key === p.group);
    const eff = g?.roleId || (p.roleFromGroup ? undefined : p.roleId || autoRole(p));
    return saved.get(p.id)?.memberId && (saved.get(p.id)?.roleId || '') !== (eff || '');
  });

  const save = async () => {
    const names = groups.map(g => norm(g.name));
    const empty = groups.find(g => g.name.trim().length < 1);
    const twice = names.find((n, i) => names.indexOf(n) !== i);
    if (empty) return toast.show('Uma das abas está sem nome.', 'erro');
    if (twice) return toast.show(`Duas abas com o mesmo nome (${groups.find(g => norm(g.name) === twice)?.name}). Troque o nome de uma ou junte os cargos numa só.`, 'erro');
    const short = draft.positions.find(p => p.title.trim().length < 2);
    if (short) return toast.show('Há cargo sem nome (mínimo de 2 letras).', 'erro');
    if (accessNews.length) {
      const ok = await confirm({
        title: 'Mudar o acesso de quem já ocupa cargo',
        text: `${accessNews.map(p => `${p.personName || 'Quem ocupa'} (${p.title})`).join(', ')}: o acesso ao portal muda junto com o salvamento. Quem ganha um acesso novo recebe um aviso.`,
        confirmLabel: 'Salvar e mudar acessos',
      });
      if (!ok) return;
    }
    const positions = asChart.positions.map(p => ({
      ...p,
      title: p.title.trim(),
      group: p.group.trim(),
      personName: p.personName?.trim() || undefined,
      memberId: p.memberId || undefined,
      parentId: p.parentId || undefined,
      under: p.under || undefined,
      roleId: p.roleId || autoRole(p) || undefined,
      accessOff: p.accessOff || undefined,
      row: p.row || undefined,
    }));
    const r = await run<{ ok: boolean; notes?: string[] }>(
      'orgchart.save',
      {
        tenantId: t.tenantId,
        style: draft.style,
        title: draft.title,
        positions,
        groups: asChart.groups.map((g, i) => ({ name: g.name.trim(), order: i + 1, ...(g.roleId ? { roleId: g.roleId } : {}) })),
        tabs: draft.tabs,
        showOnPublicPage: draft.showOnPublicPage,
      },
      { success: 'Organograma salvo.' }
    );
    if (r?.notes?.length) toast.show(r.notes.join(' '), 'info');
    if (r) onClose();
  };

  const tree = draft.style === 'arvore';


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
        <Toggle label="3. Mostrar cada grupo numa aba (Diretoria, Majestades do tiro, Beleza...)" checked={draft.tabs} onChange={v => setDraft({ ...draft, tabs: v })} />
        <Toggle label="4. Mostrar na página pública da sociedade" checked={draft.showOnPublicPage} onChange={v => setDraft({ ...draft, showOnPublicPage: v })} />
      </div>

      <div className="rounded-2xl border border-line bg-surface-2 p-3 flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-accent shrink-0" aria-hidden />
        <p className="text-sm flex-1 min-w-48">5. Tem a lista de cargos numa planilha? Baixe o modelo, preencha no Excel e envie. Depois é só escolher quem ocupa cada cargo aqui.</p>
        <Button size="sm" variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setImporting(true)}>
          Importar planilha
        </Button>
      </div>

      <div className="space-y-1">
        <div className="text-sm font-semibold">6. Abas e cargos</div>
        <p className="text-xs text-muted">
          {tree
            ? 'No estilo árvore, escolha o superior de cada cargo em "Abaixo de".'
            : 'Cargos com a mesma Linha ficam lado a lado. Em "Abaixo de", escolha o titular para o vice ficar logo embaixo dele, na mesma coluna.'}{' '}
          Numa aba de diretoria, o nível de acesso ao portal vale para todos os cargos dela (por exemplo, a diretoria executiva vê mais que a diretoria).
          {canRoles && (
            <>
              {' '}O que cada nível vê fica em{' '}
              <Link to={t.to('configuracoes')} className="underline font-semibold">Configurações, Papéis e pessoas</Link>.
            </>
          )}
        </p>
      </div>

      {linkable.length > 0 && (
        <Notice tone={linkWaiting.length ? 'warn' : 'info'}>
          <div className="space-y-2">
            <p>
              {linkReady.length > 0 ? 'Ao salvar, estes cargos passam a dar o acesso do papel de mesmo nome:' : 'Estes cargos têm um papel de acesso com o mesmo nome, mas ainda não dá para ligar:'}{' '}
              {linkReady.map(x => `${x.p.title}${x.p.personName ? ` (${x.p.personName})` : ''}`).join(', ')}
              {linkWaiting.length > 0 && `${linkReady.length ? '; ' : ''}${linkWaiting.map(x => `${x.p.title} (${x.p.personName}, ${waitReason(x.p)})`).join(', ')}`}.
            </p>
            <p>Quem estiver no cargo recebe o acesso do papel e, na troca de cargo (aqui, em Passar o cargo ou na gestão), quem sai perde e quem entra ganha. Para um cargo não dar acesso, escolha "Só no organograma" em Acesso no portal.</p>
            {linkWaiting.length > 0 && <p className="text-xs">Para esses: escolha o sócio cadastrado em Quem ocupa, e ele precisa ter entrado uma vez no portal com a conta Google (o convite fica em Sócios). Depois volte aqui.</p>}
          </div>
        </Notice>
      )}

      {groups.map((g, gi) => {
        const list = inGroup(g.key);
        const maxRow = Math.max(4, ...list.map(p => (p.row || 0) + 1));
        return (
          <section key={g.key} className="rounded-2xl border border-line bg-bg p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Nome da aba ${gi + 1}`} className="flex-1 min-w-40 font-semibold" value={g.name} maxLength={60} onChange={e => setGroup(g.key, { name: e.target.value })} />
              <div className="flex items-center">
                <button type="button" aria-label="Aba para cima" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Aba para baixo" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
              </div>
            </div>
            {canRoles && (
              <label className="flex flex-wrap items-center gap-2 text-sm">
                Acesso de quem está nesta aba
                <Select aria-label={`Acesso da aba ${g.name}`} className="w-full sm:w-56" value={g.roleId || ''} onChange={e => setGroup(g.key, { roleId: e.target.value || undefined })}>
                  <option value="">Cada cargo define o seu</option>
                  {roles.data.filter(r => r.id !== 'socio').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </label>
            )}
            <div className="space-y-2">
              {list.map((p, i) => {
                const locked = !!(p.roleId || saved.get(p.id)?.roleId);
                const blocked = below(p.id);
                const aboveOptions = (tree ? draft.positions : list).filter(x => x.id !== p.id && !blocked.has(x.id));
                return (
                  <div key={p.id} className="grid gap-2 p-3 rounded-xl border border-line bg-surface sm:grid-cols-[1fr_1fr_auto]">
                    <Input aria-label="Cargo" value={p.title} onChange={e => setPos(p.id, { title: e.target.value })} placeholder="Nome do cargo" />
                    {locked ? (
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
                      {members.data.length > 0 && !p.memberId && !locked && (
                        <Input aria-label="Nome livre" className="sm:max-w-64" value={p.personName || ''} onChange={e => setPos(p.id, { personName: e.target.value })} placeholder="Ou digite um nome (sem cadastro)" />
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        Abaixo de
                        <Select aria-label="Fica abaixo de" className="w-48" value={p[field] || ''} onChange={e => setPos(p.id, { [field]: e.target.value || undefined })}>
                          <option value="">{tree ? 'Ninguém (topo)' : 'Ninguém'}</option>
                          {aboveOptions.map(x => <option key={x.id} value={x.id}>{x.title}{tree && x.group !== p.group ? ` (${nameOf(x.group)})` : ''}</option>)}
                        </Select>
                      </label>
                      {!tree && !p.under && (
                        <label className="flex items-center gap-2 text-sm">
                          Linha
                          <Select aria-label="Linha do cargo" className="w-36" value={String(p.row || '')} onChange={e => setPos(p.id, { row: Number(e.target.value) || undefined })}>
                            <option value="">Automática</option>
                            {Array.from({ length: Math.min(30, maxRow) }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}ª linha</option>)}
                          </Select>
                        </label>
                      )}
                      <Toggle label="Destaque (coroa)" checked={p.highlight} onChange={v => setPos(p.id, { highlight: v })} />
                      <label className="flex items-center gap-2 text-sm">
                        Aba
                        <Select aria-label="Aba do cargo" className="w-44" value={p.group} onChange={e => setPos(p.id, { group: e.target.value, under: undefined })}>
                          {groups.map(x => <option key={x.key} value={x.key}>{x.name.trim() || 'Sem nome'}</option>)}
                        </Select>
                      </label>
                      {canRoles && !g.roleId && (
                        <label className="flex items-center gap-2 text-sm">
                          Acesso no portal
                          <Select
                            aria-label="Acesso ligado ao cargo"
                            className="w-48"
                            value={p.roleFromGroup ? '' : p.roleId || (p.accessOff ? '__off' : '')}
                            onChange={e => setPos(p.id, e.target.value === '__off' ? { roleId: undefined, accessOff: true, roleFromGroup: undefined } : { roleId: e.target.value || undefined, accessOff: undefined, roleFromGroup: undefined })}
                          >
                            {roleForTitle(p.title, roles.data) ? (
                              <>
                                <option value="">Automático: {roleForTitle(p.title, roles.data)!.name}</option>
                                <option value="__off">Só no organograma (sem acesso)</option>
                              </>
                            ) : (
                              <option value="">Só no organograma</option>
                            )}
                            {roles.data.filter(r => r.id !== 'socio').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </Select>
                        </label>
                      )}
                      {g.roleId && <span className="text-xs text-muted">Acesso da aba: {roleName(g.roleId)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => addPosition(g.key)}>Cargo nesta aba</Button>
            {list.length > 0 && (
              <div className="pt-2 border-t border-line">
                <div className="text-xs uppercase tracking-wider text-muted mb-2">Como fica esta aba</div>
                <Styled style={draft.style} positions={asChart.positions.filter(p => p.group === (g.name.trim() || 'Sem nome'))} />
              </div>
            )}
          </section>
        );
      })}

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
      {importing && (
        <ImportModal
          current={asChart.positions}
          groupOrder={asChart.groups.map(g => g.name)}
          members={members.data}
          onClose={() => setImporting(false)}
          onApply={res => {
            applyImport(res);
            setImporting(false);
            toast.show('Planilha aplicada. Confira as abas, escolha quem ocupa cada cargo e toque em Salvar organograma.', 'sucesso');
          }}
        />
      )}
    </Card>
  );
}

/** Janela da planilha: o que vai em cada coluna, modelo para baixar, envio e conferência antes de aplicar */
function ImportModal({ current, groupOrder, members, onClose, onApply }: { current: OrgPosition[]; groupOrder: string[]; members: MemberDoc[]; onClose: () => void; onApply: (r: MergeResult) => void }) {
  const t = useTenant();
  const toast = useToast();
  const [mode, setMode] = useState<'juntar' | 'trocar'>('juntar');
  const [fileName, setFileName] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [rows, setRows] = useState<ReturnType<typeof parseSheet>['rows'] | null>(null);
  const [reading, setReading] = useState(false);
  const result = useMemo(() => (rows ? mergeSheet(current, rows, { mode, members: members.map(m => ({ id: m.id, fullName: m.fullName })), newId }) : null), [rows, current, mode, members]);

  const download = async () => {
    try {
      const base = current.length ? current : societyType(t.tenant.societyType).positions.map((p, i) => ({ ...p, id: `cargo_${i + 1}` }));
      const blob = await writeXlsx([
        { name: 'Organograma', rows: templateRows(base, groupOrder), widths: [28, 24, 30, 8, 26, 10], boldHeader: true },
        { name: 'Instruções', rows: instructionRows(), widths: [8, 14, 14, 70, 18], boldHeader: true },
      ]);
      saveBlob(blob, `organograma-${t.tenant.slug}.xlsx`);
    } catch {
      toast.show('Não foi possível gerar a planilha neste aparelho.', 'erro');
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    setRows(null);
    setProblems([]);
    if (f.size > 5 * 1024 * 1024) return setProblems(['Arquivo grande demais (máximo de 5 MB).']);
    setReading(true);
    try {
      const lower = f.name.toLowerCase();
      let cells: string[][];
      if (lower.endsWith('.csv') || lower.endsWith('.txt')) cells = parseCsv(await f.text());
      else if (lower.endsWith('.xlsx')) cells = await readXlsx(await f.arrayBuffer());
      else throw new Error('Envie a planilha em .xlsx (Excel) ou .csv. Arquivo .xls antigo: abra no Excel e salve como .xlsx.');
      const r = parseSheet(cells);
      if (!r.rows.length) r.problems.unshift('Nenhum cargo encontrado. Confira se a primeira aba da planilha tem as colunas do modelo.');
      setRows(r.rows.length ? r.rows : null);
      setProblems(r.problems);
    } catch (e) {
      setProblems([(e as Error).message || 'Não foi possível ler a planilha.']);
    } finally {
      setReading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar organograma por planilha"
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={!result} onClick={() => result && onApply(result)}>Aplicar na tela</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="space-y-2">
          <div className="text-sm font-semibold">1. Baixe o modelo</div>
          <p className="text-sm text-muted">O modelo já vem com os cargos de hoje{current.length ? '' : ' sugeridos para o tipo da sociedade'}. Uma linha por cargo; não mude os títulos das colunas.</p>
          <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={download}>Baixar modelo (.xlsx)</Button>
        </section>
        <section className="space-y-2">
          <div className="text-sm font-semibold">2. O que vai em cada coluna</div>
          <ol className="space-y-1.5">
            {SHEET_COLUMNS.map((c, i) => (
              <li key={c.key} className="text-sm rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="font-mono font-bold text-accent mr-2">{String.fromCharCode(65 + i)}</span>
                <strong>{c.title}</strong> <span className="text-xs text-muted">({c.need.toLowerCase()})</span>
                <div className="text-xs text-muted">{c.what} Exemplo: {c.example}.</div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">Exemplo: Presidente na linha 1; Vice-presidente com Abaixo de = Presidente; Diretor de tiro, Secretário e Tesoureiro na linha 2; cada vice com Abaixo de = o seu titular; Conselho fiscal na linha 3.</p>
        </section>
        <section className="space-y-2">
          <div className="text-sm font-semibold">3. Envie a planilha preenchida</div>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-brand text-on-brand">
            <Upload className="w-4 h-4" aria-hidden />
            {reading ? 'Lendo...' : fileName ? 'Escolher outro arquivo' : 'Escolher arquivo'}
            <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
          </label>
          {fileName && <div className="text-xs text-muted">{fileName}</div>}
        </section>
        {problems.length > 0 && (
          <Notice tone={rows ? 'warn' : 'bad'}>
            <ul className="list-disc pl-4 space-y-0.5">{problems.slice(0, 12).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </Notice>
        )}
        {result && (
          <section className="space-y-3">
            <div className="text-sm font-semibold">4. Confira e aplique</div>
            {current.length > 0 && (
              <Select aria-label="Como juntar" value={mode} onChange={e => setMode(e.target.value as 'juntar' | 'trocar')}>
                <option value="juntar">Juntar com os cargos de hoje (atualiza os iguais, mantém os outros)</option>
                <option value="trocar">Trocar pela planilha (tira os cargos que não estão nela)</option>
              </Select>
            )}
            <p className="text-sm">
              {rows!.length} cargos na planilha: {result.created} novos, {result.updated} atualizados{mode === 'trocar' ? `, ${result.removed} saem` : ''}.
            </p>
            {result.kept.length > 0 && <Notice tone="warn">Continuam porque dão acesso ao portal: {result.kept.join(', ')}. Para tirar, use Passar o cargo.</Notice>}
            {result.notes.length > 0 && (
              <Notice tone="warn">
                <ul className="list-disc pl-4 space-y-0.5">{result.notes.slice(0, 10).map((n, i) => <li key={i}>{n}</li>)}</ul>
              </Notice>
            )}
            <div className="max-h-64 overflow-auto custom-scrollbar rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-left">
                  <tr>{SHEET_COLUMNS.map(c => <th key={c.key} className="px-2 py-1.5 font-semibold">{c.title}</th>)}</tr>
                </thead>
                <tbody>
                  {rows!.map(r => (
                    <tr key={r.line} className="border-t border-line">
                      <td className="px-2 py-1">{r.title}</td>
                      <td className="px-2 py-1">{r.group}</td>
                      <td className="px-2 py-1">{r.person}</td>
                      <td className="px-2 py-1">{r.row || ''}</td>
                      <td className="px-2 py-1">{r.below}</td>
                      <td className="px-2 py-1">{r.highlight ? 'sim' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Nada é gravado ainda: depois de aplicar, confira na tela, escolha quem ocupa cada cargo e toque em Salvar organograma.</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
