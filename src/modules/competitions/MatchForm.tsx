/** Cadastrar ou editar um jogo (formato times): rodada, mandante, visitante, placar, data e local. */
import { useState } from 'react';
import { useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { useConfirm } from '../../ui/index.tsx';
import type { CompetitionDoc, CompetitionMatchDoc } from '../../shared/types.ts';
import type { WithId } from '../../data/client.ts';
import { Button, Field, Input, Modal, Notice, Select } from '../../ui/index.tsx';

function scoreText(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

function parseScore(s: string): number | null | 'erro' {
  const t = s.trim();
  if (!t) return null;
  return /^\d{1,3}$/.test(t) ? Number(t) : 'erro';
}

export default function MatchForm({ competition: c, match, defaultStage, onClose }: { competition: WithId<CompetitionDoc>; match?: WithId<CompetitionMatchDoc>; defaultStage?: string; onClose: () => void }) {
  const t = useTenant();
  const op = useOp();
  const confirm = useConfirm();
  const [stageId, setStageId] = useState(match?.stageId || defaultStage || c.stages[c.stages.length - 1]?.id || '');
  const [home, setHome] = useState(match?.homeTeamId || c.teams[0]?.id || '');
  const [away, setAway] = useState(match?.awayTeamId || c.teams[1]?.id || '');
  const [hs, setHs] = useState(scoreText(match?.homeScore));
  const [as, setAs] = useState(scoreText(match?.awayScore));
  const [date, setDate] = useState(match?.date || '');
  const [location, setLocation] = useState(match?.location || '');
  const h = parseScore(hs);
  const a = parseScore(as);
  const problem =
    c.teams.length < 2
      ? 'Cadastre pelo menos dois times na edição da competição.'
      : home === away
        ? 'Mandante e visitante precisam ser times diferentes.'
        : h === 'erro' || a === 'erro'
          ? 'O placar é um número inteiro de 0 a 999.'
          : (h === null) !== (a === null)
            ? 'Informe os dois placares, ou deixe os dois em branco (jogo ainda não disputado).'
            : '';

  const save = async () => {
    const r = await op.run(
      'competitions.saveMatch',
      {
        tenantId: t.tenantId,
        competitionId: c.id,
        ...(match ? { id: match.id } : {}),
        ...(stageId ? { stageId } : {}),
        homeTeamId: home,
        awayTeamId: away,
        homeScore: h,
        awayScore: a,
        ...(date ? { date } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
      },
      { success: 'Jogo salvo.' }
    );
    if (r) onClose();
  };

  const remove = async () => {
    if (!match) return;
    const ok = await confirm({ title: 'Apagar jogo', text: 'O jogo sai da tabela e da classificação.', confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    const r = await op.run('competitions.deleteMatch', { tenantId: t.tenantId, competitionId: c.id, id: match.id }, { success: 'Jogo apagado.' });
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={match ? 'Editar jogo' : 'Novo jogo'}
      footer={
        <>
          {match && (
            <Button variant="danger" onClick={remove} disabled={op.busy} className="mr-auto">
              Apagar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={op.busy} disabled={!!problem} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {c.stages.length > 0 && (
          <Field label="Rodada">
            {id => (
              <Select id={id} value={stageId} onChange={e => setStageId(e.target.value)}>
                <option value="">Sem rodada</option>
                {c.stages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid grid-cols-[1fr_5rem] gap-2 items-end">
          <Field label="Mandante">
            {id => (
              <Select id={id} value={home} onChange={e => setHome(e.target.value)}>
                {c.teams.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Gols">{id => <Input id={id} inputMode="numeric" value={hs} onChange={e => setHs(e.target.value)} className="text-center tabular-nums" />}</Field>
          <Field label="Visitante">
            {id => (
              <Select id={id} value={away} onChange={e => setAway(e.target.value)}>
                {c.teams.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Gols">{id => <Input id={id} inputMode="numeric" value={as} onChange={e => setAs(e.target.value)} className="text-center tabular-nums" />}</Field>
        </div>
        <p className="text-xs text-muted">Deixe o placar em branco para um jogo ainda não disputado: ele não conta na classificação.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
          <Field label="Local">{id => <Input id={id} value={location} maxLength={120} onChange={e => setLocation(e.target.value)} />}</Field>
        </div>
        {problem && <Notice tone="warn">{problem}</Notice>}
      </div>
    </Modal>
  );
}
