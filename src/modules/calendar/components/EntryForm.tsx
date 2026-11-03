/** Criação e edição de item manual da agenda (coleção calendar, via generic.save). */
import { useState } from 'react';
import { useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import type { CalendarEntryDoc } from '../../../shared/types.ts';
import { Button, Field, Input, Modal, Notice, Select, Textarea, Toggle, useConfirm } from '../../../ui/index.tsx';
import { isoToLocalInput, localInputToIso } from '../../notices/noticeUtils.tsx';

export const CATEGORY_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];

export function EntryForm({ entry, initialStart, onClose, knownCategories }: { entry?: CalendarEntryDoc & { id: string }; initialStart?: Date; onClose: () => void; knownCategories: { name: string; color: string }[] }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const start0 = entry?.start || (initialStart ? new Date(new Date(initialStart).setHours(19, 0, 0, 0)).toISOString() : new Date().toISOString());
  const [title, setTitle] = useState(entry?.title || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [location, setLocation] = useState(entry?.location || '');
  const [allDay, setAllDay] = useState(entry?.allDay || false);
  const [start, setStart] = useState(isoToLocalInput(start0));
  const [end, setEnd] = useState(isoToLocalInput(entry?.end || new Date(Date.parse(start0) + 2 * 3600_000).toISOString()));
  const [category, setCategory] = useState(entry?.category || knownCategories[0]?.name || 'Geral');
  const [color, setColor] = useState(entry?.color || knownCategories[0]?.color || CATEGORY_COLORS[0]);
  const [freq, setFreq] = useState<CalendarEntryDoc['recurrence']['freq']>(entry?.recurrence?.freq || 'nenhuma');
  const [until, setUntil] = useState(entry?.recurrence?.until || '');
  const [visibility, setVisibility] = useState<CalendarEntryDoc['visibility']>(entry?.visibility || 'socios');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (title.trim().length < 2) return setError('Escreva um título.');
    const s = allDay ? new Date(`${start.slice(0, 10)}T12:00:00`).toISOString() : localInputToIso(start);
    const e = allDay ? new Date(`${(end || start).slice(0, 10)}T12:00:00`).toISOString() : localInputToIso(end);
    if (!s || !e) return setError('Confira as datas.');
    if (e < s) return setError('O fim precisa ser depois do início.');
    const data = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      start: s,
      end: e,
      allDay,
      category: category.trim() || 'Geral',
      color,
      recurrence: { freq, ...(freq !== 'nenhuma' && until ? { until } : {}) },
      visibility,
    };
    const r = await run('generic.save', { tenantId: t.tenantId, collection: 'calendar', ...(entry ? { id: entry.id } : {}), data }, { success: 'Agenda atualizada.' });
    if (r) onClose();
  };

  const remove = async () => {
    if (!entry) return;
    const ok = await confirm({ title: 'Apagar da agenda', text: entry.recurrence?.freq !== 'nenhuma' ? 'Todas as repetições deste item serão apagadas.' : `"${entry.title}" será apagado.`, confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    const r = await run('generic.delete', { tenantId: t.tenantId, collection: 'calendar', id: entry.id }, { success: 'Item apagado.' });
    if (r) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'Editar item da agenda' : 'Novo item na agenda'}
      footer={
        <>
          {entry && (
            <Button variant="ghost" onClick={remove} className="mr-auto">
              Apagar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <Field label="Título" required>
        {id => <Input id={id} value={title} maxLength={150} onChange={e => setTitle(e.target.value)} />}
      </Field>
      <Toggle checked={allDay} onChange={setAllDay} label="Dia inteiro" />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Início">
          {id => (allDay ? <Input id={id} type="date" value={start.slice(0, 10)} onChange={e => setStart(`${e.target.value}T00:00`)} /> : <Input id={id} type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />)}
        </Field>
        <Field label="Fim">
          {id => (allDay ? <Input id={id} type="date" value={end.slice(0, 10)} onChange={e => setEnd(`${e.target.value}T00:00`)} /> : <Input id={id} type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />)}
        </Field>
      </div>
      <Field label="Local">{id => <Input id={id} value={location} maxLength={200} onChange={e => setLocation(e.target.value)} />}</Field>
      <Field label="Descrição">{id => <Textarea id={id} value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} />}</Field>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Categoria" hint="Exemplo: Ensaios, Bailes, Reuniões">
          {id => (
            <>
              <Input id={id} list="agenda-categorias" value={category} maxLength={40} onChange={e => {
                setCategory(e.target.value);
                const k = knownCategories.find(c => c.name === e.target.value);
                if (k) setColor(k.color);
              }} />
              <datalist id="agenda-categorias">
                {knownCategories.map(c => (
                  <option key={c.name} value={c.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <div className="flex gap-1.5 pb-1" role="radiogroup" aria-label="Cor">
          {CATEGORY_COLORS.map(c => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Cor ${c}`} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 cursor-pointer ${color === c ? 'border-fg' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Repetir">
          {id => (
            <Select id={id} value={freq} onChange={e => setFreq(e.target.value as typeof freq)}>
              <option value="nenhuma">Não repete</option>
              <option value="semanal">Toda semana</option>
              <option value="mensal">Todo mês</option>
              <option value="anual">Todo ano</option>
            </Select>
          )}
        </Field>
        {freq !== 'nenhuma' && <Field label="Repetir até (opcional)">{id => <Input id={id} type="date" value={until} onChange={e => setUntil(e.target.value)} />}</Field>}
      </div>
      <Field label="Quem vê">
        {id => (
          <Select id={id} value={visibility} onChange={e => setVisibility(e.target.value as CalendarEntryDoc['visibility'])}>
            <option value="publico">Público (também na página pública)</option>
            <option value="socios">{t.labels.members}</option>
            <option value="diretoria">Só {t.labels.board.toLowerCase()}</option>
          </Select>
        )}
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
    </Modal>
  );
}
