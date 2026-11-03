/** Enquetes abertas para o sócio responder (uma resposta por pessoa) e resultado parcial. */
import { useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { SurveyDoc } from '../../shared/types.ts';
import { Button, Card, Section } from '../../ui/index.tsx';

export function SurveyBars({ s }: { s: SurveyDoc }) {
  const total = (s.counts || []).reduce((a, b) => a + b, 0);
  return (
    <ul className="space-y-2" aria-label={`Resultado: ${s.title}`}>
      {s.options.map((o, i) => {
        const n = s.counts?.[i] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <li key={i} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{o}</span>
              <span className="tabular-nums text-muted">
                {n} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
      <li className="text-xs text-muted">{total} resposta(s)</li>
    </ul>
  );
}

function SurveyCard({ s }: { s: SurveyDoc & { id: string } }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const voted = useDoc(session.user ? P.surveyVoter(t.tenantId, s.id, session.user.uid) : null);
  return (
    <Card className="space-y-3">
      <div>
        <div className="font-semibold">{s.title}</div>
        <p className="text-sm text-muted">{s.question}</p>
      </div>
      {voted.data ? (
        <SurveyBars s={s} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {s.options.map((o, i) => (
            <Button key={i} size="sm" variant="secondary" loading={busy} onClick={() => run('surveys.vote', { tenantId: t.tenantId, surveyId: s.id, optionIndex: i }, { success: 'Resposta registrada. Obrigado!' })}>
              {o}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Bloco para a área do sócio (pode ser usado na página inicial) */
export default function MemberSurveys() {
  const t = useTenant();
  const list = useList<SurveyDoc>(t.moduleOn('engajamento') ? P.surveys(t.tenantId) : null, { where: [['open', '==', true]], limit: 10 });
  if (!list.data.length) return null;
  return (
    <Section title="Enquetes">
      {list.data.map(s => (
        <SurveyCard key={s.id} s={s} />
      ))}
    </Section>
  );
}
