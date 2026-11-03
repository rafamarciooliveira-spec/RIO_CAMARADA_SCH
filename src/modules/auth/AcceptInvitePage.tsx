/** Aceite de convite: exige login com o mesmo e-mail do convite (verificado). */
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useOp, useSession } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { Button, Card, Loading, Notice } from '../../ui/index.tsx';

export default function AcceptInvitePage() {
  const t = useTenant();
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { run, busy } = useOp();
  const [done, setDone] = useState(false);
  const inviteId = params.get('i') || '';
  const token = params.get('t') || '';

  if (session.loading) return <Loading />;
  if (!inviteId || !token) return <div className="max-w-md mx-auto p-6"><Notice tone="bad">Link de convite incompleto.</Notice></div>;
  if (!session.user) {
    const back = `${t.to('convite')}?i=${encodeURIComponent(inviteId)}&t=${encodeURIComponent(token)}`;
    return <Navigate to={`${t.to('entrar')}?volta=${encodeURIComponent(back)}`} replace />;
  }
  if (done) return <Navigate to={t.to('inicio')} replace />;

  const accept = async () => {
    const r = await run<{ ok: boolean; board: boolean }>('invites.accept', { tenantId: t.tenantId, inviteId, token }, { success: 'Convite aceito. Bem-vindo(a)!' });
    if (r?.ok) {
      setDone(true);
      navigate(t.to(r.board ? 'gestao' : 'inicio'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full space-y-4 p-6">
        <h1 className="text-lg font-bold">Convite para {t.tenant.name}</h1>
        <p className="text-sm text-muted">
          Você está entrando como <strong>{session.user.email}</strong>. O convite só vale para o e-mail para o qual foi enviado.
        </p>
        <div className="flex gap-2">
          <Button loading={busy} onClick={accept}>Aceitar convite</Button>
          <Button variant="secondary" onClick={() => session.signOut()}>Usar outra conta</Button>
        </div>
      </Card>
    </div>
  );
}
