/**
 * /entrar: entrada única da plataforma. Depois do login (Google ou link no e-mail), mostra
 * todos os lugares em que a pessoa tem acesso com a MESMA conta: painel da plataforma (master),
 * sociedades onde é da diretoria e sociedades onde é sócia. Com um só lugar, entra direto.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, KeyRound, LayoutDashboard, LogOut, Mail } from 'lucide-react';
import { useData, useDoc, useSession } from '../../app/DataContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MembershipDoc, UserDoc } from '../../shared/types.ts';
import { BRAND } from '../../brand.ts';
import { Badge, Button, Card, Field, Input, Loading, Notice } from '../../ui/index.tsx';
import { errorMessage } from '../../data/client.ts';

interface Place {
  key: string;
  to: string;
  title: string;
  subtitle: string;
  kind: 'master' | 'federacao' | 'diretoria' | 'socio';
}

function LoginBox() {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Card className="w-full max-w-sm space-y-4 p-6">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold">Entrar no {BRAND.name}</h1>
        <p className="text-sm text-muted">Use a mesma conta em todas as sociedades de que você participa.</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <Button
        className="w-full"
        variant="secondary"
        loading={busy}
        onClick={async () => {
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
        }}
      >
        Continuar com a Conta Google
      </Button>
      <div className="text-center text-xs text-muted">ou receba um link no e-mail</div>
      {sent ? (
        <Notice tone="ok">Enviamos um link para <strong>{sent}</strong>. Abra o e-mail neste aparelho e toque no link.</Notice>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async ev => {
            ev.preventDefault();
            setBusy(true);
            try {
              await session.sendMagicLink(email.trim().toLowerCase(), '/entrar');
              setSent(email.trim().toLowerCase());
            } catch {
              setError('Não foi possível enviar o link agora. Use a Conta Google ou tente de novo.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Seu e-mail">{id => <Input id={id} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
          <Button type="submit" className="w-full" loading={busy} icon={<Mail className="w-4 h-4" />}>Enviar link de acesso</Button>
        </form>
      )}
      <p className="text-center text-xs text-muted">
        Quer conhecer antes? <Link className="text-accent" to={BRAND.demoPath}>Ver o sistema com dados fictícios</Link>
      </p>
    </Card>
  );
}

function usePlaces(uid: string | undefined, isMaster: boolean) {
  const { client } = useData();
  const user = useDoc<UserDoc>(uid ? P.user(uid) : null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const tenants = useMemo(() => Object.entries(user.data?.tenants || {}), [user.data]);
  useEffect(() => {
    if (!uid || user.loading) return;
    let alive = true;
    (async () => {
      const out: Place[] = [];
      if (isMaster) out.push({ key: 'master', to: '/master', title: 'Painel da plataforma', subtitle: 'Criar sociedades, planos e acessos', kind: 'master' });
      const feds = await client.call<{ id: string; name: string; slug: string }[]>('federation.mine', {}).catch(() => []);
      for (const f of feds) out.push({ key: `fed_${f.id}`, to: `/federacao/${f.slug}`, title: f.name, subtitle: 'Diretoria da federação: números das filiais', kind: 'federacao' });
      for (const [tenantId, info] of tenants) {
        const m = await client.get<MembershipDoc>(P.membership(tenantId, uid)).catch(() => null);
        if (!m || !m.active || (m.expiresAtMs && m.expiresAtMs < Date.now())) continue;
        const board = !!m.board && !m.support;
        out.push({
          key: tenantId,
          to: `/${info.slug}/${board ? 'gestao' : 'inicio'}`,
          title: info.name,
          subtitle: m.support ? 'Acesso temporário de suporte' : board ? 'Diretoria (e também a sua área de sócio)' : 'Área do sócio',
          kind: board ? 'diretoria' : 'socio',
        });
      }
      if (alive) setPlaces(out);
    })();
    return () => {
      alive = false;
    };
  }, [client, uid, isMaster, tenants, user.loading]);
  return places;
}

export default function ChooseAccessPage() {
  const session = useSession();
  const places = usePlaces(session.user?.uid, !!session.user?.master);
  if (session.loading) return <Loading />;
  if (!session.user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <LoginBox />
      </div>
    );
  }
  if (!places) return <Loading label="Procurando os seus acessos..." />;
  if (places.length === 1) return <Navigate to={places[0].to} replace />;
  const icon = (k: Place['kind']) => (k === 'master' || k === 'federacao' ? LayoutDashboard : k === 'diretoria' ? KeyRound : BadgeCheck);
  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Onde você quer entrar?</h1>
            <p className="text-sm text-muted">{session.user.email}</p>
          </div>
          <button onClick={() => session.signOut()} aria-label="Sair" className="p-2 rounded-xl hover:bg-surface-2 cursor-pointer">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        {places.length === 0 ? (
          <Notice>
            Esta conta ainda não tem acesso a nenhuma sociedade. Se você recebeu um convite, abra o link do e-mail. Se quer ser sócio, peça o endereço da sociedade à diretoria.
          </Notice>
        ) : (
          <div className="space-y-2">
            {places.map(p => {
              const Icon = icon(p.kind);
              return (
                <Link key={p.key} to={p.to} className="flex items-center gap-3 p-4 rounded-2xl border border-line bg-surface hover:border-muted transition">
                  <span className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-accent" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{p.title}</span>
                    <span className="block text-xs text-muted">{p.subtitle}</span>
                  </span>
                  <Badge tone={p.kind === 'master' || p.kind === 'federacao' ? 'brand' : p.kind === 'diretoria' ? 'info' : 'neutral'}>
                    {p.kind === 'master' ? 'Plataforma' : p.kind === 'federacao' ? 'Federação' : p.kind === 'diretoria' ? 'Diretoria' : 'Sócio'}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-muted" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
