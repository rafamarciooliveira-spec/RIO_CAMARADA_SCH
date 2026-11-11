/**
 * Entrada no portal. Primeiro a pessoa escolhe, com uma pergunta clara, como quer entrar (tenho senha, recebi um
 * código, conta Google, quero me cadastrar); só depois aparece o formulário daquele jeito. Assim quem usa a conta
 * Google não vê pedido de CPF e senha, e quem tem mais idade não precisa entender tudo de uma vez.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { useData, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { Button, Card, Field, Input, Notice } from '../../ui/index.tsx';
import { RememberMe } from '../../ui/RememberMe.tsx';
import { useGoogleSignIn } from './useGoogleSignIn.ts';
import { CpfLoginForm } from './CpfLogin.tsx';

export default function LoginPage() {
  const t = useTenant();
  const session = useSession();
  const { demo } = useData();
  const [params] = useSearchParams();
  const back = params.get('volta') || t.to('inicio');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const g = useGoogleSignIn();
  const [error, setError] = useState('');
  const [how, setHow] = useState<null | 'senha' | 'email'>(() => (params.get('modo') === 'senha' ? 'senha' : null));

  useEffect(() => setError(''), [email]);

  if (session.user || demo) return <Navigate to={back.startsWith('/') ? back : t.to('inicio')} replace />;

  const link = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await session.sendMagicLink(email.trim().toLowerCase(), back);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      setError(code.includes('operation-not-allowed') ? 'O acesso por link no e-mail ainda não está ativo. Use a Conta Google.' : 'Não foi possível enviar o link agora.');
    } finally {
      setBusy(false);
    }
  };

  const target = back.startsWith('/') ? back : t.to('inicio');
  const cpfOn = t.tenant.loginMethods?.cpfPassword !== false;
  const emailOn = t.tenant.loginMethods?.emailLink !== false;
  const board = t.labels.board.toLowerCase();
  const member = t.labels.member.toLowerCase();

  /** Um caminho por cartão: uma pergunta clara, uma resposta grande */
  const Choice = ({ title, text, onClick, to, strong }: { title: string; text: string; onClick?: () => void; to?: string; strong?: boolean }) => {
    const body = (
      <span className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left w-full ${strong ? 'border-accent/70 hover:border-accent' : 'border-line hover:border-muted'}`}>
        <span className="flex-1">
          <span className="block text-lg font-bold">{title}</span>
          <span className="block text-sm text-muted mt-0.5">{text}</span>
        </span>
        <ChevronRight className="w-6 h-6 text-muted shrink-0" aria-hidden />
      </span>
    );
    return to ? (
      <Link to={to} className="block">
        {body}
      </Link>
    ) : (
      <button type="button" onClick={onClick} disabled={g.busy} className="block w-full cursor-pointer disabled:opacity-60">
        {body}
      </button>
    );
  };

  const BackLink = () => (
    <button type="button" onClick={() => { setHow(null); setError(''); }} className="flex items-center gap-1 text-sm text-accent underline cursor-pointer">
      <ChevronLeft className="w-4 h-4" aria-hidden /> Voltar e escolher outro jeito
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-brand text-on-brand mx-auto flex items-center justify-center">
            <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold">{t.tenant.name}</h1>
          <p className="text-base text-muted">
            {how === 'senha' ? 'Entrar com CPF e senha' : how === 'email' ? 'Receber um link no e-mail' : `Entre para ver sua ${t.labels.card.toLowerCase()} e o portal.`}
          </p>
        </div>
        {(error || g.error) && <Notice tone="bad">{error || g.error}</Notice>}
        {g.slow && <Notice tone="warn">{g.slowText}</Notice>}

        {how === null && (
          <div className="space-y-4">
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Já sou {member}</h2>
              {cpfOn && <Choice strong title="Tenho senha" text="Entro com o meu CPF e a senha que eu criei." onClick={() => setHow('senha')} />}
              {cpfOn && <Choice title={`Recebi um código da ${board}`} text="É o meu primeiro acesso (ou esqueci a senha). Uso o telefone e o código." to={t.to('primeiro-acesso')} />}
              <Choice title="Uso a conta Google (Gmail)" text="Entro com a conta Google, sem senha nova." onClick={g.start} />
              {emailOn && (
                <button type="button" onClick={() => setHow('email')} className="text-sm text-accent underline cursor-pointer">
                  Prefiro receber um link no e-mail
                </button>
              )}
            </section>
            <section className="space-y-3 pt-2 border-t border-line">
              <h2 className="text-base font-semibold pt-3">Ainda não sou {member}</h2>
              <Choice title="Quero me cadastrar" text="Preencho a ficha e a diretoria confere." to={t.to('cadastro')} />
            </section>
            <RememberMe />
          </div>
        )}

        {how === 'senha' && (
          <div className="space-y-4">
            <CpfLoginForm back={target} />
            <RememberMe />
            <BackLink />
          </div>
        )}

        {how === 'email' && (
          <div className="space-y-4">
            {sentTo ? (
              <div className="space-y-2">
                <Notice tone="ok">
                  Pedimos o envio do link para <strong>{sentTo}</strong>. Abra o e-mail neste aparelho e toque no link. Ele vale por pouco tempo e é de uso único.
                </Notice>
                {/* O e-mail sai do serviço de login (remetente noreply@...firebaseapp.com) e muitas vezes cai no spam */}
                <p className="text-xs text-muted">
                  Não chegou em 2 minutos? Procure em <strong>Spam</strong>, <strong>Promoções</strong> ou <strong>Lixeira</strong>: o remetente termina em <strong>firebaseapp.com</strong>. Marque como "não é spam" para os próximos chegarem certo.
                </p>
                {/@(gmail|googlemail)\.com$/i.test(sentTo) && (
                  <p className="text-xs">
                    Este e-mail é do Gmail: é mais rápido voltar e tocar em <strong>Uso a conta Google</strong>, sem esperar e-mail.
                  </p>
                )}
                <button type="button" className="text-xs text-accent underline cursor-pointer" onClick={() => setSentTo('')}>
                  Mandar de novo ou usar outro e-mail
                </button>
              </div>
            ) : (
              <form onSubmit={link} className="space-y-3">
                <Field label="Seu e-mail">
                  {id => <Input id={id} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu.email@exemplo.com" />}
                </Field>
                <Button type="submit" className="w-full" loading={busy} icon={<Mail className="w-4 h-4" />}>
                  Enviar link de acesso
                </Button>
              </form>
            )}
            <BackLink />
          </div>
        )}
      </Card>
    </div>
  );
}
