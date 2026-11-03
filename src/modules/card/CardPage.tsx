/**
 * Carteirinha do sócio, em tempo real. QR rotativo (troca a cada 60 s, para quando a aba fica
 * oculta), download em PNG/PDF com QR de 24 h, cópia offline mínima (sem CPF), tela cheia e
 * carteirinhas dos dependentes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, FileDown, FileText, Maximize2, RefreshCw, RotateCw, WifiOff, X } from 'lucide-react';
import { useData, useDoc, useFileUrl, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { setupTenantPwa } from '../../app/pwa.ts';
import { P } from '../../shared/paths.ts';
import { cardStatusFor, VERIFY_LABEL } from '../../shared/memberStatus.ts';
import { formatDateTime, localDateKey, tzLabel } from '../../shared/dates.ts';
import type { MemberDoc, OrgChartDoc, VerifyStatus } from '../../shared/types.ts';
import { Badge, Button, EmptyState, Loading, Modal, Notice, PageHeader, Tabs } from '../../ui/index.tsx';
import { CardView, type CardMemberData } from './components/CardView.tsx';
import { fallbackTemplate, type CardTemplateDoc } from './cardTemplate.ts';
import { useLogoSrc } from './useLogoSrc.ts';

const ROTATE_MS = 60_000;

interface IssueResult {
  token: string;
  expiresAt: string;
  ttlSec: number;
  timezone: string;
  verifyUrl: string;
}

interface OfflineCopy extends CardMemberData {
  tenantName: string;
  savedAt: string;
}

const offlineKey = (tenantId: string, memberId: string) => `sodalis_card_${tenantId}_${memberId}`;

function readOffline(key: string): OfflineCopy | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as OfflineCopy) : null;
  } catch {
    return null;
  }
}

function useOnline(): boolean {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

function useVisible(): boolean {
  const [v, setV] = useState(() => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'));
  useEffect(() => {
    const f = () => setV(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  return v;
}

function useCardWidth(vertical: boolean): number {
  const calc = () => Math.max(240, Math.min(vertical ? 320 : 460, (typeof window === 'undefined' ? 400 : window.innerWidth) - 40));
  const [w, setW] = useState(calc);
  useEffect(() => {
    const f = () => setW(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical]);
  return w;
}

const toCardData = (m: MemberDoc): CardMemberData => ({
  fullName: m.fullName,
  displayName: m.displayName,
  categoryName: m.categoryName,
  membershipNumber: m.membershipNumber,
  validUntil: m.validUntil,
  status: m.status,
  joinedAt: m.joinedAt,
});

export default function CardPage() {
  const t = useTenant();
  const { basePath } = useData();
  const holder = t.member;
  const deps = useList<MemberDoc>(holder ? P.members(t.tenantId) : null, holder ? { where: [['dependentOf', '==', holder.id]], limit: 20 } : undefined);
  const [selectedId, setSelectedId] = useState<string>('');
  const people = useMemo(() => (holder ? [holder, ...deps.data] : []), [holder, deps.data]);
  const current = people.find(p => p.id === selectedId) || holder;

  const tplId = t.settings?.activeCardTemplateId || 'padrao';
  const tplDoc = useDoc<CardTemplateDoc>(P.cardTemplate(t.tenantId, tplId));
  const template = useMemo(() => tplDoc.data || fallbackTemplate(t.tenant.name), [tplDoc.data, t.tenant.name]);
  const logoSrc = useLogoSrc(template.logoUrl || t.tenant.branding.logoUrl);

  useEffect(() => {
    const icon = /^https?:/.test(t.tenant.branding.logoUrl || '') ? t.tenant.branding.logoUrl : null;
    setupTenantPwa(t.tenant, icon, basePath);
  }, [t.tenant, basePath]);

  if (!holder) {
    return (
      <>
        <PageHeader title={t.labels.card} />
        <EmptyState title="Você ainda não tem cadastro" text={`A ${t.labels.card.toLowerCase()} aparece depois que o seu cadastro de ${t.labels.member.toLowerCase()} for aprovado.`} />
      </>
    );
  }
  if (tplDoc.loading) return <Loading label="Montando a carteirinha..." />;

  return (
    <div className="space-y-5">
      <PageHeader title={t.labels.card} subtitle="Atualiza sozinha quando a sua situação muda. Toque na carteirinha para virar." />
      {people.length > 1 && (
        <Tabs
          value={current!.id}
          onChange={setSelectedId}
          tabs={people.map(p => ({ id: p.id, label: p.id === holder.id ? `${p.displayName} (titular)` : p.displayName }))}
        />
      )}
      <MemberCard key={current!.id} member={current!} template={template} logoSrc={logoSrc} />
    </div>
  );
}

function MemberCard({ member, template, logoSrc }: { member: MemberDoc; template: CardTemplateDoc; logoSrc: string }) {
  const t = useTenant();
  const { run } = useOp();
  const online = useOnline();
  const visible = useVisible();
  const photoUrl = useFileUrl(template.showPhoto ? member.photoPath : null);
  const width = useCardWidth(template.orientation !== 'horizontal');
  const tz = t.tenant.timezone;
  const status: VerifyStatus = cardStatusFor(member, localDateKey(new Date(), tz));
  const orgChart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const key = offlineKey(t.tenantId, member.id);
  const [offline, setOffline] = useState<OfflineCopy | null>(() => readOffline(key));
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const [qr, setQr] = useState<{ dataUrl: string; at: number } | null>(null);
  const [qrError, setQrError] = useState('');
  const [left, setLeft] = useState(0);
  const [full, setFull] = useState(false);
  const [askDownload, setAskDownload] = useState(false);

  // Cópia offline mínima: sem CPF, sem foto, sem contato
  useEffect(() => {
    const copy: OfflineCopy = { ...toCardData(member), tenantName: t.tenant.name, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(key, JSON.stringify(copy));
      setOffline(copy);
    } catch {
      /* armazenamento cheio ou bloqueado: segue sem cópia */
    }
  }, [member, key, t.tenant.name]);

  const issue = useCallback(async () => {
    const r = await run<IssueResult>('card.issue', { tenantId: t.tenantId, memberId: member.id, kind: 'rotativo' }, { silent: true });
    if (!r) {
      setQrError('Não foi possível gerar o QR agora.');
      setQr(null);
      return;
    }
    const dataUrl = await QRCode.toDataURL(r.verifyUrl, { width: 360, margin: 1, errorCorrectionLevel: 'M' });
    setQrError('');
    setQr({ dataUrl, at: Date.now() });
  }, [run, t.tenantId, member.id]);

  const active = status === 'valido' && online && visible && template.showQrCode;

  useEffect(() => {
    if (!active) return;
    issue();
    const id = window.setInterval(issue, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active, issue]);

  useEffect(() => {
    if (!qr) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((qr.at + ROTATE_MS - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [qr]);

  const data = online ? toCardData(member) : offline || toCardData(member);
  const caption = !online
    ? 'Sem internet: o QR volta quando a conexão voltar'
    : status !== 'valido'
      ? `Carteirinha ${VERIFY_LABEL[status].toLowerCase()}`
      : !visible
        ? 'QR pausado com a tela oculta'
        : qr
          ? `Novo QR em ${left} s`
          : qrError || 'Gerando QR...';

  return (
    <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
      <div className="flex flex-col items-center gap-3">
        <CardView
          template={template}
          member={data}
          logoSrc={logoSrc}
          photoUrl={online ? photoUrl : null}
          qrDataUrl={active ? qr?.dataUrl : null}
          qrCaption={caption}
          side={side}
          onFlip={() => setSide(s => (s === 'frente' ? 'verso' : 'frente'))}
          labelCard={t.labels.card}
          width={width}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" icon={<RotateCw className="w-4 h-4" />} onClick={() => setSide(s => (s === 'frente' ? 'verso' : 'frente'))}>
            {side === 'frente' ? 'Ver verso' : 'Ver frente'}
          </Button>
          <Button variant="secondary" size="sm" icon={<Maximize2 className="w-4 h-4" />} onClick={() => setFull(true)}>
            Tela cheia
          </Button>
          {['ativo', 'aprovado', 'em_atraso'].includes(member.status) && (
            <Button
              variant="secondary"
              size="sm"
              icon={<FileText className="w-4 h-4" />}
              onClick={async () => {
                const { memberDeclarationPdf, presidentSigner } = await import('../../app/pdf.ts');
                await memberDeclarationPdf(t.tenant, member, { memberLabel: t.labels.member, signer: presidentSigner(orgChart.data) });
              }}
            >
              Declaração de {t.labels.member.toLowerCase()}
            </Button>
          )}
          <Button size="sm" icon={<Download className="w-4 h-4" />} disabled={status !== 'valido' || !online} onClick={() => setAskDownload(true)}>
            Baixar PNG ou PDF
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-w-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Situação agora:</span>
          <Badge tone={status === 'valido' ? 'ok' : status === 'expirado' ? 'warn' : 'bad'}>{VERIFY_LABEL[status]}</Badge>
          {!online && (
            <Badge tone="warn">
              <WifiOff className="w-3 h-3 mr-1" aria-hidden /> Sem internet
            </Badge>
          )}
        </div>
        {!online && offline && (
          <Notice tone="warn">
            Você está sem internet. Mostrando a cópia salva neste aparelho, última sincronização às {formatDateTime(offline.savedAt, tz)}. A portaria só confirma a validade pelo QR, que precisa de conexão.
          </Notice>
        )}
        {status === 'suspenso' && <Notice tone="bad">A carteirinha está suspensa. Fale com a {t.labels.board.toLowerCase()} para regularizar.</Notice>}
        {status === 'expirado' && <Notice tone="warn">A validade terminou. Fale com a {t.labels.board.toLowerCase()} para renovar.</Notice>}
        {status === 'invalido' && member.status === 'pendente' && <Notice>Seu cadastro está em análise. A carteirinha passa a valer depois da aprovação.</Notice>}
        <Notice>
          O QR muda a cada minuto para evitar uso de print. Ao mostrar na portaria, deixe esta tela aberta e com o brilho alto.
        </Notice>
        {online && status === 'valido' && qrError && (
          <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={issue}>
            Tentar gerar o QR de novo
          </Button>
        )}
      </div>

      {full && (
        <FullScreen onClose={() => setFull(false)}>
          <CardView
            template={template}
            member={data}
            logoSrc={logoSrc}
            photoUrl={online ? photoUrl : null}
            qrDataUrl={active ? qr?.dataUrl : null}
            qrCaption={caption}
            side={side}
            onFlip={() => setSide(s => (s === 'frente' ? 'verso' : 'frente'))}
            labelCard={t.labels.card}
            width={Math.min(width + 40, 420)}
          />
        </FullScreen>
      )}

      <DownloadDialog open={askDownload} onClose={() => setAskDownload(false)} member={member} template={template} logoSrc={logoSrc} photoUrl={photoUrl} />
    </div>
  );
}

function FullScreen({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Carteirinha em tela cheia" className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4 gap-4">
      <button onClick={onClose} aria-label="Fechar tela cheia" className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 text-white cursor-pointer">
        <X className="w-6 h-6" />
      </button>
      {children}
      <p className="text-xs text-white/70 text-center">Toque na carteirinha para virar. Aumente o brilho da tela para a leitura do QR.</p>
    </div>
  );
}

function DownloadDialog({
  open,
  onClose,
  member,
  template,
  logoSrc,
  photoUrl,
}: {
  open: boolean;
  onClose: () => void;
  member: MemberDoc;
  template: CardTemplateDoc;
  logoSrc: string;
  photoUrl: string | null;
}) {
  const t = useTenant();
  const { run } = useOp();
  const [busy, setBusy] = useState<'' | 'png' | 'pdf'>('');
  const [render, setRender] = useState<{ qr: string; banner: string } | null>(null);
  const [error, setError] = useState('');
  const node = useRef<HTMLDivElement>(null);
  const tz = t.tenant.timezone;

  const go = async (fmt: 'png' | 'pdf') => {
    setBusy(fmt);
    setError('');
    try {
      const r = await run<IssueResult>('card.issue', { tenantId: t.tenantId, memberId: member.id, kind: 'download' });
      if (!r) return;
      const qr = await QRCode.toDataURL(r.verifyUrl, { width: 480, margin: 1, errorCorrectionLevel: 'M' });
      const banner = `Válida até ${formatDateTime(r.expiresAt, r.timezone || tz)} (${tzLabel(r.timezone || tz)})`;
      setRender({ qr, banner });
      // espera o React desenhar o nó de exportação e as imagens carregarem
      await new Promise(res => setTimeout(res, 350));
      const el = node.current;
      if (!el) throw new Error('sem nó');
      const { toPng } = await import('html-to-image');
      const png = await toPng(el, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
      const base = `${t.labels.card.toLowerCase()}-${(member.membershipNumber || member.displayName).replace(/[^a-zA-Z0-9]+/g, '-')}`;
      if (fmt === 'png') {
        const a = document.createElement('a');
        a.href = png;
        a.download = `${base}.png`;
        a.click();
      } else {
        const { jsPDF } = await import('jspdf');
        const img = new Image();
        img.src = png;
        await img.decode();
        const landscape = img.width > img.height;
        const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const scale = Math.min((pw - 20) / img.width, (ph - 20) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        pdf.addImage(png, 'PNG', (pw - w) / 2, 10, w, h);
        pdf.save(`${base}.pdf`);
      }
      onClose();
    } catch {
      setError('Não foi possível gerar o arquivo. Tente de novo.');
    } finally {
      setBusy('');
      setRender(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Baixar a carteirinha"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secondary" icon={<FileDown className="w-4 h-4" />} loading={busy === 'png'} disabled={!!busy} onClick={() => go('png')}>
            Baixar PNG
          </Button>
          <Button icon={<FileDown className="w-4 h-4" />} loading={busy === 'pdf'} disabled={!!busy} onClick={() => go('pdf')}>
            Baixar PDF
          </Button>
        </>
      }
    >
      <Notice tone="warn">
        <strong>Leia antes de baixar.</strong> O arquivo fica no seu aparelho e não se apaga sozinho, mas o QR dele só vale por 24 horas a partir de agora. Se a carteirinha for suspensa, o QR deixa de validar na mesma hora. A data e a hora limite aparecem em destaque no arquivo.
      </Notice>
      <p className="text-sm text-muted">Para o dia a dia, prefira mostrar a carteirinha aberta no portal: o QR de lá se renova sozinho.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      {render && (
        <div className="fixed -left-[9999px] top-0" aria-hidden>
          <CardView ref={node} both template={template} member={toCardData(member)} logoSrc={logoSrc} photoUrl={photoUrl} qrDataUrl={render.qr} qrCaption="Escaneie para autenticar" banner={render.banner} labelCard={t.labels.card} />
        </div>
      )}
    </Modal>
  );
}

