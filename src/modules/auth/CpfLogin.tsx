/**
 * Entrada por CPF e senha, pensada para quem tem mais idade: letras e campos grandes, teclado de números,
 * sem e-mail e sem conta Google. O primeiro acesso usa o código que a diretoria gera no cadastro do sócio.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useData, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { errorMessage } from '../../data/client.ts';
import { formatCPF } from '../../shared/cpf.ts';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { Button, Card, Field, Input, Notice } from '../../ui/index.tsx';
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

/** /{slug}/primeiro-acesso: CPF + código da diretoria + a senha que a pessoa escolhe */
export default function FirstAccessPage() {
  const t = useTenant();
  const { client } = useData();
  const session = useSession();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (cpf.replace(/\D/g, '').length !== 11) return setError('Digite os 11 números do CPF.');
    if (!/^\d{6}$/.test(code)) return setError('O código tem 6 números. Ele veio da diretoria (WhatsApp ou papel).');
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    if (password !== again) return setError('As duas senhas estão diferentes. Digite a mesma senha nos dois campos.');
    setBusy(true);
    try {
      const r = await client.call<{ email: string }>('access.redeem', { tenantId: t.tenantId, cpf, code, password });
      await session.signInPassword(r.email, password);
      navigate(t.to('inicio'), { replace: true });
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-brand text-on-brand mx-auto flex items-center justify-center">
            <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold">Criar a sua senha</h1>
          <p className="text-base text-muted">Use o código de 6 números que a {t.labels.board.toLowerCase()} da {t.tenant.shortName || t.tenant.name} mandou para você.</p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="1. Seu CPF">
            {id => <Input id={id} className={big} inputMode="numeric" autoComplete="username" value={cpf} maxLength={14} placeholder="000.000.000-00" onChange={e => setCpf(formatCPF(e.target.value))} />}
          </Field>
          <Field label="2. Código da diretoria (6 números)">
            {id => <Input id={id} className={`${big} tracking-[0.4em] font-mono`} inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} placeholder="000000" onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />}
          </Field>
          <Field label="3. Escolha uma senha" hint="Pelo menos 6 letras ou números, fácil de você lembrar. Não use o CPF nem 123456.">
            {id => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" />}
          </Field>
          <Field label="4. Digite a senha de novo">{id => <PasswordInput id={id} value={again} onChange={setAgain} autoComplete="new-password" />}</Field>
          <RememberMe />
          {error && <Notice tone="bad">{error}</Notice>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Criar senha e entrar
          </Button>
        </form>
        <p className="text-center text-sm text-muted">
          Já tem senha? <Link to={t.to('entrar')} className="text-accent underline">Entrar</Link>
        </p>
        <p className="text-center text-xs text-muted">Não tem o código ou ele venceu? Peça um código novo à {t.labels.board.toLowerCase()}. Ele vale 3 dias e uma vez só.</p>
      </Card>
    </div>
  );
}
