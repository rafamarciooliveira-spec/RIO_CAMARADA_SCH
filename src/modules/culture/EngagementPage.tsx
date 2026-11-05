/** Engajamento: aniversariantes do mês, tempo de associação, homenagens e enquetes com resultado. */
import { useState } from 'react';
import { Award, Cake, Medal, MessageCircleQuestion } from 'lucide-react';
import { useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { MemberDoc, SurveyDoc } from '../../shared/types.ts';
import { Badge, Card, EmptyState, Field, Input, Loading, Notice, PageHeader, Section, Select, Tabs, Textarea } from '../../ui/index.tsx';
import { CrudPage, type CrudConfig } from './CrudPage.tsx';
import { SurveyBars } from './MemberSurveys.tsx';
import { NewPoll } from './PollsPage.tsx';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default function EngagementPage() {
  const [tab, setTab] = useState<'aniversarios' | 'tempo' | 'homenagens' | 'enquetes'>('aniversarios');
  return (
    <div className="space-y-4">
      <PageHeader title="Engajamento" subtitle="Aniversariantes, tempo de casa, homenagens e pesquisas internas." />
      <Tabs
        tabs={[
          { id: 'aniversarios', label: 'Aniversariantes' },
          { id: 'tempo', label: 'Tempo de associação' },
          { id: 'homenagens', label: 'Homenagens' },
          { id: 'enquetes', label: 'Enquetes' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'aniversarios' && <Birthdays />}
      {tab === 'tempo' && <Seniority />}
      {tab === 'homenagens' && <Honors />}
      {tab === 'enquetes' && <Surveys />}
    </div>
  );
}

function useActiveMembers() {
  const t = useTenant();
  return useList<MemberDoc>(t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 5000 });
}

function Birthdays() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const [month, setMonth] = useState(today.slice(5, 7));
  const members = useActiveMembers();
  if (members.loading) return <Loading />;
  const list = members.data.filter(m => m.birthMonthDay?.startsWith(`${month}-`)).sort((a, b) => (a.birthMonthDay! < b.birthMonthDay! ? -1 : 1));
  return (
    <div className="space-y-3">
      <Select aria-label="Mês" value={month} onChange={e => setMonth(e.target.value)} className="sm:w-48">
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1).padStart(2, '0')}>
            {m[0].toUpperCase() + m.slice(1)}
          </option>
        ))}
      </Select>
      {list.length === 0 ? (
        <EmptyState icon={<Cake className="w-5 h-5" />} title={`Nenhum aniversariante em ${MONTHS[Number(month) - 1]}`} />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {list.map(m => {
            const isToday = m.birthMonthDay === today.slice(5);
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm">{m.fullName}</span>
                <span className="flex items-center gap-2 text-sm tabular-nums">
                  {m.birthMonthDay!.slice(3)}/{m.birthMonthDay!.slice(0, 2)}
                  {isToday && <Badge tone="brand">Hoje</Badge>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted">Só o dia e o mês aparecem; o ano de nascimento não é exibido.</p>
    </div>
  );
}

function Seniority() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const members = useActiveMembers();
  const [min, setMin] = useState(0);
  if (members.loading) return <Loading />;
  const year = Number(today.slice(0, 4));
  // Vale o ano informado ("Sócio desde"); sem ele, a data do cadastro no sistema
  const all = members.data
    .filter(m => m.memberSinceYear || m.joinedAt)
    .map(m => {
      const fromYear = !!m.memberSinceYear;
      const startYear = m.memberSinceYear || Number(m.joinedAt!.slice(0, 4));
      const years = fromYear ? year - startYear : year - startYear - (today.slice(5) < m.joinedAt!.slice(5) ? 1 : 0);
      const milestoneThisYear = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70].includes(year - startYear);
      const sortKey = fromYear ? `${startYear}-00-00` : m.joinedAt!;
      return { ...m, fromYear, startYear, years: Math.max(0, years), milestoneThisYear, sortKey };
    });
  const withoutYear = all.filter(m => !m.fromYear).length;
  const rows = all.filter(m => m.years >= min).sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.fullName.localeCompare(b.fullName)));
  const milestones = rows.filter(r => r.milestoneThisYear);
  return (
    <div className="space-y-4">
      {milestones.length > 0 && (
        <Section title={`Datas redondas em ${year}`}>
          <div className="grid sm:grid-cols-2 gap-2">
            {milestones.map(m => (
              <Card key={m.id} className="flex items-center justify-between gap-2 p-3 sm:p-3">
                <span className="text-sm">{m.fullName}</span>
                <Badge tone="brand">{year - m.startYear} anos</Badge>
              </Card>
            ))}
          </div>
        </Section>
      )}
      {withoutYear > 0 && (
        <Notice tone="warn">
          {withoutYear === 1 ? '1 pessoa está' : `${withoutYear} pessoas estão`} sem o ano de entrada informado: o tempo conta a partir do cadastro no sistema. Informe em {t.labels.members} &gt; ficha &gt; "Sócio desde (ano)".
        </Notice>
      )}
      <Field label="Mostrar com pelo menos (anos)">{id => <Input id={id} type="number" min={0} value={min} onChange={e => setMin(Math.max(0, Number(e.target.value) || 0))} className="sm:w-32" />}</Field>
      {rows.length === 0 ? (
        <EmptyState icon={<Medal className="w-5 h-5" />} title="Ninguém nesse filtro" />
      ) : (
        <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
          {rows.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span>{m.fullName}</span>
              <span className="text-muted">
                {m.fromYear ? `desde ${m.startYear}` : `cadastro em ${formatDate(m.joinedAt)}`} · {m.years === 1 ? '1 ano' : `${m.years} anos`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Honors() {
  const t = useTenant();
  const members = useActiveMembers();
  const config: CrudConfig = {
    collection: 'honors',
    title: 'Homenagens',
    singular: 'homenagem',
    icon: <Award className="w-5 h-5" />,
    query: { orderBy: [['date', 'desc']] },
    searchKeys: ['title', 'memberName'],
    defaults: () => ({ title: '', memberId: '', memberName: '', date: todayIn(t.tenant.timezone), description: '' }),
    fields: [
      { key: 'title', label: 'Homenagem', type: 'text', required: true, max: 150, placeholder: 'Ex.: Sócio benemérito, 50 anos de coral' },
      { key: 'memberId', label: 'Sócio homenageado', type: 'select', optional: true, options: members.data.map(m => ({ value: m.id, label: m.fullName })) },
      { key: 'memberName', label: 'Nome do homenageado', type: 'text', max: 150, hint: 'Preenchido ao escolher o sócio; edite para pessoas de fora.' },
      { key: 'date', label: 'Data', type: 'date', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea', max: 2000 },
    ],
    toData: form => {
      const m = members.data.find(x => x.id === form.memberId);
      return { ...form, memberName: String(form.memberName || m?.fullName || '').trim() };
    },
    columns: [
      { key: 't', label: 'Homenagem', render: h => <div><div className="font-medium">{String(h.title)}</div><div className="text-xs text-muted">{String(h.memberName || '')}</div></div> },
      { key: 'd', label: 'Data', render: h => formatDate(String(h.date)) },
    ],
    emptyText: 'Registre homenagens, títulos e reconhecimentos.',
  };
  return <CrudPage config={config} embedded />;
}

function Surveys() {
  const [creating, setCreating] = useState(false);
  const config: CrudConfig = {
    onCreate: () => setCreating(true),
    collection: 'surveys',
    title: 'Enquetes',
    singular: 'enquete',
    icon: <MessageCircleQuestion className="w-5 h-5" />,
    query: { orderBy: [['createdAt', 'desc']] },
    searchKeys: ['title', 'question'],
    defaults: () => ({ title: '', question: '', optionsText: 'Sim\nNão', open: true }),
    fields: [
      { key: 'title', label: 'Título', type: 'text', required: true, max: 150 },
      { key: 'question', label: 'Pergunta', type: 'text', required: true, max: 500, wide: true },
      { key: 'open', label: 'Aberta para respostas', type: 'toggle' },
    ],
    toData: (form, row) => {
      const options = String(form.optionsText || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      // Opções não mudam depois de criada (os votos contam por posição)
      return { title: form.title, question: form.question, open: !!form.open, ...(row ? {} : { options }) };
    },
    formExtra: (form, set, row) =>
      row ? (
        <SurveyBars s={row as unknown as SurveyDoc} />
      ) : (
        <Field label="Opções (uma por linha, de 2 a 10)" hint="Os sócios respondem na área deles, uma vez cada. As opções não mudam depois de criada.">
          {id => <Textarea id={id} value={String(form.optionsText || '')} maxLength={1600} onChange={e => set({ optionsText: e.target.value })} />}
        </Field>
      ),
    columns: [
      { key: 't', label: 'Enquete', render: s => <div><div className="font-medium">{String(s.title)}</div><div className="text-xs text-muted truncate max-w-xs">{String(s.question)}</div></div> },
      { key: 'n', label: 'Respostas', render: s => ((s.counts as number[] | undefined) || []).reduce((a, b) => a + b, 0) },
      { key: 'o', label: 'Situação', render: s => (s.open ? <Badge tone="ok">Aberta</Badge> : <Badge>Encerrada</Badge>) },
    ],
    emptyText: 'Pergunte aos sócios sobre cardápio, horários, temas de eventos.',
  };
  return (
    <>
      <CrudPage config={config} embedded />
      {creating && <NewPoll onClose={() => setCreating(false)} />}
    </>
  );
}

