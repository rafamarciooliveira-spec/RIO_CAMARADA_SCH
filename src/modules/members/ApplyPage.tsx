/**
 * Proposta online de sócio. Dois links:
 * - /{slug}/cadastro: a ficha;
 * - /{slug}/adesao: antes da ficha, os valores (taxa de associação e anuidade), a chave Pix e o
 *   comprovante; depois a mesma ficha. Liga em Configurações, Regras (Adesão com Pix).
 * Exige login. A foto (titular e dependentes) é obrigatória quando a carteirinha exige foto; ela fica
 * no aparelho e sobe logo depois que o servidor cria o cadastro.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import { CheckCircle2, Clock, Copy, FileCheck2, Paperclip } from 'lucide-react';
import { useData, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { Button, Card, ErrorState, Field, Loading, Notice, Select, useToast } from '../../ui/index.tsx';
import { useFormOptions, type FormOptions } from './useFormOptions.ts';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { emptyMemberForm, MemberForm, toPayload, validateMemberForm, type MemberFormValue } from './components/MemberForm.tsx';
import { DependentsBlock, dependentsPayload, validateDependents, type DependentValue } from './components/DependentsBlock.tsx';
import { PhotoPick, sendPickedPhoto } from '../member-area/PhotoPick.tsx';
import { SimpleApply } from './SimpleApply.tsx';
import { PhotoUpload } from '../member-area/PhotoUpload.tsx';
import { formatBRL } from '../../shared/money.ts';
import { buildPixPayload } from '../../shared/core/sandboxPayments.ts';
import { joinAmountCents } from '../../shared/joinPayment.ts';
import { randomId, resizeImage, sniffImageType } from '../../utils/image.ts';
import type { MemberCategory } from '../../shared/types.ts';

const PERIOD_TEXT: Record<MemberCategory['period'], string> = { mensal: 'por mês', trimestral: 'por trimestre', semestral: 'por semestre', anual: 'por ano', isento: 'isento' };

/** Comprovante: imagem reduzida (sem localização) ou PDF como veio */
async function prepareProof(f: File): Promise<{ blob: Blob; type: 'image/jpeg' | 'application/pdf' }> {
  if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo de 10 MB).');
  const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) === '%PDF-') return { blob: f, type: 'application/pdf' };
  if (!(await sniffImageType(f))) throw new Error('Envie o comprovante como foto (JPG ou PNG) ou PDF.');
  return { blob: await resizeImage(f, 1600, 'image/jpeg', 0.85), type: 'image/jpeg' };
}

