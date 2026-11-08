/** Painéis do editor do modelo da carteirinha: identidade, cores, layout, campos e verso. */
import { useState } from 'react';
import { Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import { AssociationLogo, PRESET_LOGOS } from '../../../components/AssociationLogos.tsx';
import { contrastRatio, useTenant } from '../../../app/TenantContext.tsx';
import { useData } from '../../../app/DataContext.tsx';
import { extractPaletteFromLogo, type ExtractedLogoPalette } from '../../../utils/logoColorExtractor.ts';
import { randomId, resizeImage } from '../../../utils/image.ts';
import { Badge, Button, cx, Field, Input, Notice, Select, Toggle } from '../../../ui/index.tsx';
import { PATTERN_LABEL, type CardPattern, type CardTemplateDoc } from '../cardTemplate.ts';
import { ColorPicker } from '../../../ui/ColorPicker.tsx';
import { LOGO_MAX } from '../components/CardView.tsx';
import { RoleThemes } from './RoleThemes.tsx';

export interface PanelProps {
  value: CardTemplateDoc;
  set: (patch: Partial<CardTemplateDoc>) => void;
  logoSrc: string;
}

export function IdentityPanel({ value, set }: PanelProps) {
  const logoMax = value.orientation === 'horizontal' ? LOGO_MAX.horizontal : LOGO_MAX.vertical;
  const t = useTenant();
  const { client } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const blob = await resizeImage(f, 512, 'image/png');
      const path = `tenants/${t.tenantId}/public/card-logo-${randomId()}.png`;
      await client.upload(path, blob, 'image/png');
      const u = await client.publicUrl(path);
      set({ logoUrl: u && /^https?:/.test(u) && u.length <= 600 ? u : path, logoBgTransparent: true });
    } catch (e) {
      setError((e as Error).message || 'Não foi possível enviar a logo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Field label="Nome do modelo" required>
        {id => <Input id={id} value={value.name} maxLength={100} onChange={e => set({ name: e.target.value })} />}
      </Field>
      <Field label="Nome da sociedade na carteirinha" required>
        {id => <Input id={id} value={value.associationName} maxLength={200} onChange={e => set({ associationName: e.target.value })} />}
      </Field>
      <Field label="Subtítulo" hint="Exemplo: Fundada em 1898, Blumenau, SC">
        {id => <Input id={id} value={value.associationSubtitle} maxLength={200} onChange={e => set({ associationSubtitle: e.target.value })} />}
      </Field>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted">Logo</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => set({ logoUrl: t.tenant.branding.logoUrl })}>
            Usar a logo da sociedade
          </Button>
          <label className={cx('inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl font-semibold bg-surface-2 border border-line cursor-pointer', busy && 'opacity-50')}>
            <Upload className="w-4 h-4" aria-hidden />
            {busy ? 'Enviando...' : 'Enviar imagem'}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0])} />
          </label>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="radiogroup" aria-label="Símbolos prontos">
          {PRESET_LOGOS.map(p => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={value.logoUrl === p.id}
              title={p.label}
              aria-label={p.label}
              onClick={() => set({ logoUrl: p.id })}
              className={cx('aspect-square rounded-xl border flex items-center justify-center cursor-pointer', value.logoUrl === p.id ? 'border-accent bg-accent/10' : 'border-line hover:border-muted')}
            >
              <AssociationLogo logoKeyOrUrl={p.id} className="w-6 h-6" />
            </button>
          ))}
        </div>
        <Field label={`Tamanho da logo: ${Math.min(value.logoSize || 64, logoMax)} px`} hint={`Vai até ${logoMax} px para não encostar no nome e na foto.`}>
          {id => <input id={id} type="range" min={28} max={logoMax} value={Math.min(value.logoSize || 64, logoMax)} onChange={e => set({ logoSize: Number(e.target.value) })} className="w-full accent-[var(--sd-accent)]" />}
        </Field>
        <Toggle checked={value.logoBgTransparent !== false} onChange={v => set({ logoBgTransparent: v })} label="Logo sem fundo branco" />
      </div>
    </div>
  );
}

const PRESETS: { name: string; c: [string, string, string, string] }[] = [
  { name: 'Verde e ouro', c: ['#1f3b2d', '#0f1f17', '#d4a64a', '#ffffff'] },
  { name: 'Azul real', c: ['#1e3a8a', '#0b1c4d', '#fbbf24', '#ffffff'] },
  { name: 'Vinho', c: ['#5b1124', '#2c0611', '#f2c879', '#ffffff'] },
  { name: 'Grafite', c: ['#1f2937', '#0b0f17', '#38bdf8', '#ffffff'] },
  { name: 'Areia', c: ['#f5ead7', '#e5d3b3', '#7a4b12', '#1c1408'] },
];

function ContrastBadge({ a, b, label }: { a: string; b: string; label: string }) {
  const r = contrastRatio(a, b);
  const ok = r >= 4.5;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <Badge tone={ok ? 'ok' : 'bad'}>
        {r.toFixed(1)}:1 {ok ? 'passa AA' : 'abaixo de AA'}
      </Badge>
    </div>
  );
}

