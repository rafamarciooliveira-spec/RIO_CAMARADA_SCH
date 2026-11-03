/** Grupos e oficinas: turmas, horários, professores, inscrições e lista de chamada. */
import { useState } from 'react';
import { Award, Music, UserMinus } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { todayIn } from '../../app/formHelpers.ts';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { MemberDoc, OrgChartDoc, WorkshopDoc } from '../../shared/types.ts';
import { Badge, Button, Field, Input, Section, Select } from '../../ui/index.tsx';
import { CrudPage, opts, type CrudConfig, type Doc } from './CrudPage.tsx';

export const WORKSHOP_KIND = { coral: 'Coral', danca: 'Dança', banda: 'Banda e música', teatro: 'Teatro', ginastica: 'Ginástica', tiro: 'Tiro', outro: 'Outro' };

export default function WorkshopsPage() {
  const config: CrudConfig = {
    collection: 'workshops',
    title: 'Grupos e oficinas',
    subtitle: 'Coral, dança, banda, teatro e demais turmas, com inscrições e chamada.',
    singular: 'turma',
    icon: <Music className="w-5 h-5" />,
    query: { orderBy: [['name', 'asc']] },
    defaults: () => ({ name: '', kind: 'coral', teacher: '', schedule: '', capacity: 0, active: true }),
    createExtra: () => ({ enrolled: [], sessions: [] }),
    fields: [
      { key: 'name', label: 'Nome da turma', type: 'text', required: true, max: 120 },
      { key: 'kind', label: 'Tipo', type: 'select', options: opts(WORKSHOP_KIND) },
      { key: 'teacher', label: 'Professor(a) ou regente', type: 'text', max: 120 },
      { key: 'schedule', label: 'Dias e horários', type: 'text', max: 200, placeholder: 'Ex.: terças e quintas, 19h' },
      { key: 'capacity', label: 'Vagas', type: 'number', hint: '0 = sem limite', max: 10000 },
      { key: 'active', label: 'Turma ativa', type: 'toggle' },
    ],
    columns: [
      { key: 'n', label: 'Turma', render: w => <div><div className="font-medium">{String(w.name)}</div><div className="text-xs text-muted">{WORKSHOP_KIND[w.kind as keyof typeof WORKSHOP_KIND]} · {String(w.schedule || '')}</div></div> },
      { key: 't', label: 'Professor(a)', render: w => String(w.teacher || ''), hideOnMobile: true },
      { key: 'v', label: 'Inscritos', render: w => `${(w.enrolled as unknown[] | undefined)?.length || 0}${Number(w.capacity) ? ` de ${w.capacity}` : ''}` },
      { key: 'a', label: 'Situação', render: w => (w.active ? <Badge tone="ok">Ativa</Badge> : <Badge>Inativa</Badge>) },
    ],
    detail: row => <WorkshopDetail w={row as unknown as WorkshopDoc & Doc} />,
    emptyText: 'Cadastre as turmas e grupos da sociedade.',
  };
  return <CrudPage config={config} />;
}

async function workshopCertificates(t: ReturnType<typeof useTenant>, w: WorkshopDoc, chart: OrgChartDoc | null) {
  const { certificatePdf, presidentSigner } = await import('../../app/pdf.ts');
  const total = w.sessions?.length || 0;
  const today = formatDate(new Date().toISOString(), t.tenant.timezone);
  const items = w.enrolled.map(e => {
    const n = (w.sessions || []).filter(s => s.present.includes(e.memberId)).length;
    return {
      title: 'Certificado de participação',
      name: e.name,
      text: `participou de ${w.name}${w.teacher ? `, com ${w.teacher},` : ''}${total ? ` estando presente em ${n} de ${total} encontros` : ''}.`,
      date: today,
      signers: [presidentSigner(chart), ...(w.teacher ? [{ name: w.teacher, role: 'Responsável pela turma' }] : [])],
    };
  });
  await certificatePdf(t.tenant, items, `certificados-${w.name.replace(/\W+/g, '-').toLowerCase()}.pdf`);
}

