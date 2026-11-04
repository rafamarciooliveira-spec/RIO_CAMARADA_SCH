/** Dependentes do titular: lista e inclusão (entra pendente de aprovação). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import { MEMBER_STATUS_LABEL, type MemberDoc } from '../../shared/types.ts';
import { Badge, Button, EmptyState, Loading, Modal, Notice, PageHeader } from '../../ui/index.tsx';
import { emptyMemberForm, MemberForm, toPayload, validateMemberForm, type MemberFormValue } from '../members/components/MemberForm.tsx';
import { statusTone } from '../members/statusTone.ts';
import { useFormOptions } from '../members/useFormOptions.ts';
import { RequestChangeModal } from './RequestChangeModal.tsx';
import { useDependentInfo } from '../members/components/FamilyPanel.tsx';

export default function DependentsPage() {
  const t = useTenant();
  const m = t.member;
  const list = useList<MemberDoc>(m ? P.members(t.tenantId) : null, m ? { where: [['dependentOf', '==', m.id]], limit: 20 } : undefined);
  const [open, setOpen] = useState(false);
  const depInfo = useDependentInfo();
  const [change, setChange] = useState<{ d: MemberDoc & { id: string }; kind: 'dados' | 'remover' } | null>(null);
  const opts = useFormOptions(!!m);
  const holderCat = opts.data?.categories.find(c => c.id === m?.categoryId);
  const allowed = holderCat ? holderCat.allowsDependents : true;

  if (!m) return <EmptyState title="Você ainda não tem cadastro" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dependentes"
        subtitle={`Familiares ligados ao seu cadastro. Cada um tem a própria ${t.labels.card.toLowerCase()}.`}
        actions={
          allowed &&
          !['pendente', 'rejeitado', 'desligado', 'suspenso'].includes(m.status) && (
            <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setOpen(true)}>
              Incluir dependente
            </Button>
          )
        }
      />
      {!allowed && <Notice>A sua categoria ({m.categoryName}) não permite dependentes.</Notice>}
      {list.loading ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Users className="w-5 h-5" />} title="Nenhum dependente" text="Inclua filhos, cônjuge ou outros familiares, conforme as regras da sua sociedade." />
      ) : (
        <ul className="grid sm:grid-cols-2 gap-3">
          {list.data.map(d => (
            <li key={d.id} className="p-4 rounded-2xl bg-surface border border-line space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate">{d.fullName}</span>
                <Badge tone={statusTone(d.status)}>{MEMBER_STATUS_LABEL[d.status]}</Badge>
              </div>
              <div className="text-xs text-muted">
                {d.categoryName}
                {d.membershipNumber && t.settings?.showMembershipNumber === true && ` · Matrícula ${d.membershipNumber}`}
                {d.validUntil && ` · Validade ${formatDate(d.validUntil)}`}
              </div>
              {d.status === 'rejeitado' && d.statusReason && <p className="text-xs text-warn">Ajuste pedido: {d.statusReason}</p>}
              {d.custom?.parentesco && <div className="text-xs text-muted">{d.custom.parentesco}</div>}
              {(() => {
                const i = depInfo(d);
                return (
                  <div className="text-xs space-y-0.5 pt-1">
                    <div className="text-muted">
                      {i.tl.age !== null ? `${i.tl.age} anos · ` : ''}
                      {i.feeText}
                    </div>
                    {i.notes.map(n => (
                      <p key={n.text} className={n.tone === 'bad' ? 'text-bad font-medium' : 'text-muted'}>
                        {n.text}
                      </p>
                    ))}
                  </div>
                );
              })()}
              {d.changePending && <p className="text-xs text-info">Pedido de alteração em análise pela diretoria.</p>}
              {['aprovado', 'ativo', 'em_atraso', 'suspenso'].includes(d.status) && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <Link to={t.to('carteirinha')} className="text-xs text-accent">
                    Ver {t.labels.card.toLowerCase()}
                  </Link>
                  {!d.changePending && (
                    <>
                      <button type="button" className="text-xs text-accent cursor-pointer" onClick={() => setChange({ d, kind: 'dados' })}>
                        Pedir alteração
                      </button>
                      <button type="button" className="text-xs text-bad cursor-pointer" onClick={() => setChange({ d, kind: 'remover' })}>
                        Pedir para retirar
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {change && <RequestChangeModal m={change.d} kind={change.kind} onClose={() => setChange(null)} />}
      {open && <AddDependent onClose={() => setOpen(false)} s={opts.data} />}
    </div>
  );
}

function AddDependent({ onClose, s }: { onClose: () => void; s: ReturnType<typeof useFormOptions>['data'] }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const cats = s?.categories || [];
  const def = cats.find(c => c.id === 'dependente')?.id || cats[0]?.id || '';
  const [v, setV] = useState<MemberFormValue>(() => emptyMemberForm(def));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async () => {
    const errs = validateMemberForm(v, s?.customFields || [], { requireConsent: true, tz: t.tenant.timezone });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run('members.addDependent', { tenantId: t.tenantId, holderId: t.member!.id, ...toPayload(v, t.tenant.timezone) }, { success: 'Dependente incluído. Agora é só aguardar a aprovação.' });
    if (r) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Incluir dependente"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save}>
            Enviar para aprovação
          </Button>
        </>
      }
    >
      {!s ? (
        <Loading />
      ) : (
        <>
          <Notice>Para menores de 18 anos, informe você mesmo como responsável legal no bloco que aparece após a data de nascimento.</Notice>
          <MemberForm value={v} onChange={setV} categories={cats} customFields={s.customFields || []} errors={errors} tz={t.tenant.timezone} tenantName={t.tenant.name} selfService memberLabel={t.labels.member} />
          {Object.keys(errors).length > 0 && <Notice tone="bad">Confira os campos destacados.</Notice>}
        </>
      )}
    </Modal>
  );
}
