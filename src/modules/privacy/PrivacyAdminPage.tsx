/** Pedidos dos titulares (LGPD art. 18): análise, resposta e eliminação com anonimização. */
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDoc, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { addDaysKey, formatDate, formatDateTime } from '../../shared/dates.ts';
import type { MemberDoc, PrivacyRequestDoc } from '../../shared/types.ts';
import { Badge, Button, EmptyState, ErrorState, Field, Loading, Modal, Notice, PageHeader, Tabs, Textarea, useConfirm } from '../../ui/index.tsx';

const KIND: Record<PrivacyRequestDoc['kind'], { label: string; hint: string }> = {
  acesso: { label: 'Acesso aos dados', hint: 'O titular já pode baixar a cópia dos dados no perfil. Confirme e oriente.' },
  correcao: { label: 'Correção', hint: 'Corrija o cadastro na tela de sócios e conclua o pedido explicando o que mudou.' },
  portabilidade: { label: 'Portabilidade', hint: 'A cópia em JSON e CSV fica no perfil do titular. Confirme e oriente.' },
  eliminacao: { label: 'Eliminação', hint: 'Concluir apaga CPF, contato, endereço e foto e desliga o cadastro. Registros financeiros e atas ficam pelo prazo legal, só com identificadores.' },
  revogacao: { label: 'Revogação de consentimento', hint: 'Concluir desliga os consentimentos de imagem, comunicação e marketing.' },
};
const STATUS: Record<PrivacyRequestDoc['status'], { label: string; tone: 'info' | 'warn' | 'ok' | 'bad' }> = {
  aberta: { label: 'Aberto', tone: 'info' },
  em_analise: { label: 'Em análise', tone: 'warn' },
  concluida: { label: 'Concluído', tone: 'ok' },
  negada: { label: 'Negado', tone: 'bad' },
};

export default function PrivacyAdminPage() {
  const t = useTenant();
  const [tab, setTab] = useState<'abertos' | 'encerrados'>('abertos');
  const list = useList<PrivacyRequestDoc>(P.privacyRequests(t.tenantId), { orderBy: [['createdAt', 'desc']], limit: 200 });
  const [open, setOpen] = useState<(PrivacyRequestDoc & { id: string }) | null>(null);
  const rows = useMemo(() => list.data.filter(r => (tab === 'abertos' ? r.status === 'aberta' || r.status === 'em_analise' : r.status === 'concluida' || r.status === 'negada')), [list.data, tab]);
  const pending = list.data.filter(r => r.status === 'aberta' || r.status === 'em_analise').length;
  return (
    <div className="space-y-5">
      <PageHeader title="Pedidos de privacidade" subtitle="Responda em até 15 dias. Cada resposta fica registrada na auditoria." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'abertos', label: 'Em andamento', count: pending },
          { id: 'encerrados', label: 'Encerrados' },
        ]}
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="w-5 h-5" />} title={tab === 'abertos' ? 'Nenhum pedido em andamento' : 'Nenhum pedido encerrado'} />
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <Row key={r.id} r={r} onOpen={() => setOpen(r)} />
          ))}
        </ul>
      )}
      {open && <Resolve r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Row({ r, onOpen }: { r: PrivacyRequestDoc & { id: string }; onOpen: () => void }) {
  const t = useTenant();
  const m = useDoc<MemberDoc>(P.member(t.tenantId, r.memberId));
  const due = addDaysKey(r.createdAt.slice(0, 10), 15);
  const late = (r.status === 'aberta' || r.status === 'em_analise') && due < new Date().toISOString().slice(0, 10);
  return (
    <li>
      <button type="button" onClick={onOpen} className="w-full text-left p-4 rounded-2xl bg-surface border border-line hover:border-muted cursor-pointer flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{KIND[r.kind].label}</span>
            <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
            {late && <Badge tone="bad">Prazo vencido</Badge>}
          </div>
          <div className="text-xs text-muted mt-0.5">
            {m.data?.fullName || 'Titular'} · aberto em {formatDateTime(r.createdAt, t.tenant.timezone)} · responder até {formatDate(due)}
          </div>
          {r.details && <p className="text-sm text-muted line-clamp-2 mt-1">{r.details}</p>}
        </div>
      </button>
    </li>
  );
}

function Resolve({ r, onClose }: { r: PrivacyRequestDoc & { id: string }; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const [response, setResponse] = useState(r.response || '');
  const closed = r.status === 'concluida' || r.status === 'negada';
  const can = t.can('pii', 'ver') && t.can('socios', 'aprovar');
  const act = async (status: 'em_analise' | 'concluida' | 'negada') => {
    if (status === 'concluida' && r.kind === 'eliminacao') {
      const ok = await confirm({ title: 'Concluir eliminação', text: 'Os dados pessoais do titular serão apagados e o cadastro desligado. Não dá para desfazer.', confirmLabel: 'Eliminar dados', danger: true, requireText: 'ELIMINAR' });
      if (!ok) return;
    }
    const res = await run('privacy.resolve', { tenantId: t.tenantId, id: r.id, status, response: response.trim() }, { success: 'Pedido atualizado e titular avisado.' });
    if (res) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={KIND[r.kind].label}
      footer={
        !closed && can ? (
          <>
            {r.status === 'aberta' && (
              <Button variant="secondary" loading={busy} onClick={() => act('em_analise')}>
                Marcar em análise
              </Button>
            )}
            <Button variant="secondary" loading={busy} disabled={response.trim().length < 10} onClick={() => act('negada')}>
              Negar
            </Button>
            <Button variant={r.kind === 'eliminacao' ? 'danger' : 'primary'} loading={busy} onClick={() => act('concluida')}>
              Concluir
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Fechar</Button>
        )
      }
    >
      <Notice tone={r.kind === 'eliminacao' ? 'warn' : 'info'}>{KIND[r.kind].hint}</Notice>
      <div className="text-sm">
        <div className="text-xs text-muted">Pedido do titular</div>
        <p className="whitespace-pre-line">{r.details || 'Sem detalhes.'}</p>
      </div>
      {closed ? (
        <div className="text-sm">
          <div className="text-xs text-muted">Resposta enviada {r.resolvedAt && `em ${formatDateTime(r.resolvedAt, t.tenant.timezone)}`}</div>
          <p className="whitespace-pre-line">{r.response}</p>
        </div>
      ) : can ? (
        <Field label="Resposta ao titular" hint="Obrigatória para negar. Aparece no perfil do titular.">
          {id => <Textarea id={id} value={response} maxLength={2000} onChange={e => setResponse(e.target.value)} />}
        </Field>
      ) : (
        <Notice>Responder exige permissão de dados pessoais e de aprovar cadastros.</Notice>
      )}
    </Modal>
  );
}
