import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Lock, Key, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface ForcePasswordChangeModalProps {
  isOpen: boolean;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({ isOpen }) => {
  const { changeInitialPassword, currentUser, signInWithGoogle } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem. Verifique a digitação.');
      return;
    }

    setLoading(true);
    try {
      await changeInitialPassword(newPassword);
      setSuccess(true);
    } catch (err: any) {
      console.error('Erro ao atualizar senha no primeiro acesso:', err);
      if (err.code === 'auth/requires-recent-login') {
        setErrorMsg('Por segurança, sua sessão expirou para troca de senha. Faça login novamente.');
      } else {
        setErrorMsg(err.message || 'Erro ao definir nova senha. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRecover = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao autenticar com a Conta Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-fade-in">
      <div className="bg-zinc-900 border border-emerald-500/50 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-zinc-100 relative animate-scale-in">
        {/* Header Badge */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider inline-block mb-2">
            Primeiro Acesso de Segurança
          </span>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Redefinição Obrigatória de Senha
          </h2>
          <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
            Por política de segurança da associação, todos os usuários devem definir uma nova senha pessoal definitiva no primeiro acesso.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {success ? (
          <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h4 className="font-bold text-sm text-white">Senha Definida com Sucesso!</h4>
            <p className="text-xs text-zinc-300">
              Sua nova senha foi salva. Entrando no portal...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-zinc-950/70 p-3 rounded-xl border border-zinc-800 text-[11px] text-zinc-400">
              Usuário autenticado: <strong className="text-white font-mono">{currentUser?.email}</strong>
            </div>

            <div>
              <label className="block text-xs text-zinc-300 font-semibold mb-1">
                Nova Senha Definitiva *
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-300 font-semibold mb-1">
                Confirmar Nova Senha *
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-950/60 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Definindo Nova Senha...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Salvar Nova Senha & Acessar Portal</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Google Alternative Recovery / Login */}
        <div className="mt-5 pt-4 border-t border-zinc-800 text-center">
          <p className="text-[11px] text-zinc-400 mb-2">
            Prefere não memorizar senhas ou esqueceu seus dados?
          </p>
          <button
            type="button"
            onClick={handleGoogleRecover}
            disabled={loading}
            className="w-full py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
            <span>Autenticar via Conta do Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
