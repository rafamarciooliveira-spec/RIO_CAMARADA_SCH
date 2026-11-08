/**
 * Convite para amigos: o sócio escreve o nome de quem convida e sai um convite pronto, em nome da
 * diretoria e do próprio sócio, para mandar pelo WhatsApp ou baixar. O texto é da diretoria
 * ({sociedade} e {socio} viram os nomes) e o QR leva para a ficha de proposta.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, MessageCircle, Pencil, Share2 } from 'lucide-react';
import { useDoc, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberInviteSettings, OrgChartDoc } from '../../shared/types.ts';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { useLogoSrc } from '../card/useLogoSrc.ts';
import { useFormOptions } from '../members/useFormOptions.ts';
import { nodeToPng, shrinkImage, waitImages } from '../card/exportImage.ts';
import { Button, Card, EmptyState, Field, Input, Modal, Notice, PageHeader, Textarea, Toggle, useToast } from '../../ui/index.tsx';

export const DEFAULT_INVITE: MemberInviteSettings = {
  enabled: true,
  title: 'Convite',
  intro: 'A diretoria da {sociedade}, através do(a) associado(a) {socio}, tem a honra de convidar',
  closing: 'a fazer parte da nossa sociedade.',
  showQr: true,
};

const W = 1200;
const H = 850;
const fill = (txt: string, society: string, member: string) => txt.replace(/\{sociedade\}/gi, society).replace(/\{socio\}/gi, member);

/** Quem assina pela diretoria: o cargo de presidente do organograma (ou o primeiro cargo com acesso de presidente) */
function presidentOf(chart: OrgChartDoc | null) {
  const list = chart?.positions || [];
  const p = list.find(x => x.roleId === 'presidente' && x.personName) || list.find(x => /^presidente/i.test(x.title.trim()) && x.personName);
  return p ? { name: p.personName!, title: p.title } : null;
}

function Corner({ color, flip }: { color: string; flip: string }) {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" style={{ position: 'absolute', transform: flip }} aria-hidden>
      <path d="M6 104 V40 C6 20 20 6 40 6 H104" fill="none" stroke={color} strokeWidth="3" />
      <path d="M18 104 V46 C18 30 30 18 46 18 H104" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="7" fill="none" stroke={color} strokeWidth="2" />
      <path d="M40 26 C50 32 50 48 40 54 C30 48 30 32 40 26 Z" fill={color} opacity="0.35" />
    </svg>
  );
}

/** O convite em tamanho fixo (1200 x 850); a tela reduz com transform para caber */
function InviteArt({ cfg, society, member, guests, logo, president, qr, accent, brand }: { cfg: MemberInviteSettings; society: string; member: string; guests: string; logo: string; president: { name: string; title: string } | null; qr: string; accent: string; brand: string }) {
  const serif = "'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif";
  const sign = (name: string, role: string) => (
    <div style={{ width: 280, textAlign: 'center' }}>
      <div style={{ height: 2, background: accent, marginBottom: 12 }} />
      <div style={{ fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', color: '#222' }}>{name}</div>
      <div style={{ fontSize: 22, fontStyle: 'italic', color: '#333' }}>{role}</div>
    </div>
  );
  return (
    <div style={{ width: W, height: H, background: '#ffffff', position: 'relative', fontFamily: 'Inter, system-ui, sans-serif', color: '#222', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 40, border: `2px dotted ${brand}` }} />
      <div style={{ position: 'absolute', left: 22, top: 22 }}><Corner color={brand} flip="none" /></div>
      <div style={{ position: 'absolute', right: 132, top: 22 }}><Corner color={brand} flip="scaleX(-1)" /></div>
      <div style={{ position: 'absolute', left: 22, bottom: 132 }}><Corner color={brand} flip="scaleY(-1)" /></div>
      <div style={{ position: 'absolute', right: 132, bottom: 132 }}><Corner color={brand} flip="scale(-1,-1)" /></div>
      <div style={{ position: 'absolute', inset: '70px 150px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontFamily: serif, fontSize: 104, lineHeight: 1, color: accent, letterSpacing: 2, textTransform: 'uppercase' }}>{cfg.title}</div>
        <div style={{ fontSize: 28, lineHeight: 1.35, marginTop: 26, maxWidth: 820 }}>{fill(cfg.intro, society, member)}</div>
        <div style={{ fontFamily: serif, fontSize: 56, fontWeight: 700, color: accent, marginTop: 30, fontVariant: 'small-caps', lineHeight: 1.1, maxWidth: 900 }}>{guests || 'Nome de quem você convida'}</div>
        <div style={{ width: 640, height: 3, background: '#222', marginTop: 18 }} />
        <div style={{ fontSize: 28, marginTop: 30 }}>{fill(cfg.closing, society, member)}</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, width: '100%' }}>
          {president ? sign(president.name, president.title) : sign(society, 'Diretoria')}
          <div style={{ width: 170, height: 170, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/^(https?:|data:|blob:)/.test(logo) ? <img src={logo} alt="" style={{ maxWidth: 170, maxHeight: 170, objectFit: 'contain' }} /> : <AssociationLogo logoKeyOrUrl={logo} className="w-32 h-32" />}
          </div>
          {sign(member, 'Associado(a)')}
        </div>
      </div>
      {qr && (
        <div style={{ position: 'absolute', right: 52, bottom: 52, textAlign: 'center', width: 104 }}>
          <img src={qr} alt="" style={{ width: 96, height: 96 }} />
          <div style={{ fontSize: 12, color: '#555', lineHeight: 1.2 }}>Aponte a câmera para fazer a proposta</div>
        </div>
      )}
    </div>
  );
}

/** data:image/png;base64,... para arquivo (sem rede) */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /data:([^;]+)/.exec(head)?.[1] || 'image/png' });
}

function useFitScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

function ConfigModal({ cfg, onClose }: { cfg: MemberInviteSettings; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [d, setD] = useState(cfg);
  const save = async () => {
    const r = await run('tenant.updateSettings', { tenantId: t.tenantId, settings: { memberInvite: { ...d, title: d.title.trim(), intro: d.intro.trim(), closing: d.closing.trim() } } }, { success: 'Texto do convite salvo.' });
    if (r) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Texto do convite"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Toggle checked={d.enabled} onChange={v => setD({ ...d, enabled: v })} label="1. Sócios podem gerar convites" />
        <Field label="2. Título">{id => <Input id={id} value={d.title} maxLength={60} onChange={e => setD({ ...d, title: e.target.value })} />}</Field>
        <Field label="3. Texto antes dos nomes" hint="{sociedade} vira o nome da sociedade e {socio} o nome de quem convida.">
          {id => <Textarea id={id} rows={3} value={d.intro} maxLength={400} onChange={e => setD({ ...d, intro: e.target.value })} />}
        </Field>
        <Field label="4. Texto depois dos nomes">{id => <Input id={id} value={d.closing} maxLength={200} onChange={e => setD({ ...d, closing: e.target.value })} />}</Field>
        <Toggle checked={d.showQr} onChange={v => setD({ ...d, showQr: v })} label="5. QR para a ficha de proposta no canto do convite" />
        <Notice>Quem assina pela diretoria é quem está no cargo de presidente do organograma.</Notice>
      </div>
    </Modal>
  );
}

export default function InvitePage() {
  const t = useTenant();
  const toast = useToast();
  const chart = useDoc<OrgChartDoc>(t.moduleOn('organograma') ? P.orgchart(t.tenantId) : null);
  const cfg = { ...DEFAULT_INVITE, ...(t.settings?.memberInvite || {}) };
  const [guests, setGuests] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const art = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const scale = useFitScale(box);
  const logoRaw = useLogoSrc(t.tenant.branding.logoUrl);
  const [logo, setLogo] = useState(logoRaw);
  const member = t.member?.fullName || t.member?.displayName || '';
  const society = t.tenant.name;
  const president = presidentOf(chart.data);
  // Com a adesão com Pix ligada, o convite leva ao link de adesão (valores, Pix e comprovante antes da ficha)
  const join = useFormOptions(true).data?.joinPayment?.enabled;
  const url = `${location.origin}${t.to(join ? 'adesao' : 'cadastro')}`;
  const canConfig = t.can('sociedade', 'editar');

  useEffect(() => {
    if (!cfg.showQr) return setQr('');
    QRCode.toDataURL(url, { width: 300, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [url, cfg.showQr]);
  // Logo reduzida e da própria página: o iPhone monta a imagem sem travar
  useEffect(() => {
    let alive = true;
    shrinkImage(logoRaw, 400).then(src => alive && setLogo(src || logoRaw));
    return () => {
      alive = false;
    };
  }, [logoRaw]);

  const message = useMemo(
    () => `Olá${guests.trim() ? `, ${guests.trim()}` : ''}! Você está convidado(a) para fazer parte da ${society}. Para fazer a sua proposta de sócio, é só abrir: ${url}`,
    [guests, society, url]
  );

  const makeFile = async (): Promise<File | null> => {
    if (!art.current) return null;
    await waitImages(art.current);
    const png = await nodeToPng(art.current);
    const blob = dataUrlToBlob(png);
    const name = `convite-${(guests.trim() || 'amigo').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').slice(0, 40)}.png`;
    return new File([blob], name, { type: 'image/png' });
  };
  const share = async () => {
    setBusy(true);
    try {
      const file = await makeFile();
      if (!file) return;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: message, title: cfg.title });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast.show('Convite baixado. Mande a imagem junto com a mensagem.', 'sucesso');
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.show('Não foi possível montar a imagem do convite. Tente de novo.', 'erro');
    } finally {
      setBusy(false);
    }
  };

  if (!t.member) return <EmptyState title="Convite disponível para sócios" text="Depois que o seu cadastro for aprovado, você pode convidar amigos por aqui." />;
  if (!cfg.enabled && !canConfig) return <EmptyState title="Convites desligados" text={`A ${t.labels.board.toLowerCase()} ainda não liberou os convites.`} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Convidar amigos"
        subtitle={`Escreva o nome de quem você quer convidar: o convite sai em nome da ${t.labels.board.toLowerCase()} e no seu.`}
        actions={canConfig ? <Button variant="secondary" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(true)}>Texto do convite</Button> : undefined}
      />
      {!cfg.enabled && <Notice tone="warn">Os convites estão desligados para os sócios. Ligue em Texto do convite.</Notice>}
      <Card className="space-y-4">
        <Field label="Quem você está convidando" hint="Um nome ou um casal. Ex.: Pablo Moretti e Liandra Tank">
          {id => <Input id={id} value={guests} maxLength={80} onChange={e => setGuests(e.target.value)} placeholder="Nome de quem você convida" />}
        </Field>
        <div ref={box} className="w-full rounded-xl border border-line overflow-hidden bg-white" style={{ height: H * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H }}>
            <div ref={art}>
              <InviteArt cfg={cfg} society={society} member={member} guests={guests.trim()} logo={logo} president={president} qr={qr} accent={t.tenant.branding.accentColor || '#a07a3c'} brand={t.tenant.branding.primaryColor || '#333333'} />
            </div>
          </div>
        </div>
        {!president && t.moduleOn('organograma') && <p className="text-xs text-muted">Sem presidente no organograma, a assinatura da esquerda sai com o nome da sociedade.</p>}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Share2 className="w-4 h-4" />} loading={busy} disabled={!guests.trim()} onClick={share}>
            Mandar o convite
          </Button>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" icon={<MessageCircle className="w-4 h-4" />}>Só a mensagem no WhatsApp</Button>
          </a>
          <Button variant="ghost" icon={<Download className="w-4 h-4" />} disabled={busy || !guests.trim()} onClick={async () => {
            setBusy(true);
            try {
              const file = await makeFile();
              if (!file) return;
              const a = document.createElement('a');
              a.href = URL.createObjectURL(file);
              a.download = file.name;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            } catch {
              toast.show('Não foi possível montar a imagem do convite.', 'erro');
            } finally {
              setBusy(false);
            }
          }}>
            Baixar imagem
          </Button>
        </div>
        <p className="text-xs text-muted">No celular, Mandar o convite abre o WhatsApp (ou outro app) com a imagem e a mensagem com o link da proposta.</p>
      </Card>
      {editing && <ConfigModal cfg={cfg} onClose={() => setEditing(false)} />}
    </div>
  );
}
