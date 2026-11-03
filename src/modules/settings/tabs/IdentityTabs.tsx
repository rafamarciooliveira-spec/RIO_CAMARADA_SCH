/** Abas de identidade: visual, rótulos, página pública, login e endereço (slug). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Wand2 } from 'lucide-react';
import { useData, useOp } from '../../../app/DataContext.tsx';
import { contrastRatio, useTenant } from '../../../app/TenantContext.tsx';
import { AssociationLogo, PRESET_LOGOS } from '../../../components/AssociationLogos.tsx';
import { extractPaletteFromLogo } from '../../../utils/logoColorExtractor.ts';
import { randomId, resizeImage } from '../../../utils/image.ts';
import { DEFAULT_LABELS, type Branding, type Labels, type TenantDoc } from '../../../shared/types.ts';
import { Badge, Button, cx, Field, Input, Notice, Select, Textarea, Toggle, useConfirm } from '../../../ui/index.tsx';
import { useLogoSrc } from '../../card/useLogoSrc.ts';
import { SaveBar } from './common.tsx';
import { BR_STATES, SOCIETY_TYPES } from '../../../shared/societyTypes.ts';

const FONTS: Branding['fontFamily'][] = ['Inter', 'Merriweather', 'Playfair Display', 'Montserrat', 'Lora'];
const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Rio_Branco', 'America/Noronha'];

function useUpload() {
  const { client } = useData();
  const t = useTenant();
  return async (f: File, name: string, maxPx: number): Promise<string> => {
    const blob = await resizeImage(f, maxPx, 'image/png');
    const path = `tenants/${t.tenantId}/public/${name}-${randomId()}.png`;
    await client.upload(path, blob, 'image/png');
    const u = await client.publicUrl(path);
    // URL pública curta no real; na demonstração fica o caminho do Storage
    return u && /^https?:/.test(u) && u.length <= 600 ? u : path;
  };
}

function ImagePicker({ label, value, onChange, maxPx, name, hint }: { label: string; value?: string; onChange: (v: string) => void; maxPx: number; name: string; hint?: string }) {
  const upload = useUpload();
  const src = useLogoSrc(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-surface-2 border border-line flex items-center justify-center overflow-hidden">
          {value ? <AssociationLogo logoKeyOrUrl={src} className="w-10 h-10" /> : <span className="text-[10px] text-muted">Nenhuma</span>}
        </div>
        <label className={cx('inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface-2 border border-line cursor-pointer', busy && 'opacity-50')}>
          <Upload className="w-4 h-4" aria-hidden />
          {busy ? 'Enviando...' : 'Enviar imagem'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setError('');
              try {
                onChange(await upload(f, name, maxPx));
              } catch (err) {
                setError((err as Error).message || 'Não foi possível enviar.');
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {value && !PRESET_LOGOS.some(p => p.id === value) && (
          <Button size="sm" variant="ghost" onClick={() => onChange('')}>
            Remover
          </Button>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
      {error && <p className="text-[11px] text-bad">{error}</p>}
    </div>
  );
}

export function IdentityTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [name, setName] = useState(t.tenant.name);
  const [shortName, setShortName] = useState(t.tenant.shortName || '');
  const [b, setB] = useState<Branding>({ ...t.tenant.branding });
  const [tz, setTz] = useState(t.tenant.timezone);
  const [kind, setKind] = useState(t.tenant.societyType || 'clube_social');
  const [city, setCity] = useState(t.tenant.region?.city || '');
  const [uf, setUf] = useState(t.tenant.region?.state || '');
  const [dirty, setDirty] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const logoSrc = useLogoSrc(b.logoUrl);
  const set = (p: Partial<Branding>) => (setB(x => ({ ...x, ...p })), setDirty(true));
  const onBrand = contrastRatio(b.primaryColor, '#ffffff') >= 4.5 ? '#ffffff' : '#111111';
  const ratios: [string, number][] = [
    ['Texto sobre a cor principal', contrastRatio(b.primaryColor, onBrand)],
    ['Cor de destaque sobre o fundo escuro', contrastRatio(b.accentColor, '#0e100f')],
    ['Cor de destaque sobre o fundo claro', contrastRatio(b.accentColor, '#ffffff')],
  ];

  const suggest = async () => {
    setSuggesting(true);
    try {
      const p = await extractPaletteFromLogo(logoSrc);
      set({ primaryColor: p.primaryColor, secondaryColor: p.secondaryColor, accentColor: p.accentColor, textColor: p.textColor });
    } finally {
      setSuggesting(false);
    }
  };

  const save = async () => {
    const r = await run('tenant.update', { tenantId: t.tenantId, name: name.trim(), shortName: shortName.trim(), branding: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined && v !== '')), timezone: tz, societyType: kind, region: { city: city.trim(), state: uf } }, { success: 'Identidade salva.' });
    if (r) setDirty(false);
  };

  return (
    <fieldset disabled={readOnly} className="space-y-5 min-w-0">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nome da sociedade" required>
          {id => <Input id={id} value={name} maxLength={120} onChange={e => (setName(e.target.value), setDirty(true))} />}
        </Field>
        <Field label="Nome curto (menu e ícone do app)">
          {id => <Input id={id} value={shortName} maxLength={40} onChange={e => (setShortName(e.target.value), setDirty(true))} />}
        </Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <ImagePicker label="Logo" value={b.logoUrl} onChange={v => set({ logoUrl: v || 'shield' })} maxPx={512} name="logo" />
        <ImagePicker label="Favicon (ícone da aba)" value={b.faviconUrl} onChange={v => set({ faviconUrl: v })} maxPx={128} name="favicon" />
        <ImagePicker label="Imagem de capa" value={b.coverUrl} onChange={v => set({ coverUrl: v })} maxPx={1600} name="capa" hint="Usada na página pública." />
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted">Ou um símbolo pronto</div>
        <div className="flex flex-wrap gap-2">
          {PRESET_LOGOS.map(p => (
            <button key={p.id} type="button" aria-label={p.label} title={p.label} aria-pressed={b.logoUrl === p.id} onClick={() => set({ logoUrl: p.id })} className={cx('w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer', b.logoUrl === p.id ? 'border-accent bg-accent/10' : 'border-line')}>
              <AssociationLogo logoKeyOrUrl={p.id} className="w-5 h-5" />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Cores</span>
          <Button type="button" size="sm" variant="secondary" loading={suggesting} icon={<Wand2 className="w-4 h-4" />} onClick={suggest}>
            Sugerir pela logo
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ['primaryColor', 'Principal'],
              ['secondaryColor', 'Secundária'],
              ['accentColor', 'Destaque'],
              ['textColor', 'Texto da carteirinha'],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              {id => (
                <div className="flex items-center gap-2">
                  <input id={id} type="color" value={b[k]} onChange={e => set({ [k]: e.target.value })} className="w-10 h-10 rounded-lg border border-line bg-transparent cursor-pointer" />
                  <span className="text-xs font-mono">{b[k]}</span>
                </div>
              )}
            </Field>
          ))}
        </div>
        <div className="p-3 rounded-xl bg-surface-2 space-y-1.5">
          <div className="text-xs font-semibold">Contraste (WCAG AA pede 4,5:1 para texto)</div>
          {ratios.map(([l, r]) => (
            <div key={l} className="flex items-center justify-between text-xs gap-2">
              <span>{l}</span>
              <Badge tone={r >= 4.5 ? 'ok' : r >= 3 ? 'warn' : 'bad'}>
                {r.toFixed(1)}:1 {r >= 4.5 ? 'passa' : r >= 3 ? 'só para títulos' : 'não passa'}
              </Badge>
            </div>
          ))}
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: b.primaryColor, color: onBrand }}>
            Exemplo de botão
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Fonte">
          {id => (
            <Select id={id} value={b.fontFamily} onChange={e => set({ fontFamily: e.target.value as Branding['fontFamily'] })}>
              {FONTS.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tema">
          {id => (
            <Select id={id} value={b.theme} onChange={e => set({ theme: e.target.value as Branding['theme'] })}>
              <option value="escuro">Escuro</option>
              <option value="claro">Claro</option>
            </Select>
          )}
        </Field>
        <Field label="Tipo da sociedade" hint="Usado nas sugestões de notícias, cargos do organograma e competições.">
          {id => (
            <Select id={id} value={kind} onChange={e => (setKind(e.target.value), setDirty(true))}>
              {SOCIETY_TYPES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Cidade (região das notícias)">{id => <Input id={id} value={city} onChange={e => (setCity(e.target.value), setDirty(true))} />}</Field>
          <Field label="UF">
            {id => (
              <Select id={id} value={uf} onChange={e => (setUf(e.target.value), setDirty(true))}>
                <option value="">--</option>
                {BR_STATES.map(x => <option key={x} value={x}>{x}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Fuso horário">
          {id => (
            <Select id={id} value={tz} onChange={e => (setTz(e.target.value), setDirty(true))}>
              {TIMEZONES.map(z => (
                <option key={z} value={z}>
                  {z.replace('America/', '').replace('_', ' ')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={save} disabled={name.trim().length < 3} />}
    </fieldset>
  );
}

const LABEL_FIELDS: [keyof Labels, string, string][] = [
  ['member', 'Como chamar quem participa', 'Sócio, Associado, Membro'],
  ['members', 'No plural', 'Sócios, Associados, Membros'],
  ['fee', 'Contribuição', 'Mensalidade, Anuidade, Contribuição'],
  ['board', 'Gestão', 'Diretoria, Conselho, Coordenação'],
  ['card', 'Documento de identificação', 'Carteirinha, Credencial'],
];

export function LabelsTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [l, setL] = useState<Labels>({ ...DEFAULT_LABELS, ...t.tenant.labels });
  const [dirty, setDirty] = useState(false);
  const save = async () => {
    const r = await run('tenant.update', { tenantId: t.tenantId, labels: l }, { success: 'Rótulos salvos.' });
    if (r) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <p className="text-sm text-muted">Os nomes aparecem no menu, nas telas e nos e-mails.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {LABEL_FIELDS.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint}>
            {id => <Input id={id} value={l[k]} maxLength={30} onChange={e => (setL({ ...l, [k]: e.target.value }), setDirty(true))} />}
          </Field>
        ))}
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={save} disabled={Object.values(l).some(v => !v.trim())} />}
    </fieldset>
  );
}

export function PublicPageTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [p, setP] = useState<TenantDoc['publicPage']>(() => ({ ...{ enabled: false, about: '', history: '', city: '', socials: {} }, ...(t.tenant.publicPage || {}) }));
  const [dirty, setDirty] = useState(false);
  const set = (x: Partial<TenantDoc['publicPage']>) => (setP(v => ({ ...v, ...x })), setDirty(true));
  const save = async () => {
    const socials = Object.fromEntries(Object.entries(p.socials || {}).filter(([, v]) => v && String(v).trim()));
    const r = await run(
      'tenant.update',
      { tenantId: t.tenantId, publicPage: { enabled: p.enabled, about: p.about, history: p.history, city: p.city, ...(p.foundedYear ? { foundedYear: Number(p.foundedYear) } : {}), socials, contactEmail: p.contactEmail || '' } },
      { success: 'Página pública salva.' }
    );
    if (r) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <Toggle checked={p.enabled} onChange={v => set({ enabled: v })} label="Página pública ligada" />
      <p className="text-xs text-muted">
        Endereço: <span className="font-mono">{`${location.origin}${t.to('publico')}`}</span>. Mostra a história, a diretoria atual, os eventos abertos e o botão para propor cadastro. Nenhum dado pessoal de {t.labels.members.toLowerCase()} aparece.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Cidade">{id => <Input id={id} value={p.city} maxLength={80} onChange={e => set({ city: e.target.value })} />}</Field>
        <Field label="Ano de fundação">{id => <Input id={id} type="number" min={1500} max={2100} value={p.foundedYear || ''} onChange={e => set({ foundedYear: e.target.value ? Number(e.target.value) : undefined })} />}</Field>
      </div>
      <Field label="Sobre (resumo)">{id => <Textarea id={id} value={p.about} maxLength={3000} onChange={e => set({ about: e.target.value })} />}</Field>
      <Field label="História">{id => <Textarea id={id} rows={6} value={p.history} maxLength={6000} onChange={e => set({ history: e.target.value })} />}</Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="E-mail de contato">{id => <Input id={id} type="email" value={p.contactEmail || ''} maxLength={120} onChange={e => set({ contactEmail: e.target.value })} />}</Field>
        <Field label="WhatsApp">{id => <Input id={id} value={p.socials?.whatsapp || ''} maxLength={40} onChange={e => set({ socials: { ...p.socials, whatsapp: e.target.value } })} />}</Field>
        <Field label="Instagram (endereço)">{id => <Input id={id} value={p.socials?.instagram || ''} maxLength={200} onChange={e => set({ socials: { ...p.socials, instagram: e.target.value } })} />}</Field>
        <Field label="Facebook (endereço)">{id => <Input id={id} value={p.socials?.facebook || ''} maxLength={200} onChange={e => set({ socials: { ...p.socials, facebook: e.target.value } })} />}</Field>
        <Field label="Site">{id => <Input id={id} value={p.socials?.site || ''} maxLength={200} onChange={e => set({ socials: { ...p.socials, site: e.target.value } })} />}</Field>
      </div>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={save} />}
    </fieldset>
  );
}

export function LoginTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [emailLink, setEmailLink] = useState(!!t.tenant.loginMethods?.emailLink);
  const [dirty, setDirty] = useState(false);
  const save = async () => {
    const r = await run('tenant.update', { tenantId: t.tenantId, loginMethods: { google: true, emailLink } }, { success: 'Formas de entrada salvas.' });
    if (r) setDirty(false);
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <Toggle checked disabled onChange={() => undefined} label="Entrar com Google (sempre ligado)" />
      <Toggle checked={emailLink} onChange={v => (setEmailLink(v), setDirty(true))} label="Entrar com link mágico por e-mail (sem senha)" />
      <Notice>O portal não usa senha. Quem não tem conta Google recebe um link de entrada no e-mail.</Notice>
      {!readOnly && <SaveBar dirty={dirty} busy={busy} onSave={save} />}
    </fieldset>
  );
}

export function AddressTab({ readOnly }: { readOnly: boolean }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const { basePath } = useData();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [slug, setSlug] = useState(t.slug);
  const change = async () => {
    const ok = await confirm({
      title: 'Trocar o endereço',
      text: `O portal passa a ser ${location.origin}${basePath}/${slug.trim().toLowerCase()}.\nO endereço antigo continua redirecionando, mas QRs impressos e links salvos devem ser atualizados quando possível.`,
      confirmLabel: 'Trocar endereço',
    });
    if (!ok) return;
    const r = await run<{ slug: string }>('platform.changeSlug', { tenantId: t.tenantId, newSlug: slug.trim() }, { success: 'Endereço trocado.' });
    if (r) navigate(`${basePath}/${r.slug}/configuracoes`, { replace: true });
  };
  return (
    <fieldset disabled={readOnly} className="space-y-3 min-w-0">
      <Field label="Endereço do portal" hint="Letras minúsculas, números e hífen.">
        {id => (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted shrink-0">{`${location.host}${basePath}/`}</span>
            <Input id={id} value={slug} maxLength={60} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
          </div>
        )}
      </Field>
      <Notice tone="warn">Trocar o endereço muda os links do portal, da validação de QR e da proposta online. O antigo fica reservado e redireciona para o novo.</Notice>
      {!readOnly && (
        <Button loading={busy} disabled={slug.trim() === t.slug || slug.trim().length < 3} onClick={change}>
          Trocar endereço
        </Button>
      )}
    </fieldset>
  );
}
