/** Avisos do sócio: fixados primeiro, marcação de não lidos e confirmação de leitura. */
import { useMemo, useState } from 'react';
import { CheckCircle2, Megaphone, Pin } from 'lucide-react';
import { useDoc, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDateTime } from '../../shared/dates.ts';
import { audienceMatches, noticeIsLive } from '../../shared/ops/comms.ts';
import type { NoticeDoc, NoticeReadDoc } from '../../shared/types.ts';
import { Badge, Button, cx, EmptyState, ErrorState, Loading, PageHeader, Tabs } from '../../ui/index.tsx';
import { AttachmentLink } from './noticeUtils.tsx';

export default function NoticesPage() {
  const t = useTenant();
  // A regra não filtra: quem não é da diretoria precisa pedir só os avisos publicados e abertos a sócios
  const list = useList<NoticeDoc>(
    P.notices(t.tenantId),
    t.board
      ? { orderBy: [['publishAt', 'desc']], limit: 60 }
      : { where: [['audience.boardOnly', '==', false], ['status', '==', 'publicado']], orderBy: [['publishAt', 'desc']], limit: 60 }
  );
  const [filter, setFilter] = useState<'todos' | 'fixados'>('todos');
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const visible = useMemo(
    () =>
      list.data
        .filter(n => noticeIsLive(n, nowIso) && audienceMatches(n.audience, t.member, t.board))
        .filter(n => filter === 'todos' || n.pinned)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishAt.localeCompare(a.publishAt)),
    [list.data, nowIso, t.member, t.board, filter]
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Avisos" subtitle={`Comunicados da ${t.labels.board.toLowerCase()}.`} />
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { id: 'todos', label: 'Todos' },
          { id: 'fixados', label: 'Fixados' },
        ]}
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Megaphone className="w-5 h-5" />} title="Nenhum aviso por enquanto" />
      ) : (
        <ul className="space-y-3">
          {visible.map(n => (
            <NoticeItem key={n.id} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoticeItem({ n }: { n: NoticeDoc & { id: string } }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const read = useDoc<NoticeReadDoc>(session.user ? P.noticeRead(t.tenantId, n.id, session.user.uid) : null);
  const [open, setOpen] = useState(n.pinned);
  const isRead = !!read.data;
  const confirmRead = () => run('notices.confirmRead', { tenantId: t.tenantId, id: n.id }, { silent: !n.requireReadConfirmation, success: n.requireReadConfirmation ? 'Leitura confirmada.' : undefined });
  const toggle = () => {
    setOpen(o => !o);
    // Avisos sem confirmação obrigatória contam como lidos ao abrir
    if (!open && !isRead && !n.requireReadConfirmation && !read.loading) confirmRead();
  };
  return (
    <li className={cx('rounded-2xl border bg-surface', !isRead ? 'border-accent/50' : 'border-line')}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full text-left p-4 flex items-start gap-3 cursor-pointer">
        {n.pinned ? <Pin className="w-4 h-4 text-accent shrink-0 mt-1" aria-label="Fixado" /> : <Megaphone className="w-4 h-4 text-muted shrink-0 mt-1" aria-hidden />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{n.title}</span>
            {!isRead && <Badge tone="brand">Novo</Badge>}
            {n.requireReadConfirmation && !isRead && <Badge tone="warn">Confirme a leitura</Badge>}
          </div>
          <div className="text-xs text-muted mt-0.5">{formatDateTime(n.publishAt, t.tenant.timezone)}</div>
          {!open && <p className="text-sm text-muted line-clamp-2 mt-1">{n.body}</p>}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm whitespace-pre-line">{n.body}</p>
          {(n.attachments || []).length > 0 && (
            <div className="flex flex-wrap gap-3">
              {n.attachments!.map(a => (
                <AttachmentLink key={a.path} a={a} />
              ))}
            </div>
          )}
          {n.expiresAt && <p className="text-[11px] text-muted">Válido até {formatDateTime(n.expiresAt, t.tenant.timezone)}</p>}
          {n.requireReadConfirmation &&
            (isRead ? (
              <p className="text-xs text-ok flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" aria-hidden /> Leitura confirmada em {formatDateTime(read.data!.at, t.tenant.timezone)}
              </p>
            ) : (
              <Button size="sm" loading={busy} onClick={confirmRead}>
                Confirmo que li
              </Button>
            ))}
        </div>
      )}
    </li>
  );
}
