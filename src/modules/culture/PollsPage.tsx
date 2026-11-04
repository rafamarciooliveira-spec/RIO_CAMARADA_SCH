/** Enquetes do portal (no lugar das do grupo de WhatsApp): responder, ver o resultado e, na diretoria, criar. */
import { useEffect, useState } from 'react';
import { BarChart3, Lock, Plus, Trash2, Users } from 'lucide-react';
import { useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { SurveyDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Modal, Notice, PageHeader, Toggle, cx } from '../../ui/index.tsx';

function Poll({ s, canManage }: { s: SurveyDoc & { id: string }; canManage: boolean }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const mine = useDoc<{ optionIndex?: number }>(session.user ? P.surveyVoter(t.tenantId, s.id, session.user.uid) : null);
  const [names, setNames] = useState<string[][] | null>(null);
  const [showNames, setShowNames] = useState(false);
  const total = (s.counts || []).reduce((a, b) => a + b, 0);
  const voted = mine.data?.optionIndex;
  const closed = !s.open || (!!s.closesAt && s.closesAt < new Date().toISOString());
  const canVote = !closed && (voted === undefined || s.allowChange);
  useEffect(() => {
    if (!showNames || !s.showNames) return;
    run<{ byOption: string[][] }>('surveys.responses', { tenantId: t.tenantId, surveyId: s.id }, { silent: true }).then(r => setNames(r?.byOption || null));
  }, [showNames, s.showNames, s.counts, run, t.tenantId, s.id]);
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">{s.question}</div>
        {closed ? <Badge>encerrada</Badge> : <Badge tone="ok">aberta</Badge>}
      </div>
      <div className="text-xs text-muted flex flex-wrap gap-x-3">
        <span>{formatDateTime(s.createdAt, t.tenant.timezone)}</span>
        {s.closesAt && <span>Encerra {formatDateTime(s.closesAt, t.tenant.timezone)}</span>}
        <span className="inline-flex items-center gap-1">{s.showNames ? <><Users className="w-3 h-3" /> mostra quem respondeu</> : <><Lock className="w-3 h-3" /> respostas sem nome</>}</span>
      </div>
      <ul className="space-y-2">
        {s.options.map((o, i) => {
          const n = s.counts?.[i] || 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          const chosen = voted === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!canVote || busy}
                onClick={() => run('surveys.vote', { tenantId: t.tenantId, surveyId: s.id, optionIndex: i }, { success: voted === undefined ? 'Resposta registrada.' : 'Resposta alterada.' })}
                className={cx('w-full text-left rounded-xl border p-3 relative overflow-hidden', chosen ? 'border-accent' : 'border-line', canVote ? 'cursor-pointer hover:border-muted' : 'cursor-default')}
              >
                {(voted !== undefined || closed) && <span className="absolute inset-y-0 left-0 bg-accent/15" style={{ width: `${pct}%` }} aria-hidden />}
                <span className="relative flex items-center justify-between gap-2 text-sm">
                  <span className={chosen ? 'font-semibold' : ''}>{chosen ? `✓ ${o}` : o}</span>
                  {(voted !== undefined || closed) && <span className="tabular-nums text-muted">{n} ({pct}%)</span>}
                </span>
              </button>
              {showNames && names?.[i]?.length ? <p className="text-xs text-muted mt-1 px-1">{names[i].join(', ')}</p> : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{total} resposta(s)</span>
        {voted === undefined && !closed && <span>Toque numa opção para responder.</span>}
        {voted !== undefined && s.allowChange && !closed && <span>Você pode mudar a resposta até a enquete encerrar.</span>}
        {s.showNames && total > 0 && (
          <button type="button" className="text-accent cursor-pointer" onClick={() => setShowNames(v => !v)}>
            {showNames ? 'Esconder nomes' : 'Ver quem respondeu'}
          </button>
        )}
        {canManage && (
          <button type="button" className="text-accent cursor-pointer ml-auto" onClick={() => run('surveys.close', { tenantId: t.tenantId, surveyId: s.id, open: closed }, { success: closed ? 'Enquete reaberta.' : 'Enquete encerrada.' })}>
            {closed ? 'Reabrir' : 'Encerrar'}
          </button>
        )}
      </div>
    </Card>
  );
}

function NewPoll({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['Vou', 'Não vou']);
  const [showNames, setShowNames] = useState(true);
  const [allowChange, setAllowChange] = useState(true);
  const [closesAt, setClosesAt] = useState('');
  const valid = question.trim().length >= 3 && options.filter(o => o.trim()).length >= 2;
  return (
    <Modal
      open
      onClose={onClose}
      title="Nova enquete"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!valid} onClick={async () => {
            const r = await run<{ notified: number }>(
              'surveys.create',
              { tenantId: t.tenantId, question: question.trim(), options: options.map(o => o.trim()).filter(Boolean), showNames, allowChange, ...(closesAt ? { closesAt: new Date(closesAt).toISOString() } : {}), notify: true, requestId: `enquete_${Date.now()}` },
              { success: 'Enquete publicada.' }
            );
            if (r) onClose();
          }}>
            Publicar e avisar todos
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Pergunta" required>{id => <Input id={id} value={question} maxLength={300} onChange={e => setQuestion(e.target.value)} placeholder="Quem vai participar do desfile no sábado?" />}</Field>
        <div className="space-y-2">
          <div className="text-sm font-medium">Opções</div>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Opção ${i + 1}`} value={o} maxLength={120} onChange={e => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <button type="button" aria-label="Tirar opção" className="p-2 rounded-lg hover:bg-surface-2 text-bad cursor-pointer" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <Button type="button" size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setOptions([...options, ''])}>
              Adicionar opção
            </Button>
          )}
        </div>
        <Toggle checked={showNames} onChange={setShowNames} label="Lista de presença: todos veem quem escolheu cada opção" />
        <Toggle checked={allowChange} onChange={setAllowChange} label="Quem respondeu pode mudar a resposta" />
        <Field label="Encerrar em (opcional)">{id => <Input id={id} type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} />}</Field>
        <Notice>Todos os sócios recebem a notificação no celular e no portal.</Notice>
      </div>
    </Modal>
  );
}

export default function PollsPage() {
  const t = useTenant();
  const list = useList<SurveyDoc>(P.surveys(t.tenantId), { orderBy: [['createdAt', 'desc']], limit: 30 });
  const [creating, setCreating] = useState(false);
  const canManage = t.can('engajamento', 'criar');
  return (
    <div className="space-y-5">
      <PageHeader
        title="Enquetes"
        subtitle="Perguntas rápidas da sociedade: participação no desfile, data da festa, cardápio..."
        actions={canManage && <Button icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>Nova enquete</Button>}
      />
      {list.loading ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<BarChart3 className="w-5 h-5" />} title="Nenhuma enquete ainda" text={canManage ? 'Crie a primeira: todos recebem a notificação no celular.' : 'Quando a diretoria publicar uma enquete, ela aparece aqui.'} />
      ) : (
        <div className="grid md:grid-cols-2 gap-3 items-start">
          {list.data.map(s => (
            <Poll key={s.id} s={s} canManage={canManage} />
          ))}
        </div>
      )}
      {creating && <NewPoll onClose={() => setCreating(false)} />}
    </div>
  );
}
