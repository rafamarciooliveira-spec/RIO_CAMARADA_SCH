/** Votações do sócio: abertas, elegibilidade explicada, voto com confirmação, comprovante sem o voto e resultados. */
import { useEffect, useState } from 'react';
import { CheckCircle2, Vote } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import type { ElectionDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Modal, Notice, PageHeader, Section } from '../../ui/index.tsx';
import { Results } from './ElectionsPage.tsx';

type Row = ElectionDoc & { id: string };

export default function MemberVotesPage() {
  const t = useTenant();
  const open = useList<ElectionDoc>(P.elections(t.tenantId), { where: [['status', '==', 'aberta']], orderBy: [['closesAt', 'asc']] });
  const closed = useList<ElectionDoc>(P.elections(t.tenantId), { where: [['status', '==', 'encerrada']], orderBy: [['closesAt', 'desc']], limit: 20 });
  return (
    <div className="space-y-6">
      <PageHeader title="Votações" subtitle="Seu voto é secreto: a sociedade sabe que você votou, nunca em quem." />
      {open.error && <ErrorState text={open.error} />}
      <Section title="Abertas">
        {open.loading ? <Loading /> : open.data.length === 0 ? <EmptyState icon={<Vote className="w-5 h-5" />} title="Nenhuma votação aberta agora" /> : open.data.map(e => <OpenElection key={e.id} e={e} />)}
      </Section>
      {closed.data.length > 0 && (
        <Section title="Resultados">
          {closed.data.map(e => (
            <Card key={e.id} className="space-y-2">
              <div className="font-semibold">{e.title}</div>
              <div className="text-xs text-muted">Encerrada em {formatDateTime(e.closesAt, t.tenant.timezone)}</div>
              <Results e={e} />
            </Card>
          ))}
        </Section>
      )}
    </div>
  );
}

function OpenElection({ e }: { e: Row }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [info, setInfo] = useState<{ eligible: boolean; reasons: string[]; voted: boolean; votedAt?: string } | null>(null);
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    run<{ eligible: boolean; reasons: string[]; voted: boolean; votedAt?: string }>('elections.eligibility', { tenantId: t.tenantId, electionId: e.id }, { silent: true }).then(r => alive && r && setInfo(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.id, t.tenantId, receipt]);
  const now = Date.now();
  const notYet = now < Date.parse(e.opensAt);
  const label = choice === null ? 'Voto em branco' : e.options.find(o => o.id === choice)?.label;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{e.title}</h3>
          <div className="text-xs text-muted">Até {formatDateTime(e.closesAt, t.tenant.timezone)}</div>
        </div>
        <Badge tone="ok">Aberta</Badge>
      </div>
      {e.description && <p className="text-sm whitespace-pre-line">{e.description}</p>}
      {!info ? (
        <Loading label="Conferindo se você pode votar..." />
      ) : info.voted ? (
        <Notice tone="ok">
          <span className="flex items-center gap-1 font-semibold">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Você já votou
          </span>
          Comprovante: voto registrado em {formatDateTime(info.votedAt || receipt, t.tenant.timezone)}. O conteúdo do voto não fica ligado ao seu nome.
        </Notice>
      ) : !info.eligible ? (
        <Notice tone="warn">
          <div className="font-semibold">Você não pode votar nesta votação:</div>
          <ul className="list-disc pl-5">
            {info.reasons.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Notice>
      ) : notYet ? (
        <Notice>A votação começa em {formatDateTime(e.opensAt, t.tenant.timezone)}.</Notice>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold mb-1">Escolha uma opção</legend>
          {e.options.map(o => (
            <label key={o.id} className="flex items-start gap-3 p-3 rounded-xl border border-line cursor-pointer has-[:checked]:border-accent">
              <input type="radio" name={`v_${e.id}`} className="mt-1" checked={choice === o.id} onChange={() => setChoice(o.id)} />
              <span>
                <span className="font-medium">{o.label}</span>
                {o.detail && <span className="block text-xs text-muted whitespace-pre-line">{o.detail}</span>}
              </span>
            </label>
          ))}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-line cursor-pointer has-[:checked]:border-accent">
            <input type="radio" name={`v_${e.id}`} checked={choice === null} onChange={() => setChoice(null)} />
            <span>Votar em branco</span>
          </label>
          <Button disabled={choice === undefined} onClick={() => setConfirming(true)}>
            Votar
          </Button>
        </fieldset>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirmar voto"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Voltar
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                const r = await run<{ votedAt: string }>('elections.vote', { tenantId: t.tenantId, electionId: e.id, optionId: choice ?? null }, { success: 'Voto registrado.' });
                setConfirming(false);
                if (r) setReceipt(r.votedAt);
              }}
            >
              Confirmar voto
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Seu voto: <strong>{label}</strong>
        </p>
        <p className="text-sm text-muted">Depois de confirmado, não é possível mudar. O voto é secreto.</p>
      </Modal>
    </Card>
  );
}
