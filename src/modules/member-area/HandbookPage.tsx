/**
 * Manual do sócio: o sócio lê (seções ou PDF) e marca "Li e estou ciente"; a diretoria escreve,
 * publica versões (com aviso no celular) e acompanha quem já leu a versão atual.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronDown, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { useData, useDoc, useFileUrl, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import type { HandbookDoc } from '../../shared/types.ts';
import { randomId } from '../../utils/image.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Notice, PageHeader, Textarea, Toggle, cx } from '../../ui/index.tsx';

type Section = HandbookDoc['sections'][number];
const sid = () => `s${Math.random().toString(36).slice(2, 9)}`;

/** Modelo para começar: a diretoria adapta ao estatuto e ao regimento da sociedade */
function starter(name: string): Section[] {
  return [
    { id: sid(), title: 'Direitos do sócio', body: `Participar das atividades e eventos da ${name}.\nUsar a sede e as instalações conforme as regras de uso.\nVotar e ser votado nas assembleias, conforme o estatuto.\nReceber a carteirinha digital e os avisos da sociedade.\nPedir à diretoria informações sobre a prestação de contas.` },
    { id: sid(), title: 'Deveres do sócio', body: 'Manter a mensalidade em dia.\nCumprir o estatuto, o regimento interno e as decisões da assembleia.\nZelar pelo patrimônio, pelas instalações e pelo nome da sociedade.\nManter os dados do cadastro atualizados no portal.\nTratar com respeito os demais sócios, convidados e a diretoria.' },
    { id: sid(), title: 'Mensalidade e pagamentos', body: 'Valor, vencimento e formas de pagamento estão em Financeiro, no portal.\nEm caso de atraso, a carteirinha pode ser suspensa até a regularização.' },
    { id: sid(), title: 'Dependentes', body: 'Quem pode ser dependente, até que idade e quanto paga.\nA inclusão de dependente passa pela aprovação da diretoria.' },
    { id: sid(), title: 'Uso da sede e das instalações', body: 'Horários, reservas, convidados e cuidados com o espaço.' },
    { id: sid(), title: 'Eventos, trajes e tradições', body: 'Festas, desfiles, trajes típicos e o que se espera dos sócios em cada ocasião.' },
    { id: sid(), title: 'Penalidades', body: 'Advertência, suspensão e exclusão, conforme o estatuto.' },
    { id: sid(), title: 'Como falar com a diretoria', body: 'Pelos avisos do portal, na secretaria ou pelos contatos da página da sociedade.' },
  ];
}

