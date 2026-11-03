/** Financeiro do sócio: situação, cobranças abertas com Pix copia e cola, segunda via e recibos. */
import { useState } from 'react';
import { Copy, FileDown, QrCode, Receipt } from 'lucide-react';
import { useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { copyText, todayIn } from '../../app/formHelpers.ts';
import { chargeSlipPdf, receiptPdf, METHOD_LABEL } from '../../app/pdf.ts';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import { isOverdue } from '../../shared/finance/reports.ts';
import { MEMBER_STATUS_LABEL, type ChargeDoc } from '../../shared/types.ts';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Money, Notice, PageHeader, Section, Textarea, useToast } from '../../ui/index.tsx';
import { ChargeBadge, dueNow, SandboxNotice } from './common.tsx';

type Row = ChargeDoc & { id: string };

export default function MyFinancePage() {
  const t = useTenant();
  const today = todayIn(t.tenant.timezone);
  const session = useSession();
  const uid = session.user?.uid || '';
  // A consulta casa com a regra do Firestore: o sócio só lê cobranças com o próprio uid
  const list = useList<ChargeDoc>(uid && t.member ? P.charges(t.tenantId) : null, { where: [['memberUid', '==', uid]], orderBy: [['dueDate', 'desc']], limit: 120 });
  if (!t.member) return <EmptyState title="Cadastro não vinculado" text="Seu acesso ainda não está ligado a um cadastro de sócio." />;
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorState text={list.error} />;

  const open = list.data.filter(c => c.status === 'aberta' || c.status === 'vencida').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const paid = list.data.filter(c => c.status === 'paga');
  const overdue = open.filter(c => isOverdue(c, today));
  const status = t.member.status;
  const tone = status === 'ativo' || status === 'aprovado' ? 'ok' : status === 'em_atraso' ? 'warn' : 'bad';

  return (
    <div className="space-y-6">
      <PageHeader title="Meu financeiro" subtitle={`Suas ${t.labels.fee.toLowerCase()}s e pagamentos na ${t.tenant.name}.`} />
      <Card className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Sua situação</div>
          <div className="text-lg font-bold">{MEMBER_STATUS_LABEL[status]}</div>
          <div className="text-xs text-muted">{overdue.length ? `${overdue.length} cobrança(s) vencida(s)` : open.length ? 'Tudo em dia' : 'Nenhuma cobrança em aberto'}</div>
        </div>
        <Badge tone={tone}>{overdue.length ? 'Pendente' : 'Em dia'}</Badge>
      </Card>
      {status === 'suspenso' && <Notice tone="bad">Sua {t.labels.card.toLowerCase()} está suspensa. Regularize as cobranças abaixo ou fale com a diretoria.</Notice>}
      {open.some(c => c.provider?.name === 'sandbox') && <SandboxNotice />}

      <Section title="Em aberto">
        {open.length === 0 ? <EmptyState title="Nada para pagar" text="Quando houver cobrança, ela aparece aqui com o Pix copia e cola." /> : open.map(c => <OpenCharge key={c.id} c={c} />)}
      </Section>

      <Section title="Histórico de pagamentos">
        {paid.length === 0 ? (
          <EmptyState title="Nenhum pagamento ainda" />
        ) : (
          <ul className="divide-y divide-line border border-line rounded-2xl bg-surface">
            {paid.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.description}</div>
                  <div className="text-xs text-muted">
                    Pago em {formatDate(c.paidAt, t.tenant.timezone)} · {METHOD_LABEL[c.method || ''] || ''} · recibo nº {c.receiptNumber}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Money cents={c.paidAmountCents || 0} className="text-sm font-semibold" />
                  <Button size="sm" variant="ghost" aria-label={`Baixar recibo de ${c.description}`} icon={<Receipt className="w-4 h-4" />} onClick={() => receiptPdf(t.tenant, c)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function OpenCharge({ c }: { c: Row }) {
  const t = useTenant();
  const toast = useToast();
  const { run, busy } = useOp();
  const today = todayIn(t.tenant.timezone);
  const [pix, setPix] = useState(c.provider?.pixCopyPaste || '');
  const due = dueNow(c, t.settings, today);

  const getPix = async () => {
    if (pix) return pix;
    const r = await run<{ pixCopyPaste?: string }>('charges.createPayment', { tenantId: t.tenantId, chargeId: c.id, method: 'pix' });
    if (r?.pixCopyPaste) setPix(r.pixCopyPaste);
    return r?.pixCopyPaste || '';
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{c.description}</div>
          <div className="text-xs text-muted">Vence em {formatDate(c.dueDate)}</div>
        </div>
        <ChargeBadge c={c} today={today} />
      </div>
      <div className="text-2xl font-bold">
        <Money cents={due.total} />
      </div>
      {due.daysLate > 0 && (
        <p className="text-xs text-muted">
          Inclui multa de <Money cents={due.lateFeeCents} /> e juros de <Money cents={due.interestCents} /> por {due.daysLate} dia(s) de atraso.
        </p>
      )}
      {pix ? (
        <div className="space-y-2">
          <Textarea aria-label="Pix copia e cola" readOnly value={pix} className="font-mono text-xs min-h-20" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={<Copy className="w-4 h-4" />} onClick={async () => toast.show((await copyText(pix)) ? 'Código Pix copiado. Cole no app do seu banco.' : 'Não foi possível copiar. Selecione o texto.', 'sucesso')}>
              Copiar código Pix
            </Button>
            <Button size="sm" variant="secondary" icon={<FileDown className="w-4 h-4" />} onClick={() => chargeSlipPdf(t.tenant, { ...c, provider: c.provider || { name: '', externalId: '', pixCopyPaste: pix } }, due.total)}>
              Segunda via
            </Button>
          </div>
          <p className="text-[11px] text-muted">A baixa é automática quando o banco confirma o pagamento. Pode levar alguns minutos.</p>
        </div>
      ) : (
        <Button loading={busy} icon={<QrCode className="w-4 h-4" />} onClick={getPix}>
          Pagar com Pix
        </Button>
      )}
    </Card>
  );
}
