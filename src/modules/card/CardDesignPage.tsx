/** Editor do modelo da carteirinha: painéis à esquerda, prévia ao vivo à direita. */
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { Badge, Button, Card, cx, EmptyState, Loading, Notice, PageHeader, Tabs, useConfirm } from '../../ui/index.tsx';
import { CardView } from './components/CardView.tsx';
import { fallbackTemplate, TEMPLATE_FIELDS, type CardTemplateDoc } from './cardTemplate.ts';
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
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const canEdit = t.can('carteirinha', 'editar');

  const selected = useMemo(() => list.data.find(x => x.id === (editId || activeId)) || list.data[0], [list.data, editId, activeId]);

  useEffect(() => {
    if (!dirty && selected) setDraft({ ...fallbackTemplate(t.tenant.name), ...selected });
  }, [selected, dirty, t.tenant.name]);

  const logoSrc = useLogoSrc(draft?.logoUrl);

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
    if (!draft || dirty) return;
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
            {x.id === activeId && <Badge tone="ok">Ativo</Badge>}
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
                <Button variant="secondary" icon={<Check className="w-4 h-4" />} disabled={dirty || !saved || draft.id === activeId} onClick={activate}>
                  Usar este modelo
                </Button>
                {saved && draft.id !== 'padrao' && (
                  <Button variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={remove}>
                    Apagar
                  </Button>
                )}
              </div>
            )}
            {dirty && <p className="text-xs text-warn mt-2">Há mudanças não salvas.</p>}
          </Card>
          <div className="flex flex-col items-center gap-3 lg:sticky lg:top-20">
            <div className="text-xs text-muted">Prévia com dados fictícios. Toque para virar.</div>
            <CardView
              template={draft}
              member={SAMPLE}
              logoSrc={logoSrc}
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
