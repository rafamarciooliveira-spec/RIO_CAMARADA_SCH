/**
 * Rotas de topo:
 *   /                 landing do Verein (sem Firebase); no domínio próprio de uma sociedade, o portal dela
 *   /ver-sistema/...  demonstração com dados fictícios (sem Firebase, sem rede)
 *   /master/...       painel da plataforma
 *   /{slug}/...       portal da sociedade; /{slug}/v/{token} validação pública
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmProvider, Loading, ToastProvider } from './ui/index.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { BRAND } from './brand.ts';

const Landing = lazy(() => import('./modules/landing/LandingPage.tsx'));
const DemoApp = lazy(() => import('./modules/demo/DemoApp.tsx'));
const RealApp = lazy(() => import('./app/RealApp.tsx'));
const LegalPage = lazy(() => import('./modules/landing/LegalPage.tsx'));

// Domínio próprio de uma sociedade abre direto o portal dela
const hostTenant = typeof window !== 'undefined' ? BRAND.hostTenants[window.location.hostname] : undefined;

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={hostTenant ? <Navigate to={`/${hostTenant}`} replace /> : <Landing />} />
                <Route path="/plataforma" element={<Landing />} />
                <Route path="/privacidade" element={<LegalPage doc="privacidade" />} />
                <Route path="/termos" element={<LegalPage doc="termos" />} />
                <Route path={`${BRAND.demoPath}/*`} element={<DemoApp />} />
                <Route path="/*" element={<RealApp />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
