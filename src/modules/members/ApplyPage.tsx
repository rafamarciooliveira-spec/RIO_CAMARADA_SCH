/** Proposta online de sócio (/{slug}/cadastro). Exige login; depois mostra "em análise". */
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { useData, useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { Button, Card, ErrorState, Loading, Notice } from '../../ui/index.tsx';
import { useFormOptions } from './useFormOptions.ts';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { emptyMemberForm, MemberForm, toPayload, validateMemberForm, type MemberFormValue } from './components/MemberForm.tsx';
import { DependentsBlock, dependentsPayload, validateDependents, type DependentValue } from './components/DependentsBlock.tsx';

export default function ApplyPage() {
  const t = useTenant();
  const session = useSession();
  const { demo } = useData();
  const location = useLocation();
  const { run, busy } = useOp();
  // Quem ainda não é membro não lê as configurações: categorias e campos vêm de members.formOptions
  const opts = useFormOptions(!!session.user || !!demo);
  const s = opts.data;
  const categories = (s?.categories || []).filter(c => c.id !== 'dependente');
  const [v, setV] = useState<MemberFormValue>(() => emptyMemberForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deps, setDeps] = useState<DependentValue[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (session.user?.email && !v.email) setV(x => ({ ...x, email: session.user!.email, fullName: x.fullName || session.user!.displayName || '' }));
  }, [session.user, v.email]);

  if (session.loading) return <Loading />;
  if (!session.user && !demo) return <Navigate to={t.to(`entrar?volta=${encodeURIComponent(location.pathname)}`)} replace />;

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
      {children}
    </div>
  );

  if (done || t.member) {
    const pending = !t.member || t.member.status === 'pendente';
    return shell(
      <Card className="text-center space-y-3 py-8">
        {pending ? <Clock className="w-12 h-12 mx-auto text-info" aria-hidden /> : <CheckCircle2 className="w-12 h-12 mx-auto text-ok" aria-hidden />}
        <h2 className="text-lg font-bold">{pending ? 'Cadastro em análise' : 'Você já tem cadastro'}</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          {pending
            ? `Recebemos a sua proposta. A ${t.labels.board.toLowerCase()} vai analisar e você recebe um aviso quando for aprovada. Se precisar de algum ajuste, ele aparece no portal.`
            : 'Acesse o portal para ver a sua situação e a carteirinha.'}
        </p>
        <Link to={t.to('inicio')}>
          <Button>Ir para o portal</Button>
        </Link>
      </Card>
    );
  }

  if (opts.error) return shell(<ErrorState text={opts.error} />);
  if (!s) return shell(<Loading label="Carregando as categorias..." />);

  const holderCat = s.categories.find(c => c.id === v.categoryId);
  const depsAllowed = !!holderCat?.allowsDependents;
  const depCategory = s.categories.find(c => c.id === 'dependente')?.id || v.categoryId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = { ...validateMemberForm(v, s.customFields || [], { requireConsent: true, tz: t.tenant.timezone }), ...(depsAllowed ? validateDependents(deps, t.tenant.timezone) : {}) };
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.querySelector('[class*="text-bad"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const dependents = depsAllowed
      ? dependentsPayload(deps, { categoryId: depCategory, holderName: v.fullName, holderEmail: v.email.trim() || undefined, holderPhone: v.phone.trim() || undefined, tz: t.tenant.timezone })
      : [];
    const r = await run('members.apply', { tenantId: t.tenantId, ...toPayload(v, t.tenant.timezone), dependents });
    if (r) setDone(true);
  };

  return shell(
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Notice>Preencha com cuidado. Seus dados ficam protegidos e só a {t.labels.board.toLowerCase()} autorizada tem acesso. O CPF é guardado com criptografia.</Notice>
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
      {holderCat && <DependentsBlock value={deps} onChange={setDeps} errors={errors} allowed={depsAllowed} categoryName={holderCat.name} />}
      {Object.keys(errors).length > 0 && <Notice tone="bad">Confira os campos destacados.</Notice>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={busy}>
          Enviar proposta
        </Button>
      </div>
    </form>
  );
}
