/** Escolha de vários cargos ou grupos do organograma, em botões que acendem (cabe no celular sem lista suspensa). */
import { Check } from 'lucide-react';
import { cx } from '../../../ui/index.tsx';

export function MultiPick({ options, values, onChange, label }: { options: string[]; values: string[]; onChange: (v: string[]) => void; label: string }) {
  const on = (v: string) => values.some(x => x.trim().toLowerCase() === v.trim().toLowerCase());
  // Valor gravado que saiu do organograma continua visível para poder ser tirado
  const all = [...options, ...values.filter(v => !options.some(o => o.trim().toLowerCase() === v.trim().toLowerCase()))];
  if (!all.length) return <p className="text-xs text-muted">Nada no organograma ainda.</p>;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {all.map(o => (
        <button
          key={o}
          type="button"
          aria-pressed={on(o)}
          onClick={() => onChange(on(o) ? values.filter(x => x.trim().toLowerCase() !== o.trim().toLowerCase()) : [...values, o])}
          className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs cursor-pointer', on(o) ? 'border-accent bg-accent/15 font-semibold' : 'border-line hover:border-muted')}
        >
          {on(o) && <Check className="w-3 h-3" aria-hidden />}
          {o}
        </button>
      ))}
    </div>
  );
}
