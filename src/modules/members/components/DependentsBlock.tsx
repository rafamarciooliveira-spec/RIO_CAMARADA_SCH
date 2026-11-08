/**
 * Dependentes informados junto com a proposta do titular. Cada um entra pendente e a diretoria
 * aprova junto com o titular. Menor de 18 anos usa o titular como responsável legal.
 */
import { Plus, Trash2 } from 'lucide-react';
import { ageOn, localDateKey } from '../../../shared/dates.ts';
import { formatCPF, validateCPF, cleanCPF } from '../../../shared/cpf.ts';
import { Button, Card, Field, Input, Notice, Select } from '../../../ui/index.tsx';
import { PhotoPick } from '../../member-area/PhotoPick.tsx';

export interface DependentValue {
  fullName: string;
  birthDate: string;
  cpf: string;
  relation: string;
  photo?: Blob | null; // foto da carteirinha, enviada depois que o cadastro existir
}

export const RELATIONS = ['Cônjuge ou companheiro(a)', 'Filho(a)', 'Enteado(a)', 'Pai ou mãe', 'Neto(a)', 'Outro'];
export const MAX_DEPENDENTS = 10;

export function emptyDependent(): DependentValue {
  return { fullName: '', birthDate: '', cpf: '', relation: RELATIONS[1] };
}

export function validateDependents(list: DependentValue[], tz?: string, o: { requirePhoto?: boolean } = {}): Record<string, string> {
  const e: Record<string, string> = {};
  const today = localDateKey(new Date(), tz);
  list.forEach((d, i) => {
    if (d.fullName.trim().split(/\s+/).length < 2) e[`dep${i}.fullName`] = 'Informe o nome completo.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) || d.birthDate > today) e[`dep${i}.birthDate`] = 'Informe a data de nascimento.';
    if (d.cpf.trim() && !validateCPF(cleanCPF(d.cpf))) e[`dep${i}.cpf`] = 'CPF inválido.';
    if (o.requirePhoto && !d.photo) e[`dep${i}.photo`] = 'A foto é obrigatória: ela vai na carteirinha.';
  });
  return e;
}

/** Payload de cada dependente para members.apply (titular como responsável quando menor) */
export function dependentsPayload(list: DependentValue[], o: { categoryId: string; holderName: string; holderEmail?: string; holderPhone?: string; tz?: string; relationFieldId?: string }) {
  const today = localDateKey(new Date(), o.tz);
  return list.map(d => ({
    fullName: d.fullName.trim(),
    birthDate: d.birthDate,
    ...(d.cpf.trim() ? { cpf: d.cpf.trim() } : {}),
    ...(ageOn(d.birthDate, today) < 18
      ? { guardian: { name: o.holderName.trim(), ...(o.holderEmail ? { email: o.holderEmail } : {}), ...(o.holderPhone ? { phone: o.holderPhone } : {}), consent: true as const } }
      : {}),
    categoryId: o.categoryId,
    custom: { parentesco: d.relation },
  }));
}

export function DependentsBlock({ value, onChange, errors, allowed, categoryName, requirePhoto }: { value: DependentValue[]; onChange: (v: DependentValue[]) => void; errors: Record<string, string>; allowed: boolean; categoryName?: string; requirePhoto?: boolean }) {
  const set = (i: number, patch: Partial<DependentValue>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Dependentes</h2>
        <p className="text-sm text-muted">Cônjuge, filhos e outros familiares que entram junto com você. Cada um recebe a própria carteirinha depois da aprovação.</p>
      </div>
      {!allowed ? (
        <Notice>A categoria {categoryName || 'escolhida'} não permite dependentes.</Notice>
      ) : (
        <>
          {value.map((d, i) => (
            <div key={i} className="p-3 rounded-xl border border-line space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Dependente {i + 1}</span>
                <Button type="button" size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  Tirar
                </Button>
              </div>
              <Field label="Nome completo" required error={errors[`dep${i}.fullName`]}>
                {id => <Input id={id} value={d.fullName} maxLength={150} onChange={e => set(i, { fullName: e.target.value })} />}
              </Field>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Parentesco">
                  {id => (
                    <Select id={id} value={d.relation} onChange={e => set(i, { relation: e.target.value })}>
                      {RELATIONS.map(r => (
                        <option key={r}>{r}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Nascimento" required error={errors[`dep${i}.birthDate`]}>
                  {id => <Input id={id} type="date" value={d.birthDate} onChange={e => set(i, { birthDate: e.target.value })} />}
                </Field>
                <Field label="CPF (opcional)" error={errors[`dep${i}.cpf`]}>
                  {id => <Input id={id} inputMode="numeric" value={d.cpf} maxLength={14} onChange={e => set(i, { cpf: formatCPF(e.target.value) })} />}
                </Field>
              </div>
              <PhotoPick value={d.photo || null} onChange={b => set(i, { photo: b })} error={errors[`dep${i}.photo`]} label={`Foto de ${d.fullName.trim().split(/\s+/)[0] || 'quem entra'}`} required={requirePhoto} />
            </div>
          ))}
          {value.length > 0 && <p className="text-xs text-muted">O pai e a mãe são sócios? Pode incluir o filho mesmo que o outro já tenha incluído: o sistema reconhece a mesma pessoa, a diretoria junta num cadastro só e os dois veem a carteirinha dele no celular.</p>}
          {value.length > 0 && <p className="text-xs text-muted">Para menores de 18 anos, você fica como responsável legal e o seu aceite dos termos vale também para eles.</p>}
          {value.length < MAX_DEPENDENTS && (
            <Button type="button" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => onChange([...value, emptyDependent()])}>
              Incluir dependente
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
