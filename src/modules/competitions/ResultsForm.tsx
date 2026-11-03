/**
 * Lançar os resultados de uma etapa (formato individual): grade com busca de sócio, colagem ou
 * importação de CSV "nome;categoria;valor". Gravar substitui todos os resultados da etapa.
 */
import { useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FileUp, Plus, Trash2, UserCheck } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatValue, isTimeUnit, normName, parseValue } from '../../shared/rankings.ts';
import type { CompetitionDoc, CompetitionResultDoc, MemberDoc } from '../../shared/types.ts';
import type { WithId } from '../../data/client.ts';
import { Button, Field, Input, Modal, Notice, Select, Textarea } from '../../ui/index.tsx';
import { parsePasted } from './common.ts';

interface Row {
  key: string;
  participantName: string;
  memberId?: string;
  category: string;
  valueText: string;
  notes: string;
}

const rk = () => Math.random().toString(36).slice(2, 10);

/** Etapa sugerida: a primeira sem resultados (a próxima a lançar) ou a última */
export function suggestedStage(c: CompetitionDoc, results: CompetitionResultDoc[]): string {
  const withResults = new Set(results.map(r => r.stageId));
  return c.stages.find(s => !withResults.has(s.id))?.id || c.stages[c.stages.length - 1]?.id || '';
}

