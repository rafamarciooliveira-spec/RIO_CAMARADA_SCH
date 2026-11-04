/** Início do sócio: situação, próxima cobrança, avisos novos, próximos eventos, carteirinha e pendências. */
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, CalendarDays, ChevronRight, Megaphone, Wallet } from 'lucide-react';
import { useData, useList, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { setupTenantPwa } from '../../app/pwa.ts';
import { PAGES } from '../registry.tsx';
import { P } from '../../shared/paths.ts';
import { cardStatusFor, VERIFY_LABEL } from '../../shared/memberStatus.ts';
import { formatDate, formatDateTime, localDateKey } from '../../shared/dates.ts';
import { formatBRL } from '../../shared/money.ts';
import { MEMBER_STATUS_LABEL, type ChargeDoc, type EventDoc, type NotificationDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, Notice, PageHeader, Section } from '../../ui/index.tsx';

function BoardShortcuts() {
  const t = useTenant();
  const pages = PAGES.filter(p => p.area === 'diretoria' && (!p.module || t.moduleOn(p.module)) && (!p.perm || t.can(p.perm[0], p.perm[1])));
  if (!pages.length) return null;
  return (
    <Section title={t.labels.board}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {pages.map(p => (
          <Link key={p.path} to={t.to(p.path)} className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-line hover:border-muted">
            <p.icon className="w-5 h-5 text-accent shrink-0" aria-hidden />
            <span className="text-sm font-medium">{p.path === 'socios' ? t.labels.members : p.label}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

export default function MemberHome() {
  const t = useTenant();
  const session = useSession();
  const { basePath } = useData();
  const m = t.member;
  const tz = t.tenant.timezone;
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const uid = session.user?.uid || '-';

  useEffect(() => {
    const icon = /^https?:/.test(t.tenant.branding.logoUrl || '') ? t.tenant.branding.logoUrl : null;
    setupTenantPwa(t.tenant, icon, basePath);
  }, [t.tenant, basePath]);

  const finOn = t.moduleOn('financeiro') && !!m;
  const charges = useList<ChargeDoc>(finOn ? P.charges(t.tenantId) : null, { where: [['memberUid', '==', uid], ['status', 'in', ['aberta', 'vencida']]], orderBy: [['dueDate', 'asc']], limit: 3 });
  const notifs = useList<NotificationDoc>(P.notifications(t.tenantId), { where: [['uid', '==', uid], ['read', '==', false]], orderBy: [['createdAt', 'desc']], limit: 10 });
  const events = useList<EventDoc>(t.moduleOn('eventos') ? P.events(t.tenantId) : null, { where: [['start', '>=', nowIso]], orderBy: [['start', 'asc']], limit: 6 });
  const nextEvents = events.data.filter(e => e.status === 'confirmado').slice(0, 3);
  const unreadNotices = notifs.data.filter(n => n.link === 'avisos');

  const first = (session.user?.displayName || m?.displayName || '').split(' ')[0];
  const card = m ? cardStatusFor(m, localDateKey(new Date(), tz)) : null;
  const next = charges.data[0];

  return (
    <div className="space-y-6">
      <PageHeader title={first ? `Olá, ${first}` : 'Início'} subtitle={t.tenant.name} />

      {!m && (
        <>
          {!t.board && (
            <Notice>
              Você acessa o portal sem cadastro de {t.labels.member.toLowerCase()}.{' '}
              <Link to={t.to('cadastro')} className="underline">
                Quero ser {t.labels.member.toLowerCase()}
              </Link>
            </Notice>
          )}
          <BoardShortcuts />
        </>
      )}

      {m && (
        <>
          {m.status === 'rejeitado' && (
            <Notice tone="warn">
              <strong>A {t.labels.board.toLowerCase()} pediu um ajuste no seu cadastro.</strong> {m.statusReason}{' '}
              <Link to={t.to('perfil')} className="underline font-semibold">
                Corrigir agora
              </Link>
            </Notice>
          )}
          {m.status === 'pendente' && <Notice>Seu cadastro está em análise. Você recebe um aviso quando for aprovado.</Notice>}
          {m.status === 'suspenso' && <Notice tone="bad">Sua {t.labels.card.toLowerCase()} está suspensa. Fale com a {t.labels.board.toLowerCase()}.</Notice>}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Link to={t.to('carteirinha')} className="block">
              <Card className="h-full hover:border-muted transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">{t.labels.card}</span>
                  <BadgeCheck className="w-5 h-5 text-accent" aria-hidden />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge tone={card === 'valido' ? 'ok' : card === 'expirado' ? 'warn' : 'bad'}>{card ? VERIFY_LABEL[card] : ''}</Badge>
                  <span className="text-sm">{MEMBER_STATUS_LABEL[m.status]}</span>
                </div>
                <div className="text-xs text-muted mt-2">
                  {m.membershipNumber && t.settings?.showMembershipNumber === true && `Matrícula ${m.membershipNumber}. `}
                  {m.validUntil && `Validade ${formatDate(m.validUntil)}.`}
                </div>
                <div className="text-sm text-accent mt-3 flex items-center gap-1">
                  Abrir {t.labels.card.toLowerCase()} <ChevronRight className="w-4 h-4" aria-hidden />
                </div>
              </Card>
            </Link>

            {finOn && (
              <Link to={t.to('meu-financeiro')} className="block">
                <Card className="h-full hover:border-muted transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Próximo pagamento</span>
                    <Wallet className="w-5 h-5 text-accent" aria-hidden />
                  </div>
                  {next ? (
                    <>
                      <div className="text-2xl font-bold mt-2 tabular-nums">{formatBRL(next.amountCents - (next.discountCents || 0))}</div>
                      <div className="text-xs text-muted mt-1">
                        {next.description}, vence em {formatDate(next.dueDate)}
                      </div>
                      {next.status === 'vencida' && (
                        <div className="mt-2">
                          <Badge tone="bad">Vencida</Badge>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm mt-2">{charges.loading ? 'Carregando...' : 'Nada em aberto. Tudo em dia.'}</div>
                  )}
                </Card>
              </Link>
            )}

            {t.moduleOn('avisos') && (
              <Link to={t.to('avisos')} className="block">
                <Card className="h-full hover:border-muted transition">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Avisos novos</span>
                    <Megaphone className="w-5 h-5 text-accent" aria-hidden />
                  </div>
                  <div className="text-2xl font-bold mt-2 tabular-nums">{unreadNotices.length}</div>
                  <div className="text-xs text-muted mt-1 line-clamp-2">{unreadNotices[0]?.title || 'Nenhum aviso novo.'}</div>
                </Card>
              </Link>
            )}
          </div>
        </>
      )}

      {t.moduleOn('eventos') && (
        <Section
          title="Próximos eventos"
          actions={
            <Link to={t.to('agenda')} className="text-xs text-accent">
              Ver agenda
            </Link>
          }
        >
          {nextEvents.length === 0 ? (
            <EmptyState icon={<CalendarDays className="w-5 h-5" />} title="Nenhum evento marcado" />
          ) : (
            <ul className="space-y-2">
              {nextEvents.map(e => (
                <li key={e.id}>
                  <Link to={t.to('eventos')} className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-line hover:border-muted">
                    <div className="w-12 text-center shrink-0">
                      <div className="text-xl font-bold leading-none">{formatDate(e.start, tz).slice(0, 2)}</div>
                      <div className="text-[10px] uppercase text-muted">{new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: tz }).format(new Date(e.start)).replace('.', '')}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{e.name}</div>
                      <div className="text-xs text-muted truncate">
                        {formatDateTime(e.start, tz)} {e.location && `· ${e.location}`}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {m && t.board && <BoardShortcuts />}

      {m && m.isMinor === false && m.status === 'pendente' && (
        <p className="text-xs text-muted flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" aria-hidden /> Dúvidas sobre o cadastro? Fale com a {t.labels.board.toLowerCase()}.
        </p>
      )}
      {!m && !t.board && (
        <Link to={t.to('cadastro')}>
          <Button>Fazer minha proposta</Button>
        </Link>
      )}
    </div>
  );
}
