import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase/config.ts';
import { formatDateBR, maskDateBR, dateBRToISO, isValidDateBR } from '../utils/date.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import { saveOfflineCard } from '../utils/security.ts';
import { PhotoUploader } from './PhotoUploader.tsx';
import {
  User,
  Key,
  Calendar,
  Phone,
  Mail,
  Lock,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldCheck,
  Send,
  Info,
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    currentUser,
    currentMember,
    activeTemplate,
    syncPublicCard,
    sendVerificationEmail,
    reloadUser,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'dados' | 'senha'>('dados');

  // Form Fields - Personal Data
  const [fullName, setFullName] = useState('');
  const [birthDateBR, setBirthDateBR] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [allowBirthdayPublic, setAllowBirthdayPublic] = useState(false);
  const [allowSocialMediaPhotos, setAllowSocialMediaPhotos] = useState(true);

  // Form Fields - Password Change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Feedback
  const [savingData, setSavingData] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Synchronize state when modal opens or member data changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setNewPassword('');
      setConfirmPassword('');

      if (currentMember) {
        setFullName(currentMember.fullName || '');
        setBirthDateBR(formatDateBR(currentMember.birthDate, ''));
        setPhone(currentMember.phone || '');
        setEmail(currentMember.email || currentUser?.email || '');
        setPhotoUrl(currentMember.photoUrl || '');
        setAllowBirthdayPublic(Boolean(currentMember.allowBirthdayPublic));
        setAllowSocialMediaPhotos(currentMember.allowSocialMediaPhotos !== false);
      } else {
        setFullName(currentUser?.displayName || '');
        setBirthDateBR('');
        setPhone('');
        setEmail(currentUser?.email || '');
        setPhotoUrl(currentUser?.photoURL || '');
        setAllowBirthdayPublic(false);
        setAllowSocialMediaPhotos(true);
      }
    }
  }, [isOpen, currentMember, currentUser]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Save personal details to Firestore & update offline cards
  const handleSavePersonalData = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    if (birthDateBR && !isValidDateBR(birthDateBR)) {
      setErrorMsg('Por favor, informe uma data de nascimento válida no padrão brasileiro (DD/MM/AAAA).');
      return;
    }

    if (email.trim() && !email.includes('@')) {
      setErrorMsg('Informe um endereço de e-mail válido.');
      return;
    }

    setSavingData(true);

    try {
      const normalizedDate = birthDateBR ? dateBRToISO(birthDateBR) : '';
      const updatedFields = {
        fullName: fullName.trim(),
        birthDate: normalizedDate,
        photoUrl: photoUrl || '',
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        allowBirthdayPublic,
        birthdayConsentDate: allowBirthdayPublic ? new Date().toISOString() : '',
        allowSocialMediaPhotos,
        socialMediaPhotosConsentDate: allowSocialMediaPhotos ? new Date().toISOString() : '',
        updatedAt: new Date().toISOString(),
      };

      if (currentMember?.id) {
        await updateDoc(doc(db, 'members', currentMember.id), updatedFields);

        // Synchronize sanitized public QR card representation (without PII)
        if (syncPublicCard) {
          await syncPublicCard({
            ...currentMember,
            ...updatedFields,
          });
        }

        // Synchronize offline storage cache if template exists
        if (activeTemplate) {
          saveOfflineCard(
            {
              ...currentMember,
              ...updatedFields,
            },
            activeTemplate
          );
        }
      } else if (currentUser) {
        // If user document does not exist yet (e.g. admin profile), create or update
        await setDoc(
          doc(db, 'members', currentUser.uid),
          {
            id: currentUser.uid,
            userId: currentUser.uid,
            status: 'aprovado',
            category: 'Sócio Efetivo',
            validUntil: '2027-10-31',
            renewalCount: 0,
            lgpdConsent: true,
            lgpdConsentDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            ...updatedFields,
          },
          { merge: true }
        );
      }

      triggerPushNotification(
        '✅ Cadastro Atualizado!',
        'Seus dados pessoais e foto foram salvos com sucesso.',
        'approval'
      );

      setSuccessMsg('Dados pessoais atualizados com sucesso!');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      console.error('Erro ao salvar dados do usuário:', err);
      handleFirestoreError(err, OperationType.UPDATE, `members/${currentMember?.id || currentUser?.uid}`);
      setErrorMsg('Erro ao salvar dados no banco. Tente novamente.');
    } finally {
      setSavingData(false);
    }
  };

  // Update password via Firebase Auth
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentUser) {
      setErrorMsg('Você precisa estar autenticado para alterar a senha.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem. Digite novamente.');
      return;
    }

    setSavingPassword(true);

    try {
      await updatePassword(currentUser, newPassword);

      // Update flag in member doc if applicable
      if (currentMember?.id) {
        try {
          await updateDoc(doc(db, 'members', currentMember.id), {
            mustChangePassword: false,
            passwordChangedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          // non-fatal
        }
      }

      try {
        localStorage.setItem(`pw_changed_${currentUser.uid}`, 'true');
      } catch (e) {}

      triggerPushNotification(
        '🔒 Senha Alterada com Sucesso!',
        'Sua nova senha de acesso foi cadastrada e protegida com segurança.',
        'approval'
      );

      setSuccessMsg('Sua nova senha foi atualizada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      console.error('Erro ao atualizar senha:', err);
      if (err.code === 'auth/requires-recent-login') {
        setErrorMsg(
          'Por segurança do sistema, a troca de senha exige um login recente. Por favor, clique em "Sair" no topo da página e faça login novamente para confirmar sua identidade.'
        );
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('A senha escolhida é muito fraca. Utilize letras, números e símbolos.');
      } else {
        setErrorMsg(err.message || 'Erro ao alterar a senha. Tente novamente.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  // Send password reset email link
  const handleSendResetEmail = async () => {
    if (!currentUser?.email) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setSendingResetEmail(true);

    try {
      await sendPasswordResetEmail(auth, currentUser.email);
      setSuccessMsg(`E-mail com link de redefinição de senha enviado para ${currentUser.email}!`);
      setTimeout(() => {
        setSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      setErrorMsg('Erro ao enviar e-mail de redefinição: ' + (err.message || 'Tente novamente em instantes.'));
    } finally {
      setSendingResetEmail(false);
    }
  };

  const userInitial = (
    currentMember?.fullName?.charAt(0) ||
    currentUser?.displayName?.charAt(0) ||
    currentUser?.email?.charAt(0) ||
    'U'
  ).toUpperCase();

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto cursor-pointer animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-auto animate-scale-in text-zinc-100 cursor-default"
      >
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-black text-lg flex items-center justify-center shadow-inner shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-white leading-tight">
                Meus Dados e Senha
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-xs sm:max-w-sm">
                {currentUser?.email || 'Atualize seus dados cadastrais e senha de acesso'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/60 p-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('dados');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'dados'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <User className="w-4 h-4 text-emerald-300" />
            <span>Dados Cadastrais</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('senha');
              setErrorMsg(null);
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'senha'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Key className="w-4 h-4 text-amber-300" />
            <span>Alterar Senha</span>
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold leading-relaxed">{successMsg}</span>
          </div>
        )}

        {/* TAB 1: DADOS CADASTRAIS */}
        {activeTab === 'dados' && (
          <form onSubmit={handleSavePersonalData} className="p-5 sm:p-6 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
            {/* Foto Oficial 3x4 */}
            <PhotoUploader
              aspectRatio="3:4"
              storageFolder="members"
              currentPhotoUrl={photoUrl}
              onPhotoSelected={setPhotoUrl}
              label="Foto Oficial do Sócio (Formato 3x4)"
              helperText="Escolha da galeria, tire com a câmera ou use sua foto da conta Google."
              enableCamera={true}
              googlePhotoUrl={currentUser?.photoURL || ''}
            />

            {/* Nome Completo */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Nome Completo Oficial *
                </label>
                <span className="text-[10px] text-emerald-400">Exatamente como cadastrado</span>
              </div>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Digite seu nome completo..."
                autoComplete="name"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-medium"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                O nome é levado para a carteirinha exatamente da forma digitada aqui.
              </p>
            </div>

            {/* Data de Nascimento */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Data de Nascimento (Padrão Brasil) *
                </label>
                {birthDateBR && (
                  <span className="text-[11px] font-mono">
                    {isValidDateBR(birthDateBR) ? (
                      <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Padrão BR (DD/MM/AAAA)
                      </span>
                    ) : (
                      <span className="text-amber-400">Preencha DD/MM/AAAA</span>
                    )}
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  maxLength={10}
                  value={birthDateBR}
                  onChange={e => setBirthDateBR(maskDateBR(e.target.value))}
                  placeholder="DD/MM/AAAA (ex: 15/04/1985)"
                  className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-mono"
                />

                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                  <label
                    className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer"
                    title="Selecionar no calendário"
                  >
                    <Calendar className="w-4 h-4" />
                    <input
                      type="date"
                      onChange={e => {
                        if (e.target.value) {
                          setBirthDateBR(formatDateBR(e.target.value));
                        }
                      }}
                      className="sr-only"
                      tabIndex={-1}
                    />
                  </label>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Dia, mês e ano de nascimento. O ano e sua idade nunca são exibidos publicamente aos demais sócios.
              </span>
            </div>

            {/* Telefone / WhatsApp */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Telefone / WhatsApp de Contato
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(47) 99999-9999"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
                />
              </div>
            </div>

            {/* E-mail */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                E-mail Cadastrado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
                />
              </div>
            </div>

            {/* Checkbox LGPD Aniversariantes */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowBirthdayPublic}
                  onChange={e => setAllowBirthdayPublic(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-emerald-600 border-zinc-700 bg-zinc-900 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-xs text-zinc-300">
                  <span className="font-semibold block text-white">
                    Autorizo mostrar meu nome e dia/mês de nascimento aos demais sócios
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    Opção LGPD. Se marcada, seu nome e dia/mês aparecerão na lista de aniversariantes da sociedade para os demais associados aprovados. Nunca serão divulgados seu ano de nascimento nem sua idade.
                  </p>
                </div>
              </label>
            </div>

            {/* Checkbox Autorização de Imagem em Redes Sociais */}
            <div className="p-3.5 rounded-2xl bg-zinc-950 border border-emerald-500/40">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowSocialMediaPhotos}
                  onChange={e => setAllowSocialMediaPhotos(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-emerald-600 border-zinc-700 bg-zinc-900 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-xs text-zinc-300">
                  <span className="font-semibold block text-white flex items-center gap-1.5">
                    <span>Autorizo a divulgação e exposição de minhas imagens nas redes sociais da sociedade</span>
                  </span>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    Conforme o Art. 20 do Código Civil e Art. 7º da LGPD. Autoriza fotos e filmagens suas em eventos e competições de tiro nos canais oficiais (Instagram, Facebook, YouTube e site da Sociedade), a título gratuito e estritamente institucional.
                  </p>
                </div>
              </label>
            </div>

            {/* Campos Estatutários Protegidos */}
            {currentMember && (
              <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dados Estatutários (Diretoria)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                  <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase">Categoria</span>
                    <span className="font-bold text-emerald-400 truncate block">{currentMember.category || 'SÓCIO'}</span>
                  </div>
                  <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase">Matrícula</span>
                    <span className="font-mono text-zinc-200 truncate block">{currentMember.membershipNumber || 'Não atribuída'}</span>
                  </div>
                  <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase">Situação</span>
                    <span className="font-bold text-amber-300 uppercase truncate block">{currentMember.status}</span>
                  </div>
                  <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase">Validade</span>
                    <span className="font-mono text-zinc-300 truncate block">{currentMember.validUntil || '2027-10-31'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={savingData}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={savingData}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all cursor-pointer disabled:opacity-50"
              >
                {savingData ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Salvando Dados...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Salvar Dados Cadastrais</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: ALTERAR SENHA */}
        {activeTab === 'senha' && (
          <form onSubmit={handleUpdatePassword} className="p-5 sm:p-6 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 space-y-1">
              <div className="flex items-center gap-2 text-white font-bold">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Atualização de Senha do Associado</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Defina sua nova senha de acesso. Por segurança, sua senha deve conter pelo menos 6 caracteres.
              </p>
              <div className="text-[11px] text-zinc-400 pt-1">
                Conta autenticada: <strong className="text-emerald-400 font-mono">{currentUser?.email}</strong>
              </div>
            </div>

            {/* Nova Senha */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Nova Senha *
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showNewPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar Senha */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
                Confirmar Nova Senha *
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Ver confirmação de senha'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Enviar Nova Senha */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={savingPassword || !newPassword || !confirmPassword}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-950/60 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingPassword ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Atualizando Senha no Firebase...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Salvar Nova Senha</span>
                  </>
                )}
              </button>
            </div>

            {/* Alternativa: Link de recuperação por e-mail */}
            <div className="pt-3 border-t border-zinc-800 text-center">
              <p className="text-[11px] text-zinc-400 mb-2">
                Prefere receber um link de redefinição no seu e-mail?
              </p>
              <button
                type="button"
                onClick={handleSendResetEmail}
                disabled={sendingResetEmail}
                className="w-full py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {sendingResetEmail ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span>Enviar Link de Redefinição para {currentUser?.email}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
