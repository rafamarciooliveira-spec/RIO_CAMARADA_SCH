/**
 * Portaria: leitura do QR pela câmera (jsQR), código colado, resultado em tela cheia com som,
 * registro de entradas por evento e relatório de contagens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, ClipboardPaste, Clock, ShieldAlert, XCircle } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { VERIFY_LABEL } from '../../shared/memberStatus.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import type { CheckinDoc, EventDoc, VerifyResult, VerifyStatus } from '../../shared/types.ts';
import { playNotificationSound } from '../../utils/sound.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Notice, PageHeader, Section, Select, Stat, Tabs } from '../../ui/index.tsx';

/** Extrai o token de uma URL de validação (/{slug}/v/{token}) ou aceita o token puro */
export function extractToken(text: string): string {
  const raw = String(text || '').trim();
  const m = raw.match(/\/v\/([A-Za-z0-9_-]{20,200})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,200}$/.test(raw) ? raw : '';
}

const RESULT = {
  valido: { bg: 'bg-emerald-700', Icon: CheckCircle2, text: 'Entrada liberada' },
  expirado: { bg: 'bg-amber-700', Icon: Clock, text: 'QR vencido. Peça o QR atual, aberto no portal.' },
  suspenso: { bg: 'bg-red-700', Icon: ShieldAlert, text: 'Carteirinha suspensa. Encaminhe para a diretoria.' },
  invalido: { bg: 'bg-red-700', Icon: XCircle, text: 'QR não reconhecido.' },
} as const;

const TONE: Record<VerifyStatus, 'ok' | 'warn' | 'bad'> = { valido: 'ok', expirado: 'warn', suspenso: 'bad', invalido: 'bad' };

function useStartOfToday(tz: string): string {
  return useMemo(() => {
    // meia-noite no fuso da sociedade: agora menos a hora local já decorrida
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const n = (k: string) => Number(parts.find(p => p.type === k)?.value || 0);
    return new Date(now.getTime() - ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 - now.getMilliseconds()).toISOString();
  }, [tz]);
}

