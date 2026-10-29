import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { AssociationLogo } from './AssociationLogos.tsx';
import { db, auth } from '../firebase/config.ts';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import {
  Lock,
  Mail,
  Key,
  Shield,
  User,
  AlertCircle,
  Sparkles,
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
    activeTemplate,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      } else {
        await signUpWithEmail(email, password);
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
        setErrorMsg(err.message || 'Erro ao realizar login.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Quick Demo Logins for instant evaluation in AI Studio
  const handleDemoAdmin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Try login or create demo admin
      try {
        await signInWithEmail('rafa.marciooliveira@gmail.com', 'admin123456');
      } catch {
        await signUpWithEmail('rafa.marciooliveira@gmail.com', 'admin123456');
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao entrar como administrador.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMember = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      try {
        await signInWithEmail('socio.demo@associacao.org.br', 'socio123456');
      } catch {
        await signUpWithEmail('socio.demo@associacao.org.br', 'socio123456');
      }

      // Check if member doc exists; if not, seed approved member so the carteirinha displays immediately
      const uid = auth.currentUser?.uid;
      if (uid) {
        const q = query(collection(db, 'members'), where('userId', '==', uid));
        const snap = await getDocs(q);
        if (snap.empty) {
          const newMemberId = `mem_demo_${Date.now()}`;
          await setDoc(doc(db, 'members', newMemberId), {
            id: newMemberId,
            userId: uid,
            fullName: 'Carlos Eduardo da Silva',
            cpf: '543.210.987-65',
            birthDate: '1988-06-20',
            email: 'socio.demo@associacao.org.br',
            phone: '(11) 98765-4321',
            photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80',
            category: 'SÓCIO',
            status: 'aprovado',
            lgpdConsent: true,
            lgpdConsentDate: new Date().toISOString(),
            validUntil: '2027-10-31',
            renewalCount: 0,
            lastGeneratedAt: new Date().toISOString(),
            lastViewToken: 'DEMO-LIVE-24H-TOKEN',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao entrar como sócio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-zinc-100 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-zinc-400 hover:text-white"
        >
          ✕
        </button>

        {/* Association Branding */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 text-emerald-400">
            <AssociationLogo logoKeyOrUrl={activeTemplate.logoUrl} className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'Entrar no Portal do Associado' : 'Criar Conta de Sócio'}
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {activeTemplate.associationName || 'Associação Sem Fins Lucrativos'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Google Sign-In (Requested in prompt) */}
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
            <label className="block text-xs text-zinc-400 mb-1">Senha de Acesso</label>
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
            {loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Cadastrar e Prosseguir'}
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

        {/* Quick Demo Access Bar */}
        <div className="mt-6 pt-4 border-t border-zinc-800">
          <span className="text-[10px] uppercase font-mono text-zinc-500 block text-center mb-2">
            Acesso Rápido de Testes (AI Studio Preview)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDemoAdmin}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Entrar como Gestor</span>
            </button>

            <button
              type="button"
              onClick={handleDemoMember}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 transition-colors"
            >
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>Entrar como Sócio</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
