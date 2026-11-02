import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { AssociationLogo } from './AssociationLogos.tsx';
import {
  Lock,
  Mail,
  Key,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    activeTemplate,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Close modal on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao autenticar com a Conta Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else if (mode === 'register') {
        await signUpWithEmail(email, password);
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setErrorMsg('Informe o e-mail cadastrado para recuperação.');
          setLoading(false);
          return;
        }
        await sendPasswordReset(email.trim());
        setResetSent(true);
        setLoading(false);
        return;
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setErrorMsg('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail já está cadastrado. Alterne para o modo Entrar.');
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('A senha deve ter no mínimo 6 caracteres.');
      } else {
        setErrorMsg(err.message || 'Erro ao processar solicitação.');
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md cursor-pointer animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-zinc-100 relative cursor-default animate-scale-in"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white p-1 cursor-pointer"
          title="Fechar"
        >
          ✕
        </button>

        {/* Association Branding */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 text-emerald-400">
            <AssociationLogo logoKeyOrUrl={activeTemplate.logoUrl} className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {mode === 'login' && 'Entrar como Sócio'}
            {mode === 'register' && 'Cadastrar-se como Sócio'}
            {mode === 'forgot' && 'Recuperar Acesso de Sócio'}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {activeTemplate.associationName || 'Portal do Associado'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* FORGOT PASSWORD MODE */}
        {mode === 'forgot' ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 space-y-2">
              <p className="leading-relaxed">
                <strong>Esqueceu sua senha?</strong> Você pode acessar imediatamente com sua <strong>Conta Google</strong> ou receber um link de redefinição no seu e-mail cadastrado.
              </p>
            </div>

            {/* Google Fast Recovery Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Recuperar Acesso com a Conta Google</span>
            </button>

            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-zinc-800 w-full" />
              <span className="bg-zinc-900 px-3 text-[10px] uppercase tracking-wider text-zinc-500 font-mono absolute">
                ou enviar link por e-mail
              </span>
            </div>

            {resetSent ? (
              <div className="p-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                <h4 className="font-bold text-xs text-white">E-mail de Recuperação Enviado!</h4>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  Enviamos as instruções de redefinição para <strong>{email}</strong>. Verifique sua caixa de entrada e spam.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResetSent(false);
                    setMode('login');
                  }}
                  className="mt-2 text-xs font-bold text-emerald-400 hover:underline"
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">E-mail do Sócio Cadastrado</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu.email@exemplo.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-colors shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Enviar Link de Redefinição'}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o Login</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* LOGIN OR REGISTER MODE */
          <>
            {/* Google Sign-In */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              type="button"
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar com a Conta Google</span>
            </button>

            <div className="relative my-5 flex items-center justify-center">
              <div className="border-t border-zinc-800 w-full" />
              <span className="bg-zinc-900 px-3 text-[11px] uppercase tracking-wider text-zinc-500 font-mono absolute">
                ou com e-mail e senha
              </span>
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">E-mail do Sócio</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu.email@exemplo.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-zinc-400">Senha de Acesso</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Key className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-colors shadow-md cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Processando...' : mode === 'login' ? 'Entrar no Portal' : 'Cadastrar e Prosseguir'}
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="text-center mt-4 text-xs text-zinc-400">
              {mode === 'login' ? (
                <p>
                  Novo por aqui?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="text-emerald-400 font-semibold hover:underline"
                  >
                    Cadastre-se como Sócio
                  </button>
                </p>
              ) : (
                <p>
                  Já possui conta?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-emerald-400 font-semibold hover:underline"
                  >
                    Fazer Login
                  </button>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
