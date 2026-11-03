import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { DataSubjectRequest, Member } from '../types/index.ts';
import { maskCPF } from '../utils/cpf.ts';
import {
  Shield,
  Download,
  FileText,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Lock,
  Cake,
  Camera,
  Mail,
  Printer,
  ChevronRight,
  X,
} from 'lucide-react';

interface Props {
  onOpenEditProfile?: () => void;
}

export const MemberDataPrivacyView: React.FC<Props> = ({ onOpenEditProfile }) => {
  const { currentMember, currentUser } = useAuth();
  const dialog = useDialog();

  const [savingConsent, setSavingConsent] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestType, setRequestType] = useState<'retificacao' | 'exclusao_dados'>('retificacao');
  const [requestDetails, setRequestDetails] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  if (!currentMember) {
    return (
      <div className="text-center py-12 text-zinc-400">
        Nenhum perfil de associado associado a este login.
      </div>
    );
  }

  // Toggle granular consent
  const handleToggleConsent = async (field: 'allowBirthdayPublic' | 'allowEventPhotos' | 'allowCommunications') => {
    setSavingConsent(true);
    try {
      const currentVal = Boolean(currentMember[field]);
      const newVal = !currentVal;
      const nowIso = new Date().toISOString();

      const updates: Partial<Member> = {
        [field]: newVal,
        updatedAt: nowIso,
      };

      if (field === 'allowBirthdayPublic') updates.birthdayConsentDate = nowIso;
      if (field === 'allowEventPhotos') updates.eventPhotosConsentDate = nowIso;
      if (field === 'allowCommunications') updates.communicationsConsentDate = nowIso;

      await updateDoc(doc(db, 'members', currentMember.id), updates);
      await dialog.alert(
        `Sua preferência de privacidade para "${
          field === 'allowBirthdayPublic'
            ? 'Divulgação de Aniversário'
            : field === 'allowEventPhotos'
            ? 'Fotos em Eventos'
            : 'Comunicações e Informativos'
        }" foi atualizada com sucesso!`,
        { title: 'Preferência Atualizada' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro ao salvar preferência: ${err.message}`);
    } finally {
      setSavingConsent(false);
    }
  };

  // Download complete personal data as JSON
  const handleDownloadDataCopy = () => {
    const exportData = {
      termo: 'Cópia de Dados Pessoais - Art. 19 da Lei Geral de Proteção de Dados (LGPD)',
      associacao: 'Associação Esportiva e Cultural Rio Camarada',
      geradoEm: new Date().toISOString(),
      titular: {
        id: currentMember.id,
        nomeCompleto: currentMember.fullName,
        cpf: currentMember.cpf,
        dataNascimento: currentMember.birthDate,
        email: currentMember.email,
        telefone: currentMember.phone || 'Não informado',
        categoria: currentMember.category,
        matricula: currentMember.membershipNumber || 'Não gerada',
        status: currentMember.status,
        validadeCarteirinha: currentMember.validUntil,
        fotoUrl: currentMember.photoUrl || 'Não enviada',
      },
      menorDeIdade: currentMember.isMinor
        ? {
            responsavelNome: currentMember.parentName,
            responsavelCpf: currentMember.parentCpf,
            autorizado: currentMember.parentAuthorized,
          }
        : 'Não aplicável (Maior de idade)',
      consentimentos: {
        cadastroECarteirinha: {
          ativo: currentMember.lgpdConsent,
          registradoEm: currentMember.lgpdConsentDate,
          finalidade: 'Vínculo associativo e confecção da carteirinha social',
        },
        divulgacaoAniversario: {
          ativo: Boolean(currentMember.allowBirthdayPublic),
          registradoEm: currentMember.birthdayConsentDate || currentMember.createdAt,
          finalidade: 'Exibição aos demais sócios apenas do dia e mês',
        },
        fotosEventos: {
          ativo: Boolean(currentMember.allowEventPhotos),
          registradoEm: currentMember.eventPhotosConsentDate || currentMember.createdAt,
          finalidade: 'Publicação de fotos de torneios e premiações',
        },
        comunicacoes: {
          ativo: Boolean(currentMember.allowCommunications),
          registradoEm: currentMember.communicationsConsentDate || currentMember.createdAt,
          finalidade: 'Envio de convocações de assembleia e avisos',
        },
      },
      seguranca: {
        infraestrutura: 'Google Cloud Platform (GCP)',
        criptografia: 'Protegido em trânsito (TLS 1.3) e em repouso (AES-256)',
      },
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Meus_Dados_LGPD_${currentMember.cpf.replace(/\D/g, '')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Submit formal data subject request to admin queue
  const handleSubmitDataRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestDetails.trim()) {
      await dialog.alert('Informe os detalhes ou a justificativa da sua solicitação.');
      return;
    }

    setSubmittingRequest(true);
    try {
      const id = 'req_' + Date.now();
      const newReq: DataSubjectRequest = {
        id,
        memberId: currentMember.id,
        memberName: currentMember.fullName,
        memberEmail: currentMember.email,
        memberCpf: currentMember.cpf,
        type: requestType,
        details: requestDetails.trim(),
        status: 'pendente',
        requestedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'dataRequests', id), newReq);
      setIsRequestModalOpen(false);
      setRequestDetails('');
      await dialog.alert(
        'Sua solicitação foi protocolada e enviada para o Encarregado de Dados (DPO) e Diretoria da Sociedade. Você receberá um retorno em até 15 dias úteis, conforme estipulado pela LGPD.',
        { title: 'Solicitação Protocolada' }
      );
    } catch (err: any) {
      await dialog.alert(`Erro ao protocolar solicitação: ${err.message}`);
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 p-6 rounded-2xl border border-emerald-500/20 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Painel do Titular: Meus Dados e Privacidade
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">
                Consulte, gerencie consentimentos e exerça seus direitos garantidos pela LGPD (Lei 13.709/2018)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadDataCopy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-700 transition"
              title="Baixar arquivo JSON com todos os dados pessoais mantidos pela Sociedade"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Baixar Cópia (JSON)
            </button>
            <button
              onClick={() => window.print()}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition"
              title="Imprimir extrato de dados cadastrais"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Security Architecture Statement */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 leading-relaxed">
          <strong className="text-white">Infraestrutura e Segurança de Ponta:</strong> Seus dados são protegidos em trânsito e em repouso pela infraestrutura do Google Cloud (GCP) com criptografia padrão bancário AES-256 e TLS 1.3. O acesso aos seus dados é restrito a você e aos membros autorizados da Diretoria Executiva da Associação.
        </div>
      </div>

      {/* Member Data Summary Card */}
      <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            Dados Cadastrais em Registro
          </h2>
          <button
            onClick={onOpenEditProfile}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold rounded-lg transition"
          >
            <Edit3 className="w-3.5 h-3.5" /> Editar Cadastro
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Nome Completo:</span>
            <span className="font-bold text-white mt-0.5 block">{currentMember.fullName}</span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">CPF do Associado:</span>
            <span className="font-mono font-bold text-white mt-0.5 block">{maskCPF(currentMember.cpf)}</span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Data de Nascimento:</span>
            <span className="font-bold text-white mt-0.5 block">
              {currentMember.birthDate
                ? new Date(currentMember.birthDate + 'T12:00:00').toLocaleDateString('pt-BR')
                : '-'}
            </span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">E-mail Cadastrado:</span>
            <span className="font-medium text-white mt-0.5 block truncate">{currentMember.email}</span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Telefone / WhatsApp:</span>
            <span className="font-medium text-white mt-0.5 block">{currentMember.phone || 'Não informado'}</span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Número de Matrícula:</span>
            <span className="font-mono font-bold text-emerald-400 mt-0.5 block">
              {currentMember.membershipNumber || 'Em emissão'}
            </span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Categoria Associativa:</span>
            <span className="font-bold text-white mt-0.5 block">{currentMember.category}</span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Validade da Carteirinha:</span>
            <span className="font-bold text-white mt-0.5 block">
              {currentMember.validUntil
                ? new Date(currentMember.validUntil + 'T12:00:00').toLocaleDateString('pt-BR')
                : '-'}
            </span>
          </div>

          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <span className="text-zinc-500 block">Situação Cadastral:</span>
            <span className="font-bold text-emerald-400 uppercase mt-0.5 block">{currentMember.status}</span>
          </div>
        </div>

        {currentMember.isMinor && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-1">
            <h4 className="font-bold text-amber-300">Proteção Especial para Menores de Idade (ECA & LGPD)</h4>
            <p className="text-zinc-300">
              Responsável Legal: <strong>{currentMember.parentName}</strong> • CPF: <strong>{maskCPF(currentMember.parentCpf || '')}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Granular Consent Management */}
      <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Gestão de Consentimentos Granulares
          </h2>
          <p className="text-xs text-zinc-400">
            Você tem total autonomia para autorizar ou revogar cada tratamento opcional de dados a qualquer momento.
          </p>
        </div>

        <div className="space-y-3">
          {/* Required Consent: Registration */}
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  Cadastro Associativo e Emissão de Carteirinha Social
                  <span className="ml-2 text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded font-semibold">
                    Obrigatório
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Necessário para a identificação perante a Associação, controle de acesso e estande de tiro. Base legal: Execução de contrato associativo (Art. 7º, V da LGPD).
                </p>
              </div>
            </div>
            <span className="text-xs text-zinc-500 font-semibold shrink-0">Ativo</span>
          </div>

          {/* Optional Consent 1: Birthday */}
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Cake className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  Divulgação de Aniversário no Mural dos Sócios
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Permite exibir seu nome e dia/mês de nascimento aos demais associados logados para celebração de aniversários. O ano e sua idade nunca são exibidos.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={savingConsent}
              onClick={() => handleToggleConsent('allowBirthdayPublic')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
                currentMember.allowBirthdayPublic
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
              }`}
            >
              {currentMember.allowBirthdayPublic ? 'Autorizado (Sim)' : 'Revogado (Não)'}
            </button>
          </div>

          {/* Optional Consent 2: Event Photos */}
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  Fotografia em Competições, Treinos e Festas Tradicionais
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Autoriza o registro e a publicação de fotos suas em premiações esportivas, torneios de tiro e Schützenfest na galeria da Sociedade.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={savingConsent}
              onClick={() => handleToggleConsent('allowEventPhotos')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
                currentMember.allowEventPhotos
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
              }`}
            >
              {currentMember.allowEventPhotos ? 'Autorizado (Sim)' : 'Revogado (Não)'}
            </button>
          </div>

          {/* Optional Consent 3: Communications */}
          <div className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  Informativos Culturais, Calendário e Notificações Gerais
                </h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Recebimento de e-mails e avisos sobre programação de treinos, novos artigos culturais e avisos institucionais.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={savingConsent}
              onClick={() => handleToggleConsent('allowCommunications')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shrink-0 ${
                currentMember.allowCommunications
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
              }`}
            >
              {currentMember.allowCommunications ? 'Autorizado (Sim)' : 'Revogado (Não)'}
            </button>
          </div>
        </div>
      </div>

      {/* Formal Data Subject Requests (Direitos do Titular) */}
      <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Canal de Atendimento ao Titular (Art. 18 LGPD)
          </h2>
          <p className="text-xs text-zinc-400">
            Deseja solicitar retificação de dados incorretos ou protocolar pedido de exclusão / desfiliação?
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              setRequestType('retificacao');
              setIsRequestModalOpen(true);
            }}
            className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition flex items-center gap-2"
          >
            <Edit3 className="w-4 h-4 text-emerald-400" />
            Solicitar Retificação Formal de Dados
          </button>

          <button
            onClick={() => {
              setRequestType('exclusao_dados');
              setIsRequestModalOpen(true);
            }}
            className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 transition flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            Solicitar Exclusão de Cadastro / Desfiliação
          </button>
        </div>
      </div>

      {/* Request Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                {requestType === 'retificacao'
                  ? 'Solicitação de Retificação de Dados Cadastrais'
                  : 'Solicitação de Exclusão de Dados / Desfiliação'}
              </h3>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDataRequest} className="p-5 space-y-4 text-xs">
              <p className="text-zinc-300 leading-relaxed">
                {requestType === 'retificacao'
                  ? 'Especifique quais dados necessitam de correção e, se aplicável, apresente o novo valor pretendido.'
                  : 'O pedido de exclusão e revogação total dos dados implicará no cancelamento da carteirinha e desfiliação da Sociedade, ressalvada a guarda de registros obrigatórios por lei.'}
              </p>

              <div>
                <label className="text-[11px] text-zinc-400 font-semibold block mb-1">
                  Detalhes da Solicitação *
                </label>
                <textarea
                  rows={4}
                  value={requestDetails}
                  onChange={e => setRequestDetails(e.target.value)}
                  placeholder="Descreva detalhadamente sua solicitação..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg shadow-md"
                >
                  {submittingRequest ? 'Protocolando...' : 'Protocolar Pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
