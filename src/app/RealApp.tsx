/** Raiz do app real (Firebase). Carregada só fora da landing e da demonstração. */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { createFirebaseClient, USE_EMULATORS } from '../data/firebaseClient.ts';
import { completeMagicLink, doSignOut, refreshClaims, sendMagicLink, signInGoogle, watchSession } from '../data/firebaseSession.ts';
import type { SessionApi, SessionUser } from '../data/client.ts';
import { DataProvider } from './DataContext.tsx';
import PortalApp from './PortalApp.tsx';
import { Loading, Notice } from '../ui/index.tsx';

const MasterApp = lazy(() => import('../modules/master/MasterApp.tsx'));
const ChooseAccessPage = lazy(() => import('../modules/auth/ChooseAccessPage.tsx'));

export default function RealApp() {
  const client = useMemo(() => createFirebaseClient(), []);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    completeMagicLink().then(r => r === 'erro' && setLinkError(true));
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
      {linkError && (
        <div className="max-w-md mx-auto p-4">
          <Notice tone="bad">Este link de acesso expirou ou já foi usado. Peça um novo.</Notice>
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="entrar" element={<ChooseAccessPage />} />
          <Route path="master/*" element={<MasterApp />} />
          <Route path="*" element={<PortalApp />} />
        </Routes>
      </Suspense>
    </DataProvider>
  );
}
