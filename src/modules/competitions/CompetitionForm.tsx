/** Criar ou editar uma competição: formato, unidade, regra do ranking, categorias, etapas e times. */
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { societyType, suggestedCompetitionKinds, suggestedModalities } from '../../shared/societyTypes.ts';
import { isTimeUnit } from '../../shared/rankings.ts';
import type { CompetitionDoc } from '../../shared/types.ts';
import { Button, Field, Input, Modal, Notice, Select, Textarea, Toggle } from '../../ui/index.tsx';
import { UNITS } from './common.ts';

type Draft = Omit<CompetitionDoc, 'id' | 'createdAt' | 'updatedAt'>;

const rid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

function emptyDraft(tenantName: string, societyTypeId: string | undefined): Draft {
  const preset = societyType(societyTypeId).competition;
  const season = String(new Date().getFullYear());
  return {
    name: `${preset.label} ${season}`,
    scope: 'interno',
    organizer: tenantName,
    season,
    format: preset.format,
    unit: preset.unit,
    higherIsBetter: preset.higherIsBetter,
    aggregate: 'soma',
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    categories: [],
    stages: [],
    teams: [],
    status: 'planejada',
    publicRanking: false,
  };
}

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export default function CompetitionForm({ competition, hasResults, onClose, onSaved }: { competition?: CompetitionDoc; hasResults?: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const t = useTenant();
  const op = useOp();
  const [d, setD] = useState<Draft>(() => {
    if (!competition) return emptyDraft(t.tenant.name, t.tenant.societyType);
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = competition;
    return rest;
  });
  const [cats, setCats] = useState(() => d.categories.join('\n'));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const isTeams = d.format === 'times';
  const modalities = t.settings?.modalities?.length ? t.settings.modalities : suggestedModalities(t.tenant.societyType);
  const kinds = t.settings?.competitionKinds?.length ? t.settings.competitionKinds : suggestedCompetitionKinds(t.tenant.societyType);
  // Filial de federação: a competição pode valer para um campeonato da federação
  const [champs, setChamps] = useState<{ id: string; name: string; season: string }[]>([]);
  const { run } = op;
  useEffect(() => {
    if (!t.tenant.federationId) return;
    run<{ id: string; name: string; season: string }[]>('federation.championships', { tenantId: t.tenantId }, { silent: true }).then(r => setChamps(r || []));
  }, [run, t.tenantId, t.tenant.federationId]);

  const save = async () => {
    const categories = [...new Set(cats.split(/[\n;]/).map(s => s.trim()).filter(Boolean))];
    const data = {
      ...d,
      categories,
      stages: d.stages.map(s => ({ id: s.id, name: s.name.trim(), ...(s.date ? { date: s.date } : {}), ...(s.location?.trim() ? { location: s.location.trim() } : {}) })),
      teams: d.teams.map(x => ({ id: x.id, name: x.name.trim() })),
      ...(d.aggregate === 'melhores' ? { bestN: d.bestN || 1 } : { bestN: undefined }),
    };
    const r = await op.run<{ id: string }>('competitions.save', { tenantId: t.tenantId, ...(competition ? { id: competition.id } : {}), data }, { success: competition ? 'Competição salva.' : 'Competição criada.' });
    if (r) {
      onSaved?.(r.id);
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={competition ? 'Editar competição' : 'Nova competição'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={op.busy} onClick={save} disabled={d.name.trim().length < 2}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-bold mb-2">1. Identificação</legend>
          <Field label="Nome" required>
            {id => <Input id={id} value={d.name} maxLength={120} onChange={e => set('name', e.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              {id => (
                <Select id={id} value={d.scope} onChange={e => set('scope', e.target.value as Draft['scope'])}>
                  <option value="interno">Torneio interno</option>
                  <option value="externo">Etapas externas (liga, federação)</option>
                </Select>
              )}
            </Field>
            <Field label="Temporada" hint="Ex.: 2026">
              {id => <Input id={id} value={d.season} maxLength={20} onChange={e => set('season', e.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Modalidade" hint="Escolha da lista ou escreva outra">
              {id => (
                <>
                  <Input id={id} list={`${id}-mod`} value={d.modality || ''} maxLength={60} onChange={e => set('modality', e.target.value)} placeholder="Ex.: Tiro, Dado, Futebol society" />
                  <datalist id={`${id}-mod`}>
                    {modalities.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Tipo de competição" hint="Torneio, campeonato, copa...">
              {id => (
                <>
                  <Input id={id} list={`${id}-kind`} value={d.kind || ''} maxLength={60} onChange={e => set('kind', e.target.value)} placeholder="Ex.: Campeonato" />
                  <datalist id={`${id}-kind`}>
                    {kinds.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
          <Field label="Organizador" hint="A própria sociedade, a liga regional, a federação...">
            {id => <Input id={id} value={d.organizer} maxLength={120} onChange={e => set('organizer', e.target.value)} />}
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold mb-2">2. Formato e regra do ranking</legend>
          {hasResults && <Notice tone="warn">Já há resultados lançados: o formato não pode mais mudar.</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Formato">
              {id => (
                <Select id={id} value={d.format} disabled={hasResults} onChange={e => set('format', e.target.value as Draft['format'])}>
                  <option value="individual">Individual (resultado por etapa)</option>
                  <option value="times">Times (jogos com placar)</option>
                </Select>
              )}
            </Field>
            <Field label="Unidade" hint="pontos, pinos, gols, tempo...">
              {id => (
                <>
                  <Input
                    id={id}
                    list="sd-units"
                    value={d.unit}
                    maxLength={30}
                    onChange={e => {
                      const unit = e.target.value;
                      setD(x => ({ ...x, unit, ...(isTimeUnit(unit) ? { higherIsBetter: false } : {}) }));
                    }}
                  />
                  <datalist id="sd-units">
                    {UNITS.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>
          {isTeams ? (
            <div className="grid grid-cols-3 gap-3">
              {(['pointsWin', 'pointsDraw', 'pointsLoss'] as const).map(k => (
                <Field key={k} label={k === 'pointsWin' ? 'Pontos por vitória' : k === 'pointsDraw' ? 'Por empate' : 'Por derrota'}>
                  {id => <Input id={id} type="number" inputMode="numeric" min={0} max={100} value={d[k]} onChange={e => set(k, Math.max(0, Math.floor(Number(e.target.value) || 0)))} />}
                </Field>
              ))}
            </div>
          ) : (
            <>
              <Field label="Quem vence">
                {id => (
                  <Select id={id} value={d.higherIsBetter ? 'maior' : 'menor'} onChange={e => set('higherIsBetter', e.target.value === 'maior')}>
                    <option value="maior">Maior valor vence (pontos, pinos)</option>
                    <option value="menor">Menor valor vence (tempo)</option>
                  </Select>
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ranking geral da temporada">
                  {id => (
                    <Select id={id} value={d.aggregate} onChange={e => set('aggregate', e.target.value as Draft['aggregate'])}>
                      <option value="soma">Soma de todas as etapas</option>
                      <option value="media">Média das etapas disputadas</option>
                      <option value="melhores">Soma dos melhores resultados</option>
                    </Select>
                  )}
                </Field>
                {d.aggregate === 'melhores' && (
                  <Field label="Quantos melhores resultados contam" hint="Os demais são descartados.">
                    {id => <Input id={id} type="number" inputMode="numeric" min={1} max={100} value={d.bestN || 1} onChange={e => set('bestN', Math.max(1, Math.floor(Number(e.target.value) || 1)))} />}
                  </Field>
                )}
              </div>
              <Field label="Categorias" hint="Uma por linha. Ex.: Masculino, Feminino, Sênior. Deixe vazio para categoria única.">
                {id => <Textarea id={id} value={cats} onChange={e => setCats(e.target.value)} className="min-h-20" />}
              </Field>
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold mb-2">3. {isTeams ? 'Rodadas' : 'Etapas'}</legend>
          {d.stages.length === 0 && <p className="text-sm text-muted">Nenhuma {isTeams ? 'rodada' : 'etapa'} cadastrada.</p>}
          <ol className="space-y-2">
            {d.stages.map((s, i) => (
              <li key={s.id} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr_auto] items-end border border-line rounded-xl p-3">
                <Field label={`${isTeams ? 'Rodada' : 'Etapa'} ${i + 1}`}>
                  {id => <Input id={id} value={s.name} maxLength={80} onChange={e => set('stages', d.stages.map(x => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />}
                </Field>
                <Field label="Data">
                  {id => <Input id={id} type="date" value={s.date || ''} onChange={e => set('stages', d.stages.map(x => (x.id === s.id ? { ...x, date: e.target.value || undefined } : x)))} />}
                </Field>
                <Field label="Local">
                  {id => <Input id={id} value={s.location || ''} maxLength={120} onChange={e => set('stages', d.stages.map(x => (x.id === s.id ? { ...x, location: e.target.value } : x)))} />}
                </Field>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Subir" onClick={() => set('stages', move(d.stages, i, -1))} icon={<ArrowUp className="w-4 h-4" />} />
                  <Button variant="ghost" size="sm" aria-label="Descer" onClick={() => set('stages', move(d.stages, i, 1))} icon={<ArrowDown className="w-4 h-4" />} />
                  <Button variant="ghost" size="sm" aria-label={`Remover ${s.name}`} onClick={() => set('stages', d.stages.filter(x => x.id !== s.id))} icon={<Trash2 className="w-4 h-4" />} />
                </div>
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => set('stages', [...d.stages, { id: rid('e'), name: `${isTeams ? 'Rodada' : 'Etapa'} ${d.stages.length + 1}` }])}>
            Adicionar {isTeams ? 'rodada' : 'etapa'}
          </Button>
        </fieldset>

        {isTeams && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-bold mb-2">4. Times</legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.teams.map(x => (
                <li key={x.id} className="flex gap-2 items-center">
                  <Input aria-label="Nome do time" value={x.name} maxLength={80} onChange={e => set('teams', d.teams.map(y => (y.id === x.id ? { ...y, name: e.target.value } : y)))} />
                  <Button variant="ghost" size="sm" aria-label={`Remover ${x.name}`} onClick={() => set('teams', d.teams.filter(y => y.id !== x.id))} icon={<Trash2 className="w-4 h-4" />} />
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => set('teams', [...d.teams, { id: rid('t'), name: `Time ${d.teams.length + 1}` }])}>
              Adicionar time
            </Button>
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold mb-2">{isTeams ? '5' : '4'}. Publicação</legend>
          <Toggle checked={d.publicRanking} onChange={v => set('publicRanking', v)} label="Ranking público (visitantes da página da sociedade podem ver)" />
          <p className="text-xs text-muted">Aparece só o nome do participante e o resultado. Sem o público ligado, só os sócios veem.</p>
          {champs.length > 0 && !isTeams && (
            <Field label="Vale para o campeonato da federação" hint="Os resultados desta competição entram no ranking geral da federação.">
              {id => (
                <Select id={id} value={d.federationChampionshipId || ''} onChange={e => set('federationChampionshipId', e.target.value)}>
                  <option value="">Não vale para campeonato da federação</option>
                  {champs.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.season})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