async function sendProof(client: ReturnType<typeof useData>['client'], tenantId: string, memberId: string, proof: { blob: Blob; type: 'image/jpeg' | 'application/pdf' }) {
  const path = `tenants/${tenantId}/members/${memberId}/proof/${randomId()}.${proof.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
  await client.upload(path, proof.blob, proof.type);
  await client.call('members.setJoinProof', { tenantId, memberId, path, contentType: proof.type });
}

export default function ApplyPage({ join = false }: { join?: boolean }) {
  const t = useTenant();
  const session = useSession();
  const { demo, client } = useData();
  const location = useLocation();
  const { run, busy } = useOp();
  const toast = useToast();
  // Quem ainda não é membro não lê as configurações: categorias e campos vêm de members.formOptions
  const opts = useFormOptions(!!session.user || !!demo);
  const s = opts.data;
  const categories = (s?.categories || []).filter(c => c.id !== 'dependente');
  const [v, setV] = useState<MemberFormValue>(() => emptyMemberForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deps, setDeps] = useState<DependentValue[]>([]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [proof, setProof] = useState<{ blob: Blob; type: 'image/jpeg' | 'application/pdf'; name: string } | null>(null);
  const [step, setStep] = useState<'pagamento' | 'ficha'>(join ? 'pagamento' : 'ficha');
  const [done, setDone] = useState<{ memberId: string; failed: string[] } | null>(null);
  const [sending, setSending] = useState(false);
  // Prévia da diretoria (botão "Ver a página" nas configurações): mostra a ficha e não envia nada
  const preview = new URLSearchParams(location.search).has('previa') && t.can('sociedade', 'editar');

  useEffect(() => {
    if (session.user?.email && !v.email) setV(x => ({ ...x, email: session.user!.email, fullName: x.fullName || session.user!.displayName || '' }));
  }, [session.user, v.email]);

  if (session.loading) return <Loading />;
  // Sem login: a pessoa escolhe entre a conta Google e a ficha simples com CPF e senha (sem e-mail nem Google)
  const noGoogle = new URLSearchParams(location.search).has('sem-google');
  const cpfOn = t.tenant.loginMethods?.cpfPassword !== false;
  if ((!session.user && !demo) || (preview && noGoogle)) {
    if (!cpfOn) return <Navigate to={t.to(`entrar?volta=${encodeURIComponent(location.pathname)}`)} replace />;
    return (
      <ChooseHow
        noGoogle={noGoogle}
        preview={preview}
        loginTo={t.to(`entrar?volta=${encodeURIComponent(location.pathname)}`)}
        simpleTo={`${location.pathname}?sem-google=1${preview ? '&previa=1' : ''}`}
      />
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0">
          <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-6 h-6" />
        </span>
        <div>
          <div className="text-xs text-muted">{t.tenant.name}</div>
          <h1 className="text-xl font-bold">Quero ser {t.labels.member.toLowerCase()}</h1>
        </div>
      </header>
      {preview && <Notice tone="warn">Prévia da diretoria: é assim que a pessoa vê. Nada é enviado daqui.</Notice>}
      {children}
    </div>
  );

  if (done || (t.member && !preview)) {
    const me = t.member;
    const pending = !me || me.status === 'pendente';
    const memberId = done?.memberId || me?.id || '';
    const noPhoto = s?.requirePhoto !== false && (done ? done.failed.includes('foto') : me && !me.photoPath);
    return shell(
      <Card className="text-center space-y-3 py-8">
        {pending ? <Clock className="w-12 h-12 mx-auto text-info" aria-hidden /> : <CheckCircle2 className="w-12 h-12 mx-auto text-ok" aria-hidden />}
        <h2 className="text-lg font-bold">{pending ? 'Cadastro em análise' : 'Você já tem cadastro'}</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          {pending
            ? `Recebemos a sua proposta. A ${t.labels.board.toLowerCase()} vai analisar e você recebe um aviso quando for aprovada. Se precisar de algum ajuste, ele aparece no portal.`
            : 'Acesse o portal para ver a sua situação e a carteirinha.'}
        </p>
        {done && done.failed.filter(x => x !== 'foto').length > 0 && (
          <Notice tone="warn">Não deu para enviar agora: {done.failed.filter(x => x !== 'foto').join(', ')}. Envie pelo portal em Dependentes ou mande para a {t.labels.board.toLowerCase()}.</Notice>
        )}
        {noPhoto && memberId && (
          <div className="text-left space-y-2 max-w-md mx-auto">
            <Notice tone="warn">Falta a sua foto para a carteirinha. Envie agora:</Notice>
            <PhotoUpload memberId={memberId} hasPhoto={false} />
          </div>
        )}
        <Link to={t.to('inicio')}>
          <Button>Ir para o portal</Button>
        </Link>
      </Card>
    );
  }

  if (opts.error) return shell(<ErrorState text={opts.error} />);
  if (!s) return shell(<Loading label="Carregando as categorias..." />);

  if (join && step === 'pagamento' && s.joinPayment?.enabled) {
    return shell(
      <PaymentStep
        s={s}
        categories={categories}
        categoryId={v.categoryId}
        setCategoryId={id => setV(x => ({ ...x, categoryId: id }))}
        proof={proof}
        setProof={setProof}
        onNext={() => {
          setStep('ficha');
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const holderCat = s.categories.find(c => c.id === v.categoryId);
  const depsAllowed = !!holderCat?.allowsDependents;
  const depCategory = s.categories.find(c => c.id === 'dependente')?.id || v.categoryId;
  const needPhoto = s.requirePhoto !== false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return toast.show('Prévia da diretoria: nada foi enviado.', 'info');
    const errs = {
      ...validateMemberForm(v, s.customFields || [], { requireConsent: true, tz: t.tenant.timezone }),
      ...(depsAllowed ? validateDependents(deps, t.tenant.timezone, { requirePhoto: needPhoto }) : {}),
      ...(needPhoto && !photo ? { photo: 'A foto é obrigatória: ela vai na carteirinha.' } : {}),
      ...(join && s.joinPayment?.enabled && s.joinPayment.requireProof && !proof ? { proof: 'Anexe o comprovante do Pix.' } : {}),
    };
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector('.text-bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const sentDeps = depsAllowed ? deps : [];
    const dependents = dependentsPayload(sentDeps, { categoryId: depCategory, holderName: v.fullName, holderEmail: v.email.trim() || undefined, holderPhone: v.phone.trim() || undefined, tz: t.tenant.timezone });
    const r = await run<{ memberId: string; dependentIds?: string[] }>('members.apply', { tenantId: t.tenantId, ...toPayload(v, t.tenant.timezone), dependents });
    if (!r) return;
    // Arquivos depois do cadastro criado (as regras só deixam o dono enviar)
    setSending(true);
    const failed: string[] = [];
    const call = (op: string, input: object) => client.call(op, input);
    if (photo) await sendPickedPhoto(client, call, t.tenantId, r.memberId, photo).catch(() => failed.push('foto'));
    for (const [i, id] of (r.dependentIds || []).entries()) {
      const b = sentDeps[i]?.photo;
      if (b) await sendPickedPhoto(client, call, t.tenantId, id, b).catch(() => failed.push(`foto de ${sentDeps[i].fullName.split(' ')[0]}`));
    }
    if (proof) await sendProof(client, t.tenantId, r.memberId, proof).catch(() => failed.push('comprovante do Pix'));
    setSending(false);
    if (failed.length) toast.show(`Cadastro enviado, mas faltou: ${failed.join(', ')}.`, 'erro');
    setDone({ memberId: r.memberId, failed });
  };

  const amount = join && s.joinPayment?.enabled ? joinAmountCents({ joinPayment: s.joinPayment, categories: s.categories }, v.categoryId) : 0;

  return shell(
    <form onSubmit={submit} className="space-y-4" noValidate>
      {join && s.joinPayment?.enabled && (
        <Card className="flex flex-wrap items-center gap-3 p-3!">
          <FileCheck2 className={proof ? 'w-5 h-5 text-ok' : 'w-5 h-5 text-warn'} aria-hidden />
          <div className="text-sm flex-1 min-w-40">
            <div className="font-semibold">1. Pagamento da adesão {amount > 0 && `(${formatBRL(amount)})`}</div>
            <div className="text-xs text-muted">{proof ? `Comprovante anexado: ${proof.name}` : 'Comprovante ainda não anexado.'}</div>
            {errors.proof && <div className="text-xs text-bad">{errors.proof}</div>}
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setStep('pagamento')}>
            {proof ? 'Ver' : 'Anexar'}
          </Button>
        </Card>
      )}
      {join && s.joinPayment?.enabled && <div className="text-sm font-semibold">2. Ficha de cadastro</div>}
      <Notice>Preencha com cuidado. Seus dados ficam protegidos e só a {t.labels.board.toLowerCase()} autorizada tem acesso. O CPF é guardado com criptografia.</Notice>
      <Card>
        <PhotoPick value={photo} onChange={setPhoto} error={errors.photo} label="Sua foto para a carteirinha" required={needPhoto} />
      </Card>
      <MemberForm
        value={v}
        onChange={setV}
        categories={categories}
        customFields={s.customFields || []}
        errors={errors}
        tz={t.tenant.timezone}
        tenantName={t.tenant.name}
        selfService
        emailLocked={!!session.user?.email}
        memberLabel={t.labels.member}
      />
      {holderCat && <DependentsBlock value={deps} onChange={setDeps} errors={errors} allowed={depsAllowed} categoryName={holderCat.name} requirePhoto={needPhoto} />}
      {Object.keys(errors).length > 0 && <Notice tone="bad">Confira os campos destacados.</Notice>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy || sending}>
          {sending ? 'Enviando fotos...' : 'Enviar proposta'}
        </Button>
      </div>
    </form>
  );
}

/** Passo 1 do link de adesão: valores, chave Pix (com copia e cola no valor) e comprovante */
function PaymentStep({
  s,
  categories,
  categoryId,
  setCategoryId,
  proof,
  setProof,
  onNext,
}: {
  s: FormOptions;
  categories: MemberCategory[];
  categoryId: string;
  setCategoryId: (id: string) => void;
  proof: { blob: Blob; type: 'image/jpeg' | 'application/pdf'; name: string } | null;
  setProof: (p: { blob: Blob; type: 'image/jpeg' | 'application/pdf'; name: string } | null) => void;
  onNext: () => void;
}) {
  const t = useTenant();
  const toast = useToast();
  const jp = s.joinPayment!;
  const cat = categories.find(c => c.id === categoryId);
  const amount = joinAmountCents({ joinPayment: jp, categories: s.categories }, categoryId);
  const [problem, setProblem] = useState('');
  const [qr, setQr] = useState('');
  const pix = useMemo(
    () => (s.pixKey && amount > 0 ? buildPixPayload({ key: s.pixKey, name: t.tenant.name, city: s.pixCity || 'BRASIL', amountCents: amount, txid: 'ADESAO' }) : ''),
    [s.pixKey, s.pixCity, amount, t.tenant.name]
  );
  useEffect(() => {
    if (!pix) return setQr('');
    QRCode.toDataURL(pix, { width: 360, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [pix]);
  const copy = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(ok, 'sucesso');
    } catch {
      toast.show('Não foi possível copiar. Segure o texto e copie à mão.', 'erro');
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setProblem('');
    try {
      const p = await prepareProof(f);
      setProof({ ...p, name: f.name });
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  const canGo = !!categoryId && (!jp.requireProof || !!proof);
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">1. Pagamento da adesão</h2>
          <p className="text-sm text-muted">Escolha a categoria, pague pelo Pix e anexe o comprovante. Depois vem a ficha de cadastro.</p>
        </div>
        <Field label="Categoria">
          {id => (
            <Select id={id} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Escolha</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.period === 'isento' ? ' (isento)' : ` · ${formatBRL(c.feeCents)} ${PERIOD_TEXT[c.period]}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="rounded-xl border border-line divide-y divide-line text-sm">
          {jp.feeCents > 0 && (
            <div className="flex justify-between gap-3 px-3 py-2">
              <span>{jp.feeLabel}</span>
              <span className="tabular-nums">{formatBRL(jp.feeCents)}</span>
            </div>
          )}
          {jp.includeCategoryFee && cat && cat.period !== 'isento' && (
            <div className="flex justify-between gap-3 px-3 py-2">
              <span>
                {cat.period === 'anual' ? 'Anuidade' : 'Primeira mensalidade'} ({cat.name})
              </span>
              <span className="tabular-nums">{formatBRL(cat.feeCents)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 px-3 py-2 font-bold">
            <span>Total para pagar agora</span>
            <span className="tabular-nums">{categoryId ? formatBRL(amount) : 'escolha a categoria'}</span>
          </div>
        </div>
        {jp.note && <p className="text-sm text-muted whitespace-pre-line">{jp.note}</p>}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold text-sm">Pix</h3>
        {s.pixKey ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-40">
                <div className="text-xs text-muted">Chave Pix da {t.tenant.shortName || t.tenant.name}</div>
                <div className="font-mono text-sm break-all">{s.pixKey}</div>
              </div>
              <Button type="button" size="sm" variant="secondary" icon={<Copy className="w-4 h-4" />} onClick={() => copy(s.pixKey!, 'Chave Pix copiada.')}>
                Copiar chave
              </Button>
            </div>
            {pix && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line">
                {qr && <img src={qr} alt="QR Code do Pix" className="w-32 h-32 rounded-lg bg-white p-1" />}
                <div className="space-y-2 flex-1 min-w-40">
                  <p className="text-xs text-muted">Pix copia e cola já com o valor de {formatBRL(amount)}. No celular, copie e cole no app do banco; no computador, aponte a câmera para o QR.</p>
                  <Button type="button" size="sm" icon={<Copy className="w-4 h-4" />} onClick={() => copy(pix, 'Pix copia e cola copiado.')}>
                    Copiar Pix copia e cola
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <Notice tone="warn">A {t.labels.board.toLowerCase()} ainda não cadastrou a chave Pix. Combine o pagamento com ela e anexe o comprovante.</Notice>
        )}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold text-sm">
          Comprovante do Pix{jp.requireProof && <span className="text-bad"> *</span>}
        </h3>
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer bg-brand text-on-brand">
          <Paperclip className="w-4 h-4" aria-hidden />
          {proof ? 'Trocar comprovante' : 'Anexar comprovante'}
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-muted">Print da tela do banco ou PDF do comprovante (até 10 MB).</p>
        {proof && (
          <p className="text-sm text-ok flex items-center gap-2">
            <FileCheck2 className="w-4 h-4" aria-hidden /> {proof.name}
          </p>
        )}
        {problem && <p className="text-xs text-bad">{problem}</p>}
      </Card>

      <div className="flex flex-wrap justify-end items-center gap-3">
        {!canGo && <span className="text-xs text-muted">{!categoryId ? 'Escolha a categoria.' : 'Anexe o comprovante para continuar.'}</span>}
        <Button size="lg" disabled={!canGo} onClick={onNext}>
          Continuar para a ficha
        </Button>
      </div>
    </div>
  );
}

/** Como fazer o cadastro: conta Google ou ficha simples com CPF e senha (botões grandes, uma decisão só) */
function ChooseHow({ noGoogle, preview, loginTo, simpleTo }: { noGoogle: boolean; preview: boolean; loginTo: string; simpleTo: string }) {
  const t = useTenant();
  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0">
          <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-7 h-7" />
        </span>
        <div>
          <div className="text-sm text-muted">{t.tenant.name}</div>
          <h1 className="text-2xl font-bold">Quero ser {t.labels.member.toLowerCase()}</h1>
        </div>
      </header>
      {preview && <Notice tone="warn">Prévia da diretoria: é assim que a pessoa vê. Nada é enviado daqui.</Notice>}
      {noGoogle ? (
        <SimpleApply preview={preview} />
      ) : (
        <div className="space-y-3">
          <p className="text-base">Como você prefere fazer o cadastro?</p>
          <Link to={simpleTo} className="block">
            <Card className="p-5! border-2 border-accent/60 hover:border-accent">
              <div className="text-lg font-bold">Não tenho conta Google</div>
              <p className="text-sm text-muted mt-1">Preencho uma ficha curta e crio uma senha. Depois entro com o meu CPF e a senha. O mais simples.</p>
            </Card>
          </Link>
          <Link to={loginTo} className="block">
            <Card className="p-5! hover:border-muted">
              <div className="text-lg font-bold">Tenho conta Google (Gmail)</div>
              <p className="text-sm text-muted mt-1">Entro com a conta Google e preencho a ficha completa.</p>
            </Card>
          </Link>
          <p className="text-sm text-muted">
            Já é {t.labels.member.toLowerCase()} e recebeu um código da {t.labels.board.toLowerCase()}?{' '}
            <Link to={t.to('primeiro-acesso')} className="text-accent underline">Criar a minha senha</Link>
          </p>
        </div>
      )}
    </div>
  );
}
