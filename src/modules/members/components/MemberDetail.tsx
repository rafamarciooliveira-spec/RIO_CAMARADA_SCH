/** Detalhe do sócio para a secretaria: dados, histórico e ações (aprovar, ajuste, situação, renovar, CPF, convite, anonimizar). */
import { useEffect, useState } from 'react';
import { Eye, FileText, Mail, Pencil, RefreshCw, ShieldOff, UserCheck } from 'lucide-react';
import { useDoc, useFileUrl, useList, useOp } from '../../../app/DataContext.tsx';
import { useTenant } from '../../../app/TenantContext.tsx';
import { P } from '../../../shared/paths.ts';
import { formatDate, formatDateTime } from '../../../shared/dates.ts';
import { STATUS_TRANSITIONS } from '../../../shared/memberStatus.ts';
import { formatCPF } from '../../../shared/cpf.ts';
import { MEMBER_STATUS_LABEL, type OrgChartDoc, type MemberDoc, type MemberHistoryDoc, type MemberPiiDoc, type MemberStatus } from '../../../shared/types.ts';
import { Badge, Button, Field, Input, Loading, Modal, Notice, Select, Tabs, Textarea, Toggle, useConfirm } from '../../../ui/index.tsx';
import { statusTone } from '../statusTone.ts';
import { ChangeReview } from './ChangeReview.tsx';

const FIX_REASONS = [
  'Foto ilegível ou ausente',
  'CPF não confere',
  'Falta o responsável legal (menor de 18 anos)',
  'Categoria escolhida não corresponde',
  'Dados de contato incompletos',
];

type Pii = Omit<MemberPiiDoc, 'cpfEnc' | 'cpfHmac'> & { cpf?: string };

