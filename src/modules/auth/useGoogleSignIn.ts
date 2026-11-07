/**
 * Entrar com o Google sem deixar o botão girando para sempre: se a janela do Google não devolver
 * o login (comum no atalho da tela inicial do celular), o botão volta em 25 s com uma orientação.
 */
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../app/DataContext.tsx';
import { errorMessage } from '../../data/client.ts';

const SLOW_MS = 25_000;

export function useGoogleSignIn() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = async () => {
    setBusy(true);
    setError('');
    setSlow(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setBusy(false);
      setSlow(true);
    }, SLOW_MS);
    try {
      await session.signInGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      setError(code.includes('popup-closed') || code.includes('cancelled-popup') ? 'A janela do Google foi fechada antes de concluir.' : code.includes('popup-blocked') ? 'O navegador bloqueou a janela do Google. Libere janelas para este site e tente de novo.' : errorMessage(e));
    } finally {
      window.clearTimeout(timer.current);
      setBusy(false);
    }
  };
  const slowText = 'O Google está demorando para responder. Toque de novo em Continuar com a Conta Google. Se estiver usando o atalho da tela inicial e não funcionar, abra o portal pelo Safari ou pelo Chrome.';
  return { busy, error, slow, slowText, start };
}