function Reader({ h, onEdit }: { h: HandbookDoc; onEdit?: () => void }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const ack = useDoc<{ version: number; at: string }>(session.user ? P.handbookAck(t.tenantId, session.user.uid) : null);
  const pdf = useFileUrl(h.pdfPath || null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const acked = ack.data?.version === h.version;
  const last = h.versions[h.versions.length - 1];
  return (
    <div className="space-y-4">
      <PageHeader title={h.title} subtitle={`Versão ${h.version}${h.publishedAt ? `, publicada em ${formatDate(h.publishedAt, t.tenant.timezone)}` : ''}`} actions={onEdit && <Button variant="secondary" onClick={onEdit}>Editar manual</Button>} />
      {h.requireAck && t.member && !acked && (
        <Card className="border-accent/60 space-y-2">
          <div className="font-semibold">{ack.data ? 'O manual foi atualizado' : 'Leia o manual do sócio'}</div>
          {ack.data && last?.note && <p className="text-sm">O que mudou: {last.note}</p>}
          <p className="text-sm text-muted">Depois de ler, confirme. A diretoria vê quem já está ciente da versão atual.</p>
          <Button loading={busy} icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => run('handbook.ack', { tenantId: t.tenantId, version: h.version }, { success: 'Obrigado! Ciência registrada.' })}>
            Li e estou ciente
          </Button>
        </Card>
      )}
      {acked && <Notice tone="ok">Você confirmou a leitura desta versão em {formatDateTime(ack.data!.at, t.tenant.timezone)}.</Notice>}
      {h.intro && <p className="text-sm whitespace-pre-line">{h.intro}</p>}
      {h.pdfPath && (
        <a href={pdf || undefined} target="_blank" rel="noopener noreferrer" className={cx('inline-flex', !pdf && 'pointer-events-none opacity-50')}>
          <Button variant="secondary" icon={<FileText className="w-4 h-4" />}>{pdf ? 'Abrir o manual em PDF' : 'Carregando o PDF...'}</Button>
        </a>
      )}
      <div className="space-y-2">
        {h.sections.map(s => (
          <Card key={s.id} className="p-0 overflow-hidden">
            <button type="button" className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer" aria-expanded={!!open[s.id]} onClick={() => setOpen(o => ({ ...o, [s.id]: !o[s.id] }))}>
              <span className="font-semibold">{s.title}</span>
              <ChevronDown className={cx('w-4 h-4 transition', open[s.id] && 'rotate-180')} aria-hidden />
            </button>
            {open[s.id] && (
              <ul className="px-4 pb-4 space-y-1.5 text-sm">
                {s.body.split('\n').filter(l => l.trim()).map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-accent" aria-hidden>•</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      {h.versions.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Histórico de versões</summary>
          <ul className="mt-2 space-y-1">
            {[...h.versions].reverse().map(v => (
              <li key={v.version} className="text-muted">
                Versão {v.version}, {formatDate(v.at, t.tenant.timezone)}
                {v.note ? `: ${v.note}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {onEdit && h.version > 0 && <Readers />}
    </div>
  );
}

function Readers() {
  const t = useTenant();
  const { run } = useOp();
  const [r, setR] = useState<{ version: number; total: number; read: number; readers: { name: string; at: string }[]; pending: string[] } | null>(null);
  useEffect(() => {
    if (!t.can('socios', 'ver')) return;
    run<NonNullable<typeof r>>('handbook.acks', { tenantId: t.tenantId }, { silent: true }).then(x => setR(x || null));
  }, [run, t]);
  if (!r) return null;
  return (
    <Card className="space-y-2">
      <div className="font-semibold">Leitura da versão {r.version}</div>
      <div className="text-sm">
        <strong>{r.read}</strong> de {r.total} titulares com acesso ao portal já confirmaram.
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${r.total ? Math.round((r.read / r.total) * 100) : 0}%` }} />
      </div>
      {r.pending.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Ainda não leram ({r.pending.length})</summary>
          <p className="mt-1 text-muted">{r.pending.join(', ')}</p>
        </details>
      )}
    </Card>
  );
}

function Editor({ h, onDone }: { h: HandbookDoc | null; onDone: () => void }) {
  const t = useTenant();
  const { client } = useData();
  const { run, busy } = useOp();
  const [title, setTitle] = useState(h?.title || 'Manual do sócio');
  const [intro, setIntro] = useState(h?.intro || '');
  const [sections, setSections] = useState<Section[]>(h?.sections?.length ? h.sections : starter(t.tenant.shortName || t.tenant.name));
  const [pdfPath, setPdfPath] = useState(h?.pdfPath || '');
  const [requireAck, setRequireAck] = useState(h?.requireAck ?? true);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const set = (id: string, p: Partial<Section>) => setSections(l => l.map(s => (s.id === id ? { ...s, ...p } : s)));
  const move = (i: number, d: number) =>
    setSections(l => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const upload = async (f?: File) => {
    if (!f) return;
    setErr('');
    if (f.type !== 'application/pdf') return setErr('Envie um arquivo PDF.');
    if (f.size > 15 * 1024 * 1024) return setErr('PDF grande demais (máximo de 15 MB).');
    setUploading(true);
    try {
      const path = `tenants/${t.tenantId}/handbook/manual-${randomId()}.pdf`;
      await client.upload(path, f, 'application/pdf');
      setPdfPath(path);
    } catch {
      setErr('Não foi possível enviar o PDF.');
    } finally {
      setUploading(false);
    }
  };
  const save = async (publish: boolean) => {
    const r = await run(
      'handbook.save',
      { tenantId: t.tenantId, title: title.trim(), ...(intro.trim() ? { intro: intro.trim() } : {}), sections: sections.filter(s => s.title.trim()).map(s => ({ ...s, title: s.title.trim() })), pdfPath, publish, requireAck, ...(note.trim() ? { changeNote: note.trim() } : {}), requestId: `manual_${Date.now()}` },
      { success: publish ? 'Manual publicado e sócios avisados.' : 'Rascunho salvo.' }
    );
    if (r && publish) onDone();
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Editar o manual do sócio" subtitle="Escreva em seções, envie um PDF, ou os dois. Uma linha por item." />
      <Card className="space-y-3">
        <Field label="Título">{id => <Input id={id} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="Apresentação (opcional)">{id => <Textarea id={id} value={intro} maxLength={2000} onChange={e => setIntro(e.target.value)} placeholder="Bem-vindo à sociedade! Aqui estão os seus direitos, deveres e as regras da casa." />}</Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className={cx('inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-surface-2 border border-line cursor-pointer', uploading && 'opacity-50')}>
            <Upload className="w-4 h-4" aria-hidden />
            {uploading ? 'Enviando...' : pdfPath ? 'Trocar o PDF' : 'Enviar PDF (estatuto, regimento...)'}
            <input type="file" accept="application/pdf" className="sr-only" disabled={uploading} onChange={e => upload(e.target.files?.[0])} />
          </label>
          {pdfPath && (
            <>
              <Badge tone="ok">PDF anexado</Badge>
              <button type="button" className="text-xs text-bad cursor-pointer" onClick={() => setPdfPath('')}>Tirar o PDF</button>
            </>
          )}
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
        <Toggle checked={requireAck} onChange={setRequireAck} label='Pedir aos sócios "Li e estou ciente"' />
      </Card>
      <div className="space-y-2">
        {sections.map((s, i) => (
          <Card key={s.id} className="space-y-2">
            <div className="flex gap-2">
              <Input aria-label="Título da seção" value={s.title} maxLength={120} onChange={e => set(s.id, { title: e.target.value })} />
              <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Descer" disabled={i === sections.length - 1} onClick={() => move(i, 1)} className="p-2 rounded-lg hover:bg-surface-2 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" aria-label="Apagar seção" onClick={() => setSections(l => l.filter(x => x.id !== s.id))} className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer"><Trash2 className="w-4 h-4" /></button>
            </div>
            <Textarea aria-label={`Texto de ${s.title}`} rows={5} value={s.body} maxLength={20000} onChange={e => set(s.id, { body: e.target.value })} />
          </Card>
        ))}
        <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setSections(l => [...l, { id: sid(), title: 'Nova seção', body: '' }])}>
          Adicionar seção
        </Button>
      </div>
      <Notice>O modelo inicial é só um ponto de partida: confira com o estatuto e o regimento da sociedade antes de publicar.</Notice>
      <Card className="space-y-3">
        {(h?.version || 0) > 0 && <Field label="O que mudou nesta versão (vai no aviso aos sócios)">{id => <Input id={id} value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Ex.: nova regra de uso do salão" />}</Field>}
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} onClick={() => save(true)}>{(h?.version || 0) > 0 ? `Publicar versão ${(h?.version || 0) + 1} e avisar` : 'Publicar e avisar os sócios'}</Button>
          <Button variant="secondary" loading={busy} onClick={() => save(false)}>Salvar rascunho</Button>
          <Button variant="ghost" onClick={onDone}>Voltar</Button>
        </div>
      </Card>
    </div>
  );
}

export default function HandbookPage() {
  const t = useTenant();
  const doc = useDoc<HandbookDoc>(P.handbook(t.tenantId));
  const canEdit = t.can('sociedade', 'editar') || t.can('documentos', 'editar');
  const [editing, setEditing] = useState(false);
  if (doc.loading) return <Loading />;
  const h = doc.data;
  if (editing) return <Editor h={h} onDone={() => setEditing(false)} />;
  if (!h || h.version === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Manual do sócio" />
        <EmptyState
          icon={<BookOpen className="w-5 h-5" />}
          title={canEdit && h ? 'Há um rascunho ainda não publicado' : 'O manual ainda não foi publicado'}
          text={canEdit ? 'Escreva os direitos, deveres e regras da sociedade, ou envie o PDF do regimento. Há um modelo para começar.' : 'Quando a diretoria publicar, ele aparece aqui e você recebe um aviso.'}
          action={canEdit ? <Button onClick={() => setEditing(true)}>{h ? 'Continuar o rascunho' : 'Criar o manual'}</Button> : undefined}
        />
      </div>
    );
  }
  return <Reader h={h} onEdit={canEdit ? () => setEditing(true) : undefined} />;
}

/** Aviso na página inicial: manual (ou versão nova) ainda não lido */
export function HandbookNotice() {
  const t = useTenant();
  const session = useSession();
  const doc = useDoc<HandbookDoc>(t.member ? P.handbook(t.tenantId) : null);
  const ack = useDoc<{ version: number }>(t.member && session.user ? P.handbookAck(t.tenantId, session.user.uid) : null);
  const h = doc.data;
  if (!h || !h.version || !h.requireAck || doc.loading || ack.loading || ack.data?.version === h.version) return null;
  return (
    <Notice>
      <span className="font-semibold">{ack.data ? 'O manual do sócio foi atualizado.' : 'Leia o manual do sócio.'}</span>{' '}
      <Link to={t.to('manual')} className="text-accent underline">
        Abrir o manual
      </Link>
    </Notice>
  );
}