export function MemberDetail({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const doc = useDoc<MemberDoc>(P.member(t.tenantId, memberId));
  const history = useList<MemberHistoryDoc>(P.memberHistory(t.tenantId, memberId), { orderBy: [['at', 'desc']], limit: 50 });
  const holder = useDoc<MemberDoc>(doc.data?.dependentOf ? P.member(t.tenantId, doc.data.dependentOf) : null);
  const photo = useFileUrl(doc.data?.photoPath);
  const [tab, setTab] = useState<'dados' | 'acoes' | 'historico'>('dados');
  const [pii, setPii] = useState<Pii | null>(null);
  const [edit, setEdit] = useState(false);
  const m = doc.data;
  const cats = t.settings?.categories || [];
  const canApprove = t.can('socios', 'aprovar');
  const canEdit = t.can('socios', 'editar');
  const canPii = t.can('pii', 'ver');

  useEffect(() => setPii(null), [memberId]);

  if (doc.loading) return <Modal open onClose={onClose} title="Carregando..."><Loading /></Modal>;
  if (!m) return <Modal open onClose={onClose} title="Cadastro"><Notice tone="bad">Cadastro não encontrado.</Notice></Modal>;

  const loadPii = async (revealCpf: boolean) => {
    if (revealCpf) {
      const ok = await confirm({ title: 'Revelar CPF', text: 'O CPF completo vai aparecer na tela. Esta consulta fica registrada na auditoria com o seu nome.', confirmLabel: 'Revelar' });
      if (!ok) return;
    }
    const r = await run<Pii | null>('members.getPii', { tenantId: t.tenantId, memberId, revealCpf });
    if (r !== undefined) setPii(r || ({ consents: [] } as unknown as Pii));
  };

  const anonymized = !!(m as MemberDoc & { anonymizedAt?: string }).anonymizedAt;

  return (
    <Modal open onClose={onClose} title={m.fullName} size="lg">
      <div className="flex items-start gap-4">
        <div className="w-16 h-20 rounded-xl overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center text-xs text-muted">
          {photo ? <img src={photo} alt={`Foto de ${m.fullName}`} className="w-full h-full object-cover" /> : 'Sem foto'}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(m.status)}>{MEMBER_STATUS_LABEL[m.status]}</Badge>
            {m.isMinor && <Badge tone="info">Menor de idade</Badge>}
            {m.dependentOf && <Badge>Dependente de {holder.data?.displayName || 'titular'}</Badge>}
            {anonymized && <Badge tone="warn">Anonimizado</Badge>}
          </div>
          <div className="text-sm text-muted">
            {m.categoryName} {m.membershipNumber && `· Matrícula ${m.membershipNumber}`} {m.validUntil && `· Validade ${formatDate(m.validUntil)}`}
          </div>
          {m.statusReason && <div className="text-xs text-muted">Motivo: {m.statusReason}</div>}
        </div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'dados', label: 'Dados' },
          { id: 'acoes', label: 'Ações' },
          { id: 'historico', label: 'Histórico', count: history.data.length },
        ]}
      />
      {tab === 'dados' && (
        <div className="space-y-3">
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Entrada</dt>
              <dd>{m.joinedAt ? formatDate(m.joinedAt) : 'Ainda não aprovado'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Grupos</dt>
              <dd>{m.groups?.length ? m.groups.join(', ') : 'Nenhum'}</dd>
            </div>
            {Object.entries(m.custom || {}).map(([k, v]) => {
              const f = t.settings?.customFields.find(x => x.id === k);
              return (
                <div key={k}>
                  <dt className="text-xs text-muted">{f?.label || (k === 'parentesco' ? 'Parentesco' : k)}</dt>
                  <dd>{v}</dd>
                </div>
              );
            })}
          </dl>
          {!anonymized && <Documents m={m} pii={pii} canPii={canPii} />}
          {canPii && !anonymized && (
            <div className="space-y-2 p-3 rounded-xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">Dados pessoais</span>
                <div className="flex gap-2">
                  {!pii && (
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => loadPii(false)}>
                      Ver contato
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={<Eye className="w-4 h-4" />} loading={busy} onClick={() => loadPii(true)}>
                    Revelar CPF
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted">Cada consulta fica registrada na auditoria.</p>
              {pii && (
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">CPF</dt>
                    <dd className="tabular-nums">{pii.cpf ? formatCPF(pii.cpf) : pii.cpfMasked || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Nascimento</dt>
                    <dd>{pii.birthDate ? formatDate(pii.birthDate) : 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">E-mail</dt>
                    <dd className="break-all">{pii.email || 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Telefone</dt>
                    <dd>{pii.phone || 'Não informado'}</dd>
                  </div>
                  {pii.guardian && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted">Responsável legal</dt>
                      <dd>
                        {pii.guardian.name} {pii.guardian.phone && `· ${pii.guardian.phone}`} {pii.guardian.consentAt && `· consentiu em ${formatDateTime(pii.guardian.consentAt, t.tenant.timezone)}`}
                      </dd>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Consentimentos atuais</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {(['cadastro', 'imagem', 'comunicacao', 'marketing'] as const).map(p => {
                        const last = (pii.consents || []).filter(c => c.purpose === p).pop();
                        return (
                          <Badge key={p} tone={last?.granted ? 'ok' : 'neutral'}>
                            {p === 'comunicacao' ? 'comunicação' : p}: {last?.granted ? 'sim' : 'não'}
                          </Badge>
                        );
                      })}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          )}
          {canEdit && !anonymized && (
            <Button variant="secondary" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => setEdit(true)}>
              Editar dados
            </Button>
          )}
        </div>
      )}
      {tab === 'acoes' && <Actions m={m} cats={cats} canApprove={canApprove} anonymized={anonymized} onDone={onClose} />}
      {tab === 'historico' && (
        <ol className="space-y-2">
          {history.data.map(h => (
            <li key={h.id} className="text-sm p-3 rounded-xl bg-surface-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {h.from ? <Badge>{MEMBER_STATUS_LABEL[h.from]}</Badge> : <Badge>Novo</Badge>}
                <span aria-hidden>→</span>
                <Badge tone={statusTone(h.to)}>{MEMBER_STATUS_LABEL[h.to]}</Badge>
                <span className="text-xs text-muted ml-auto">{formatDateTime(h.at, t.tenant.timezone)}</span>
              </div>
              {h.reason && <div className="text-xs text-muted mt-1">{h.reason}</div>}
              <div className="text-[11px] text-muted mt-0.5">Por: {h.byUid === 'sistema' ? 'rotina automática' : h.byUid}</div>
            </li>
          ))}
          {!history.data.length && <p className="text-sm text-muted">Sem histórico.</p>}
        </ol>
      )}
      {edit && <EditModal m={m} pii={pii} onClose={() => setEdit(false)} />}
    </Modal>
  );
}

/** Ficha de inscrição e declaração em PDF com a identidade da sociedade */
function Documents({ m, pii, canPii }: { m: MemberDoc & { id: string }; pii: Pii | null; canPii: boolean }) {
  const t = useTenant();
  const { run } = useOp();
  const deps = useList<MemberDoc>(!m.dependentOf ? P.members(t.tenantId) : null, { where: [['dependentOf', '==', m.id]], limit: 20 });
  const chart = useDoc<OrgChartDoc>(P.orgchart(t.tenantId));
  const [busy, setBusy] = useState(false);
  const ficha = async () => {
    setBusy(true);
    try {
      const data = pii || (canPii ? await run<Pii | null>('members.getPii', { tenantId: t.tenantId, memberId: m.id }, { silent: true }) : null);
      const { memberFormPdf } = await import('../../../app/pdf.ts');
      const list = deps.data.filter(d => d.status !== 'desligado').map(d => ({ fullName: d.fullName, relation: d.custom?.parentesco }));
      await memberFormPdf(t.tenant, m, data || null, list, { memberLabel: t.labels.member, cpfFull: data?.cpf ? formatCPF(data.cpf) : undefined });
    } finally {
      setBusy(false);
    }
  };
  const declaration = async () => {
    const { memberDeclarationPdf, presidentSigner } = await import('../../../app/pdf.ts');
    await memberDeclarationPdf(t.tenant, m, { memberLabel: t.labels.member, signer: presidentSigner(chart.data) });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-line">
      <span className="text-sm font-semibold mr-auto">Documentos</span>
      <Button size="sm" variant="secondary" icon={<FileText className="w-4 h-4" />} loading={busy} onClick={ficha}>
        Ficha em PDF
      </Button>
      {['ativo', 'aprovado', 'em_atraso'].includes(m.status) && (
        <Button size="sm" variant="secondary" icon={<FileText className="w-4 h-4" />} onClick={declaration}>
          Declaração
        </Button>
      )}
    </div>
  );
}

function Actions({ m, cats, canApprove, anonymized, onDone }: { m: MemberDoc & { id: string }; cats: { id: string; name: string }[]; canApprove: boolean; anonymized: boolean; onDone: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const confirm = useConfirm();
  const [cat, setCat] = useState(m.categoryId);
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<MemberStatus | ''>('');
  const [statusReason, setStatusReason] = useState('');
  const [months, setMonths] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [anonReason, setAnonReason] = useState('');
  const next = (STATUS_TRANSITIONS[m.status] || []).filter(s => s !== 'rejeitado' && s !== 'pendente');
  const deps = useList<MemberDoc>(!m.dependentOf && m.status === 'pendente' ? P.members(t.tenantId) : null, { where: [['dependentOf', '==', m.id], ['status', '==', 'pendente']], limit: 20 });
  const [withDeps, setWithDeps] = useState(true);

  if (!canApprove) return <Notice>Seu papel pode consultar, mas não alterar a situação dos cadastros.</Notice>;
  if (anonymized) return <Notice>Cadastro anonimizado. Não há ações disponíveis.</Notice>;

  return (
    <div className="space-y-5">
      <ChangeReview m={m} />
      {['pendente', 'rejeitado', 'desligado'].includes(m.status) && (
        <section className="space-y-2 p-3 rounded-xl border border-ok/40">
          <h3 className="font-semibold text-sm">{m.status === 'desligado' ? 'Readmitir' : 'Aprovar cadastro'}</h3>
          <Field label="Categoria">
            {id => (
              <Select id={id} value={cat} onChange={e => setCat(e.target.value)}>
                {cats.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {deps.data.length > 0 && (
            <div className="text-sm space-y-1">
              <Toggle checked={withDeps} onChange={setWithDeps} label={`Aprovar junto os ${deps.data.length} dependente(s) desta ficha`} />
              <ul className="text-xs text-muted list-disc pl-5">
                {deps.data.map(d => (
                  <li key={d.id}>
                    {d.fullName}
                    {d.custom?.parentesco ? ` (${d.custom.parentesco})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button icon={<UserCheck className="w-4 h-4" />} loading={busy} onClick={() => run('members.approve', { tenantId: t.tenantId, memberId: m.id, categoryId: cat, withDependents: withDeps && deps.data.length > 0, requestId: `${m.id}_${Date.now()}` }, { success: 'Cadastro aprovado.' })}>
            Aprovar
          </Button>
        </section>
      )}
      {m.status === 'pendente' && (
        <section className="space-y-2 p-3 rounded-xl border border-warn/40">
          <h3 className="font-semibold text-sm">Pedir ajuste</h3>
          <div className="flex flex-wrap gap-1.5">
            {FIX_REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)} className="px-2 py-1 rounded-lg text-xs border border-line hover:border-muted cursor-pointer">
                {r}
              </button>
            ))}
          </div>
          <Textarea aria-label="Motivo do ajuste" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Explique o que precisa ser corrigido" />
          <Button variant="secondary" loading={busy} disabled={reason.trim().length < 5} onClick={async () => (await run('members.requestFix', { tenantId: t.tenantId, memberId: m.id, reason: reason.trim() }, { success: 'Pedido de ajuste enviado.' })) && setReason('')}>
            Enviar pedido de ajuste
          </Button>
        </section>
      )}
      {next.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">Mudar situação</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <Select aria-label="Nova situação" value={to} onChange={e => setTo(e.target.value as MemberStatus)}>
              <option value="">Escolha...</option>
              {next.map(s => (
                <option key={s} value={s}>
                  {MEMBER_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Input aria-label="Motivo" placeholder="Motivo (fica no histórico)" value={statusReason} maxLength={300} onChange={e => setStatusReason(e.target.value)} />
          </div>
          {to === 'suspenso' && <p className="text-xs text-warn">A carteirinha deixa de validar na hora, inclusive arquivos baixados.</p>}
          <Button
            variant="secondary"
            loading={busy}
            disabled={!to}
            onClick={async () => {
              if (to === 'desligado' && !(await confirm({ title: 'Desligar', text: `${m.fullName} será desligado(a). A carteirinha deixa de valer.`, confirmLabel: 'Desligar', danger: true }))) return;
              const r = await run('members.setStatus', { tenantId: t.tenantId, memberId: m.id, status: to, ...(statusReason.trim() ? { reason: statusReason.trim() } : {}) }, { success: 'Situação atualizada.' });
              if (r) {
                setTo('');
                setStatusReason('');
              }
            }}
          >
            Aplicar
          </Button>
        </section>
      )}
      {['aprovado', 'ativo', 'em_atraso'].includes(m.status) && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">Renovar validade</h3>
          <div className="flex gap-2 items-end">
            <Field label="Meses (vazio usa a regra da sociedade)">
              {id => <Input id={id} type="number" min={1} max={120} value={months} onChange={e => setMonths(e.target.value)} className="w-40" />}
            </Field>
            <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} loading={busy} onClick={() => run('members.renew', { tenantId: t.tenantId, memberId: m.id, ...(months ? { months: Number(months) } : {}) }, { success: 'Validade renovada.' })}>
              Renovar
            </Button>
          </div>
        </section>
      )}
      {!m.uid && t.can('papeis', 'criar') && (
        <section className="space-y-2">
          <h3 className="font-semibold text-sm">Convidar para acessar o portal</h3>
          <div className="flex gap-2">
            <Input type="email" aria-label="E-mail do convite" placeholder="E-mail da pessoa" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            <Button
              variant="secondary"
              icon={<Mail className="w-4 h-4" />}
              loading={busy}
              disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())}
              onClick={async () => {
                const r = await run<{ link?: string; mailStatus: string }>('invites.create', { tenantId: t.tenantId, email: inviteEmail.trim(), roleIds: ['socio'], memberId: m.id }, { success: 'Convite criado.' });
                if (r) setInviteLink(r.link || '');
              }}
            >
              Convidar
            </Button>
          </div>
          {inviteLink && (
            <Notice tone="warn">
              O e-mail não foi enviado de verdade neste ambiente. Envie este link para a pessoa: <span className="break-all font-mono text-xs">{inviteLink}</span>
            </Notice>
          )}
        </section>
      )}
      <section className="space-y-2 p-3 rounded-xl border border-bad/40">
        <h3 className="font-semibold text-sm">Desligar e anonimizar</h3>
        <p className="text-xs text-muted">Apaga CPF, contato, endereço e foto. Ficam só identificadores nos registros financeiros e atas, pelo prazo legal. Não dá para desfazer.</p>
        <Input aria-label="Motivo da anonimização" placeholder="Motivo (mínimo 5 letras)" value={anonReason} maxLength={300} onChange={e => setAnonReason(e.target.value)} />
        <Button
          variant="danger"
          icon={<ShieldOff className="w-4 h-4" />}
          loading={busy}
          disabled={anonReason.trim().length < 5}
          onClick={async () => {
            const word = 'ANONIMIZAR';
            const ok = await confirm({ title: 'Anonimizar cadastro', text: `Os dados pessoais de ${m.fullName} serão apagados para sempre.`, confirmLabel: 'Anonimizar', danger: true, requireText: word });
            if (!ok) return;
            const r = await run('members.anonymize', { tenantId: t.tenantId, memberId: m.id, reason: anonReason.trim() }, { success: 'Cadastro anonimizado.' });
            if (r) onDone();
          }}
        >
          Anonimizar
        </Button>
      </section>
    </div>
  );
}

function EditModal({ m, pii, onClose }: { m: MemberDoc & { id: string }; pii: Pii | null; onClose: () => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const [fullName, setFullName] = useState(m.fullName);
  const [categoryId, setCategoryId] = useState(m.categoryId);
  const [groups, setGroups] = useState((m.groups || []).join(', '));
  const [email, setEmail] = useState(pii?.email || '');
  const [phone, setPhone] = useState(pii?.phone || '');
  const [birthDate, setBirthDate] = useState(pii?.birthDate || '');
  const [cpf, setCpf] = useState('');
  const canPii = t.can('pii', 'ver');
  const save = async () => {
    const data: Record<string, unknown> = {
      fullName: fullName.trim(),
      categoryId,
      groups: groups.split(',').map(g => g.trim()).filter(Boolean).slice(0, 20),
    };
    if (canPii && pii) {
      if (email.trim() !== (pii.email || '')) data.email = email.trim();
      if (phone.trim() !== (pii.phone || '')) data.phone = phone.trim();
      if (birthDate && birthDate !== pii.birthDate) data.birthDate = birthDate;
    }
    if (cpf.trim()) data.cpf = cpf.trim();
    const r = await run('members.update', { tenantId: t.tenantId, memberId: m.id, data }, { success: 'Dados atualizados.' });
    if (r) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar dados"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={save} disabled={fullName.trim().length < 3}>
            Salvar
          </Button>
        </>
      }
    >
      <Field label="Nome completo">{id => <Input id={id} value={fullName} maxLength={150} onChange={e => setFullName(e.target.value)} />}</Field>
      <Field label="Categoria">
        {id => (
          <Select id={id} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {(t.settings?.categories || []).map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Grupos" hint="Separados por vírgula. Exemplo: coral, dança">
        {id => <Input id={id} value={groups} onChange={e => setGroups(e.target.value)} />}
      </Field>
      {canPii && !pii && <Notice>Para editar contato e nascimento, abra antes os dados pessoais na aba Dados.</Notice>}
      {canPii && pii && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="E-mail">{id => <Input id={id} type="email" value={email} maxLength={120} onChange={e => setEmail(e.target.value)} />}</Field>
          <Field label="Telefone">{id => <Input id={id} value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} />}</Field>
          <Field label="Nascimento">{id => <Input id={id} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />}</Field>
        </div>
      )}
      {canPii && (
        <Field label="Trocar CPF" hint="Deixe vazio para manter o atual.">
          {id => <Input id={id} inputMode="numeric" value={cpf} maxLength={14} onChange={e => setCpf(formatCPF(e.target.value))} />}
        </Field>
      )}
    </Modal>
  );
}
