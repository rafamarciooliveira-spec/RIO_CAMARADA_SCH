/**
 * Entrada por CPF e senha, pensada para quem tem mais idade: letras e campos grandes, teclado de números,
 * sem e-mail e sem conta Google. O primeiro acesso usa o telefone (ou o CPF) e o código que a diretoria gera.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useData, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { errorMessage } from '../../data/client.ts';
import { cleanCPF, formatCPF, validateCPF } from '../../shared/cpf.ts';
import { localDateKey } from '../../shared/dates.ts';
import { PhotoPick, sendPickedPhoto } from '../member-area/PhotoPick.tsx';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { Button, Card, Field, Input, Notice, Select } from '../../ui/index.tsx';
import { RememberMe } from '../../ui/RememberMe.tsx';

const big = 'text-lg py-3';

/** Mensagem clara para os erros do login com senha */
function loginError(e: unknown): string {
  const code = (e as { code?: string }).code || '';
  if (code.includes('operation-not-allowed')) return 'A entrada com senha ainda não foi ligada na plataforma. Avise a diretoria (Firebase: Authentication, Métodos de login, E-mail/senha).';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (code.includes('network')) return 'Sem internet agora. Confira a conexão e tente de novo.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'CPF ou senha não conferem. Esqueceu a senha? Peça um código novo à diretoria.';
  return errorMessage(e);
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} className={`${big} pr-12`} value={value} maxLength={64} autoComplete={autoComplete} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Esconder a senha' : 'Mostrar a senha'} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted hover:text-fg cursor-pointer">
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

/** Formulário "Entrar com CPF e senha" (vai dentro da tela de login) */
export function CpfLoginForm({ back }: { back: string }) {
  const t = useTenant();
  const { client } = useData();
  const session = useSession();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cpf.replace(/\D/g, '').length !== 11) return setError('Digite os 11 números do CPF.');
    if (!password) return setError('Digite a sua senha.');
    setBusy(true);
    try {
      const r = await client.call<{ email: string }>('access.login', { cpf, password });
      await session.signInPassword(r.email, password);
      navigate(back, { replace: true });
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="CPF">
        {id => <Input id={id} className={big} inputMode="numeric" autoComplete="username" value={cpf} maxLength={14} placeholder="000.000.000-00" onChange={e => setCpf(formatCPF(e.target.value))} />}
      </Field>
      <Field label="Senha">{id => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="current-password" />}</Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button type="submit" size="lg" className="w-full" loading={busy} icon={<KeyRound className="w-5 h-5" />}>
        Entrar com CPF e senha
      </Button>
      <p className="text-center text-sm">
        <Link to={t.to('primeiro-acesso')} className="text-accent underline">
          Primeiro acesso ou esqueci a senha
        </Link>
      </p>
    </form>
  );
}

interface Needs {
  firstName: string;
  needCpf: boolean;
  needBirthDate: boolean;
  needConsents: boolean;
  needPhoto: boolean;
  customFields: { id: string; label: string; type: string; options: string[] }[];
}

function BigCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-base cursor-pointer">
      <input type="checkbox" className="w-6 h-6 mt-0.5 shrink-0" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/**
 * /{slug}/primeiro-acesso, em dois passos:
 * 1. telefone (ou CPF) + o código que a diretoria mandou;
 * 2. o que falta no cadastro (CPF, nascimento, foto, aceites) e a senha que a pessoa escolhe.
 */
