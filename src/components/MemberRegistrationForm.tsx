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
  Calendar,
  Cake,
  Mail,
  Share2,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
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
    allowSocialMediaPhotos?: boolean;
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

  // LGPD Consents
  const [lgpdConsent, setLgpdConsent] = useState(isEditing ? true : false);
  const [allowSocialMediaPhotos, setAllowSocialMediaPhotos] = useState(
    initialData?.allowSocialMediaPhotos !== undefined ? initialData.allowSocialMediaPhotos : true
  );
  const [allowEventPhotos, setAllowEventPhotos] = useState(
    initialData?.allowEventPhotos !== undefined ? initialData.allowEventPhotos : true
  );
  const [allowBirthdayPublic, setAllowBirthdayPublic] = useState(
    Boolean(initialData?.allowBirthdayPublic)
  );
  const [allowCommunications, setAllowCommunications] = useState(
    initialData?.allowCommunications !== undefined ? initialData.allowCommunications : true
  );

  // Minor protection state
  const [parentName, setParentName] = useState(initialData?.parentName || '');
  const [parentCpf, setParentCpf] = useState(initialData?.parentCpf || '');
  const [parentAuthorized, setParentAuthorized] = useState(Boolean(initialData?.parentAuthorized));

  const [showLgpdModal, setShowLgpdModal] = useState(false);
  const [showDetailedTermsAccordion, setShowDetailedTermsAccordion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const scrollToTop = () => {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {}
    };

    if (!currentUser) {
      setErrorMsg('Você precisa estar autenticado para enviar o cadastro.');
      scrollToTop();
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Por favor, informe seu nome completo.');
      scrollToTop();
      return;
    }

    if (!validateCPF(cpf)) {
      setErrorMsg('CPF inválido. Verifique os dígitos digitados.');
      scrollToTop();
      return;
    }

    if (!birthDateBR || !isValidDateBR(birthDateBR)) {
      setErrorMsg('Por favor, informe uma data de nascimento válida no padrão brasileiro (DD/MM/AAAA).');
      scrollToTop();
      return;
    }

    if (isMinor) {
      if (!parentName.trim() || parentName.trim().length < 3) {
        setErrorMsg('O cadastro de menores de 18 anos exige o nome completo do responsável legal.');
        scrollToTop();
        return;
      }
      if (!validateCPF(parentCpf)) {
        setErrorMsg('CPF do responsável legal inválido.');
        scrollToTop();
        return;
      }
      if (!parentAuthorized) {
        setErrorMsg('É obrigatório que o responsável legal declare expressa autorização para cadastro e tratamento de dados do menor (Art. 14 da LGPD).');
        scrollToTop();
        return;
      }
    }

    if (!lgpdConsent) {
      setErrorMsg('Você deve concordar com os termos de consentimento e tratamento de dados pessoais (LGPD).');
      scrollToTop();
      return;
    }

    setSubmitting(true);

    try {
      const memberId = currentMember?.id || currentUser.uid;
      const path = 'members';
      const normalizedBirthDate = dateBRToISO(birthDateBR);
      const nowIso = new Date().toISOString();

      // Ensure zero undefined values in payload (Firestore rejects any undefined field)
      const payload: Record<string, any> = {
        id: memberId,
        userId: currentUser.uid,
        fullName: fullName.trim(),
        cpf: cpf.trim(),
        birthDate: normalizedBirthDate,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        photoUrl: photoUrl || '',
        membershipNumber: currentMember?.membershipNumber || `SOC-${Math.floor(100000 + Math.random() * 900000)}`,
        category: category || 'Sócio Efetivo',
        status: isEditing && currentMember?.status === 'aprovado' ? 'aprovado' : 'pendente',
        rejectionReason: '',
        lgpdConsent: true,
        lgpdConsentDate: nowIso,
        allowSocialMediaPhotos: Boolean(allowSocialMediaPhotos),
        socialMediaPhotosConsentDate: allowSocialMediaPhotos ? nowIso : '',
        allowEventPhotos: Boolean(allowEventPhotos),
        eventPhotosConsentDate: allowEventPhotos ? nowIso : '',
        allowBirthdayPublic: Boolean(allowBirthdayPublic),
        birthdayConsentDate: allowBirthdayPublic ? nowIso : '',
        allowCommunications: Boolean(allowCommunications),
        communicationsConsentDate: allowCommunications ? nowIso : '',
        consentVersion: 'v3_lgpd_redes_sociais',
        isMinor: Boolean(isMinor),
        parentName: isMinor ? parentName.trim() : '',
        parentCpf: isMinor ? parentCpf.trim() : '',
        parentAuthorized: isMinor ? Boolean(parentAuthorized) : false,
        validUntil: currentMember?.validUntil || getDefaultOfficialExpiry(),
        renewalCount: currentMember?.renewalCount || 0,
        createdAt: currentMember?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, path, memberId), payload, { merge: true });

      // Create confirmation notification in background (non-fatal if blocked)
      try {
        const notifPath = 'notifications';
        const notifId = `notif_${Date.now()}`;
        await setDoc(doc(db, notifPath, notifId), {
          id: notifId,
          userId: currentUser.uid,
          title: '📋 Cadastro Enviado para Homologação',
          message: 'Seu cadastro e os termos de LGPD e uso de imagem foram salvos com sucesso e aguardam homologação pela diretoria da sociedade.',
          type: 'status_change',
          read: false,
          createdAt: new Date().toISOString(),
        });
      } catch (notifErr) {
        console.warn('Gravação de notificação secundária não concluída:', notifErr);
      }

      setIsSubmittedSuccess(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Erro ao submeter cadastro do associado:', err);
      let friendlyMsg = 'Não foi possível salvar o seu cadastro. Verifique sua conexão à internet e tente novamente.';
      if (err?.code === 'permission-denied') {
        friendlyMsg = 'Permissão negada pelo servidor ao salvar o cadastro. Por favor, verifique se está logado ou contate a administração.';
      } else if (err?.message) {
        friendlyMsg = `Falha ao salvar: ${err.message}`;
      }
      setErrorMsg(friendlyMsg);
      scrollToTop();
    } finally {
      setSubmitting(false);
    }
  };

  if (isSubmittedSuccess && !isEditing) {
    return (
      <div className="bg-zinc-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-10 shadow-2xl max-w-2xl mx-auto text-zinc-100 text-center space-y-6 animate-scale-in">
        <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-950/50">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white">Cadastro Enviado com Sucesso!</h2>
          <p className="text-sm text-zinc-300 max-w-md mx-auto leading-relaxed">
            Seus dados cadastrais, termos de privacidade LGPD e autorizações de uso de imagem foram salvos com sucesso na <strong>Sociedade Recreativa e Esportiva Rio Camarada</strong>.
          </p>
        </div>

        <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 text-xs text-zinc-300 max-w-md mx-auto text-left space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold">
            <Clock className="w-4 h-4 shrink-0" />
            <span>Situação: Aguardando Homologação da Diretoria</span>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            A Diretoria Executiva irá homologar sua inscrição estatutária. Assim que seu cadastro for homologado, sua carteirinha digital estará disponível automaticamente no Portal do Associado.
          </p>
        </div>

        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (onSuccess) onSuccess();
              else window.location.reload();
            }}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-emerald-900/30"
          >
            <span>Acompanhar Meu Status</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-8 shadow-2xl max-w-2xl mx-auto text-zinc-100 animate-fade-in">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-5 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            {isEditing ? 'Atualizar Dados Cadastrais' : 'Ficha de Cadastro de Associado'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            Sociedade Recreativa e Esportiva Rio Camarada • Portal do Associado
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center gap-3 text-red-200 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Foto Oficial 3x4 */}
        <PhotoUploader
          aspectRatio="3:4"
          storageFolder="members"
          currentPhotoUrl={photoUrl}
          onPhotoSelected={setPhotoUrl}
          label="Foto Oficial do Sócio (Formato 3x4) *"
          helperText="Arraste uma foto, escolha um arquivo ou tire com a câmera do celular com recorte 3x4."
          enableCamera={true}
        />

        {/* Nome Completo */}
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
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
          />
        </div>

        {/* CPF & Data de Nascimento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                CPF *
              </label>
              {cpf && (
                <span className="text-[11px] font-mono flex items-center gap-1">
                  {validateCPF(cpf) ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
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
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Data de Nascimento *
              </label>
              {birthDateBR && (
                <span className="text-[11px] font-mono">
                  {isValidDateBR(birthDateBR) ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Padrão BR (DD/MM/AAAA)
                    </span>
                  ) : (
                    <span className="text-amber-400">DD/MM/AAAA</span>
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
                placeholder="DD/MM/AAAA (ex: 21/07/1980)"
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
          </div>
        </div>

        {/* Alerta de Menor de Idade (Art. 14 da LGPD) */}
        {isMinor && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border border-amber-500/40 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wide">
              <Shield className="w-4 h-4" />
              <span>Titular Menor de 18 Anos — Requisito Legal LGPD (Art. 14, § 1º)</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              O tratamento de dados pessoais e de imagem de crianças e adolescentes deve ser realizado no seu melhor interesse e com consentimento específico fornecido por pelo menos um dos pais ou pelo responsável legal.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">
                  Nome do Responsável Legal *
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={e => setParentName(e.target.value)}
                  placeholder="Nome completo do pai, mãe ou tutor"
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white"
                  required={isMinor}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-300 font-semibold block mb-1">
                  CPF do Responsável Legal *
                </label>
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
              <label htmlFor="parentAuth" className="text-xs text-zinc-300 cursor-pointer select-none leading-relaxed">
                <strong className="text-amber-300">Consentimento do Responsável Legal:</strong> Declaro sob as penas da lei que sou o responsável legal pelo menor e autorizo expressamente seu cadastro, bem como a divulgação e exposição de sua imagem nas redes sociais da sociedade nas mesmas condições pactuadas neste termo (Art. 14 da Lei 13.709/2018).
              </label>
            </div>
          </div>
        )}

        {/* E-mail e Telefone */}
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
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Telefone / WhatsApp de Contato
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(47) 99999-9999"
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-hidden text-sm text-white"
            />
          </div>
        </div>

        {/* SEÇÃO PRINCIPAL DE TERMOS: LGPD & DIREITO DE IMAGEM EM REDES SOCIAIS */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-zinc-950 to-zinc-900 border-2 border-emerald-500/40 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2 text-white">
              <Shield className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold tracking-tight">
                Proteção de Dados (LGPD) e Autorização de Imagem em Redes Sociais
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Lei 13.709/18 & Art. 20 CC
            </span>
          </div>

          {/* 1. TERMO OBRIGATÓRIO DE TRATAMENTO DE DADOS PESSOAIS */}
          <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-emerald-500/30">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                id="lgpdConsentInput"
                checked={lgpdConsent}
                onChange={e => setLgpdConsent(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
              />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <span className="font-bold text-white block">
                  1. Termo Geral de Tratamento de Dados Pessoais (LGPD - Lei nº 13.709/2018) *
                </span>
                <p className="mt-1 text-zinc-400 text-[11px] leading-relaxed">
                  Declaro que as informações cadastrais prestadas são verdadeiras e autorizo a <strong>Sociedade Recreativa e Esportiva Rio Camarada</strong> a tratar meus dados pessoais (Nome, CPF, Data de Nascimento, Telefone, E-mail e Foto 3x4) estritamente para identificação institucional, controle do quadro social e emissão da credencial/carteirinha digital social, conforme o Art. 7º, incisos I e V da Lei Federal nº 13.709/2018.
                </p>
              </div>
            </label>
          </div>

          {/* 2. TERMO DESTACADO: AUTORIZAÇÃO DE DIVULGAÇÃO E EXPOSIÇÃO DE IMAGENS NAS REDES SOCIAIS */}
          <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/50 shadow-inner">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                id="socialMediaConsentInput"
                checked={allowSocialMediaPhotos}
                onChange={e => setAllowSocialMediaPhotos(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
              />
              <div className="text-xs text-zinc-200 leading-relaxed">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>2. Autorização de Divulgação e Exposição de Imagem nas Redes Sociais da Sociedade</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-normal">
                    Recomendado
                  </span>
                </span>
                <p className="mt-1 text-zinc-300 text-[11px] leading-relaxed">
                  Nos termos do <strong>Artigo 20 da Lei Federal nº 10.406/2002 (Código Civil Brasileiro)</strong> e dos <strong>Artigos 7º, I e 8º, § 4º da Lei nº 13.709/2018 (LGPD)</strong>, <strong>AUTORIZO EXPRESSAMENTE</strong> a <strong>Sociedade Recreativa e Esportiva Rio Camarada</strong> a captar, fixar, divulgar e expor minha imagem e voz (fotografias e filmagens de torneios esportivos de tiro, premiações, solenidades, celebrações culturais, festividades e atividades sociais da agremiação) em suas contas e perfis oficiais nas redes sociais (<strong>Instagram, Facebook, YouTube, website oficial da sociedade, murais e boletins institucionais</strong>).
                </p>
                <p className="mt-1 text-zinc-400 text-[10px] leading-relaxed italic">
                  A presente autorização é concedida a título gratuito, sem direito a remuneração ou indenização, com finalidade estritamente institucional e associativa, sendo vedada qualquer destinação comercial abusiva ou que atente contra a honra e os bons costumes. Você poderá revogar esta autorização a qualquer momento pelo portal do associado.
                </p>
              </div>
            </label>
          </div>

          {/* 3. PREFERÊNCIAS COMPLEMENTARES (ANIVERSARIANTES & COMUNICAÇÕES) */}
          <div className="space-y-2 pt-1 border-t border-zinc-800">
            {/* Aniversariantes */}
            <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-950/40 transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                id="birthdayConsentInput"
                checked={allowBirthdayPublic}
                onChange={e => setAllowBirthdayPublic(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
              />
              <div className="text-xs text-zinc-300 leading-snug">
                <span className="font-semibold text-white">
                  3. Divulgação na Lista de Aniversariantes:
                </span>{' '}
                Autorizo mostrar meu nome e dia/mês de nascimento aos demais associados na aba de aniversariantes da sociedade (ano e idade nunca são exibidos).
              </div>
            </label>

            {/* Comunicações */}
            <label className="flex items-start gap-3 p-2 rounded-lg hover:bg-zinc-950/40 transition-colors cursor-pointer select-none">
              <input
                type="checkbox"
                id="communicationsConsentInput"
                checked={allowCommunications}
                onChange={e => setAllowCommunications(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
              />
              <div className="text-xs text-zinc-300 leading-snug">
                <span className="font-semibold text-white">
                  4. Informativos e Convocações:
                </span>{' '}
                Desejo receber avisos, convocações de assembleia e informativos da Sociedade por e-mail ou WhatsApp.
              </div>
            </label>
          </div>

          {/* Botão de Leitura do Termo Jurídico Completo */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowLgpdModal(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Ler Termo Jurídico Completo de LGPD e Uso de Imagem</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-zinc-500">
              Versão 3.0 • Revogável a qualquer tempo
            </span>
          </div>
        </div>

        {/* Alerta de Erro Próximo ao Botão de Envio */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-start gap-3 text-red-200 text-xs sm:text-sm animate-pulse">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-white">Não foi possível concluir o envio:</p>
              <p className="leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Botão de Envio */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-900/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <UserCheck className="w-4 h-4" />
                <span>{isEditing ? 'Salvar Alterações do Cadastro' : 'Submeter Cadastro e Aceitar Termos'}</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-zinc-400 text-center mt-2.5 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Dados armazenados sob conformidade da Lei 13.709/2018 e infraestrutura de segurança do Google Cloud.</span>
          </p>
        </div>
      </form>

      {/* MODAL JURÍDICO COMPLETO: LGPD E AUTORIZAÇÃO DE IMAGEM */}
      {showLgpdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl text-zinc-200 overflow-hidden animate-scale-in">
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-inner">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Termo de Consentimento LGPD & Uso de Imagem
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Sociedade Recreativa e Esportiva Rio Camarada • Lei 13.709/18 & Art. 20 CC
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowLgpdModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo Jurídico Formal */}
            <div className="p-5 sm:p-6 text-xs space-y-4 overflow-y-auto leading-relaxed custom-scrollbar text-zinc-300">
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] space-y-1">
                <p><strong>CONTROLADOR:</strong> Sociedade Recreativa e Esportiva Rio Camarada (Associação Rio Camarada), Schroeder/SC.</p>
                <p><strong>FUNDAMENTO LEGAL:</strong> Artigo 5º, incisos X e LXXIX da Constituição Federal de 1988; Artigo 20 da Lei Federal nº 10.406/2002 (Código Civil Brasileiro); Artigos 7º (I e V), 8º, 9º, 14 e 18 da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD).</p>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 1ª — Da Coleta e Tratamento de Dados Cadastrais (LGPD)
                </h4>
                <p>
                  O titular (associado) fornece seus dados pessoais consistentes em Nome Completo, CPF, Data de Nascimento, E-mail, Telefone/WhatsApp e Fotografia Oficial 3x4, autorizando o tratamento destes estritamente para as finalidades de:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-400">
                  <li>Identificação e verificação de elegibilidade estatutária perante a Diretoria;</li>
                  <li>Emissão, renovação e validação da carteirinha digital de associado;</li>
                  <li>Controle de acesso às dependências da sede, estande de tiro esportivo e eventos;</li>
                  <li>Cumprimento de obrigações regulatórias, estatutárias e prestações de contas associativas.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 2ª — Da Autorização de Uso e Exposição de Imagem em Redes Sociais
                </h4>
                <p>
                  Em atendimento ao <strong>Artigo 20 do Código Civil</strong> e aos <strong>Artigos 7º, inciso I e 8º, § 4º da LGPD</strong>, o associado concede à Sociedade autorização expressa, em caráter não exclusivo e gratuito, para captação, gravação, edição, veiculação e exibição pública de sua imagem e voz em fotografias e vídeos obtidos durante torneios, competições esportivas de tiro, solenidades cívicas, festividades culturais e reuniões associativas da agremiação.
                </p>
                <p className="mt-1">
                  <strong>Canais Autorizados:</strong> A veiculação limita-se exclusivamente aos meios de comunicação oficiais da Sociedade, compreendendo:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-400">
                  <li>Redes sociais institucionais (Instagram, Facebook, YouTube, TikTok e congêneres);</li>
                  <li>Website oficial e portal do associado da Sociedade;</li>
                  <li>Murais internos, telões e boletins informativos da sede social.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 3ª — Da Gratuidade e Salvaguarda da Honra
                </h4>
                <p>
                  A autorização de imagem é conferida a título inteiramente gratuito, renunciando expressamente o titular a qualquer retribuição financeira, royalties, direitos autorais conexos ou indenização a qualquer título. Fica terminantemente vedada qualquer destinação comercial abusiva, cessão a terceiros com fins lucrativos ou exposição que cause constrangimento, ofensa à moral, aos bons costumes ou que viole a honra e boa fama do associado (Art. 20, Código Civil).
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 4ª — Da Proteção de Crianças e Adolescentes (Art. 14 da LGPD)
                </h4>
                <p>
                  Tratando-se de titular menor de 18 (dezoito) anos, o consentimento para tratamento de dados cadastrais e a autorização para exposição de imagens nas redes sociais é formalizado com consentimento específico fornecido por seu pai, mãe ou responsável legal devidamente qualificado com CPF, visando sempre o seu melhor interesse e desenvolvimento esportivo/cultural.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 5ª — Dos Direitos do Titular e Revogação do Consentimento (Art. 18 da LGPD)
                </h4>
                <p>
                  O associado tem o direito inalienável de, a qualquer momento e de forma facilitada:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-400">
                  <li>Consultar os dados mantidos e requerer a correção de informações incompletas;</li>
                  <li>Alterar ou <strong>revogar a autorização de uso de sua imagem nas redes sociais</strong> diretamente pelo Portal do Associado ou mediante contato com o Encarregado de Proteção de Dados (DPO);</li>
                  <li>Solicitar a exclusão ou anonimização de fotos após o desligamento da agremiação, ressalvadas as hipóteses de guarda histórica previstas em lei.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                  Cláusula 6ª — Da Segurança e Armazenamento dos Dados
                </h4>
                <p>
                  A Sociedade adota medidas técnicas e administrativas aptas a proteger os dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas, utilizando ambiente em nuvem com criptografia em trânsito e em repouso e regras de controle estrito de privilégios.
                </p>
              </div>
            </div>

            {/* Rodapé Modal */}
            <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-zinc-400">
                Ao clicar em confirmar, você declara ter lido e compreendido os termos.
              </span>
              <button
                type="button"
                onClick={() => {
                  setLgpdConsent(true);
                  setShowLgpdModal(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md"
              >
                Compreendi e Concordo com os Termos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
