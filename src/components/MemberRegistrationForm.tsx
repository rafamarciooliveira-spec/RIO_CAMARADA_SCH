import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { doc, setDoc } from 'firebase/firestore';
import { validateCPF, formatCPF } from '../utils/cpf.ts';
import { formatDateBR, maskDateBR, dateBRToISO, isValidDateBR } from '../utils/date.ts';
import { getDefaultOfficialExpiry } from '../utils/security.ts';
import { PhotoUploader } from './PhotoUploader.tsx';
import {
  UserCheck,
  Shield,
  FileText,
  AlertCircle,
  Camera,
  CheckCircle2,
  Lock,
  Info,
  Upload,
  Calendar,
  Cake,
  Mail,
  UserX,
} from 'lucide-react';

interface FormProps {
  onSuccess?: () => void;
  initialData?: {
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    email?: string;
    phone?: string;
    photoUrl?: string;
    category?: string;
    allowBirthdayPublic?: boolean;
    allowEventPhotos?: boolean;
    allowCommunications?: boolean;
    isMinor?: boolean;
    parentName?: string;
    parentCpf?: string;
    parentAuthorized?: boolean;
  };
  isEditing?: boolean;
}

export const MemberRegistrationForm: React.FC<FormProps> = ({
  onSuccess,
  initialData,
  isEditing = false,
}) => {
  const { currentUser, currentMember } = useAuth();

  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [cpf, setCpf] = useState(initialData?.cpf || '');
  const [birthDateBR, setBirthDateBR] = useState(() => {
    if (initialData?.birthDate) {
      return formatDateBR(initialData.birthDate);
    }
    return '';
  });
  const [email, setEmail] = useState(initialData?.email || currentUser?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl || currentUser?.photoURL || '');
  const [category, setCategory] = useState(initialData?.category || 'Sócio Efetivo');
  const [lgpdConsent, setLgpdConsent] = useState(isEditing ? true : false);
  const [allowBirthdayPublic, setAllowBirthdayPublic] = useState(Boolean(initialData?.allowBirthdayPublic));
  const [allowEventPhotos, setAllowEventPhotos] = useState(initialData?.allowEventPhotos !== undefined ? initialData.allowEventPhotos : true);
  const [allowCommunications, setAllowCommunications] = useState(initialData?.allowCommunications !== undefined ? initialData.allowCommunications : true);

  // Minor protection state
  const [parentName, setParentName] = useState(initialData?.parentName || '');
  const [parentCpf, setParentCpf] = useState(initialData?.parentCpf || '');
  const [parentAuthorized, setParentAuthorized] = useState(Boolean(initialData?.parentAuthorized));

  const [showLgpdModal, setShowLgpdModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper to check if birth date indicates a minor under 18
  const checkIsMinor = (dateBr: string) => {
    if (!isValidDateBR(dateBr)) return false;
    const parts = dateBr.split('/');
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (!d || !m || !y) return false;
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const mDiff = now.getMonth() - birth.getMonth();
    if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age < 18;
  };

  const isMinor = checkIsMinor(birthDateBR);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCPF(e.target.value));
  };

  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateBR(e.target.value);
    setBirthDateBR(masked);
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setBirthDateBR(formatDateBR(e.target.value));
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrorMsg('A foto deve ter no máximo 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!currentUser) {
      setErrorMsg('Você precisa estar autenticado para enviar o cadastro.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      return;
    }

    if (!validateCPF(cpf)) {
      setErrorMsg('CPF inválido. Verifique os dígitos digitados.');
      return;
    }

    if (!birthDateBR || !isValidDateBR(birthDateBR)) {
      setErrorMsg('Por favor, informe uma data de nascimento válida no padrão brasileiro (DD/MM/AAAA).');
      return;
    }

    if (isMinor) {
      if (!parentName.trim() || parentName.trim().length < 3) {
        setErrorMsg('O cadastro de menores de 18 anos exige o nome completo do responsável legal.');
        return;
      }
      if (!validateCPF(parentCpf)) {
        setErrorMsg('CPF do responsável legal inválido.');
        return;
      }
      if (!parentAuthorized) {
        setErrorMsg('É obrigatório que o responsável legal declare expressa autorização para cadastro do menor.');
        return;
      }
    }

    if (!lgpdConsent) {
      setErrorMsg('Você deve concordar com os termos de consentimento e tratamento de dados (LGPD).');
      return;
    }

    setSubmitting(true);

    try {
      const memberId = currentMember?.id || currentUser.uid;
      const path = 'members';
      const normalizedBirthDate = dateBRToISO(birthDateBR);
      const nowIso = new Date().toISOString();

      const payload = {
        id: memberId,
        userId: currentUser.uid,
        fullName: fullName.trim(),
        cpf: cpf.trim(),
        birthDate: normalizedBirthDate,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        photoUrl,
        membershipNumber: currentMember?.membershipNumber || `SOC-${Math.floor(100000 + Math.random() * 900000)}`,
        category,
        status: isEditing && currentMember?.status === 'aprovado' ? 'aprovado' : 'pendente',
        rejectionReason: '',
        lgpdConsent: true,
        lgpdConsentDate: nowIso,
        allowBirthdayPublic,
        birthdayConsentDate: allowBirthdayPublic ? nowIso : undefined,
        allowEventPhotos,
        eventPhotosConsentDate: allowEventPhotos ? nowIso : undefined,
        allowCommunications,
        communicationsConsentDate: allowCommunications ? nowIso : undefined,
        consentVersion: 'v2_lgpd_granular',
        isMinor,
        parentName: isMinor ? parentName.trim() : undefined,
        parentCpf: isMinor ? parentCpf.trim() : undefined,
        parentAuthorized: isMinor ? parentAuthorized : undefined,
        validUntil: currentMember?.validUntil || getDefaultOfficialExpiry(),
        renewalCount: currentMember?.renewalCount || 0,
        createdAt: currentMember?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, path, memberId), payload, { merge: true });

      // Create confirmation notification
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: currentUser.uid,
        title: '📋 Cadastro Enviado para Análise',
        message: 'Seu cadastro foi recebido com sucesso e aguarda homologação pela diretoria da associação.',
        type: 'status_change',
        read: false,
        createdAt: new Date().toISOString(),
      });

      if (onSuccess) onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `members/${currentUser.uid}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl max-w-2xl mx-auto text-zinc-100">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-5 mb-6">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {isEditing ? 'Atualizar Dados Cadastrais' : 'Ficha de Cadastro de Associado'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Associação Sem Fins Lucrativos • Sistema de Emissão de Carteirinha Digital
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-red-500/30 flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo Selection with 3x4 crop and camera */}
        <PhotoUploader
          aspectRatio="3:4"
          storageFolder="members"
          currentPhotoUrl={photoUrl}
          onPhotoSelected={setPhotoUrl}
          label="Foto Oficial do Sócio (Formato 3x4) *"
          helperText="Arraste uma foto, escolha um arquivo ou tire foto com a câmera do celular com recorte 3x4."
          enableCamera={true}
        />



        {/* Full Name */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
            Nome Completo Oficial *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Ex: Carlos Alberto da Silva"
            autoComplete="name"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
          />
        </div>

        {/* CPF & Birth Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                CPF *
              </label>
              {cpf && (
                <span className="text-[11px] font-mono flex items-center gap-1">
                  {validateCPF(cpf) ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Válido
                    </span>
                  ) : (
                    <span className="text-amber-400">Dígitos inválidos</span>
                  )}
                </span>
              )}
            </div>
            <input
              type="text"
              required
              maxLength={14}
              value={cpf}
              onChange={handleCpfChange}
              placeholder="000.000.000-00"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Data de Nascimento (DD/MM/AAAA) *
              </label>
              {birthDateBR && (
                <span className="text-[11px] font-mono flex items-center gap-1">
                  {isValidDateBR(birthDateBR) ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Padrão BR
                    </span>
                  ) : (
                    <span className="text-amber-400">Formato: DD/MM/AAAA</span>
                  )}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                required
                maxLength={10}
                value={birthDateBR}
                onChange={handleBirthDateChange}
                placeholder="DD/MM/AAAA"
                className="w-full pl-4 pr-11 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-mono"
              />

              {/* Native Date Picker trigger overlay */}
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                <label className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors cursor-pointer" title="Abrir calendário">
                  <Calendar className="w-4 h-4" />
                  <input
                    type="date"
                    onChange={handlePickerChange}
                    className="sr-only"
                    tabIndex={-1}
                  />
                </label>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 mt-1 block">
              Padrão Brasil: dia / mês / ano (Ex: 15/04/1985)
            </span>
          </div>
        </div>

        {/* Minor Protection: Required parent info if age < 18 */}
        {isMinor && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <UserX className="w-4 h-4" />
              <span>Autorização Obrigatória de Menor de 18 Anos (ECA & LGPD)</span>
            </div>
            <p className="text-[11px] text-zinc-300">
              O cadastro de associados menores de idade necessita de expressa anuência e dados do responsável legal.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">Nome Completo do Responsável Legal *</label>
                <input
                  type="text"
                  value={parentName}
                  onChange={e => setParentName(e.target.value)}
                  placeholder="Nome do pai, mãe ou tutor"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white"
                  required={isMinor}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">CPF do Responsável Legal *</label>
                <input
                  type="text"
                  maxLength={14}
                  value={parentCpf}
                  onChange={e => setParentCpf(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white font-mono"
                  required={isMinor}
                />
              </div>
            </div>
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="parentAuth"
                checked={parentAuthorized}
                onChange={e => setParentAuthorized(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 border-zinc-700 cursor-pointer"
                required={isMinor}
              />
              <label htmlFor="parentAuth" className="text-xs text-zinc-300 cursor-pointer select-none">
                <strong className="text-amber-300">Autorização Expressa:</strong> Como responsável legal pelo menor, autorizo expressamente seu cadastro e filiação à Sociedade nos termos do Art. 14 da Lei 13.709/2018 (LGPD).
              </label>
            </div>
          </div>
        )}

        {/* Email & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              E-mail de Contato *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu.email@exemplo.com"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
            />
          </div>
        </div>

        {/* Category Notification */}
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold block">
              Categoria do Associado
            </span>
            <p className="text-zinc-200 mt-0.5">
              A sua classificação oficial na associação (<strong className="text-emerald-400">SÓCIO</strong> ou <strong className="text-amber-400">MEMBRO DA DIRETORIA</strong>) será definida pelo administrador no momento da homologação.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] shrink-0 self-start sm:self-auto">
            Atribuído na Aprovação
          </span>
        </div>

        {/* LGPD Required Consent */}
        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="lgpd"
              checked={lgpdConsent}
              onChange={e => setLgpdConsent(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="lgpd" className="text-xs text-zinc-300 leading-relaxed cursor-pointer select-none">
              <span className="font-semibold text-white">Conformidade LGPD (Lei nº 13.709/2018): </span>
              Declaro que as informações prestadas são verídicas e autorizo o tratamento dos meus dados pessoais
              (nome, CPF, data de nascimento e foto) exclusivamente para identificação associativa, controle de
              quadro social e emissão da credencial/carteirinha digital.{' '}
              <button
                type="button"
                onClick={() => setShowLgpdModal(true)}
                className="text-emerald-400 underline hover:text-emerald-300 inline-flex items-center gap-0.5 ml-1"
              >
                Ler Termos de Privacidade
              </button>
            </label>
          </div>
        </div>

        {/* Granular Optional Consents */}
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
          <span className="text-[10px] uppercase font-mono text-zinc-400 font-bold block">
            Preferências de Privacidade Adicionais (Opcionais)
          </span>

          {/* Birthday consent */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="birthdayConsent"
              checked={allowBirthdayPublic}
              onChange={e => setAllowBirthdayPublic(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="birthdayConsent" className="text-xs text-zinc-300 cursor-pointer select-none">
              <span className="font-semibold text-white">Autorizo mostrar meu nome e dia/mês de nascimento aos demais sócios</span> (o ano de nascimento e idade nunca são exibidos).
            </label>
          </div>

          {/* Event photos consent */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="eventPhotosConsent"
              checked={allowEventPhotos}
              onChange={e => setAllowEventPhotos(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="eventPhotosConsent" className="text-xs text-zinc-300 cursor-pointer select-none">
              Autorizo o uso de minha imagem em registros fotográficos de competições, torneios de tiro e eventos tradicionais da Sociedade.
            </label>
          </div>

          {/* Communications consent */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="communicationsConsent"
              checked={allowCommunications}
              onChange={e => setAllowCommunications(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="communicationsConsent" className="text-xs text-zinc-300 cursor-pointer select-none">
              Desejo receber avisos, convocações de assembleia e informativos da Sociedade por e-mail ou WhatsApp.
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>{isEditing ? 'Salvar Alterações' : 'Submeter Cadastro para Homologação'}</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-zinc-400 text-center mt-2.5 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            Seus dados são protegidos em trânsito e em repouso pela infraestrutura do Google Cloud.
          </p>
        </div>
      </form>

      {/* LGPD Modal */}
      {showLgpdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <Shield className="w-5 h-5" />
                <span>Declaração de Privacidade & LGPD</span>
              </div>
              <button
                onClick={() => setShowLgpdModal(false)}
                className="text-zinc-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-3 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
              <p>
                <strong>1. Finalidade Específica:</strong> Os dados fornecidos (Nome, CPF, Data de Nascimento, E-mail,
                Telefone e Foto) serão utilizados unicamente para a emissão de carteirinha de sócio, validação estatutária
                e comunicações institucionais da Associação Sem Fins Lucrativos.
              </p>
              <p>
                <strong>2. Segurança e Armazenamento:</strong> Os dados ficam armazenados na infraestrutura do Firebase
                (Google Cloud), sob diretrizes rigorosas de controle de acesso (ABAC), impedindo o compartilhamento
                comercial ou vazamento a terceiros não autorizados.
              </p>
              <p>
                <strong>3. Direitos do Titular (Art. 18 da Lei 13.709/2018):</strong> Você tem o direito de solicitar a
                qualquer momento a confirmação da existência de tratamento, o acesso aos seus dados, a correção de dados
                incompletos, a anonimização ou exclusão dos seus dados mediante solicitação formal à diretoria.
              </p>
              <p>
                <strong>4. Validade da Credencial:</strong> Em consonância com o estatuto social, a credencial digital
                permanece válida pelo ciclo vigente oficial ({formatDateBR(getDefaultOfficialExpiry())}), exigindo revalidação e consentimento anual
                subsequente.
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-zinc-800 text-right">
              <button
                type="button"
                onClick={() => {
                  setLgpdConsent(true);
                  setShowLgpdModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
              >
                Compreendi e Aceito os Termos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
