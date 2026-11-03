/** Entrada no portal: Google (sempre) ou link mágico (se a sociedade ativar). Sem senha. */
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useData, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { AssociationLogo } from '../../components/AssociationLogos.tsx';
import { Button, Card, Field, Input, Notice } from '../../ui/index.tsx';
import { errorMessage } from '../../data/client.ts';

export default function LoginPage() {
  const t = useTenant();
  const session = useSession();
  const { demo } = useData();
  const [params] = useSearchParams();
  const back = params.get('volta') || t.to('inicio');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setError(''), [email]);

  if (session.user || demo) return <Navigate to={back.startsWith('/') ? back : t.to('inicio')} replace />;

  const google = async () => {
    setBusy(true);
    setError('');
    try {
      await session.signInGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      setError(code.includes('popup-closed') ? 'A janela do Google foi fechada antes de concluir.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-5 p-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-brand text-on-brand mx-auto flex items-center justify-center">
            <AssociationLogo logoKeyOrUrl={t.tenant.branding.logoUrl} className="w-8 h-8" />
          </div>
          <h1 className="text-lg font-bold">{t.tenant.name}</h1>
          <p className="text-sm text-muted">Entre para ver sua {t.labels.card.toLowerCase()} e o portal.</p>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button className="w-full" variant="secondary" loading={busy} onClick={google}>
          Continuar com a Conta Google
        </Button>
        {t.tenant.loginMethods?.emailLink !== false && (
          <>
            <div className="text-center text-xs text-muted">ou receba um link no e-mail</div>
            {sentTo ? (
              <Notice tone="ok">
                Enviamos um link para <strong>{sentTo}</strong>. Abra o e-mail neste aparelho e toque no link. Ele vale por pouco tempo e é de uso único.
              </Notice>
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
          </>
        )}
        <p className="text-center text-xs text-muted">
          Ainda não é {t.labels.member.toLowerCase()}? <Link className="text-accent" to={t.to('cadastro')}>Faça sua proposta</Link>
        </p>
      </Card>
    </div>
  );
}
