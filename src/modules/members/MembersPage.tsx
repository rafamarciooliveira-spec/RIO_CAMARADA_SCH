/** Sócios: lista paginada, busca, filtros, pendentes primeiro, detalhe, cadastro, importação e exportação. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, CornerDownRight, Download, Link2, Megaphone, Upload, UserPlus, Users } from 'lucide-react';
import { useData, useList, useOp } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatDate } from '../../shared/dates.ts';
import type { QuerySpec } from '../../shared/core/store.ts';
import { MEMBER_STATUSES, MEMBER_STATUS_LABEL, type MemberDoc, type MemberStatus } from '../../shared/types.ts';
import { Badge, Button, EmptyState, ErrorState, LoadMore, Loading, Modal, Notice, PageHeader, SearchBox, Select, Table, Toggle, type Column } from '../../ui/index.tsx';
import { MemberDetail } from './components/MemberDetail.tsx';
import { ExportModal, ImportModal } from './components/ImportExport.tsx';
import { emptyMemberForm, MemberForm, toPayload, validateMemberForm, type MemberFormValue } from './components/MemberForm.tsx';
import { statusTone } from './statusTone.ts';
import { SignupLinkModal } from './components/SignupLinkModal.tsx';
import { TransfersSection } from './components/Transfers.tsx';

const PAGE = 50;

export default function MembersPage() {
  const t = useTenant();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MemberStatus | ''>('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState('');
  const [modal, setModal] = useState<'' | 'novo' | 'importar' | 'exportar' | 'link'>('');

  const q = useMemo<QuerySpec>(() => {
    const where: QuerySpec['where'] = [];
    if (status) where.push(['status', '==', status]);
    if (category) where.push(['categoryId', '==', category]);
    return { where, orderBy: [['fullName', 'asc']], limit };
  }, [status, category, limit]);
  const list = useList<MemberDoc>(P.members(t.tenantId), q);
  const pending = useList<MemberDoc>(!status ? P.members(t.tenantId) : null, { where: [['status', '==', 'pendente']], orderBy: [['createdAt', 'asc']], limit: 20 });

  const term = search.trim().toLowerCase();
  const match = (m: MemberDoc) => !term || m.fullName.toLowerCase().includes(term) || (m.membershipNumber || '').toLowerCase().includes(term);
  const base = list.data.filter(m => match(m) && (status || m.status !== 'pendente'));
  // Árvore: dependentes embaixo do titular (carregados à parte, porque a lista é paginada por nome)
  const { client } = useData();
  const holderIds = useMemo(() => base.filter(m => !m.dependentOf).map(m => m.id), [base]);
  const holderKey = holderIds.join(',');
  const [deps, setDeps] = useState<Record<string, (MemberDoc & { id: string })[]>>({});
  const [holderNames, setHolderNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, (MemberDoc & { id: string })[]> = {};
      for (let i = 0; i < holderIds.length; i += 30) {
        const chunk = holderIds.slice(i, i + 30);
        const found = await client.list<MemberDoc>(P.members(t.tenantId), { where: [['dependentOf', 'in', chunk]], limit: 300 }).catch(() => []);
        for (const d of found) (out[d.dependentOf!] ||= []).push(d);
      }
      for (const k of Object.keys(out)) out[k].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
      if (alive) setDeps(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, t.tenantId, holderKey]);
  // Dependente cujo titular não está nesta página: busca só o nome do titular
  const orphanHolders = useMemo(() => [...new Set(base.filter(m => m.dependentOf && !holderIds.includes(m.dependentOf)).map(m => m.dependentOf!))], [base, holderIds]);
  useEffect(() => {
    const missing = orphanHolders.filter(id => !holderNames[id]);
    if (!missing.length) return;
    Promise.all(missing.map(id => client.get<MemberDoc>(P.member(t.tenantId, id)).catch(() => null))).then(list =>
      setHolderNames(h => ({ ...h, ...Object.fromEntries(list.filter(Boolean).map(m => [m!.id, m!.fullName])) }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphanHolders.join(','), client, t.tenantId]);
  type Row = MemberDoc & { id: string; _child?: string; _deps?: number };
  const rows: Row[] = [];
  for (const m of base) {
    if (m.dependentOf && holderIds.includes(m.dependentOf)) continue;
    const kids = !m.dependentOf ? deps[m.id] || [] : [];
    rows.push({ ...m, _deps: kids.length });
    if (open[m.id]) for (const d of kids) rows.push({ ...d, _child: m.fullName });
  }
  const pend = pending.data.filter(match);
  const changes = useList<MemberDoc>(!status && t.can('socios', 'aprovar') ? P.members(t.tenantId) : null, { where: [['changePending', '==', true]], limit: 30 });

  const cats = t.settings?.categories || [];
  const columns: Column<MemberDoc & { id: string; _child?: string; _deps?: number }>[] = [
    {
      key: 'nome',
      label: 'Nome',
      render: m => (
        <div className={`min-w-0 flex items-start gap-2 ${m._child ? 'pl-6' : ''}`}>
          {m._child ? (
            <CornerDownRight className="w-4 h-4 mt-0.5 text-muted shrink-0" aria-hidden />
          ) : m._deps ? (
            <button
              type="button"
              aria-label={open[m.id] ? 'Esconder dependentes' : 'Mostrar dependentes'}
              aria-expanded={!!open[m.id]}
              className="p-0.5 -ml-1 rounded hover:bg-surface-2 cursor-pointer shrink-0"
              onClick={e => (e.stopPropagation(), setOpen(o => ({ ...o, [m.id]: !o[m.id] })))}
            >
              {open[m.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="font-medium truncate">{m.fullName}</div>
            <div className="text-xs text-muted md:hidden">{m.categoryName}</div>
            {m._deps ? (
              <button type="button" className="text-xs text-accent cursor-pointer" onClick={e => (e.stopPropagation(), setOpen(o => ({ ...o, [m.id]: !o[m.id] })))}>
                {m._deps} dependente{m._deps > 1 ? 's' : ''} {open[m.id] ? '(esconder)' : '(ver)'}
              </button>
            ) : null}
            {m.dependentOf && (
              <div className="text-xs text-muted">
                Dependente de {m._child || holderNames[m.dependentOf] || 'titular'}
                {m.custom?.parentesco ? ` · ${m.custom.parentesco}` : ''}
              </div>
            )}
          </div>
        </div>
      ),
    },
    ...(t.settings?.showMembershipNumber === true ? [{ key: 'matricula', label: 'Matrícula', render: (m: MemberDoc) => <span className="tabular-nums">{m.membershipNumber || ''}</span>, hideOnMobile: true }] : []),
    { key: 'categoria', label: 'Categoria', render: m => m.categoryName, hideOnMobile: true },
    { key: 'validade', label: 'Validade', render: m => (m.validUntil ? formatDate(m.validUntil) : ''), hideOnMobile: true },
    { key: 'situacao', label: 'Situação', render: m => <Badge tone={statusTone(m.status)}>{MEMBER_STATUS_LABEL[m.status]}</Badge> },
  ];

  const communicate = () => {
    const p = new URLSearchParams();
    if (category) p.set('categoria', category);
    navigate(t.to(`gestao-avisos${p.toString() ? `?${p}` : ''}`));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.labels.members}
        subtitle="Cadastros, aprovações, situação e histórico."
        actions={
          <>
            {(t.can('socios', 'criar') || t.can('socios', 'aprovar')) && (
              <Button size="sm" icon={<Link2 className="w-4 h-4" />} onClick={() => setModal('link')}>
                Link de cadastro
              </Button>
            )}
            {t.can('socios', 'criar') && (
              <>
                <Button size="sm" variant="secondary" icon={<UserPlus className="w-4 h-4" />} onClick={() => setModal('novo')}>
                  Novo cadastro
                </Button>
                <Button size="sm" variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => setModal('importar')}>
                  Importar
                </Button>
              </>
            )}
            {t.can('socios', 'exportar') && (
              <Button size="sm" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={() => setModal('exportar')}>
                Exportar
              </Button>
            )}
            {t.can('avisos', 'criar') && (
              <Button size="sm" variant="secondary" icon={<Megaphone className="w-4 h-4" />} onClick={communicate}>
                Comunicar
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nome ou matrícula" />
        <Select aria-label="Filtrar por situação" value={status} onChange={e => (setStatus(e.target.value as MemberStatus | ''), setLimit(PAGE))} className="sm:w-48">
          <option value="">Todas as situações</option>
          {MEMBER_STATUSES.map(s => (
            <option key={s} value={s}>
              {MEMBER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filtrar por categoria" value={category} onChange={e => (setCategory(e.target.value), setLimit(PAGE))} className="sm:w-56">
          <option value="">Todas as categorias</option>
          {cats.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {term && <p className="text-xs text-muted">A busca considera os cadastros já carregados. Use "Carregar mais" para buscar em toda a lista.</p>}

      {!status && pend.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-info">Aguardando aprovação ({pend.length})</h2>
          <Table rows={pend} columns={columns} onRowClick={m => setOpenId(m.id)} />
        </section>
      )}
      {!status && <TransfersSection />}
      {changes.data.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-info">Alterações para aprovar ({changes.data.length})</h2>
          <p className="text-xs text-muted">Mudança de nome, nascimento, CPF ou retirada de dependente pedida pelo sócio. Clique para ver o antes e o depois.</p>
          <Table rows={changes.data} columns={columns} onRowClick={m => setOpenId(m.id)} />
        </section>
      )}

      {list.loading && !list.data.length ? (
        <Loading />
      ) : list.error ? (
        <ErrorState text={list.error} />
      ) : (
        <>
          <Table
            rows={rows}
            columns={columns}
            onRowClick={m => setOpenId(m.id)}
            empty={<EmptyState icon={<Users className="w-5 h-5" />} title={term || status || category ? 'Ninguém encontrado com estes filtros' : `Nenhum ${t.labels.member.toLowerCase()} ainda`} text={!term && !status && !category ? 'Cadastre, importe uma planilha ou divulgue o link de proposta online.' : undefined} />}
          />
          <LoadMore onClick={() => setLimit(l => l + PAGE)} loading={list.loading} done={list.data.length < limit} />
        </>
      )}

      {openId && <MemberDetail memberId={openId} onClose={() => setOpenId('')} />}
      <ImportModal open={modal === 'importar'} onClose={() => setModal('')} />
      <ExportModal open={modal === 'exportar'} onClose={() => setModal('')} />
      {modal === 'link' && <SignupLinkModal onClose={() => setModal('')} />}
      {modal === 'novo' && <NewMemberModal onClose={() => setModal('')} onCreated={id => (setModal(''), setOpenId(id))} />}
    </div>
  );
}

function NewMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const s = t.settings;
  const [v, setV] = useState<MemberFormValue>(() => ({ ...emptyMemberForm(s?.categories[0]?.id || ''), consents: { cadastro: true, imagem: false, comunicacao: false, marketing: false } }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [approve, setApprove] = useState(false);
  const [invite, setInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [requestId] = useState(() => `novo_${Date.now()}`);

  const save = async () => {
    const errs = validateMemberForm(v, s?.customFields || [], { requireConsent: true, tz: t.tenant.timezone });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = await run<{ memberId: string; inviteLink?: string }>(
      'members.create',
      { tenantId: t.tenantId, requestId, ...toPayload(v, t.tenant.timezone), approve, inviteEmail: invite && !!v.email.trim() },
      { success: 'Cadastro criado.' }
    );
    if (!r) return;
    if (r.inviteLink) setInviteLink(r.inviteLink);
    else onCreated(r.memberId);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Novo cadastro de ${t.labels.member.toLowerCase()}`}
      size="lg"
      footer={
        inviteLink ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={busy} onClick={save}>
              Salvar cadastro
            </Button>
          </>
        )
      }
    >
      {inviteLink ? (
        <Notice tone="warn">
          Cadastro criado. O e-mail do convite não saiu de verdade neste ambiente; envie este link para a pessoa: <span className="font-mono text-xs break-all">{inviteLink}</span>
        </Notice>
      ) : !s ? (
        <Loading />
      ) : (
        <>
          <MemberForm value={v} onChange={setV} categories={s.categories} customFields={s.customFields || []} errors={errors} tz={t.tenant.timezone} tenantName={t.tenant.name} selfService={false} memberLabel={t.labels.member} />
          <div className="space-y-2">
            {t.can('socios', 'aprovar') && <Toggle checked={approve} onChange={setApprove} label="Já aprovar (gera matrícula e validade)" />}
            <Toggle checked={invite} onChange={setInvite} label="Enviar convite de acesso ao portal pelo e-mail informado" disabled={!v.email.trim()} />
          </div>
          {Object.keys(errors).length > 0 && <Notice tone="bad">Confira os campos destacados.</Notice>}
        </>
      )}
    </Modal>
  );
}
