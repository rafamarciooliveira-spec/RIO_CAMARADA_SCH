/** Editor do modelo da carteirinha: painéis à esquerda, prévia ao vivo à direita. */
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import type { OrgChartDoc } from '../../shared/types.ts';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { Badge, Button, Card, cx, EmptyState, Loading, Notice, PageHeader, Select, Tabs, useConfirm } from '../../ui/index.tsx';
import { CardView } from './components/CardView.tsx';
import { MultiPick } from './design/MultiPick.tsx';
import { fallbackTemplate, ruleValues, stickersFor, TEMPLATE_FIELDS, themeFor, type CardAudience, type CardTemplateDoc } from './cardTemplate.ts';
import { useStickerUrls } from './useStickerUrls.ts';
import { BackPanel, ColorsPanel, FieldsPanel, IdentityPanel, LayoutPanel } from './design/panels.tsx';
import { useLogoSrc } from './useLogoSrc.ts';

type PanelId = 'identidade' | 'cores' | 'layout' | 'campos' | 'verso';

const SAMPLE = {
  fullName: 'Maria Aparecida dos Santos',
  displayName: 'Maria S.',
  categoryName: 'Sócio',
  validUntil: '2027-12-31',
  status: 'ativo' as const,
  birthDate: '1980-04-12',
  memberSince: '1998',
  roles: ['Rainha do tiro'],
};
const SAMPLE_HONORS = ['Rainha do tiro: desde 2025', 'Rainha do dado: 2019 a 2020', 'Diretoria social: 2015 a 2018', 'Sócio destaque (2014)'];

function pickFields(v: CardTemplateDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TEMPLATE_FIELDS) if (v[k] !== undefined) out[k] = v[k];
  out.showCpf = false;
  return out;
}