function WorkshopDetail({ w }: { w: WorkshopDoc & Doc }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const canEdit = t.can('oficinas', 'editar');
  const members = useList<MemberDoc>(canEdit && t.can('socios', 'ver') ? P.members(t.tenantId) : null, { where: [['status', 'in', ['ativo', 'aprovado', 'em_atraso']]], orderBy: [['fullName', 'asc']], limit: 2000 });
  const [pick, setPick] = useState('');
  const [date, setDate] = useState(todayIn(t.tenant.timezone));
  const session = w.sessions?.find(s => s.date === date);
  const [present, setPresent] = useState<Set<string>>(new Set(session?.present || []));
  const [loadedDate, setLoadedDate] = useState(date);
  if (loadedDate !== date) {
    setLoadedDate(date);
    setPresent(new Set(w.sessions?.find(s => s.date === date)?.present || []));
  }
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const enrolledIds = new Set((w.enrolled || []).map(e => e.memberId));
  const free = w.capacity > 0 ? Math.max(0, w.capacity - (w.enrolled?.length || 0)) : null;

  return (
    <div className="space-y-5 border-t border-line pt-4">
      <Section title={`Inscritos (${w.enrolled?.length || 0}${free !== null ? `, ${free} vaga(s)` : ''})`}>
        {canEdit && members.data.length > 0 && (
          <div className="flex gap-2">
            <Select aria-label="Escolher sócio para inscrever" value={pick} onChange={e => setPick(e.target.value)}>
              <option value="">Inscrever {t.labels.member.toLowerCase()}...</option>
              {members.data
                .filter(m => !enrolledIds.has(m.id))
                .map(m => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
            </Select>
            <Button disabled={!pick} loading={busy} onClick={async () => (await run('workshops.enroll', { tenantId: t.tenantId, workshopId: w.id, memberId: pick }, { success: 'Inscrição feita.' })) && setPick('')}>
              Inscrever
            </Button>
          </div>
        )}
        {free === 0 && <p className="text-xs text-warn">Turma cheia. A coordenação ainda pode incluir acima da capacidade.</p>}
        <ul className="divide-y divide-line border border-line rounded-xl">
          {(w.enrolled || []).map(e => (
            <li key={e.memberId} className="flex items-center justify-between px-3 py-2 text-sm">
              {e.name}
              {canEdit && <Button size="sm" variant="ghost" aria-label={`Remover ${e.name}`} icon={<UserMinus className="w-4 h-4" />} onClick={() => run('workshops.unenroll', { tenantId: t.tenantId, workshopId: w.id, memberId: e.memberId })} />}
            </li>
          ))}
          {!w.enrolled?.length && <li className="px-3 py-2 text-sm text-muted">Ninguém inscrito.</li>}
        </ul>
      </Section>
      {canEdit && (w.enrolled?.length || 0) > 0 && (
        <Section title="Certificados">
          <p className="text-sm text-muted">Um certificado por inscrito com a quantidade de encontros em que esteve presente, nas cores e com o logo da sociedade.</p>
          <Button variant="secondary" icon={<Award className="w-4 h-4" />} onClick={() => workshopCertificates(t, w, chart.data)}>
            Gerar certificados da turma
          </Button>
        </Section>
      )}
      {canEdit && (w.enrolled?.length || 0) > 0 && (
        <Section title="Lista de chamada">
          <Field label="Data do encontro">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
          <ul className="space-y-1">
            {w.enrolled.map(e => (
              <li key={e.memberId}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={present.has(e.memberId)}
                    onChange={ev =>
                      setPresent(s => {
                        const n = new Set(s);
                        if (ev.target.checked) n.add(e.memberId);
                        else n.delete(e.memberId);
                        return n;
                      })
                    }
                  />
                  {e.name}
                </label>
              </li>
            ))}
          </ul>
          <Button size="sm" loading={busy} onClick={() => run('workshops.attendance', { tenantId: t.tenantId, workshopId: w.id, date, present: [...present] }, { success: 'Chamada salva.' })}>
            Salvar chamada ({present.size} presente(s))
          </Button>
          {w.sessions?.length > 0 && (
            <p className="text-xs text-muted">
              {w.sessions.length} encontro(s) registrado(s). Último: {formatDate(w.sessions[w.sessions.length - 1].date)}.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}