export default function PortariaPage() {
  const t = useTenant();
  const [tab, setTab] = useState<'ler' | 'relatorio'>('ler');
  const events = useList<EventDoc>(t.moduleOn('eventos') ? P.events(t.tenantId) : null, { orderBy: [['start', 'desc']], limit: 30 });
  const [eventId, setEventId] = useState('');
  const canCheck = t.can('portaria', 'criar');
  const upcoming = events.data.filter(e => e.status !== 'cancelado');

  return (
    <div className="space-y-5">
      <PageHeader title="Portaria" subtitle="Leia o QR da carteirinha aberta no portal do sócio. Prints e arquivos com QR vencido aparecem como vencidos." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'ler', label: 'Ler carteirinha' },
          { id: 'relatorio', label: 'Entradas e relatório' },
        ]}
      />
      {upcoming.length > 0 && (
        <Field label="Evento (opcional)" hint="Com um evento escolhido, a entrada conta no relatório dele.">
          {id => (
            <Select id={id} value={eventId} onChange={e => setEventId(e.target.value)} className="sm:max-w-md">
              <option value="">Sem evento (entrada na sede)</option>
              {upcoming.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({formatDate(e.start, t.tenant.timezone)})
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {tab === 'ler' ? (
        canCheck ? (
          <Reader eventId={eventId} />
        ) : (
          <Notice tone="warn">Seu papel pode ver as entradas, mas não registrar novas.</Notice>
        )
      ) : (
        <Report eventId={eventId} events={events.data} />
      )}
    </div>
  );
}

function Reader({ eventId }: { eventId: string }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });
  const busyRef = useRef(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const today = useStartOfToday(t.tenant.timezone);
  const recent = useList<CheckinDoc>(P.checkins(t.tenantId), { where: [['at', '>=', today]], orderBy: [['at', 'desc']], limit: 15 });

  const check = useCallback(
    async (text: string) => {
      const token = extractToken(text);
      if (!token) {
        setResult({ status: 'invalido', tenantName: t.tenant.name, checkedAt: new Date().toISOString() });
        playNotificationSound('alert');
        return;
      }
      const now = Date.now();
      if (lastRef.current.token === token && now - lastRef.current.at < 5000) return; // mesma leitura repetida
      lastRef.current = { token, at: now };
      busyRef.current = true;
      const r = await run<VerifyResult>('portaria.checkin', { tenantId: t.tenantId, token, ...(eventId ? { eventId } : {}) });
      busyRef.current = false;
      if (r) {
        setResult(r);
        playNotificationSound(r.status === 'valido' ? 'success' : 'alert');
      }
    },
    [run, t.tenantId, t.tenant.name, eventId]
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current = null;
    setCamOn(false);
  }, []);

  const start = async () => {
    setCamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Este navegador não dá acesso à câmera. Use o campo para colar o código.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setCamOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCamError('Não foi possível abrir a câmera. Confira a permissão do navegador.');
    }
  };

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!camOn) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 200 || busyRef.current || result) return;
      last = ts;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c || v.readyState < 2) return;
      const w = Math.min(640, v.videoWidth);
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(v, 0, 0, w, h);
      const img = g.getImageData(0, 0, w, h);
      const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (qr?.data) check(qr.data);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [camOn, check, result]);

  // Resultado some sozinho para a próxima pessoa
  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => setResult(null), result.status === 'valido' ? 3500 : 6000);
    return () => window.clearTimeout(id);
  }, [result]);

  const R = result ? RESULT[result.status] : null;

  return (
    <div className="grid lg:grid-cols-2 gap-5 items-start">
      <Card className="space-y-3">
        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-black flex items-center justify-center">
          {camOn ? (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline aria-label="Imagem da câmera" />
              <div className="absolute inset-[18%] border-4 border-white/70 rounded-3xl pointer-events-none" aria-hidden />
            </>
          ) : (
            <div className="text-white/70 text-sm text-center p-6">
              <Camera className="w-10 h-10 mx-auto mb-2" aria-hidden />
              Câmera desligada
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex flex-wrap gap-2">
          {camOn ? (
            <Button variant="secondary" icon={<CameraOff className="w-4 h-4" />} onClick={stop}>
              Desligar câmera
            </Button>
          ) : (
            <Button icon={<Camera className="w-4 h-4" />} onClick={start}>
              Ligar câmera
            </Button>
          )}
        </div>
        {camError && <Notice tone="warn">{camError}</Notice>}
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            lastRef.current = { token: '', at: 0 };
            check(code);
            setCode('');
          }}
        >
          <Input aria-label="Código ou link do QR" placeholder="Cole o link ou o código do QR" value={code} onChange={e => setCode(e.target.value)} />
          <Button type="submit" variant="secondary" loading={busy} icon={<ClipboardPaste className="w-4 h-4" />}>
            Conferir
          </Button>
        </form>
      </Card>
      <Section title="Entradas de hoje">
        {recent.loading ? (
          <Loading />
        ) : recent.data.length === 0 ? (
          <EmptyState title="Nenhuma entrada hoje" />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {recent.data.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{c.displayName || 'Não identificado'}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge tone={TONE[c.result]}>{VERIFY_LABEL[c.result]}</Badge>
                  <span className="text-xs text-muted tabular-nums">{formatDateTime(c.at, t.tenant.timezone).split(' às ')[1]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {result && R && (
        <button
          type="button"
          onClick={() => setResult(null)}
          className={`fixed inset-0 z-50 ${R.bg} text-white flex flex-col items-center justify-center p-6 text-center cursor-pointer`}
          aria-label="Fechar resultado e ler o próximo"
        >
          <div role="alert" className="space-y-4">
            <R.Icon className="w-28 h-28 mx-auto" aria-hidden />
            <div className="text-6xl font-black">{VERIFY_LABEL[result.status]}</div>
            <div className="text-xl">{R.text}</div>
            {result.status === 'valido' && (
              <div className="flex items-center justify-center gap-4 mt-4">
                {result.photoUrl && <img src={result.photoUrl} alt="" className="w-28 h-32 rounded-2xl object-cover border-2 border-white/70" />}
                <div className="text-left">
                  <div className="text-3xl font-bold">{result.displayName}</div>
                  {result.categoryName && <div className="text-lg">{result.categoryName}</div>}
                  <div className="text-sm opacity-90">Validade: {result.validUntil ? formatDate(result.validUntil) : 'sem prazo'}</div>
                </div>
              </div>
            )}
            <div className="text-sm opacity-80 pt-6">Toque para ler o próximo</div>
          </div>
        </button>
      )}
    </div>
  );
}

function Report({ eventId, events }: { eventId: string; events: (EventDoc & { id: string })[] }) {
  const t = useTenant();
  const today = useStartOfToday(t.tenant.timezone);
  const q = eventId ? { where: [['eventId', '==', eventId]] as [string, '==', unknown][], orderBy: [['at', 'desc']] as [string, 'desc'][], limit: 1000 } : { where: [['at', '>=', today]] as [string, '>=', unknown][], orderBy: [['at', 'desc']] as [string, 'desc'][], limit: 1000 };
  const rows = useList<CheckinDoc>(P.checkins(t.tenantId), q);
  const counts = useMemo(() => {
    const c: Record<VerifyStatus, number> = { valido: 0, invalido: 0, expirado: 0, suspenso: 0 };
    for (const r of rows.data) c[r.result] = (c[r.result] || 0) + 1;
    return c;
  }, [rows.data]);
  const unique = useMemo(() => new Set(rows.data.filter(r => r.result === 'valido' && r.memberId).map(r => r.memberId)).size, [rows.data]);
  const ev = events.find(e => e.id === eventId);
  if (rows.loading) return <Loading />;
  if (rows.error) return <Notice tone="bad">{rows.error}</Notice>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{ev ? `Evento: ${ev.name}` : 'Entradas de hoje, sem filtro de evento.'}</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Pessoas diferentes" value={unique} tone="info" />
        <Stat label="Válidas" value={counts.valido} tone="ok" />
        <Stat label="Vencidas" value={counts.expirado} tone="warn" />
        <Stat label="Suspensas" value={counts.suspenso} tone="bad" />
        <Stat label="Inválidas" value={counts.invalido} tone="bad" />
      </div>
      {rows.data.length === 0 ? (
        <EmptyState title="Nenhuma leitura registrada" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.data.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="truncate">{c.displayName || 'Não identificado'}</span>
              <span className="flex items-center gap-2 shrink-0">
                <Badge tone={TONE[c.result]}>{VERIFY_LABEL[c.result]}</Badge>
                <span className="text-xs text-muted tabular-nums">{formatDateTime(c.at, t.tenant.timezone)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
