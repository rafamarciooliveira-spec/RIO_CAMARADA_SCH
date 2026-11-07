/**
 * Demonstração "Ver sistema" (/ver-sistema). Segurança:
 * - roda 100% no navegador, sobre um banco em memória criado na hora com dados FICTÍCIOS;
 * - não importa o SDK do Firebase nem a configuração do projeto, não faz chamada de rede,
 *   não tem login, senha ou token real (teste automático em tests/demo-isolation.test.ts);
 * - as telas são as mesmas do sistema; as operações também (mesmas regras de permissão).
 * Recarregar a página recomeça do zero.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FlaskConical, RotateCcw, X } from 'lucide-react';
import { createMemoryBackend, createMemoryClient, type MemoryBackend } from '../../data/memoryClient.ts';
import type { DataClient, SessionApi, SessionUser } from '../../data/client.ts';
import { DataProvider } from '../../app/DataContext.tsx';
import PortalApp from '../../app/PortalApp.tsx';
import { buildDemoData, type DemoSeedResult } from '../../shared/seed/demoData.ts';
import { BRAND } from '../../brand.ts';
import { Loading, cx } from '../../ui/index.tsx';

type Persona = 'diretoria' | 'socio';

interface DemoState {
  backend: MemoryBackend;
  client: DataClient;
  seed: DemoSeedResult;
}

async function boot(): Promise<DemoState> {
  const backend = createMemoryBackend(`${window.location.origin}${BRAND.demoPath}`);
  const seed = await buildDemoData(backend.env, { files: backend.files });
  return { backend, client: createMemoryClient(backend), seed };
}

function toSessionUser(a: DemoSeedResult['personas']['socio']): SessionUser {
  return { uid: a.uid, email: a.email, displayName: a.displayName, emailVerified: true, master: false, mfa: false };
}

function DemoBar({ persona, onPersona, onReset }: { persona: Persona; onPersona: (p: Persona) => void; onReset: () => void }) {
  // O cabeçalho do portal gruda logo abaixo desta faixa (senão some atrás dela ao rolar)
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const put = () => document.documentElement.style.setProperty('--app-top', `${el.offsetHeight}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--app-top');
    };
  }, []);
  return (
    <div ref={bar} role="region" aria-label="Demonstração" className="sticky top-0 z-[45] bg-accent text-black">
      <div className="max-w-7xl mx-auto px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <FlaskConical className="w-4 h-4 shrink-0" aria-hidden />
        <strong className="mr-1">Demonstração com dados fictícios</strong>
        <span className="hidden md:inline opacity-80">Nada aqui é real e nada é gravado.</span>
        <div className="flex-1" />
        <div className="flex rounded-lg overflow-hidden border border-black/30" role="group" aria-label="Escolher visão">
          {(['socio', 'diretoria'] as Persona[]).map(p => (
            <button key={p} onClick={() => onPersona(p)} aria-pressed={persona === p} className={cx('px-3 py-1 font-semibold cursor-pointer', persona === p ? 'bg-black text-accent' : 'hover:bg-black/10')}>
              {p === 'socio' ? 'Visão do sócio' : 'Visão da diretoria'}
            </button>
          ))}
        </div>
        <button onClick={onReset} className="p-1.5 rounded-lg hover:bg-black/10 cursor-pointer" aria-label="Recomeçar a demonstração" title="Recomeçar">
          <RotateCcw className="w-4 h-4" />
        </button>
        <Link to="/" className="p-1.5 rounded-lg hover:bg-black/10" aria-label="Sair da demonstração" title="Sair">
          <X className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export default function DemoApp() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState('');
  const [persona, setPersona] = useState<Persona>(params.get('visao') === 'diretoria' ? 'diretoria' : 'socio');
  const [gen, setGen] = useState(0);

  useEffect(() => {
    let alive = true;
    setState(null);
    boot()
      .then(s => alive && setState(s))
      .catch(e => alive && setError(String((e as Error).message || e)));
    return () => {
      alive = false;
    };
  }, [gen]);

  const actor = state ? (persona === 'diretoria' ? state.seed.personas.diretoria : state.seed.personas.socio) : null;
  useEffect(() => {
    if (state && actor) state.backend.setActor(actor);
  }, [state, actor]);

  const session: SessionApi = useMemo(
    () => ({
      user: actor ? toSessionUser(actor) : null,
      loading: !actor,
      async signInGoogle() {},
      async sendMagicLink() {},
      async signOut() {
        navigate('/');
      },
      async refreshClaims() {},
    }),
    [actor, navigate]
  );

  if (error) return <div className="p-6 text-sm">Não foi possível montar a demonstração: {error}</div>;
  if (!state || !actor) return <Loading label="Montando a sociedade de exemplo..." />;

  const home = `${BRAND.demoPath}/${state.seed.slug}/${persona === 'diretoria' ? 'gestao' : 'inicio'}`;
  const switchPersona = (p: Persona) => {
    setPersona(p);
    navigate(`${BRAND.demoPath}/${state.seed.slug}/${p === 'diretoria' ? 'gestao' : 'inicio'}`);
  };
  const atRoot = location.pathname.replace(/\/+$/, '') === BRAND.demoPath;

  return (
    <DataProvider
      key={`${gen}-${persona}`}
      value={{
        client: state.client,
        session,
        basePath: BRAND.demoPath,
        demo: { persona, setPersona: switchPersona, reset: () => setGen(g => g + 1) },
      }}
    >
      <DemoBar persona={persona} onPersona={switchPersona} onReset={() => setGen(g => g + 1)} />
      {atRoot ? (
        <Navigate to={home} replace />
      ) : (
        <Routes>
          <Route path="*" element={<PortalApp />} />
        </Routes>
      )}
    </DataProvider>
  );
}
