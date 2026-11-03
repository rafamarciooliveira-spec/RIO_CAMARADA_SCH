/** Painel da gestão: números de sócios e financeiro, aniversariantes, tarefas atrasadas, eventos e alertas. */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Cake, CalendarDays, ClipboardList } from 'lucide-react';
import { useDoc, useList } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { addDaysKey, formatDate, formatDateTime, localDateKey } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import type { DashboardStats, EventDoc, LibraryDocDoc, MemberDoc, PrivacyRequestDoc, TaskDoc } from '../../shared/types.ts';
import { Badge, Card, EmptyState, Loading, Notice, PageHeader, Section, Stat } from '../../ui/index.tsx';

export default function BoardDashboard() {
  const t = useTenant();
  const navigate = useNavigate();
  const tz = t.tenant.timezone;
  const today = localDateKey(new Date(), tz);
  const month = today.slice(5, 7);
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const stats = useDoc<DashboardStats>(P.stats(t.tenantId));
  const s = stats.data;
  const canFin = t.can('financeiro', 'ver');
  const canTasks = t.can('tarefas', 'ver');
  const canDocs = t.can('documentos', 'ver');
  const canPriv = t.can('pii', 'ver') && t.can('socios', 'aprovar');

  const birthdays = useList<MemberDoc>(P.members(t.tenantId), { where: [['birthMonthDay', '>=', `${month}-01`], ['birthMonthDay', '<=', `${month}-31`]], orderBy: [['birthMonthDay', 'asc']], limit: 60 });
  const tasks = useList<TaskDoc>(canTasks ? P.tasks(t.tenantId) : null, { where: [['when', '<', today]], orderBy: [['when', 'asc']], limit: 50 });
  const events = useList<EventDoc>(t.moduleOn('eventos') && t.can('eventos', 'ver') ? P.events(t.tenantId) : null, { where: [['start', '>=', nowIso]], orderBy: [['start', 'asc']], limit: 5 });
  const docs = useList<LibraryDocDoc>(canDocs ? P.library(t.tenantId) : null, { where: [['expiresAt', '<=', addDaysKey(today, 30)]], orderBy: [['expiresAt', 'asc']], limit: 20 });
  const priv = useList<PrivacyRequestDoc>(canPriv ? P.privacyRequests(t.tenantId) : null, { where: [['status', '==', 'aberta']], limit: 20 });

  const lateTasks = tasks.data.filter(x => x.status !== 'concluida');
  const bday = birthdays.data.filter(m => ['ativo', 'aprovado', 'em_atraso'].includes(m.status));
  const n = (k: keyof DashboardStats['members']) => (s?.members?.[k] as number) || 0;
  const go = (path: string) => () => navigate(t.to(path));
  const pend = n('pendente');

  if (stats.loading) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="Painel da gestão" subtitle={s ? `Atualizado em ${formatDateTime(s.updatedAt, tz)}` : undefined} />

      {(pend > 0 || docs.data.length > 0 || priv.data.length > 0) && (
        <Section title="Alertas">
          <div className="space-y-2">
            {pend > 0 && (
              <Link to={t.to('socios')} className="block">
                <Notice tone="warn">
                  {pend} {pend === 1 ? 'cadastro aguarda' : 'cadastros aguardam'} aprovação.
                </Notice>
              </Link>
            )}
            {priv.data.length > 0 && (
              <Link to={t.to('privacidade')} className="block">
                <Notice tone="warn">{priv.data.length} pedido(s) de privacidade aberto(s). A LGPD pede resposta em até 15 dias.</Notice>
              </Link>
            )}
            {docs.data.map(d => (
              <Link key={d.id} to={t.to('gestao-documentos')} className="block">
                <Notice tone={d.expiresAt! < today ? 'bad' : 'warn'}>
                  {d.name}: {d.expiresAt! < today ? 'venceu em' : 'vence em'} {formatDate(d.expiresAt)}.
                </Notice>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title={t.labels.members}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Ativos" value={n('ativo') + n('aprovado')} tone="ok" onClick={go('socios')} />
          <Stat label="Novos no mês" value={s?.newThisMonth || 0} tone="info" onClick={go('socios')} />
          <Stat label="Pendentes" value={pend} tone={pend ? 'warn' : undefined} onClick={go('socios')} />
          <Stat label="Em atraso" value={n('em_atraso')} tone={n('em_atraso') ? 'warn' : undefined} onClick={go('socios')} />
          <Stat label="Suspensos" value={n('suspenso')} tone={n('suspenso') ? 'bad' : undefined} onClick={go('socios')} />
        </div>
      </Section>

      {canFin && t.moduleOn('financeiro') && s && (
        <Section title="Financeiro">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Saldo" value={formatBRL(s.finance.balanceCents)} onClick={go('financeiro')} />
            <Stat label="Entradas no mês" value={formatBRL(s.finance.monthInCents)} tone="ok" onClick={go('financeiro')} />
            <Stat label="Saídas no mês" value={formatBRL(s.finance.monthOutCents)} tone="bad" onClick={go('financeiro')} />
            <Stat label="Em aberto vencido" value={formatBRL(s.finance.overdueCents)} hint={`${s.finance.overdueCount} cobranças`} tone={s.finance.overdueCount ? 'warn' : undefined} onClick={go('financeiro')} />
          </div>
        </Section>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <Section title="Aniversariantes do mês">
          <Card className="space-y-2">
            {birthdays.loading ? (
              <Loading />
            ) : bday.length === 0 ? (
              <p className="text-sm text-muted flex items-center gap-2">
                <Cake className="w-4 h-4" aria-hidden /> Ninguém faz aniversário este mês.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {bday.map(m => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{m.displayName}</span>
                    <Badge tone={m.birthMonthDay === today.slice(5) ? 'brand' : 'neutral'}>{m.birthMonthDay!.split('-').reverse().join('/')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>

        {canTasks && t.moduleOn('tarefas') && (
          <Section title="Tarefas atrasadas">
            <Card className="space-y-2">
              {lateTasks.length === 0 ? (
                <p className="text-sm text-muted flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" aria-hidden /> Nenhuma tarefa atrasada.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {lateTasks.slice(0, 8).map(x => (
                    <li key={x.id}>
                      <Link to={t.to('plano-de-acao')} className="flex items-center justify-between gap-2 text-sm hover:underline">
                        <span className="truncate">{x.title}</span>
                        <span className="text-xs text-bad shrink-0 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" aria-hidden />
                          {formatDate(x.when)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        )}

        {t.moduleOn('eventos') && t.can('eventos', 'ver') && (
          <Section title="Próximos eventos">
            <Card className="space-y-2">
              {events.data.length === 0 ? (
                <EmptyState icon={<CalendarDays className="w-5 h-5" />} title="Nenhum evento marcado" />
              ) : (
                <ul className="space-y-1.5">
                  {events.data.map(e => (
                    <li key={e.id}>
                      <Link to={t.to('gestao-eventos')} className="block text-sm hover:underline">
                        <span className="font-medium">{e.name}</span>
                        <span className="block text-xs text-muted">{formatDateTime(e.start, tz)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        )}
      </div>
    </div>
  );
}