export default function FirstAccessPage() {
  const t = useTenant();
  const { client } = useData();
  const session = useSession();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [needs, setNeeds] = useState<Needs | null>(null);
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [consents, setConsents] = useState({ cadastro: false, imagem: false, comunicacao: true, marketing: false });
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const board = t.labels.board.toLowerCase();
  const today = localDateKey(new Date(), t.tenant.timezone);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (login.replace(/\D/g, '').length < 8) return setError('Digite o seu telefone com DDD (ou o CPF).');
    if (!/^\d{6}$/.test(code)) return setError(`O código tem 6 números. Ele veio da ${board} (WhatsApp ou papel).`);
    setBusy(true);
    try {
      setNeeds(await client.call<Needs>('access.check', { tenantId: t.tenantId, login, code }));
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!needs) return;
    setError('');
    if (needs.needCpf && !validateCPF(cleanCPF(cpf))) return setError('Confira o CPF: os números não batem.');
    if (needs.needBirthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > today)) return setError('Informe a data de nascimento.');
    for (const f of needs.customFields) if (!custom[f.id]?.trim()) return setError(`Preencha o campo "${f.label}".`);
    if (needs.needPhoto && !photo) return setError('A foto é obrigatória: ela vai na carteirinha.');
    if (needs.needConsents && !consents.cadastro) return setError('Marque o aceite dos termos para continuar.');
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 letras ou números.');
    if (password !== again) return setError('As duas senhas estão diferentes. Digite a mesma senha nos dois campos.');
    setBusy(true);
    try {
      const data = {
        ...(needs.needCpf ? { cpf } : {}),
        ...(needs.needBirthDate ? { birthDate } : {}),
        ...(needs.customFields.length ? { custom } : {}),
      };
      const r = await client.call<{ email: string; memberId: string }>('access.redeem', {
        tenantId: t.tenantId,
        login,
        code,
        password,
        data,
        ...(needs.needConsents ? { consents: { ...consents, cadastro: true } } : {}),
      });
      await session.signInPassword(r.email, password);
      if (photo) await sendPickedPhoto(client, (op, input) => client.call(op, input), t.tenantId, r.memberId, photo).catch(() => undefined);
      navigate(t.to('inicio'), { replace: true });
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  };

  let n = 0;
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-brand text-on-brand mx-auto flex items-center justify-center">
            <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold">{needs ? `Olá, ${needs.firstName}!` : 'Primeiro acesso'}</h1>
          <p className="text-base text-muted">
            {needs
              ? needs.needCpf || needs.needBirthDate || needs.needConsents
                ? 'Falta pouco: complete o seu cadastro e crie a sua senha.'
                : 'Agora crie a sua senha.'
              : `Use o código de 6 números que a ${board} da ${t.tenant.shortName || t.tenant.name} mandou para você.`}
          </p>
        </div>
        {!needs ? (
          <form onSubmit={check} className="space-y-4" noValidate>
            <Field label="1. Seu telefone (com DDD)" hint="O mesmo número que a diretoria tem. Também pode digitar o CPF.">
              {id => <Input id={id} className={big} inputMode="tel" autoComplete="tel" value={login} maxLength={20} placeholder="(47) 99999-9999" onChange={e => setLogin(e.target.value.replace(/[^\d()\-\s.+]/g, ''))} />}
            </Field>
            <Field label="2. Código da diretoria (6 números)">
              {id => <Input id={id} className={`${big} tracking-[0.4em] font-mono`} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} placeholder="000000" onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />}
            </Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Continuar
            </Button>
          </form>
        ) : (
          <form onSubmit={finish} className="space-y-4" noValidate>
            {needs.needCpf && (
              <Field label={`${++n}. Seu CPF`} hint="Daqui em diante você entra com o CPF e a senha. O CPF fica guardado com criptografia.">
                {id => <Input id={id} className={big} inputMode="numeric" value={cpf} maxLength={14} placeholder="000.000.000-00" onChange={e => setCpf(formatCPF(e.target.value))} />}
              </Field>
            )}
            {needs.needBirthDate && (
              <Field label={`${++n}. Data de nascimento`}>{id => <Input id={id} className={big} type="date" max={today} value={birthDate} onChange={e => setBirthDate(e.target.value)} />}</Field>
            )}
            {needs.customFields.map(f => (
              <Field key={f.id} label={`${++n}. ${f.label}`}>
                {id =>
                  f.type === 'opcao' ? (
                    <Select id={id} className={big} value={custom[f.id] || ''} onChange={e => setCustom({ ...custom, [f.id]: e.target.value })}>
                      <option value="">Escolha</option>
                      {f.options.map(o => <option key={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input id={id} className={big} type={f.type === 'data' ? 'date' : 'text'} inputMode={f.type === 'numero' ? 'numeric' : undefined} value={custom[f.id] || ''} maxLength={300} onChange={e => setCustom({ ...custom, [f.id]: e.target.value })} />
                  )
                }
              </Field>
            ))}
            {needs.needPhoto && <PhotoPick value={photo} onChange={setPhoto} label={`${++n}. Sua foto para a carteirinha`} required />}
            {needs.needConsents && (
              <div className="space-y-3 rounded-xl border border-line p-3">
                <div className="font-semibold">{++n}. Termos</div>
                <BigCheck checked={consents.cadastro} onChange={x => setConsents(c => ({ ...c, cadastro: x }))}>
                  <strong>Obrigatório.</strong> Li e aceito os termos de associação e a política de privacidade da {t.tenant.name}. Os dados são usados para o cadastro, a carteirinha e as obrigações da associação.
                </BigCheck>
                <p className="text-sm text-muted">Opcionais, você pode mudar depois no seu perfil:</p>
                <BigCheck checked={consents.imagem} onChange={x => setConsents(c => ({ ...c, imagem: x }))}>Uso de imagem em fotos e vídeos de eventos da sociedade.</BigCheck>
                <BigCheck checked={consents.comunicacao} onChange={x => setConsents(c => ({ ...c, comunicacao: x }))}>Receber avisos e comunicados.</BigCheck>
                <BigCheck checked={consents.marketing} onChange={x => setConsents(c => ({ ...c, marketing: x }))}>Receber ofertas de parceiros e patrocinadores.</BigCheck>
              </div>
            )}
            <Field label={`${++n}. Escolha uma senha`} hint="Pelo menos 6 letras ou números, fácil de você lembrar. Não use o CPF nem 123456.">
              {id => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />}
            </Field>
            <Field label={`${++n}. Digite a senha de novo`}>{id => <PasswordInput id={id} value={again} onChange={setAgain} autoComplete="new-password" />}</Field>
            <RememberMe />
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Criar senha e entrar
            </Button>
            <button type="button" className="w-full text-sm text-muted underline cursor-pointer" onClick={() => { setNeeds(null); setError(''); }}>
              Voltar
            </button>
          </form>
        )}
        <p className="text-center text-sm text-muted">
          Já tem senha? <Link to={t.to('entrar')} className="text-accent underline">Entrar com CPF e senha</Link>
        </p>
        <p className="text-center text-xs text-muted">Não tem o código ou ele venceu? Peça um código novo à {board}. Ele vale 3 dias e uma vez só.</p>
      </Card>
    </div>
  );
}