export default function ResultsForm({ competition: c, results, initialStage, onClose }: { competition: WithId<CompetitionDoc>; results: CompetitionResultDoc[]; initialStage?: string; onClose: () => void }) {
  const t = useTenant();
  const op = useOp();
  const canSeeMembers = t.can('socios', 'ver');
  const members = useList<MemberDoc>(canSeeMembers ? P.members(t.tenantId) : null, { orderBy: [['fullName', 'asc']], limit: 3000 });
  const byName = useMemo(() => {
    const m = new Map<string, WithId<MemberDoc>>();
    for (const x of members.data) if (x.status !== 'desligado' && x.status !== 'rejeitado') m.set(normName(x.fullName), x);
    return m;
  }, [members.data]);
  const memberName = useMemo(() => new Map(members.data.map(m => [m.id, m.fullName])), [members.data]);

  const fromResults = (stageId: string): Row[] =>
    results
      .filter(r => r.stageId === stageId)
      .sort((a, b) => a.participantName.localeCompare(b.participantName, 'pt-BR'))
      .map(r => ({ key: rk(), participantName: r.participantName, memberId: r.memberId, category: r.category || '', valueText: formatValue(r.value, c.unit).replace(/\./g, ''), notes: r.notes || '' }));

  const [stageId, setStageId] = useState(() => initialStage || suggestedStage(c, results));
  const [rows, setRows] = useState<Row[]>(() => {
    const r = fromResults(initialStage || suggestedStage(c, results));
    return r.length ? r : [{ key: rk(), participantName: '', category: c.categories[0] || '', valueText: '', notes: '' }];
  });
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteErrors, setPasteErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const time = isTimeUnit(c.unit);

  const link = (name: string): string | undefined => byName.get(normName(name))?.id;
  const update = (key: string, patch: Partial<Row>) =>
    setRows(rs =>
      rs.map(r => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.participantName !== undefined) next.memberId = link(patch.participantName);
        return next;
      })
    );

  const changeStage = (id: string) => {
    setStageId(id);
    const r = fromResults(id);
    setRows(r.length ? r : [{ key: rk(), participantName: '', category: c.categories[0] || '', valueText: '', notes: '' }]);
  };

  const applyPaste = (text: string) => {
    const { rows: parsed, errors } = parsePasted(text, c.categories.length > 0, c.unit);
    setPasteErrors(errors);
    if (!parsed.length) return;
    setRows(rs => {
      const kept = rs.filter(r => r.participantName.trim());
      const merged = [...kept];
      for (const p of parsed) {
        const cat = c.categories.find(x => normName(x) === normName(p.category)) || p.category;
        const i = merged.findIndex(r => normName(r.participantName) === normName(p.participantName) && normName(r.category) === normName(cat));
        const row: Row = { key: rk(), participantName: p.participantName, memberId: link(p.participantName), category: cat, valueText: p.valueText, notes: i >= 0 ? merged[i].notes : '' };
        if (i >= 0) merged[i] = row;
        else merged.push(row);
      }
      return merged;
    });
    setPaste('');
    if (!errors.length) setPasteOpen(false);
  };

  const filled = rows.filter(r => r.participantName.trim() || r.valueText.trim());
  const problems = filled
    .map((r, i) => {
      if (r.participantName.trim().length < 2) return `Linha ${i + 1}: informe o nome.`;
      if (parseValue(r.valueText, c.unit) === null) return `Linha ${i + 1} (${r.participantName}): valor inválido.`;
      if (c.categories.length && !c.categories.some(x => normName(x) === normName(r.category))) return `Linha ${i + 1} (${r.participantName}): escolha a categoria.`;
      return '';
    })
    .filter(Boolean);
  const stage = c.stages.find(s => s.id === stageId);
  const hadResults = results.some(r => r.stageId === stageId);

  const save = async () => {
    const entries = filled.map(r => ({
      participantName: r.participantName.trim(),
      ...(r.memberId ? { memberId: r.memberId } : {}),
      ...(c.categories.length ? { category: r.category } : {}),
      value: parseValue(r.valueText, c.unit) as number,
      ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
    }));
    const res = await op.run<{ saved: number }>('competitions.saveResults', { tenantId: t.tenantId, competitionId: c.id, stageId, entries }, { success: `Resultados de ${stage?.name || 'etapa'} gravados.` });
    if (res) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Lançar resultados"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={op.busy} disabled={!stageId || problems.length > 0} onClick={save}>
            Gravar {filled.length} {filled.length === 1 ? 'resultado' : 'resultados'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!c.stages.length ? (
          <Notice tone="warn">Cadastre as etapas na edição da competição antes de lançar resultados.</Notice>
        ) : (
          <Field label="Etapa" hint={hadResults ? 'Esta etapa já tem resultados: gravar substitui a lista inteira.' : 'Etapa ainda sem resultados.'}>
            {id => (
              <Select id={id} value={stageId} onChange={e => changeStage(e.target.value)}>
                {c.stages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {results.some(r => r.stageId === s.id) ? ' (lançada)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<ClipboardPaste className="w-4 h-4" />} onClick={() => setPasteOpen(o => !o)} aria-expanded={pasteOpen}>
            Colar lista
          </Button>
          <Button variant="secondary" size="sm" icon={<FileUp className="w-4 h-4" />} onClick={() => fileRef.current?.click()}>
            Importar CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            aria-label="Arquivo CSV de resultados"
            onChange={async e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) applyPaste(await f.text());
            }}
          />
        </div>
        {pasteOpen && (
          <div className="space-y-2">
            <Field label="Cole aqui (uma pessoa por linha)" hint={c.categories.length ? 'Formato: nome;categoria;valor' : 'Formato: nome;valor (ou nome;categoria;valor)'}>
              {id => <Textarea id={id} value={paste} onChange={e => setPaste(e.target.value)} placeholder={c.categories.length ? `Maria Souza;${c.categories[0]};${time ? '01:23,45' : '98'}` : `Maria Souza;${time ? '01:23,45' : '98'}`} />}
            </Field>
            <Button size="sm" onClick={() => applyPaste(paste)} disabled={!paste.trim()}>
              Usar a lista
            </Button>
          </div>
        )}
        {pasteErrors.length > 0 && (
          <Notice tone="warn">
            <ul className="list-disc pl-4">
              {pasteErrors.slice(0, 8).map(e => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}

        {canSeeMembers && (
          <datalist id="sd-socios">
            {members.data
              .filter(m => m.status !== 'desligado' && m.status !== 'rejeitado')
              .map(m => (
                <option key={m.id} value={m.fullName} />
              ))}
          </datalist>
        )}
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="grid gap-2 grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_8rem_1fr_auto] items-end border border-line rounded-xl p-3 bg-surface">
              <div className="col-span-2 sm:col-span-1">
                <Field label={`${i + 1}. Participante`} hint={r.memberId ? `Sócio: ${memberName.get(r.memberId) || r.participantName}` : canSeeMembers ? 'Digite para buscar um sócio' : undefined}>
                  {id => (
                    <div className="relative">
                      <Input id={id} list={canSeeMembers ? 'sd-socios' : undefined} value={r.participantName} maxLength={120} autoComplete="off" onChange={e => update(r.key, { participantName: e.target.value })} className={r.memberId ? 'pr-8' : undefined} />
                      {r.memberId && <UserCheck className="w-4 h-4 text-ok absolute right-2.5 top-1/2 -translate-y-1/2" aria-label="Sócio vinculado" />}
                    </div>
                  )}
                </Field>
              </div>
              {c.categories.length > 0 ? (
                <Field label="Categoria">
                  {id => (
                    <Select id={id} value={r.category} onChange={e => update(r.key, { category: e.target.value })}>
                      <option value="">Escolha</option>
                      {c.categories.map(x => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              ) : (
                <span className="hidden sm:block" />
              )}
              <Field label={time ? 'Tempo (mm:ss,cc)' : `Valor (${c.unit})`}>
                {id => (
                  <Input
                    id={id}
                    inputMode={time ? 'text' : 'decimal'}
                    value={r.valueText}
                    onChange={e => update(r.key, { valueText: e.target.value })}
                    aria-invalid={!!r.valueText && parseValue(r.valueText, c.unit) === null}
                    className="tabular-nums"
                  />
                )}
              </Field>
              <Field label="Observação">
                {id => <Input id={id} value={r.notes} maxLength={200} onChange={e => update(r.key, { notes: e.target.value })} />}
              </Field>
              <Button variant="ghost" size="sm" aria-label={`Remover linha ${i + 1}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} icon={<Trash2 className="w-4 h-4" />} />
            </li>
          ))}
        </ol>
        <Button variant="secondary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setRows(rs => [...rs, { key: rk(), participantName: '', category: c.categories[0] || '', valueText: '', notes: '' }])}>
          Adicionar participante
        </Button>
        {problems.length > 0 && filled.length > 0 && (
          <Notice tone="warn">
            <ul className="list-disc pl-4">
              {problems.slice(0, 6).map(p => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </Modal>
  );
}
