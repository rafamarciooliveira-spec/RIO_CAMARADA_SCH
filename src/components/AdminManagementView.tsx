import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { db } from '../firebase/config.ts';
import { collection, onSnapshot } from 'firebase/firestore';
import { Member, MemberCategory, MemberStatus, MEMBER_CATEGORIES, normalizeMemberCategory } from '../types/index.ts';
import { maskCPF } from '../utils/cpf.ts';
import { useAppDialog } from '../context/DialogContext.tsx';
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
  Lock,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
} from 'lucide-react';

const BOOTSTRAP_ADMIN_EMAIL = 'rafa.marciooliveira@gmail.com';

export const AdminManagementView: React.FC = () => {
  const {
    currentUser,
    isSuperAdmin,
    adminList,
    addAdmin,
    removeAdmin,
    updateUserCategory,
    updateUserStatus,
    updateUserForcePassword,
  } = useAuth();
  const dialog = useAppDialog();

  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'diretoria_executiva' | 'diretoria' | 'admin'>('diretoria_executiva');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // All members list for Superadmin user configuration
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'members'),
      snap => {
        const list: Member[] = [];
        snap.forEach(d => {
          list.push({ ...d.data(), id: d.id } as Member);
        });
        list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setAllMembers(list);
        setMembersLoading(false);
      },
      err => {
        console.warn('Members list fetch notice:', err.message);
        setMembersLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isSuperAdmin) {
      setFeedback({
        type: 'error',
        message: 'Apenas o Superadministrador titular tem permissão para cadastrar ou modificar membros da diretoria.',
      });
      return;
    }

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
      setFeedback({ type: 'error', message: 'Este usuário já está cadastrado com acesso administrativo.' });
      return;
    }

    setLoading(true);
    try {
      const categoryType: 'DIRETORIA EXECUTIVA' | 'DIRETORIA' =
        newRole === 'diretoria' ? 'DIRETORIA' : 'DIRETORIA EXECUTIVA';

      await addAdmin(emailTrim, newName.trim(), newRole, categoryType);

      // If user also has a member record, synchronize category
      const targetMember = allMembers.find(m => m.email?.toLowerCase() === emailTrim);
      if (targetMember) {
        await updateUserCategory(targetMember.id, categoryType === 'DIRETORIA' ? 'Membro da Diretoria' : 'Membro Diretoria Executiva');
      }

      setFeedback({
        type: 'success',
        message: `Acesso concedido a ${emailTrim} como ${
          newRole === 'diretoria_executiva'
            ? 'Diretoria Executiva'
            : newRole === 'diretoria'
            ? 'Somente Diretoria'
            : 'Administrador'
        }!`,
      });
      setNewEmail('');
      setNewName('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao conceder privilégio.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAdmin = async (adminId: string, email: string) => {
    if (!isSuperAdmin) {
      setFeedback({
        type: 'error',
        message: 'Apenas o Superadministrador pode revogar privilégios de outros administradores.',
      });
      return;
    }

    const confirmed = await dialog.confirm({
      title: 'Revogar Acesso Administrativo',
      message: `Tem certeza que deseja revogar o acesso administrativo de ${email}?`,
      confirmText: 'Revogar Acesso',
      variant: 'danger',
    });
    if (!confirmed) return;

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

  const handleToggleForcePassword = async (member: Member) => {
    if (!isSuperAdmin) {
      await dialog.alert({
        title: 'Acesso Restrito',
        message: 'Apenas o Superadministrador titular pode alterar as configurações de segurança dos usuários.',
        variant: 'warning',
      });
      return;
    }
    const currentVal = !!member.mustChangePassword;
    const nextVal = !currentVal;
    try {
      await updateUserForcePassword(member.id, nextVal);
      setFeedback({
        type: 'success',
        message: nextVal
          ? `O usuário ${member.fullName} (${member.email}) será obrigado a redefinir a senha no próximo acesso.`
          : `Exigência de redefinição de senha para ${member.fullName} foi desativada.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao atualizar configuração.' });
    }
  };

  const handleChangeMemberCategory = async (memberId: string, newCat: MemberCategory) => {
    if (!isSuperAdmin) {
      await dialog.alert({
        title: 'Acesso Restrito',
        message: 'Apenas o Superadministrador titular pode alterar as categorias e funções dos usuários.',
        variant: 'warning',
      });
      return;
    }
    try {
      await updateUserCategory(memberId, newCat);
      setFeedback({
        type: 'success',
        message: `Categoria do usuário atualizada com sucesso para "${newCat}".`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao atualizar categoria.' });
    }
  };

  const handleChangeMemberStatus = async (memberId: string, newStatus: MemberStatus) => {
    if (!isSuperAdmin) {
      await dialog.alert({
        title: 'Acesso Restrito',
        message: 'Apenas o Superadministrador titular pode alterar o status cadastral dos usuários.',
        variant: 'warning',
      });
      return;
    }
    try {
      await updateUserStatus(memberId, newStatus);
      setFeedback({
        type: 'success',
        message: `Status do usuário atualizado para "${newStatus}".`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao atualizar status.' });
    }
  };

  const filteredUsers = allMembers.filter(m => {
    const q = memberSearch.toLowerCase();
    return (
      m.fullName?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.cpf?.includes(q) ||
      String(m.category || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">
              Gestão de Diretoria & Configurações de Usuários
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Controle total de permissões, membros da diretoria e gerenciamento de todos os usuários da associação.
            </p>
          </div>
        </div>

        {isSuperAdmin ? (
          <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            <span>Superadmin Titular Ativo</span>
          </span>
        ) : (
          <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            Modo Consulta
          </span>
        )}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-xs animate-fade-in ${
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

      {/* SECTION 1: ADD NEW BOARD MEMBER (EXECUTIVA vs SOMENTE DIRETORIA) */}
      {isSuperAdmin && (
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <UserPlus className="w-4 h-4" />
            <span>Conceder Acesso a Membro da Diretoria</span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Selecione entre as duas categorias de diretoria para conceder as devidas atribuições estatutárias:
            <strong> Diretoria Executiva</strong> (gestão operacional ativa e homologação) ou
            <strong> Somente Diretoria</strong> (fiscalização, consulta e validação).
          </p>

          <form onSubmit={handleAddAdmin} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-[11px] uppercase font-mono text-zinc-400 mb-1">
                  E-mail do Membro *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="ex: diretor@associacao.org.br"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[11px] uppercase font-mono text-zinc-400 mb-1">
                  Nome ou Cargo Oficial
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

              <div className="sm:col-span-3">
                <label className="block text-[11px] uppercase font-mono text-zinc-400 mb-1">
                  Tipo de Diretoria *
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as any)}
                  className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="diretoria_executiva">Diretoria Executiva</option>
                  <option value="diretoria">Somente Diretoria</option>
                  <option value="admin">Administrador Geral</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{loading ? 'Adicionando...' : 'Autorizar Membro na Diretoria'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 2: LIST OF ACTIVE BOARD MEMBERS */}
      <div>
        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          <span>Equipe com Acesso Administrativo e de Diretoria</span>
        </h4>

        <div className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/50">
          {/* Permanent Superadmin */}
          <div className="p-4 flex items-center justify-between gap-4 bg-amber-950/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-sm">{BOOTSTRAP_ADMIN_EMAIL}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                    SUPERADMIN FUNDADOR (ACESSO TOTAL)
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400 block mt-0.5">
                  Acesso total irrestrito a todas as configurações, customizador e alteração de privilégios de todos os usuários.
                </span>
              </div>
            </div>

            <span className="text-xs font-mono text-zinc-500 shrink-0">Permanente</span>
          </div>

          {/* Dynamic Administrators / Board Members */}
          {adminList.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Nenhum membro adicional cadastrado. Apenas o Superadministrador titular ({BOOTSTRAP_ADMIN_EMAIL}) possui acesso administrativo.
            </div>
          ) : (
            adminList.map(admin => {
              const isExec = admin.role === 'diretoria_executiva' || admin.category === 'DIRETORIA EXECUTIVA';
              return (
                <div key={admin.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-900/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                      isExec
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                    }`}>
                      {isExec ? <Crown className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{admin.email}</span>
                        {admin.name && (
                          <span className="text-xs text-zinc-400 font-medium">({admin.name})</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          isExec
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        }`}>
                          {isExec ? 'DIRETORIA EXECUTIVA' : 'SOMENTE DIRETORIA'}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono block mt-0.5">
                        Adicionado em: {new Date(admin.createdAt).toLocaleDateString('pt-BR')} por {admin.addedBy}
                      </span>
                    </div>
                  </div>

                  {isSuperAdmin && (
                    <button
                      onClick={() => handleRevokeAdmin(admin.id, admin.email)}
                      className="self-end sm:self-center px-3 py-1.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Revogar privilégio de diretoria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revogar</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 3: TOTAL USER CONFIGURATION MANAGER (EXCLUSIVE TO SUPERADMIN) */}
      <div className="pt-4 border-t border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Painel de Controle e Configuração dos Usuários</span>
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              O seu usuário ({BOOTSTRAP_ADMIN_EMAIL}) possui poder total para alterar categoria, status e exigir troca obrigatória de senha de qualquer usuário.
            </p>
          </div>

          {/* Quick search inside user table */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Localizar usuário..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-hidden focus:border-amber-500"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/70">
          {membersLoading ? (
            <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Carregando usuários cadastrados...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              Nenhum usuário cadastrado localizado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Associado / E-mail</th>
                    <th className="py-3 px-4">Categoria / Cargo</th>
                    <th className="py-3 px-4">Status Cadastral</th>
                    <th className="py-3 px-4">Segurança / Senha</th>
                    <th className="py-3 px-4 text-right">Ação Superadmin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filteredUsers.map(u => {
                    const isUserSuper = u.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
                    const mustChange = !!u.mustChangePassword;

                    return (
                      <tr key={u.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-xs">{u.fullName || 'Sem Nome'}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">{u.email}</div>
                          {u.cpf && (
                            <div className="text-[10px] text-zinc-500 font-mono">CPF: {maskCPF(u.cpf)}</div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isSuperAdmin ? (
                            <select
                              value={normalizeMemberCategory(u.category)}
                              onChange={e => handleChangeMemberCategory(u.id, e.target.value as MemberCategory)}
                              className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 cursor-pointer outline-hidden focus:border-amber-400 font-semibold"
                            >
                              {MEMBER_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold text-zinc-300">{normalizeMemberCategory(u.category)}</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isSuperAdmin ? (
                            <select
                              value={u.status || 'pendente'}
                              onChange={e => handleChangeMemberStatus(u.id, e.target.value as MemberStatus)}
                              className="px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200 cursor-pointer outline-hidden focus:border-amber-400"
                            >
                              <option value="aprovado">Aprovado</option>
                              <option value="pendente">Pendente</option>
                              <option value="rejeitado">Rejeitado</option>
                              <option value="expirado">Expirado</option>
                            </select>
                          ) : (
                            <span className="text-zinc-400 font-mono uppercase">{u.status}</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {mustChange ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                                <Lock className="w-2.5 h-2.5" /> Exige Nova Senha
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Senha Definida
                              </span>
                            )}
                            {u.passwordChangedAt && (
                              <div className="text-[10px] text-zinc-500 font-mono">
                                Redefinida: {new Date(u.passwordChangedAt).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isSuperAdmin && !isUserSuper && (
                            <button
                              type="button"
                              onClick={() => handleToggleForcePassword(u)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                mustChange
                                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                                  : 'bg-amber-950/60 hover:bg-amber-900 border-amber-500/40 text-amber-300'
                              }`}
                              title={
                                mustChange
                                  ? 'Desativar obrigatoriedade de troca de senha'
                                  : 'Obrigar este associado a alterar a senha no próximo acesso'
                              }
                            >
                              {mustChange ? 'Dispensar Troca' : 'Forçar Troca de Senha'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Diretrizes de Acesso & Segurança:</strong> O e-mail <strong>{BOOTSTRAP_ADMIN_EMAIL}</strong> possui controle absoluto de todas as configurações do sistema e dos demais usuários. Ao registrar membros como <em>Diretoria Executiva</em> ou <em>Somente Diretoria</em>, os acessos ao painel de administração são ativados automaticamente após o login de cada pessoa.
        </div>
      </div>
    </div>
  );
};
