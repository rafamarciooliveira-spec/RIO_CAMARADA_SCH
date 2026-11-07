/** Raiz do app real (Firebase). Carregada só fora da landing e da demonstração. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { createFirebaseClient, USE_EMULATORS } from '../data/firebaseClient.ts';
import { completeMagicLink, doSignOut, finishRedirect, refreshClaims, sendMagicLink, signInGoogle, watchSession } from '../data/firebaseSession.ts';
import type { SessionApi, SessionUser } from '../data/client.ts';
import { DataProvider } from './DataContext.tsx';
import PortalApp from './PortalApp.tsx';
import { Loading, Notice } from '../ui/index.tsx';

const MasterApp = lazy(() => import('../modules/master/MasterApp.tsx'));
const ChooseAccessPage = lazy(() => import('../modules/auth/ChooseAccessPage.tsx'));
const FederationApp = lazy(() => import('../modules/federation/FederationApp.tsx'));

/** Avisa quando uma versão nova foi publicada (o app instalado fica aberto por dias) */
function useNewVersion(): boolean {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || USE_EMULATORS) return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5 * 60_000) return;
      last = Date.now();
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        const v = (await r.json()) as { build?: string };
        if (v.build && v.build !== __BUILD_ID__) setFresh(true);
      } catch {
        /* sem internet: tenta na próxima */
      }
    };
    const id = window.setInterval(check, 30 * 60_000);
    document.addEventListener('visibilitychange', check);
    window.setTimeout(check, 60_000);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return fresh;
}

export default function RealApp() {
  const fresh = useNewVersion();
  const client = useMemo(() => createFirebaseClient(), []);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState(false);
  const [googleError, setGoogleError] = useState('');

  useEffect(() => {
    completeMagicLink().then(r => r === 'erro' && setLinkError(true));
    finishRedirect().then(code => code && setGoogleError(code.includes('redirect-cancelled') || code.includes('user-cancelled') ? 'O login do Google foi cancelado.' : 'O Google não concluiu o login neste atalho. Tente de novo ou abra o portal pelo navegador.'));
    return watchSession(u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const session: SessionApi = useMemo(
    () => ({
      user,
      loading,
      signInGoogle,
      sendMagicLink,
      async signOut() {
        // Limpa caches locais da carteirinha ao sair
        try {
          Object.keys(localStorage).filter(k => k.startsWith('sodalis_card_')).forEach(k => localStorage.removeItem(k));
        } catch {
          /* modo privado */
        }
        await doSignOut();
      },
      refreshClaims,
    }),
    [user, loading]
  );

  return (
    <DataProvider value={{ client, session, basePath: '' }}>
      {USE_EMULATORS && (
        <div className="bg-warn text-black text-center text-xs font-semibold py-1">Ambiente local (emulador) com dados simulados</div>
      )}
      {googleError && (
        <div className="max-w-md mx-auto p-4">
          <Notice tone="bad">{googleError}</Notice>
        </div>
      )}
      {linkError && (
        <div className="max-w-md mx-auto p-4">
          <Notice tone="bad">Este link de acesso expirou ou já foi usado. Peça um novo.</Notice>
        </div>
      )}
      {fresh && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-3 sm:inset-x-auto sm:right-4 sm:w-96 z-[55] p-3 rounded-xl border border-accent/50 bg-surface shadow-xl flex items-center gap-3 text-sm">
          <span className="flex-1">Há uma versão nova do portal.</span>
          <button type="button" className="px-3 py-1.5 rounded-lg bg-brand text-on-brand font-semibold cursor-pointer" onClick={() => location.reload()}>
            Atualizar
          </button>
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="entrar" element={<ChooseAccessPage />} />
          <Route path="master/*" element={<MasterApp />} />
          <Route path="federacao/:slug" element={<FederationApp />} />
          <Route path="*" element={<PortalApp />} />
        </Routes>
      </Suspense>
    </DataProvider>
  );
}
