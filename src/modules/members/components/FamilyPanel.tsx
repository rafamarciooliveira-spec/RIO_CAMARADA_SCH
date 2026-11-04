/** Família no detalhe do sócio: dependentes do titular com idade, valor e prazos; e passagem do dependente a titular. */
import { useState } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { formatDate, localDateKey } from '../../../shared/dates.ts';
import { formatBRL } from '../../../shared/money.ts';
import { birthDateOf, dependentRules, dependentTimeline } from '../../../shared/dependents.ts';
import { MEMBER_STATUS_LABEL, type MemberDoc } from '../../../shared/types.ts';
import { Badge, Button, Select } from '../../../ui/index.tsx';
import { statusTone } from '../statusTone.ts';

/** Linha do tempo do dependente em texto curto, igual para a diretoria e para o titular */
export function useDependentInfo() {
  const t = useTenant();
  const rules = dependentRules(t.settings);
  const today = localDateKey(new Date(), t.tenant.timezone);
  return (d: MemberDoc) => {
    const cat = t.settings?.categories.find(c => c.id === d.categoryId);
    const tl = dependentTimeline(rules, birthDateOf(d), today, cat && cat.period !== 'isento' ? cat.feeCents : 0);
    const notes: { text: string; tone: 'info' | 'warn' | 'bad' }[] = [];
    if (tl.overLimit) notes.push({ text: `Passou de ${rules.maxAge} anos: não pode mais ser dependente. Precisa virar sócio titular.`, tone: 'bad' });
    else if (tl.limitAt) notes.push({ text: `Pode ser dependente até ${formatDate(tl.limitAt)} (${rules.maxAge} anos).`, tone: 'info' });
    if (tl.paysFrom) notes.push({ text: `Sem custo até ${formatDate(tl.paysFrom)}; depois soma ${formatBRL(rules.mode === 'valor_fixo' ? rules.feeCents : cat?.feeCents || 0)} na mensalidade.`, tone: 'info' });
    return { tl, notes, feeText: rules.mode === 'gratis' ? 'Sem custo' : tl.feeNowCents > 0 ? `${formatBRL(tl.feeNowCents)} na mensalidade` : 'Sem custo por enquanto' };
  };
}

export function HolderFamily({ m, onOpen }: { m: MemberDoc & { id: string }; onOpen?: (id: string) => void }) {
  const t = useTenant();
  const list = useList<MemberDoc>(P.members(t.tenantId), { where: [['dependentOf', '==', m.id]], limit: 30 });
  const info = useDependentInfo();
  if (!list.data.length) return null;
  return (
    <div className="space-y-2 p-3 rounded-xl border border-line">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Users className="w-4 h-4" aria-hidden />
        {list.data.length} dependente{list.data.length > 1 ? 's' : ''}
      </div>
      <ul className="divide-y divide-line">
        {list.data.map(d => {
          const i = info(d);
          return (
            <li key={d.id} className="py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="font-medium text-sm text-left hover:underline cursor-pointer" onClick={() => onOpen?.(d.id)}>
                  {d.fullName}
                </button>
                <Badge tone={statusTone(d.status)}>{MEMBER_STATUS_LABEL[d.status]}</Badge>
                {i.tl.age !== null && <span className="text-xs text-muted">{i.tl.age} anos</span>}
                {d.custom?.parentesco && <span className="text-xs text-muted">{d.custom.parentesco}</span>}
                <span className="text-xs text-muted ml-auto">{i.feeText}</span>
              </div>
              {i.notes.map(n => (
                <p key={n.text} className={`text-xs ${n.tone === 'bad' ? 'text-bad' : 'text-muted'} flex items-start gap-1`}>
                  {n.tone === 'bad' && <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />}
                  {n.text}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PromoteDependent({ m }: { m: MemberDoc & { id: string } }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const cats = (t.settings?.categories || []).filter(c => c.id !== 'dependente');
  const [cat, setCat] = useState(cats[0]?.id || '');
  if (!m.dependentOf || !t.can('socios', 'aprovar')) return null;
  return (
    <section className="space-y-2 p-3 rounded-xl border border-line">
      <h3 className="font-semibold text-sm">Tornar sócio titular</h3>
      <p className="text-xs text-muted">Deixa de ser dependente e passa a ter o próprio cadastro, com a própria mensalidade. O histórico e a data de entrada continuam.</p>
      <Select aria-label="Categoria de titular" value={cat} onChange={e => setCat(e.target.value)}>
        {cats.map(c => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Button variant="secondary" loading={busy} disabled={!cat} onClick={() => run('members.promoteDependent', { tenantId: t.tenantId, memberId: m.id, categoryId: cat, requestId: `${m.id}_titular` }, { success: 'Agora é sócio titular.' })}>
        Tornar sócio titular
      </Button>
    </section>
  );
}
