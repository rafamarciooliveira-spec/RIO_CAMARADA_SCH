import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ShieldAlert,
  UserPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Crown,
  Key,
  ShieldCheck,
  Mail,
  User,
  Info,
} from 'lucide-react';

const BOOTSTRAP_ADMIN_EMAIL = 'rafa.marciooliveira@gmail.com';

export const AdminManagementView: React.FC = () => {
  const { currentUser, isSuperAdmin, adminList, addAdmin, removeAdmin } = useAuth();

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const emailTrim = newEmail.trim().toLowerCase();
    if (!emailTrim || !emailTrim.includes('@')) {
      setFeedback({ type: 'error', message: 'Por favor, informe um endereço de e-mail válido.' });
      return;
    }

    if (emailTrim === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
      setFeedback({ type: 'error', message: 'Este e-mail já é o Superadministrador permanente.' });
      return;
    }

    if (adminList.some(a => a.email.toLowerCase() === emailTrim)) {
      setFeedback({ type: 'error', message: 'Este usuário já está cadastrado como administrador.' });
      return;
    }

    setLoading(true);
    try {
      await addAdmin(emailTrim, newName.trim());
      setFeedback({
        type: 'success',
        message: `Novo administrador (${emailTrim}) autorizado com sucesso! Quando este usuário acessar com Google ou e-mail, terá acesso ao painel de administração.`,
      });
      setNewEmail('');
      setNewName('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao conceder privilégio de administrador.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAdmin = async (adminId: string, email: string) => {
    if (!confirm(`Tem certeza que deseja revogar o acesso administrativo de ${email}?`)) return;
    try {
      await removeAdmin(adminId);
      setFeedback({
        type: 'success',
        message: `Acesso administrativo de ${email} revogado com sucesso.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao remover administrador.' });
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Controle de Administradores & Gestores</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Gerencie quem tem permissão para aprovar cadastros, customizar carteirinhas e gerenciar o sistema.
            </p>
          </div>
        </div>

        <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          Superadmin Ativo
        </span>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Add New Administrator Form */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <UserPlus className="w-4 h-4" />
          <span>Conceder Acesso de Administrador a um Novo Usuário</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Informe o e-mail da pessoa que você deseja autorizar como administradora. Ela poderá fazer login via
          <strong> Conta Google</strong> ou com senha e acessar o painel de homologação de carteirinhas.
        </p>

        <form onSubmit={handleAddAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
          <div className="sm:col-span-6">
            <label className="block text-[11px] uppercase font-mono text-zinc-400 mb-1">
              E-mail do Novo Administrador *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="nome.sobrenome@gmail.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] uppercase font-mono text-zinc-400 mb-1">
              Nome ou Cargo (Opcional)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ex: Diretor Financeiro"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{loading ? 'Adicionando...' : 'Autorizar'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* List of Active Administrators */}
      <div>
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>Equipe com Acesso Administrativo Homologado</span>
        </h4>

        <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/50">
          {/* Permanent Superadmin */}
          <div className="p-4 flex items-center justify-between gap-4 bg-amber-950/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{BOOTSTRAP_ADMIN_EMAIL}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    SUPERADMIN FUNDADOR
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 block mt-0.5">
                  Administrador titular permanente da associação com acesso irrestrito.
                </span>
              </div>
            </div>

            <span className="text-xs font-mono text-zinc-500">Permanente</span>
          </div>

          {/* Dynamic Administrators Added by Superadmin */}
          {adminList.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Nenhum administrador adicional cadastrado. Apenas você ({BOOTSTRAP_ADMIN_EMAIL}) possui acesso administrativo.
            </div>
          ) : (
            adminList.map(admin => (
              <div key={admin.id} className="p-4 flex items-center justify-between gap-4 hover:bg-zinc-900/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{admin.email}</span>
                      {admin.name && (
                        <span className="text-xs text-zinc-400 font-medium">({admin.name})</span>
                      )}
                      <span className="px-2 py-0.5 rounded-md text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        ADMINISTRADOR
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono block mt-0.5">
                      Adicionado em: {new Date(admin.createdAt).toLocaleDateString('pt-BR')} por {admin.addedBy}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleRevokeAdmin(admin.id, admin.email)}
                  className="px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Revogar privilégio de administrador"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revogar Acesso</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Segurança de Acesso:</strong> Somente o e-mail <strong>{BOOTSTRAP_ADMIN_EMAIL}</strong> inicia com poderes de Superadministrador. Os novos gestores adicionados aqui herdam as permissões de aprovação de carteirinhas e customização no banco de dados Firestore.
        </div>
      </div>
    </div>
  );
};
