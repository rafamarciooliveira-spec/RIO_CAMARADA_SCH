/**
 * Cadastro repetido (o filho incluído pelo pai e pela mãe) e comprovante da adesão, na tela da diretoria.
 * - DuplicateNotice: aviso no detalhe do cadastro, com Juntar ou Não é a mesma pessoa.
 * - Guardians: os responsáveis do dependente (titular e segundo responsável).
 * - JoinProofView: o comprovante do Pix da adesão.
 * - DuplicatesFinder: procura os repetidos que já existem (inclusive os de antes da conferência automática).
 */
import { useState } from 'react';
import { Copy, Paperclip, Users } from 'lucide-react';
import { useData, useDoc, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { formatDateTime } from '../../../shared/dates.ts';
import { formatBRL } from '../../../shared/money.ts';
import { MEMBER_STATUS_LABEL, type MemberDoc } from '../../../shared/types.ts';
import type { DupSide } from '../../../shared/ops/members.ts';
import { Badge, Button, EmptyState, Loading, Modal, Notice, useConfirm, useToast } from '../../../ui/index.tsx';

function useMerge() {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const merge = async (aId: string, bId: string, name: string) => {
    const ok = await confirm({
      title: 'Juntar os dois cadastros',
      text: `${name} fica com um cadastro só e os dois responsáveis veem a carteirinha no celular. Fica o cadastro que já tem foto (ou o já aprovado); o outro é apagado. A mensalidade continua só com o titular principal.`,
      confirmLabel: 'Juntar',
    });
    if (!ok) return null;
    return run<{ keptId: string; removedId: string }>('members.mergeDuplicate', { tenantId: t.tenantId, aId, bId }, { success: 'Cadastros juntados.' });
  };
  const separate = (aId: string, bId: string) => run('members.notDuplicate', { tenantId: t.tenantId, aId, bId }, { success: 'Marcados como pessoas diferentes.' });
  return { merge, separate, busy };
}

export function DuplicateNotice({ m, onMerged }: { m: MemberDoc; onMerged?: (keptId: string) => void }) {
  const t = useTenant();
  const other = useDoc<MemberDoc>(m.duplicateOf ? P.member(t.tenantId, m.duplicateOf) : null);
  const holder = useDoc<MemberDoc>(other.data?.dependentOf ? P.member(t.tenantId, other.data.dependentOf) : null);
  const { merge, separate, busy } = useMerge();
  if (!m.duplicateOf) return null;
  const canEdit = t.can('socios', 'editar');
  return (
    <div className="p-3 rounded-xl border border-warn/50 bg-warn/5 space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Copy className="w-4 h-4 text-warn" aria-hidden /> Parece cadastro repetido
      </div>
      <p className="text-sm">
        {other.data ? (
          <>
            <strong>{other.data.fullName}</strong> ({MEMBER_STATUS_LABEL[other.data.status]}) já estava cadastrado{holder.data ? ` como dependente de ${holder.data.fullName}` : ''}
            {m.duplicateBy === 'cpf' ? ', com o mesmo CPF.' : ', com o mesmo nome e a mesma data de nascimento.'}
          </>
        ) : (
          'O outro cadastro não foi encontrado (talvez já tenha sido apagado).'
        )}
      </p>
      <p className="text-xs text-muted">Comum quando o pai e a mãe são sócios e os dois incluem o filho. Juntando, fica um cadastro só (aparece uma vez no aniversário e nas listas) e os dois responsáveis veem a carteirinha.</p>
      {canEdit && other.data && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={async () => { const r = await merge(m.id, m.duplicateOf!, m.fullName); if (r) onMerged?.(r.keptId); }}>
            Juntar num cadastro só
          </Button>
          {m.duplicateBy !== 'cpf' && (
            <Button size="sm" variant="secondary" loading={busy} onClick={() => separate(m.id, m.duplicateOf!)}>
              Não é a mesma pessoa
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Responsáveis do dependente: o titular (quem paga) e os outros (pai ou mãe) */
export function Guardians({ m }: { m: MemberDoc }) {
  const t = useTenant();
  const holder = useDoc<MemberDoc>(m.dependentOf ? P.member(t.tenantId, m.dependentOf) : null);
  const g1 = useDoc<MemberDoc>(m.guardianIds?.[0] ? P.member(t.tenantId, m.guardianIds[0]) : null);
  const g2 = useDoc<MemberDoc>(m.guardianIds?.[1] ? P.member(t.tenantId, m.guardianIds[1]) : null);
  if (!m.dependentOf) return null;
  const others = [g1.data, g2.data].filter(Boolean) as MemberDoc[];
  return (
    <div className="text-sm p-3 rounded-xl border border-line space-y-1">
      <div className="flex items-center gap-2 font-semibold">
        <Users className="w-4 h-4" aria-hidden /> Responsáveis
      </div>
      <div>{holder.data?.fullName || '...'} <span className="text-xs text-muted">(titular, a mensalidade vai com ele)</span></div>
      {others.map(o => (
        <div key={o.id}>
          {o.fullName} <span className="text-xs text-muted">(também vê e cuida do cadastro)</span>
        </div>
      ))}
      {(m.guardianIds?.length || 0) > 2 && <div className="text-xs text-muted">e mais {m.guardianIds!.length - 2}</div>}
    </div>
  );
}

export function JoinProofView({ m }: { m: MemberDoc }) {
  const { client } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!m.joinProof) return null;
  const open = async () => {
    setBusy(true);
    // A aba abre já no toque (o Safari bloqueia janela aberta depois de esperar)
    const w = window.open('', '_blank');
    try {
      const url = await client.fileUrl(m.joinProof!.path);
      if (!url) throw new Error('sem');
      if (w) w.location.href = url;
      else location.assign(url);
    } catch {
      w?.close();
      toast.show('Não foi possível abrir o comprovante agora.', 'erro');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p-3 rounded-xl border border-line flex flex-wrap items-center gap-3">
      <Paperclip className="w-4 h-4 text-accent" aria-hidden />
      <div className="text-sm flex-1 min-w-40">
        <div className="font-semibold">Comprovante do Pix da adesão</div>
        <div className="text-xs text-muted">
          Enviado em {formatDateTime(m.joinProof.at)}
          {m.joinProof.amountCents > 0 && ` · valor esperado ${formatBRL(m.joinProof.amountCents)}`}. Confira no extrato antes de aprovar.
        </div>
      </div>
      <Button size="sm" variant="secondary" loading={busy} onClick={open}>
        Ver comprovante
      </Button>
    </div>
  );
}

/** Procura repetidos: mesmo nome e mesma data de nascimento, com pelo menos um dependente */
export function DuplicatesFinder({ onClose }: { onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const { merge, separate, busy: acting } = useMerge();
  const [pairs, setPairs] = useState<{ a: DupSide; b: DupSide; by: 'cpf' | 'nome' }[] | null>(null);
  const search = async () => {
    const r = await run<{ pairs: { a: DupSide; b: DupSide; by: 'cpf' | 'nome' }[] }>('members.findDuplicates', { tenantId: t.tenantId });
    if (r) setPairs(r.pairs);
  };
  const drop = (a: string, b: string) => setPairs(p => (p || []).filter(x => !(x.a.id === a && x.b.id === b)));
  const side = (s: DupSide) => (
    <div className="flex-1 min-w-36 text-sm">
      <div className="font-semibold">{s.fullName}</div>
      <div className="text-xs text-muted">
        {s.dependent ? `Dependente de ${s.holderName || '?'}` : 'Titular'} · {MEMBER_STATUS_LABEL[s.status]}
        {s.hasPhoto ? ' · com foto' : ' · sem foto'}
      </div>
    </div>
  );
  return (
    <Modal open onClose={onClose} title="Cadastros repetidos" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Procura pessoas com o mesmo nome e a mesma data de nascimento em que pelo menos uma é dependente, como o filho incluído pelo pai e pela mãe. Juntando, fica um cadastro só, os dois responsáveis veem a carteirinha e a pessoa aparece uma vez no aniversário.
        </p>
        {pairs === null ? (
          <Button loading={busy} onClick={search}>Procurar agora</Button>
        ) : busy ? (
          <Loading />
        ) : pairs.length === 0 ? (
          <EmptyState title="Nenhum repetido encontrado" text="Os dependentes novos são conferidos sozinhos na hora da inclusão." />
        ) : (
          <ul className="space-y-2">
            {pairs.map(p => (
              <li key={`${p.a.id}_${p.b.id}`} className="p-3 rounded-xl border border-line space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  {side(p.a)}
                  <Badge tone={p.by === 'cpf' ? 'bad' : 'warn'}>{p.by === 'cpf' ? 'mesmo CPF' : 'mesmo nome e nascimento'}</Badge>
                  {side(p.b)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={acting} onClick={async () => { if (await merge(p.a.id, p.b.id, p.a.fullName)) drop(p.a.id, p.b.id); }}>
                    Juntar
                  </Button>
                  {p.by !== 'cpf' && (
                    <Button size="sm" variant="secondary" loading={acting} onClick={async () => { if (await separate(p.a.id, p.b.id)) drop(p.a.id, p.b.id); }}>
                      Não é a mesma pessoa
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Notice>Só dá para juntar quando pelo menos um dos dois é dependente e não entra no portal com conta própria.</Notice>
      </div>
    </Modal>
  );
}
