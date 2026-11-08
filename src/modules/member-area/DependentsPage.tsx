/** Dependentes do titular: lista e inclusão (entra pendente de aprovação). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { useData, useOp } from '../../app/DataContext.tsx';
import { useMyDependents } from './useMyDependents.ts';
import { PhotoPick, sendPickedPhoto } from './PhotoPick.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { formatDate } from '../../shared/dates.ts';
import { MEMBER_STATUS_LABEL, type MemberDoc } from '../../shared/types.ts';
import { Badge, Button, EmptyState, Loading, Modal, Notice, PageHeader, useToast } from '../../ui/index.tsx';
import { emptyMemberForm, MemberForm, toPayload, validateMemberForm, type MemberFormValue } from '../members/components/MemberForm.tsx';
import { statusTone } from '../members/statusTone.ts';
import { useFormOptions } from '../members/useFormOptions.ts';
import { RequestChangeModal } from './RequestChangeModal.tsx';
import { useDependentInfo } from '../members/components/FamilyPanel.tsx';

export default function DependentsPage() {
  const t = useTenant();
  const m = t.member;
  const list = useMyDependents(t.tenantId, m?.id);
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
              {list.coIds.has(d.id) && <div className="text-xs text-muted">Você é o segundo responsável; a mensalidade vai com o titular dele.</div>}
              {d.duplicateOf && <p className="text-xs text-info">Já estava cadastrado por outro responsável. A {t.labels.board.toLowerCase()} vai juntar num cadastro só, e você continua vendo a carteirinha.</p>}
              {!d.photoPath && opts.data?.requirePhoto !== false && !['rejeitado', 'desligado'].includes(d.status) && (
                <div className="pt-2 space-y-1">
                  <p className="text-xs text-warn font-medium">Falta a foto para a carteirinha.</p>
                  <PhotoUpload memberId={d.id} hasPhoto={false} own={false} />
                </div>
              )}
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
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);
  const { client } = useData();
  const toast = useToast();
  const needPhoto = s?.requirePhoto !== false;
  const save = async () => {
    const errs = { ...validateMemberForm(v, s?.customFields || [], { requireConsent: true, tz: t.tenant.timezone }), ...(needPhoto && !photo ? { photo: 'A foto é obrigatória: ela vai na carteirinha.' } : {}) };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run<{ memberId: string; duplicate?: boolean }>('members.addDependent', { tenantId: t.tenantId, holderId: t.member!.id, ...toPayload(v, t.tenant.timezone) });
    if (!r) return;
    if (photo) {
      setSending(true);
      await sendPickedPhoto(client, (op, input) => client.call(op, input), t.tenantId, r.memberId, photo).catch(() => toast.show('Dependente incluído, mas a foto não foi. Envie de novo pelo cartão dele nesta tela.', 'erro'));
      setSending(false);
    }
    toast.show(r.duplicate ? 'Dependente incluído. Ele já estava cadastrado por outro responsável: a diretoria vai juntar os dois.' : 'Dependente incluído. Agora é só aguardar a aprovação.', 'sucesso');
    onClose();
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
          <Button loading={busy || sending} onClick={save}>
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
          <div className="mb-4">
            <PhotoPick value={photo} onChange={setPhoto} error={errors.photo} label="Foto do dependente para a carteirinha" required={needPhoto} />
          </div>
          <MemberForm value={v} onChange={setV} categories={cats} customFields={s.customFields || []} errors={errors} tz={t.tenant.timezone} tenantName={t.tenant.name} selfService memberLabel={t.labels.member} />
          {Object.keys(errors).length > 0 && <Notice tone="bad">Confira os campos destacados.</Notice>}
        </>
      )}
    </Modal>
  );
}
