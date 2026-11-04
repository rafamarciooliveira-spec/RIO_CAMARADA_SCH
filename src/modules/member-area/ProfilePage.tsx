import { PushToggle } from './PushToggle.tsx';
/** Meu perfil e privacidade: dados, contato, foto, consentimentos, cópia dos dados e pedidos LGPD. */
import { useCallback, useEffect, useState } from 'react';
import { Download, FileJson, ShieldCheck, Trash2 } from 'lucide-react';
import { useFileUrl, useList, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import { formatCPF } from '../../shared/cpf.ts';
import { formatDate, formatDateTime } from '../../shared/dates.ts';
import { MEMBER_STATUS_LABEL, type MemberPiiDoc, type PrivacyRequestDoc } from '../../shared/types.ts';
import { buildSafeCsv, downloadCsv } from '../../utils/csv.ts';
import { RequestChangeModal } from './RequestChangeModal.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';
import { Badge, Button, Card, EmptyState, Field, Input, Loading, Notice, PageHeader, Section, Select, Textarea, Toggle, useConfirm } from '../../ui/index.tsx';

type Pii = Omit<MemberPiiDoc, 'cpfEnc' | 'cpfHmac'>;

const KIND_LABEL: Record<PrivacyRequestDoc['kind'], string> = {
  acesso: 'Acesso aos dados',
  correcao: 'Correção de dados',
  portabilidade: 'Portabilidade',
  eliminacao: 'Eliminação (exclusão)',
  revogacao: 'Revogação de consentimento',
};
const REQ_STATUS: Record<PrivacyRequestDoc['status'], { label: string; tone: 'info' | 'warn' | 'ok' | 'bad' }> = {
  aberta: { label: 'Aberto', tone: 'info' },
  em_analise: { label: 'Em análise', tone: 'warn' },
  concluida: { label: 'Concluído', tone: 'ok' },
  negada: { label: 'Negado', tone: 'bad' },
};

const lastConsent = (pii: Pii | null, p: string) => !!(pii?.consents || []).filter(c => c.purpose === p).pop()?.granted;

function flatten(obj: unknown, prefix = '', out: [string, string][] = []): [string, string][] {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (typeof obj === 'object') for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out.push([prefix, String(obj)]);
  return out;
}

export default function ProfilePage() {
  const t = useTenant();
  const session = useSession();
  const m = t.member;
  if (!m) {
    return (
      <div className="space-y-5">
        <PageHeader title="Meu perfil e privacidade" />
        <PushToggle />
        <Card className="space-y-1">
          <div className="text-sm">
            Conta: <strong>{session.user?.email}</strong>
          </div>
          <p className="text-sm text-muted">Você não tem cadastro de {t.labels.member.toLowerCase()} nesta sociedade, então não há dados pessoais guardados além do e-mail de acesso.</p>
        </Card>
      </div>
    );
  }
  return <Profile />;
}

function Profile() {
  const t = useTenant();

  const { run, busy } = useOp();
  const confirm = useConfirm();
  const m = t.member!;
  const tz = t.tenant.timezone;
  const [pii, setPii] = useState<Pii | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [socials, setSocials] = useState({ instagram: '', facebook: '' });
  const [address, setAddress] = useState({ street: '', number: '', district: '', city: '', state: '', zip: '' });
  const [fullName, setFullName] = useState(m.fullName);
  const [birthDate, setBirthDate] = useState('');
  const [cpf, setCpf] = useState('');
  const photo = useFileUrl(m.photoPath);
  const identityEditable = m.status === 'pendente' || m.status === 'rejeitado';
  const [changeOpen, setChangeOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await run<Pii | null>('members.getPii', { tenantId: t.tenantId, memberId: m.id }, { silent: true });
    const p = r || ({ consents: [] } as unknown as Pii);
    setPii(p);
    setPhone(p.phone || '');
    setSocials({ instagram: p.socials?.instagram || '', facebook: p.socials?.facebook || '' });
    setAddress({ street: '', number: '', district: '', city: '', state: '', zip: '', ...(p.address || {}) });
    setBirthDate(p.birthDate || '');
    setLoading(false);
  }, [run, t.tenantId, m.id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveContact = async (resubmit = false) => {
    const addr = Object.fromEntries(Object.entries(address).filter(([, v]) => String(v).trim()));
    const input: Record<string, unknown> = { tenantId: t.tenantId, memberId: m.id, phone: phone.trim(), address: addr, socials: { ...(socials.instagram.trim() ? { instagram: socials.instagram.trim() } : {}), ...(socials.facebook.trim() ? { facebook: socials.facebook.trim() } : {}) } };
    if (identityEditable) {
      if (fullName.trim() && fullName.trim() !== m.fullName) input.fullName = fullName.trim();
      if (birthDate && birthDate !== pii?.birthDate) input.birthDate = birthDate;
      if (cpf.trim()) input.cpf = cpf.trim();
    }
    if (resubmit) input.resubmit = true;
    const r = await run('members.updateSelf', input, { success: resubmit ? 'Correção enviada para nova análise.' : 'Dados atualizados.' });
    if (r) {
      setCpf('');
      load();
    }
  };

  const setConsent = async (purpose: 'imagem' | 'comunicacao' | 'marketing', granted: boolean) => {
    const r = await run('members.updateSelf', { tenantId: t.tenantId, memberId: m.id, consents: { [purpose]: granted } }, { success: 'Preferência registrada.' });
    if (r) load();
  };


  const exportData = async (fmt: 'json' | 'csv') => {
    const r = await run<Record<string, unknown>>('privacy.myData', { tenantId: t.tenantId, memberId: m.id });
    if (!r) return;
    const name = `meus-dados-${t.slug}`;
    if (fmt === 'json') {
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else {
      downloadCsv(buildSafeCsv(['campo', 'valor'], flatten(r)), `${name}.csv`);
    }
  };

  if (loading) return <Loading label="Carregando seus dados..." />;

  return (
    <div className="space-y-6">
      <PageHeader title="Meu perfil e privacidade" subtitle="Seus dados ficam protegidos. Só você e a diretoria autorizada têm acesso." />
      <PushToggle />

      {m.status === 'rejeitado' && (
        <Notice tone="warn">
          <strong>Ajuste pedido:</strong> {m.statusReason}. Corrija abaixo e toque em "Enviar correção".
        </Notice>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-5 items-start">
        <Card className="flex flex-col items-center gap-3 text-center">
          <div className="w-32 h-40 rounded-2xl overflow-hidden bg-surface-2 flex items-center justify-center text-xs text-muted">
            {photo ? <img src={photo} alt="Sua foto" className="w-full h-full object-cover" /> : 'Sem foto'}
          </div>
          <PhotoUpload memberId={m.id} hasPhoto={!!m.photoPath} />
          <p className="text-[11px] text-muted">Foto de rosto, de frente, para a {t.labels.card.toLowerCase()}. A imagem é reduzida e os dados de localização são removidos.</p>
        </Card>

        <Card className="space-y-4">
          <dl className="grid sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Situação</dt>
              <dd>{MEMBER_STATUS_LABEL[m.status]}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Categoria</dt>
              <dd>{m.categoryName}</dd>
            </div>
            {t.settings?.showMembershipNumber === true && (
              <div>
                <dt className="text-xs text-muted">Matrícula</dt>
                <dd>{m.membershipNumber || 'Após aprovação'}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted">CPF</dt>
              <dd className="tabular-nums">{pii?.cpfMasked || 'Não informado'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">E-mail</dt>
              <dd className="break-all">{pii?.email || 'Não informado'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Nascimento</dt>
              <dd>{pii?.birthDate ? formatDate(pii.birthDate) : 'Não informado'}</dd>
            </div>
          </dl>
          {identityEditable ? (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Nome completo">{id => <Input id={id} value={fullName} maxLength={150} onChange={e => setFullName(e.target.value)} />}</Field>
              <Field label="Nascimento">{id => <Input id={id} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />}</Field>
              <Field label="CPF (para corrigir)">{id => <Input id={id} inputMode="numeric" value={cpf} maxLength={14} onChange={e => setCpf(formatCPF(e.target.value))} />}</Field>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {m.changePending ? (
                <Notice tone="info">Seu pedido de alteração está com a diretoria. Você recebe um aviso quando for decidido.</Notice>
              ) : (
                <>
                  <p className="text-xs text-muted">Depois da aprovação, nome, nascimento e CPF mudam por pedido à diretoria.</p>
                  <Button size="sm" variant="secondary" onClick={() => setChangeOpen(true)}>
                    Pedir alteração
                  </Button>
                </>
              )}
              {changeOpen && <RequestChangeModal m={m} kind="dados" birthDate={pii?.birthDate} onClose={() => setChangeOpen(false)} />}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Telefone ou WhatsApp">{id => <Input id={id} type="tel" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} />}</Field>
            <Field label="Instagram (opcional)">{id => <Input id={id} value={socials.instagram} maxLength={120} placeholder="@seuperfil" onChange={e => setSocials({ ...socials, instagram: e.target.value })} />}</Field>
            <Field label="Facebook (opcional)">{id => <Input id={id} value={socials.facebook} maxLength={200} onChange={e => setSocials({ ...socials, facebook: e.target.value })} />}</Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-4">
              <Field label="Rua">{id => <Input id={id} value={address.street} maxLength={120} onChange={e => setAddress({ ...address, street: e.target.value })} />}</Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Número">{id => <Input id={id} value={address.number} maxLength={20} onChange={e => setAddress({ ...address, number: e.target.value })} />}</Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Bairro">{id => <Input id={id} value={address.district} maxLength={80} onChange={e => setAddress({ ...address, district: e.target.value })} />}</Field>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <Field label="Cidade">{id => <Input id={id} value={address.city} maxLength={80} onChange={e => setAddress({ ...address, city: e.target.value })} />}</Field>
            </div>
            <div>
              <Field label="UF">{id => <Input id={id} value={address.state} maxLength={2} onChange={e => setAddress({ ...address, state: e.target.value.toUpperCase() })} />}</Field>
            </div>
            <div>
              <Field label="CEP">{id => <Input id={id} value={address.zip} maxLength={10} onChange={e => setAddress({ ...address, zip: e.target.value })} />}</Field>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => saveContact(false)}>
              Salvar
            </Button>
            {m.status === 'rejeitado' && (
              <Button variant="accent" loading={busy} onClick={() => saveContact(true)}>
                Enviar correção
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Section title="Consentimentos">
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-ok" aria-hidden /> Cadastro e carteirinha: necessários para a associação (não dependem de consentimento).
          </div>
          <Toggle checked={lastConsent(pii, 'imagem')} onChange={v => setConsent('imagem', v)} disabled={busy} label="Uso da minha imagem em fotos e vídeos de eventos" />
          <Toggle checked={lastConsent(pii, 'comunicacao')} onChange={v => setConsent('comunicacao', v)} disabled={busy} label="Receber avisos por e-mail" />
          <Toggle checked={lastConsent(pii, 'marketing')} onChange={v => setConsent('marketing', v)} disabled={busy} label="Receber ofertas de parceiros e patrocinadores" />
          <p className="text-[11px] text-muted">Cada mudança fica registrada com data e versão dos termos. Os avisos dentro do portal continuam aparecendo.</p>
        </Card>
      </Section>

      <Section title="Meus dados">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Baixe uma cópia de tudo que a sociedade guarda sobre você: cadastro, consentimentos, histórico, cobranças, entradas e notificações. O CPF vem mascarado.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<FileJson className="w-4 h-4" />} loading={busy} onClick={() => exportData('json')}>
              Baixar em JSON
            </Button>
            <Button variant="secondary" icon={<Download className="w-4 h-4" />} loading={busy} onClick={() => exportData('csv')}>
              Baixar em CSV
            </Button>
          </div>
        </Card>
      </Section>

      <PrivacyRequests memberId={m.id} tz={tz} onConfirmDelete={() => confirm({ title: 'Pedir exclusão dos dados', text: 'A diretoria vai analisar o pedido. Se for concluído, seu cadastro é desligado e os dados pessoais são apagados. Registros financeiros e atas ficam guardados pelo prazo legal, só com identificadores.', confirmLabel: 'Pedir exclusão', danger: true, requireText: 'EXCLUIR' })} />
    </div>
  );
}

function PrivacyRequests({ memberId, tz, onConfirmDelete }: { memberId: string; tz: string; onConfirmDelete: () => Promise<boolean> }) {
  const t = useTenant();
  const { run, busy } = useOp();
  const session = useSession();
  const list = useList<PrivacyRequestDoc>(P.privacyRequests(t.tenantId), { where: [['uid', '==', session.user?.uid || '-']], orderBy: [['createdAt', 'desc']], limit: 20 });
  const [kind, setKind] = useState<PrivacyRequestDoc['kind']>('correcao');
  const [details, setDetails] = useState('');
  const send = async (k: PrivacyRequestDoc['kind'], d: string) => {
    const r = await run('privacy.request', { tenantId: t.tenantId, memberId, kind: k, details: d.trim() }, { success: 'Pedido registrado. Você recebe a resposta no portal.' });
    if (r) setDetails('');
  };
  return (
    <Section title="Pedidos de privacidade (LGPD)">
      <Card className="space-y-3">
        <div className="grid sm:grid-cols-[220px_1fr] gap-3">
          <Field label="Tipo de pedido">
            {id => (
              <Select id={id} value={kind} onChange={e => setKind(e.target.value as PrivacyRequestDoc['kind'])}>
                {(Object.keys(KIND_LABEL) as PrivacyRequestDoc['kind'][])
                  .filter(k => k !== 'eliminacao')
                  .map(k => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Detalhes">{id => <Textarea id={id} value={details} maxLength={2000} onChange={e => setDetails(e.target.value)} placeholder="Explique o que você precisa" />}</Field>
        </div>
        <div className="flex flex-wrap gap-2 justify-between">
          <Button loading={busy} onClick={() => send(kind, details)}>
            Enviar pedido
          </Button>
          <Button
            variant="ghost"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={async () => {
              if (await onConfirmDelete()) send('eliminacao', details || 'Quero a exclusão dos meus dados.');
            }}
          >
            Pedir exclusão dos meus dados
          </Button>
        </div>
      </Card>
      {list.data.length === 0 ? (
        <EmptyState title="Nenhum pedido feito" />
      ) : (
        <ul className="space-y-2">
          {list.data.map(r => (
            <li key={r.id} className="p-3 rounded-2xl bg-surface border border-line text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{KIND_LABEL[r.kind]}</span>
                <Badge tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</Badge>
              </div>
              <div className="text-xs text-muted">Aberto em {formatDateTime(r.createdAt, tz)}</div>
              {r.response && <div className="text-sm">Resposta: {r.response}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
