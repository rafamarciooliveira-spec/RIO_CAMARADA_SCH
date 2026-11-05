/**
 * Prestação de contas na tela (prévia da tesouraria e versão publicada para os sócios):
 * resumo, histórico com entradas e saídas, totais que fecham dos dois lados,
 * composição do saldo por conta, de onde veio e para onde foi, observações e assinaturas.
 */
import { useState } from 'react';
import { CheckCircle2, Download, PenLine, Share2, Undo2 } from 'lucide-react';
import { useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import { FIN_ACCOUNT_TYPE_LABEL, type AccountabilityDoc } from '../../shared/types.ts';
import { Badge, Button, Card, Field, Modal, Money, Notice, Stat, Textarea } from '../../ui/index.tsx';

export function AccountabilityView({ a }: { a: AccountabilityDoc }) {
  const t = useTenant();
  const r = a.report;
  const legal = t.tenant.legal || {};
  const withDate = a.grouping === 'lancamento';
  const sumAcc = r.accounts.reduce((s, x) => s + x.finalCents, 0);
  return (
    <div className="space-y-5">
      <Card className="text-center space-y-1">
        <div className="font-bold">{legal.legalName || t.tenant.name}</div>
        {(legal.address || legal.cityState || legal.cnpj) && (
          <div className="text-xs text-muted">
            {[legal.address, [legal.cep, legal.cityState].filter(Boolean).join(' '), legal.cnpj && `CNPJ ${legal.cnpj}`].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="text-lg font-extrabold uppercase tracking-wide pt-2">Prestação de contas {a.periodLabel}</div>
        {a.title !== `Prestação de contas ${a.periodLabel}` && <div className="text-sm text-muted">{a.title}</div>}
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          {a.status === 'retirado' && <Badge tone="bad">Retirada</Badge>}
          {a.kind === 'periodo' && (a.periodClosed ? <Badge tone="ok">Mês fechado</Badge> : <Badge tone="warn">Mês ainda aberto</Badge>)}
          {a.kind === 'evento' && <Badge tone="info">Evento ou projeto</Badge>}
          {a.audience === 'diretoria' && <Badge>Só diretoria</Badge>}
        </div>
      </Card>

      {a.status === 'retirado' && <Notice tone="bad">Retirada em {formatDateTime(a.withdrawnAt, t.tenant.timezone)}. Motivo: {a.withdrawnReason}</Notice>}
      {r.pending.count > 0 && (
        <Notice tone="warn">
          {r.pending.count} lançamento(s) aguardando a segunda aprovação (<Money cents={r.pending.cents} />) ficaram de fora destes números.
        </Notice>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {a.kind === 'periodo' && <Stat label="Saldo anterior" value={<Money cents={r.openingCents} className="text-lg sm:text-2xl" />} />}
        <Stat label="Entradas" value={<Money cents={r.totals.inCents} className="text-lg sm:text-2xl" />} tone="ok" />
        <Stat label="Saídas" value={<Money cents={r.totals.outCents} className="text-lg sm:text-2xl" />} tone="bad" />
        {a.kind === 'periodo' ? (
          <Stat label="Saldo atual" value={<Money cents={r.closingCents} className="text-lg sm:text-2xl" />} hint={`${r.resultCents >= 0 ? 'Sobrou' : 'Faltou'} ${fmt(Math.abs(r.resultCents))} no período`} />
        ) : (
          <Stat label={r.resultCents >= 0 ? 'Lucro do evento' : 'Prejuízo do evento'} value={<Money cents={r.resultCents} className="text-lg sm:text-2xl" />} tone={r.resultCents >= 0 ? 'ok' : 'bad'} />
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                {withDate && <th className="text-left font-semibold px-3 py-2 w-24">Data</th>}
                <th className="text-left font-semibold px-3 py-2">Histórico</th>
                <th className="text-right font-semibold px-2 sm:px-3 py-2 w-24 sm:w-32">Entrada</th>
                <th className="text-right font-semibold px-2 sm:px-3 py-2 w-24 sm:w-32">Saída</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i} className="border-t border-line">
                  {withDate && <td className="px-3 py-1.5 tabular-nums text-xs text-muted whitespace-nowrap">{l.date ? formatDate(l.date) : ''}</td>}
                  <td className="px-3 py-1.5">
                    {l.label}
                    {!withDate && l.count > 1 && <span className="text-[11px] text-muted"> ({l.count} lançamentos)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-ok">{l.inCents ? fmtN(l.inCents) : ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-bad">{l.outCents ? fmtN(l.outCents) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <SumRow cols={withDate} label="Totais" i={r.totals.inCents} o={r.totals.outCents} top />
              {a.kind === 'periodo' ? (
                <>
                  <SumRow cols={withDate} label="Saldo anterior" i={r.openingCents} />
                  <SumRow cols={withDate} label="Saldo atual" o={r.closingCents} />
                  <SumRow cols={withDate} label="Soma dos totais" i={r.totals.inCents + r.openingCents} o={r.totals.outCents + r.closingCents} top />
                </>
              ) : (
                <SumRow cols={withDate} label={r.resultCents >= 0 ? 'Resultado (lucro)' : 'Resultado (prejuízo)'} i={r.resultCents >= 0 ? r.resultCents : undefined} o={r.resultCents < 0 ? -r.resultCents : undefined} top />
              )}
            </tfoot>
          </table>
        </div>
      </Card>

      {r.transfers.length > 0 && (
        <Card className="space-y-1">
          <div className="text-sm font-semibold">Movimentação entre contas</div>
          <p className="text-xs text-muted">Dinheiro que só mudou de lugar (ex.: do caixa para o banco, aplicação). Não é entrada nem saída.</p>
          {r.transfers.map((x, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span>
                <span className="text-xs text-muted tabular-nums">{formatDate(x.date)}</span> {x.label}
              </span>
              <Money cents={x.cents} />
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-2">
        <div className="text-sm font-semibold">{a.kind === 'periodo' ? 'Composição do saldo' : 'Por onde o dinheiro passou'}</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {r.accounts.map(x => (
            <div key={x.accountId} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface-2">
              <div className="min-w-0">
                <div className="text-sm font-medium break-words">{x.name}</div>
                <div className="text-[11px] text-muted">{FIN_ACCOUNT_TYPE_LABEL[x.type] || ''}</div>
              </div>
              {a.kind === 'periodo' ? (
                <Money cents={x.finalCents} className="font-semibold" />
              ) : (
                <div className="text-right text-xs">
                  <div className="text-ok">+ {fmt(x.inCents)}</div>
                  <div className="text-bad">− {fmt(x.outCents)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
        {a.kind === 'periodo' && (
          <div className="flex justify-between text-sm font-bold pt-1 border-t border-line">
            <span>Total</span>
            <Money cents={sumAcc} />
          </div>
        )}
      </Card>

      {(r.receitas.length > 0 || r.despesas.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3">
          <Bars title="De onde veio" items={r.receitas} total={r.totals.inCents} tone="bg-ok" />
          <Bars title="Para onde foi" items={r.despesas} total={r.totals.outCents} tone="bg-bad" />
        </div>
      )}

      {a.notes && (
        <Card>
          <div className="text-sm font-semibold mb-1">Observações</div>
          <p className="text-sm whitespace-pre-line">{a.notes}</p>
        </Card>
      )}

      {a.signers.length > 0 && (
        <Card className="space-y-2">
          <div className="text-sm font-semibold">Assinaturas</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {a.signers.map((s, i) => {
              const sig = a.signatures.find(x => s.uid && x.uid === s.uid);
              return (
                <div key={i} className="p-3 rounded-xl border border-line text-center">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-muted">{s.role}</div>
                  <div className="text-[11px] mt-1">
                    {sig ? (
                      <span className="text-ok inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Assinado em {formatDate(sig.at, t.tenant.timezone)}
                      </span>
                    ) : s.uid ? (
                      <span className="text-warn">Aguardando assinatura</span>
                    ) : (
                      <span className="text-muted">Assina no papel</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {a.publishedByName && (
        <p className="text-[11px] text-muted text-center">
          Publicada por {a.publishedByName} em {formatDateTime(a.publishedAt, t.tenant.timezone)}. Os números foram calculados do livro caixa e não mudam depois de publicados.
        </p>
      )}
    </div>
  );
}

/** Baixar, compartilhar (WhatsApp, e-mail pelo celular), assinar e retirar */
export function AccountabilityActions({ a }: { a: AccountabilityDoc }) {
  const t = useTenant();
  const session = useSession();
  const { run, busy } = useOp();
  const [making, setMaking] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [reason, setReason] = useState('');
  const me = session.user?.uid;
  const canSign = a.status === 'publicado' && !!a.id && !!me && a.signers.some(s => s.uid === me) && !a.signatures.some(s => s.uid === me);
  const canWithdraw = a.status === 'publicado' && !!a.id && t.can('financeiro', 'editar');

  const file = async () => {
    const { accountabilityStatementPdf } = await import('../../app/pdf.ts');
    return accountabilityStatementPdf(t.tenant, a);
  };
  const download = async () => {
    setMaking(true);
    try {
      const f = await file();
      const url = URL.createObjectURL(f.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = f.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setMaking(false);
    }
  };
  const share = async () => {
    setMaking(true);
    try {
      const f = await file();
      const pdf = new File([f.blob], f.filename, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [pdf] })) await nav.share({ files: [pdf], title: a.title, text: `${a.title} da ${t.tenant.name}` }).catch(() => undefined);
      else await download();
    } finally {
      setMaking(false);
    }
  };
  const canShareFiles = typeof navigator !== 'undefined' && 'share' in navigator;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" icon={<Download className="w-4 h-4" />} loading={making} onClick={download}>
        Baixar PDF
      </Button>
      {canShareFiles && (
        <Button size="sm" variant="secondary" icon={<Share2 className="w-4 h-4" />} disabled={making} onClick={share}>
          Compartilhar (WhatsApp, e-mail)
        </Button>
      )}
      {canSign && (
        <Button size="sm" variant="secondary" icon={<PenLine className="w-4 h-4" />} loading={busy} onClick={() => run('accountability.sign', { tenantId: t.tenantId, id: a.id }, { success: 'Assinatura registrada.' })}>
          Conferi e assino
        </Button>
      )}
      {canWithdraw && (
        <Button size="sm" variant="ghost" icon={<Undo2 className="w-4 h-4" />} onClick={() => setWithdraw(true)}>
          Retirar
        </Button>
      )}
      <Modal
        open={withdraw}
        onClose={() => setWithdraw(false)}
        title="Retirar a prestação de contas"
        footer={
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 5}
            onClick={async () => {
              if (await run('accountability.withdraw', { tenantId: t.tenantId, id: a.id, reason: reason.trim() }, { success: 'Prestação de contas retirada.' })) setWithdraw(false);
            }}
          >
            Retirar
          </Button>
        }
      >
        <p className="text-sm text-muted mb-3">Os sócios deixam de ver e o aviso sai do quadro. A diretoria continua vendo, com o motivo. Para corrigir, acerte os lançamentos e publique de novo.</p>
        <Field label="Motivo" required>
          {id => <Textarea id={id} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  );
}

const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtN = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SumRow({ cols, label, i, o, top }: { cols: boolean; label: string; i?: number; o?: number; top?: boolean }) {
  return (
    <tr className={top ? 'border-t-2 border-line' : ''}>
      {cols && <td />}
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{i !== undefined ? fmtN(i) : ''}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{o !== undefined ? fmtN(o) : ''}</td>
    </tr>
  );
}

function Bars({ title, items, total, tone }: { title: string; items: { name: string; cents: number }[]; total: number; tone: string }) {
  return (
    <Card className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      {!items.length && <p className="text-xs text-muted">Nada no período.</p>}
      {items.map(x => {
        const p = total ? Math.max(0, Math.round((x.cents / total) * 100)) : 0;
        return (
          <div key={x.name}>
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate">{x.name}</span>
              <span className="tabular-nums whitespace-nowrap">
                {fmt(x.cents)} · {p}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mt-0.5">
              <div className={`h-full ${tone}`} style={{ width: `${p}%` }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}