export function ColorsPanel({ value, set, logoSrc }: PanelProps) {
  const [pal, setPal] = useState<ExtractedLogoPalette | null>(null);
  const [busy, setBusy] = useState(false);
  const suggest = async () => {
    setBusy(true);
    try {
      setPal(await extractPaletteFromLogo(logoSrc));
    } finally {
      setBusy(false);
    }
  };
  const colors: [keyof CardTemplateDoc, string][] = [
    ['primaryColor', 'Cor principal'],
    ['secondaryColor', 'Cor secundária (degradê)'],
    ['accentColor', 'Destaque'],
    ['textColor', 'Texto'],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" loading={busy} icon={<Wand2 className="w-4 h-4" />} onClick={suggest}>
          Sugerir cores pela logo
        </Button>
      </div>
      {pal && (
        <div className="p-3 rounded-xl border border-line space-y-2">
          <div className="text-xs text-muted">Sugestão a partir de: {pal.sourceName}</div>
          <div className="flex gap-1.5">
            {[pal.primaryColor, pal.secondaryColor, pal.accentColor, pal.textColor].map((c, i) => (
              <span key={i} className="w-8 h-8 rounded-lg border border-line" style={{ background: c }} title={c} />
            ))}
          </div>
          <Button type="button" size="sm" onClick={() => set({ primaryColor: pal.primaryColor, secondaryColor: pal.secondaryColor, accentColor: pal.accentColor, textColor: pal.textColor })}>
            Aplicar sugestão
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {colors.map(([k, label]) => (
          <Field key={k} label={label}>
            {id => (
              <ColorPicker id={id} label={label} value={String(value[k])} imageSrc={logoSrc} onChange={v => set({ [k]: v } as Partial<CardTemplateDoc>)} />
            )}
          </Field>
        ))}
      </div>
      <div className="space-y-1.5 p-3 rounded-xl bg-surface-2">
        <div className="text-xs font-semibold">Contraste do texto (WCAG AA pede 4,5:1)</div>
        <ContrastBadge a={value.textColor} b={value.primaryColor} label="Texto sobre a cor principal" />
        <ContrastBadge a={value.textColor} b={value.secondaryColor} label="Texto sobre a cor secundária" />
      </div>
      <div>
        <div className="text-xs font-semibold text-muted mb-2">Combinações prontas</div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => set({ primaryColor: p.c[0], secondaryColor: p.c[1], accentColor: p.c[2], textColor: p.c[3] })}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-line text-xs hover:border-muted cursor-pointer"
            >
              <span className="w-4 h-4 rounded" style={{ background: `linear-gradient(135deg, ${p.c[0]}, ${p.c[2]})` }} aria-hidden />
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <RoleThemes value={value} set={set} logoSrc={logoSrc} />
    </div>
  );
}

export function LayoutPanel({ value, set }: PanelProps) {
  return (
    <div className="space-y-4">
      <Field label="Orientação">
        {id => (
          <Select id={id} value={value.orientation} onChange={e => set({ orientation: e.target.value as CardTemplateDoc['orientation'] })}>
            <option value="vertical">Vertical (celular)</option>
            <option value="horizontal">Horizontal (cartão)</option>
          </Select>
        )}
      </Field>
      <Field label="Padrão de fundo">
        {id => (
          <Select id={id} value={value.backgroundPattern} onChange={e => set({ backgroundPattern: e.target.value as CardPattern })}>
            {(Object.keys(PATTERN_LABEL) as CardPattern[]).map(p => (
              <option key={p} value={p}>
                {PATTERN_LABEL[p]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Posição da logo">
        {id => (
          <Select id={id} value={value.logoPosition || 'center'} onChange={e => set({ logoPosition: e.target.value as 'left' | 'center' })}>
            <option value="center">Centralizada</option>
            <option value="left">À esquerda</option>
          </Select>
        )}
      </Field>
      <Field label="Alinhamento dos dados">
        {id => (
          <Select id={id} value={value.infoAlignment || 'center'} onChange={e => set({ infoAlignment: e.target.value as CardTemplateDoc['infoAlignment'] })}>
            <option value="center">Centro</option>
            <option value="left">Esquerda</option>
            <option value="right">Direita</option>
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tamanho do nome">
          {id => (
            <Select id={id} value={value.nameFontSize || 'lg'} onChange={e => set({ nameFontSize: e.target.value as CardTemplateDoc['nameFontSize'] })}>
              <option value="sm">Pequeno</option>
              <option value="base">Normal</option>
              <option value="lg">Grande</option>
              <option value="xl">Maior</option>
              <option value="2xl">Destaque</option>
            </Select>
          )}
        </Field>
        <Field label="Tamanho dos dados">
          {id => (
            <Select id={id} value={value.detailsFontSize || 'xs'} onChange={e => set({ detailsFontSize: e.target.value as CardTemplateDoc['detailsFontSize'] })}>
              <option value="xs">Pequeno</option>
              <option value="sm">Normal</option>
              <option value="base">Grande</option>
            </Select>
          )}
        </Field>
      </div>
    </div>
  );
}

export function FieldsPanel({ value, set }: PanelProps) {
  return (
    <div className="space-y-3">
      <Notice>O CPF nunca aparece na carteirinha. Mostre só o necessário para a identificação.</Notice>
      <Toggle checked={value.showPhoto} onChange={v => set({ showPhoto: v })} label="Mostrar foto" />
      <Toggle checked={value.showCategory} onChange={v => set({ showCategory: v })} label="Mostrar categoria" />
      <Toggle checked={value.showBirthDate} onChange={v => set({ showBirthDate: v })} label="Mostrar data de nascimento" />
      {value.showBirthDate && <Notice tone="warn">A data de nascimento é dado pessoal. Mantenha desligado se não for indispensável.</Notice>}
      <Toggle checked={value.showSecurityStamp} onChange={v => set({ showSecurityStamp: v })} label='Mostrar a frase "Validação oficial só pelo QR"' />
    </div>
  );
}

export function BackPanel({ value, set }: PanelProps) {
  const [label, setLabel] = useState('');
  const [val, setVal] = useState('');
  const add = () => {
    if (!label.trim() || value.customFields.length >= 6) return;
    set({ customFields: [...value.customFields, { id: randomId().replace(/[^A-Za-z0-9]/g, '').slice(0, 20), label: label.trim().slice(0, 40), value: val.trim().slice(0, 80), visible: true }] });
    setLabel('');
    setVal('');
  };
  return (
    <div className="space-y-4">
      <AffiliationBlock value={value} set={set} />
      <Toggle checked={value.showQrCode} onChange={v => set({ showQrCode: v })} label="QR de validação no verso" />
      <Toggle checked={!!value.showHonors} onChange={v => set({ showHonors: v })} label="Histórico de cargos e honrarias no verso" />
      {value.showHonors && <p className="text-xs text-muted">Sai sozinho do organograma (cargos atuais), da galeria de mandatos e das honrarias de cada sócio. Ex.: "Rei do tiro: 2019 a 2020", "Presidente: desde 2024".</p>}
      {!value.showQrCode && <Notice tone="warn">Sem QR, a portaria não tem como confirmar se a carteirinha está válida.</Notice>}
      <Field label="Texto da assinatura" hint="Exemplo: Diretoria executiva">
        {id => <Input id={id} value={value.signatureLabel} maxLength={80} onChange={e => set({ signatureLabel: e.target.value })} />}
      </Field>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted">Informações fixas no verso (até 6)</div>
        {value.customFields.map((f, i) => (
          <div key={f.id} className="flex items-center gap-2">
            <span className="flex-1 text-sm truncate">
              <strong>{f.label}:</strong> {f.value}
            </span>
            <Toggle
              checked={f.visible !== false}
              onChange={v => set({ customFields: value.customFields.map((x, j) => (j === i ? { ...x, visible: v } : x)) })}
              label="Visível"
            />
            <button type="button" aria-label={`Remover ${f.label}`} onClick={() => set({ customFields: value.customFields.filter((_, j) => j !== i) })} className="p-2 rounded-lg hover:bg-surface-2 cursor-pointer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {value.customFields.length < 6 && (
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input aria-label="Rótulo" placeholder="Rótulo (ex.: Telefone da sede)" value={label} maxLength={40} onChange={e => setLabel(e.target.value)} />
            <Input aria-label="Valor" placeholder="Valor" value={val} maxLength={80} onChange={e => setVal(e.target.value)} />
            <Button type="button" size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={add} aria-label="Adicionar informação" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Filiação no verso: a federação, liga ou associação regional a que a sociedade pertence (texto e logo) */
function AffiliationBlock({ value, set }: { value: CardTemplateDoc; set: PanelProps['set'] }) {
  const t = useTenant();
  const { client } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const blob = await resizeImage(f, 400, 'image/png');
      const path = `tenants/${t.tenantId}/public/card-affiliation-${randomId()}.png`;
      await client.upload(path, blob, 'image/png');
      const u = await client.publicUrl(path);
      set({ affiliationLogoUrl: u && /^https?:/.test(u) && u.length <= 600 ? u : path });
    } catch (e) {
      setError((e as Error).message || 'Não foi possível enviar a logo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 p-3 rounded-xl border border-line">
      <div className="text-xs font-semibold text-muted">Filiação (federação, liga ou associação da região)</div>
      <Field label="Texto no verso" hint="Ex.: Afiliada à Associação dos Clubes e Sociedades de Tiro do Vale do Itapocu. Em branco, não aparece.">
        {id => <Input id={id} value={value.affiliationText || ''} maxLength={200} onChange={e => set({ affiliationText: e.target.value })} />}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <label className={cx('inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl font-semibold bg-surface-2 border border-line cursor-pointer', busy && 'opacity-50')}>
          <Upload className="w-4 h-4" aria-hidden />
          {busy ? 'Enviando...' : value.affiliationLogoUrl ? 'Trocar a logo da entidade' : 'Enviar a logo da entidade'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => upload(e.target.files?.[0])} />
        </label>
        {value.affiliationLogoUrl && (
          <Button type="button" size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={() => set({ affiliationLogoUrl: '' })}>
            Tirar a logo
          </Button>
        )}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