export default function CardDesignPage() {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const list = useList<CardTemplateDoc>(P.cardTemplates(t.tenantId), { limit: 30 });
  const activeId = t.settings?.activeCardTemplateId || 'padrao';
  const [editId, setEditId] = useState<string>('');
  const [draft, setDraft] = useState<CardTemplateDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [panel, setPanel] = useState<PanelId>('identidade');
  const [previewAs, setPreviewAs] = useState('');
  // "Ver como grupo X": usa um cargo de verdade daquele grupo do organograma (ex.: Rainha do tiro), não o nome do grupo
  const orgChart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  // Opções da prévia: cada cargo ou grupo do público do modelo e das regras ("cargo:Rei do tiro")
  const previewOptions = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const add = (match: 'grupo' | 'cargo', v: string) => {
      const key = `${match}:${v}`;
      if (v && !out.some(o => o.key === key)) out.push({ key, label: match === 'grupo' ? `grupo ${v}` : v });
    };
    for (const a of draft?.appliesTo || []) add(a.match, a.value);
    for (const r of draft?.roleThemes || []) for (const v of ruleValues(r)) add(r.match, v);
    return out;
  }, [draft?.appliesTo, draft?.roleThemes]);
  const forEveryone = !draft?.appliesTo?.length;
  const previewPos = useMemo(() => {
    if (!previewAs) return null;
    const [match, ...rest] = previewAs.split(':');
    const v = rest.join(':');
    return match === 'grupo'
      ? orgChart.data?.positions.find(p => p.group === v) || { title: v, group: v }
      : orgChart.data?.positions.find(p => p.title === v) || { title: v, group: '' };
  }, [previewAs, orgChart.data]);
  // Ao abrir um modelo, a prévia já mostra quem usa o modelo (ou quem ganha o adesivo)
  const draftId = draft?.id;
  useEffect(() => {
    const a = draft?.appliesTo?.[0];
    const r = draft?.roleThemes?.find(x => ruleValues(x).length && x.stickerPath);
    setPreviewAs(a ? `${a.match}:${a.value}` : r ? `${r.match}:${ruleValues(r)[0]}` : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);
  const previewStickers = useStickerUrls(useMemo(() => (draft && previewPos ? stickersFor(draft, [previewPos]) : []), [draft, previewPos]));
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const canEdit = t.can('carteirinha', 'editar');

  const selected = useMemo(() => list.data.find(x => x.id === (editId || activeId)) || list.data[0], [list.data, editId, activeId]);

  useEffect(() => {
    if (!dirty && selected) setDraft({ ...fallbackTemplate(t.tenant.name), ...selected });
  }, [selected, dirty, t.tenant.name]);

  const logoSrc = useLogoSrc(draft?.logoUrl);
  const affRaw = useLogoSrc(draft?.affiliationLogoUrl);
  const affiliationSrc = draft?.affiliationLogoUrl ? affRaw : '';

  if (list.loading) return <Loading />;
  if (list.error) return <EmptyState title="Não foi possível carregar os modelos" text={list.error} />;

  const set = (patch: Partial<CardTemplateDoc>) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const choose = async (id: string) => {
    if (dirty && !(await confirm({ title: 'Descartar alterações?', text: 'As mudanças deste modelo ainda não foram salvas.', confirmLabel: 'Descartar', danger: true }))) return;
    setDirty(false);
    setEditId(id);
  };

  const save = async () => {
    if (!draft) return;
    const exists = list.data.some(x => x.id === draft.id);
    const r = await run<{ id: string }>(
      'generic.save',
      { tenantId: t.tenantId, collection: 'cardTemplates', ...(exists ? { id: draft.id } : {}), data: pickFields(draft) },
      { success: 'Modelo salvo.' }
    );
    if (r) {
      setDirty(false);
      setEditId(r.id);
    }
  };

  const duplicate = () => {
    if (!draft) return;
    setDraft({ ...draft, id: `novo_${Date.now()}`, name: `${draft.name} (cópia)`, isDefault: false });
    setDirty(true);
  };

  const fresh = () => {
    setDraft({ ...fallbackTemplate(t.tenant.name), id: `novo_${Date.now()}`, name: 'Novo modelo', isDefault: false, logoUrl: t.tenant.branding.logoUrl, primaryColor: t.tenant.branding.primaryColor, secondaryColor: t.tenant.branding.secondaryColor, accentColor: t.tenant.branding.accentColor });
    setDirty(true);
  };

  const activate = async () => {
    if (!draft || dirty || draft.appliesTo?.length) return;
    await run('tenant.updateSettings', { tenantId: t.tenantId, settings: { activeCardTemplateId: draft.id } }, { success: 'Este modelo agora é o usado por todos.' });
  };

  const remove = async () => {
    if (!draft || draft.id === 'padrao') return;
    const ok = await confirm({ title: 'Apagar modelo', text: `O modelo "${draft.name}" será apagado. As carteirinhas passam a usar o modelo ativo.`, confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    if (draft.id === activeId) await run('tenant.updateSettings', { tenantId: t.tenantId, settings: { activeCardTemplateId: 'padrao' } }, { silent: true });
    const r = await run('generic.delete', { tenantId: t.tenantId, collection: 'cardTemplates', id: draft.id }, { success: 'Modelo apagado.' });
    if (r) {
      setDirty(false);
      setEditId('');
    }
  };

  const saved = !!draft && list.data.some(x => x.id === draft.id);
  const panelProps = draft ? { value: draft, set, logoSrc } : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Modelo da ${t.labels.card.toLowerCase()}`}
        subtitle="As mudanças salvas no modelo ativo aparecem na hora para todos."
        actions={
          canEdit && (
            <>
              <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={fresh}>
                Novo modelo
              </Button>
              <Button variant="secondary" size="sm" icon={<Copy className="w-4 h-4" />} onClick={duplicate} disabled={!draft}>
                Duplicar
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-wrap gap-2" role="list" aria-label="Modelos">
        {list.data.map(x => (
          <button
            key={x.id}
            role="listitem"
            onClick={() => choose(x.id)}
            className={cx('px-3 py-2 rounded-xl border text-sm flex items-center gap-2 cursor-pointer', draft?.id === x.id ? 'border-accent bg-accent/10' : 'border-line hover:border-muted')}
          >
            <span className="w-3 h-3 rounded-full" style={{ background: x.primaryColor }} aria-hidden />
            {x.name}
            {x.appliesTo?.length ? <Badge tone="brand">{audienceText(x.appliesTo)}</Badge> : x.id === activeId && <Badge tone="ok">Ativo para todos</Badge>}
          </button>
        ))}
        {draft && !saved && <span className="px-3 py-2 rounded-xl border border-dashed border-accent text-sm">{draft.name} (não salvo)</span>}
      </div>

      {!draft || !panelProps ? (
        <EmptyState title="Nenhum modelo ainda" action={canEdit && <Button onClick={fresh}>Criar o primeiro modelo</Button>} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
          <Card className="min-w-0">
            <Tabs
              value={panel}
              onChange={setPanel}
              tabs={[
                { id: 'identidade', label: 'Identidade' },
                { id: 'cores', label: 'Cores' },
                { id: 'layout', label: 'Layout' },
                { id: 'campos', label: 'Campos' },
                { id: 'verso', label: 'Verso' },
              ]}
            />
            <fieldset disabled={!canEdit} className="min-w-0">
              {panel === 'identidade' && <AudiencePanel key={draft.id} value={draft} set={set} isActive={draft.id === activeId} />}
              {panel === 'identidade' && <IdentityPanel {...panelProps} />}
              {panel === 'cores' && <ColorsPanel {...panelProps} />}
              {panel === 'layout' && <LayoutPanel {...panelProps} />}
              {panel === 'campos' && <FieldsPanel {...panelProps} />}
              {panel === 'verso' && <BackPanel {...panelProps} />}
            </fieldset>
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-line">
                <Button icon={<Save className="w-4 h-4" />} loading={busy} disabled={!dirty} onClick={save}>
                  Salvar modelo
                </Button>
                {forEveryone && (
                  <Button variant="secondary" icon={<Check className="w-4 h-4" />} disabled={dirty || !saved || draft.id === activeId} onClick={activate}>
                    Usar para todos
                  </Button>
                )}
                {saved && draft.id !== 'padrao' && (
                  <Button variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={remove}>
                    Apagar
                  </Button>
                )}
              </div>
            )}
            {dirty && <p className="text-xs text-warn mt-2">Há mudanças não salvas.</p>}
            {saved && forEveryone && draft.id !== activeId && (
              <div className="mt-3"><Notice tone="warn">
                Este modelo geral não está em uso: quem não tem modelo próprio continua vendo o marcado como Ativo para todos. Toque em "Usar para todos" para trocar.
              </Notice></div>
            )}
            {!forEveryone && (
              <div className="mt-3"><Notice>
                Este modelo vale sozinho para quem ocupa {audienceText(draft.appliesTo || [])} no organograma{dirty ? ', depois de salvar' : ''}. Os demais continuam no modelo geral.
              </Notice></div>
            )}
          </Card>
          <div className="flex flex-col items-center gap-3 lg:sticky lg:top-20">
            <div className="text-xs text-muted">Prévia com dados fictícios. Toque para virar.</div>
            {previewOptions.length > 0 && (
              <Select aria-label="Ver a prévia como" value={previewAs} onChange={e => setPreviewAs(e.target.value)} className="max-w-xs">
                {/* Modelo de um público (ex.: Diretoria) não é usado por quem não tem cargo: sem essa opção */}
                {forEveryone && <option value="">Ver como: sócio sem cargo</option>}
                {previewOptions.map(o => (
                  <option key={o.key} value={o.key}>
                    Ver como: {o.label}
                  </option>
                ))}
              </Select>
            )}
            <CardView
              template={previewPos ? themeFor(draft, [previewPos]) : draft}
              stickers={previewStickers}
              member={{ ...SAMPLE, roles: previewPos ? [previewPos.title] : [], honors: draft.showHonors ? SAMPLE_HONORS : undefined }}
              logoSrc={logoSrc}
              affiliationSrc={affiliationSrc}
              qrDataUrl={null}
              qrCaption="O QR real aparece na carteirinha do sócio"
              side={side}
              onFlip={() => setSide(s => (s === 'frente' ? 'verso' : 'frente'))}
              labelCard={t.labels.card}
              width={draft.orientation === 'horizontal' ? Math.min(420, (typeof window !== 'undefined' ? window.innerWidth : 420) - 40) : 290}
            />
            <Notice>O CPF nunca aparece na carteirinha.</Notice>
          </div>
        </div>
      )}
    </div>
  );
}

const audienceText = (list: CardAudience[]) => {
  const names = list.map(a => a.value);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}` : names.join(', ');
};

/** Quem usa o modelo: todos (geral) ou só quem ocupa certos cargos ou grupos do organograma */
function AudiencePanel({ value, set, isActive }: { value: CardTemplateDoc; set: (p: Partial<CardTemplateDoc>) => void; isActive: boolean }) {
  const t = useTenant();
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const groups = [...new Set((chart.data?.positions || []).map(p => p.group).filter(Boolean))];
  const titles = [...new Set((chart.data?.positions || []).map(p => p.title).filter(Boolean))];
  const list = value.appliesTo || [];
  const pick = (match: 'grupo' | 'cargo') => list.filter(a => a.match === match).map(a => a.value);
  const setPick = (match: 'grupo' | 'cargo', vals: string[]) => set({ appliesTo: [...list.filter(a => a.match !== match), ...vals.map(v => ({ match, value: v }))] });
  const [mode, setMode] = useState<'todos' | 'cargos'>(list.length ? 'cargos' : 'todos');
  return (
    <div className="space-y-3 mb-5 pb-5 border-b border-line">
      <div className="text-sm font-semibold">Quem usa este modelo</div>
      {isActive && !list.length ? (
        <p className="text-sm text-muted">Todos os sócios: é o modelo geral em uso. Para um modelo só da Diretoria ou das Majestades, toque em Novo modelo ou Duplicar e escolha aqui quem usa.</p>
      ) : (
      <Select
        aria-label="Quem usa este modelo"
        value={mode}
        onChange={e => {
          const m = e.target.value as 'todos' | 'cargos';
          setMode(m);
          if (m === 'todos') set({ appliesTo: [] });
        }}
      >
        <option value="todos">Todos os sócios (modelo geral)</option>
        <option value="cargos">Só quem ocupa certos cargos ou abas do organograma</option>
      </Select>
      )}
      {mode === 'cargos' && (
        <>
          <p className="text-xs text-muted">Ex.: um modelo para a Diretoria, outro para as Majestades do pássaro. Quem ocupa um cargo escolhido aqui usa este modelo; se cair em dois modelos, vale o que escolheu o cargo (mais específico que a aba).</p>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted">Abas inteiras</div>
            <MultiPick label="Abas que usam o modelo" options={groups} values={pick('grupo')} onChange={v => setPick('grupo', v)} />
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold text-muted">Cargos</div>
            <MultiPick label="Cargos que usam o modelo" options={titles} values={pick('cargo')} onChange={v => setPick('cargo', v)} />
          </div>
          {!list.length && <p className="text-xs text-warn">Escolha ao menos uma aba ou um cargo.</p>}
        </>
      )}
    </div>
  );
}
