import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useAppDialog } from '../context/DialogContext.tsx';
import { Member, MemberStatus, CardTemplate, MemberCategory, MEMBER_CATEGORIES, normalizeMemberCategory } from '../types/index.ts';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { AdminCardCustomizer } from './AdminCardCustomizer.tsx';
import { AssociationLogoUploader } from './AssociationLogoUploader.tsx';
import { VerificationModal } from './VerificationModal.tsx';
import { DigitalCard } from './DigitalCard.tsx';
import { ApproveMemberModal } from './ApproveMemberModal.tsx';
import { AdminManagementView } from './AdminManagementView.tsx';
import { RejectionEmailConfig } from './RejectionEmailConfig.tsx';
import { RejectMemberModal } from './RejectMemberModal.tsx';
import { EventsCalendarView } from './EventsCalendarView.tsx';
import { AdminCultureManager } from './AdminCultureManager.tsx';
import { AdminSocialsManager } from './AdminSocialsManager.tsx';
import { MemberExcelImporterModal } from './MemberExcelImporterModal.tsx';
import { NewsManagerView } from './NewsManagerView.tsx';
import { BirthdaysView } from './BirthdaysView.tsx';
import { AdminFinancialManager } from './AdminFinancialManager.tsx';
import { AdminDataRequestsView } from './AdminDataRequestsView.tsx';
import { PrivacyPolicyView } from './PrivacyPolicyView.tsx';
import { AdminHomepageSettingsManager } from './EditableHomepageBlock.tsx';
import { maskCPF } from '../utils/cpf.ts';
import { formatDateBR } from '../utils/date.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import {
  DEFAULT_OFFICIAL_EXPIRY,
  checkOfficialCardStatus,
  getDefaultOfficialExpiry,
  generateNextMembershipNumber,
} from '../utils/security.ts';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Sliders,
  Shield,
  Download,
  Eye,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  CalendarCheck,
  Edit3,
  Lock,
  Image as ImageIcon,
  Crown,
  Key,
  User,
  Mail,
  BookOpen,
  Share2,
  ShieldCheck,
  Check,
  X,
  Newspaper,
  Gift,
  DollarSign,
  FileText,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Settings,
  HelpCircle,
  CheckSquare,
  Building,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const {
    activeTemplate,
    setActiveTemplate,
    templates,
    currentUser,
    adminList,
    isSuperAdmin,
    isDiretoriaExecutiva,
    isDiretoria,
    boardRole,
    isTesoureiro,
    isConselhoFiscal,
    canManageFinances,
    canViewFinances,
    updateUserCategory,
  } = useAuth();

  const dialog = useAppDialog();
  const [activeGroup, setActiveGroup] = useState<'socios' | 'conteudo' | 'aniversariantes' | 'financeiro' | 'configuracoes' | 'lgpd'>('socios');
  const [activeTab, setActiveTab] = useState<
    | 'members'
    | 'events'
    | 'culture'
    | 'news'
    | 'socials'
    | 'customizer'
    | 'logo'
    | 'birthdays'
    | 'fin_dashboard'
    | 'fin_transactions'
    | 'fin_fees'
    | 'fin_reports'
    | 'admins'
    | 'rejectionEmail'
    | 'homepageTexts'
    | 'lgpd_overview'
    | 'lgpd_requests'
    | 'lgpd_policy'
  >('members');
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [showPrimeirosPassos, setShowPrimeirosPassos] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | (typeof MEMBER_CATEGORIES)[number]>('all');

  const canManageMembers = isSuperAdmin || isDiretoriaExecutiva;
  const canConfigureSettings = isSuperAdmin || isDiretoriaExecutiva;

  // Modals
  const [approvingMember, setApprovingMember] = useState<Member | null>(null);
  const [rejectingMember, setRejectingMember] = useState<Member | null>(null);
  const [previewingMember, setPreviewingMember] = useState<Member | null>(null);
  const [verifyingMember, setVerifyingMember] = useState<Member | null>(null);

  // Bulk Renewal State
  const [showBulkRenewModal, setShowBulkRenewModal] = useState(false);
  const [bulkRenewDate, setBulkRenewDate] = useState(() => getDefaultOfficialExpiry());
  const [bulkRenewing, setBulkRenewing] = useState(false);

  // Individual Validity Edit State
  const [editingValidityMember, setEditingValidityMember] = useState<Member | null>(null);
  const [editingValidityDate, setEditingValidityDate] = useState('');
  const [savingValidity, setSavingValidity] = useState(false);

  // Fetch all members in real-time
  useEffect(() => {
    const path = 'members';
    const unsubscribe = onSnapshot(
      collection(db, path),
      snapshot => {
        const list: Member[] = [];
        snapshot.forEach(docSnap => {
          list.push({ ...docSnap.data(), id: docSnap.id } as Member);
        });
        // Sort: pending first, then by date
        list.sort((a, b) => {
          if (a.status === 'pendente' && b.status !== 'pendente') return -1;
          if (a.status !== 'pendente' && b.status === 'pendente') return 1;
          const getTime = (val: any) => {
            if (!val) return 0;
            if (typeof val === 'object' && val !== null && 'seconds' in val) return val.seconds * 1000;
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
          };
          return getTime(b.createdAt) - getTime(a.createdAt);
        });
        setMembers(list);
        setLoading(false);
      },
      error => {
        console.warn('Members snapshot sync notice:', error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewingMember) setPreviewingMember(null);
        if (verifyingMember) setVerifyingMember(null);
        if (approvingMember) setApprovingMember(null);
        if (rejectingMember) setRejectingMember(null);
        if (showBulkRenewModal) setShowBulkRenewModal(false);
        if (editingValidityMember) setEditingValidityMember(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewingMember, verifyingMember, approvingMember, rejectingMember, showBulkRenewModal, editingValidityMember]);

  // Quick category switch in the table
  const handleQuickChangeCategory = async (memberId: string, newCategory: MemberCategory) => {
    try {
      await updateUserCategory(memberId, newCategory);
    } catch (err: any) {
      console.error('Erro ao atualizar categoria do associado:', err);
      await dialog.alert({
        title: 'Erro ao Atualizar',
        message: 'Erro ao atualizar categoria: ' + (err.message || 'Erro no banco de dados.'),
        variant: 'danger',
      });
    }
  };

  // Trigger Approval Modal with Category Selection & Sequential Number
  const handleOpenApproveModal = (member: Member) => {
    setApprovingMember(member);
  };

  const handleConfirmApproval = async (data: {
    category: MemberCategory;
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    photoUrl?: string;
    validUntil?: string;
    membershipNumber?: string;
  }) => {
    if (!approvingMember) return;
    try {
      const path = 'members';
      // Sequential non-repeating number generator
      let finalMatricula = data.membershipNumber?.trim() || approvingMember.membershipNumber?.trim();
      if (!finalMatricula || !finalMatricula.startsWith('SOC-')) {
        finalMatricula = generateNextMembershipNumber(members);
      }
      const finalValidUntil = data.validUntil?.trim() || approvingMember.validUntil || getDefaultOfficialExpiry();

      const updatedMember = {
        status: 'aprovado' as MemberStatus,
        category: data.category,
        fullName: data.fullName || approvingMember.fullName,
        birthDate: data.birthDate || approvingMember.birthDate,
        photoUrl: data.photoUrl || approvingMember.photoUrl,
        membershipNumber: finalMatricula,
        rejectionReason: '',
        validUntil: finalValidUntil,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, path, approvingMember.id), updatedMember);

      // Sync public card for QR code validation (strictly no PII)
      try {
        await setDoc(doc(db, 'publicCards', approvingMember.id), {
          id: approvingMember.id,
          fullName: updatedMember.fullName,
          category: updatedMember.category,
          status: 'aprovado',
          validUntil: finalValidUntil,
          membershipNumber: finalMatricula,
          photoUrl: updatedMember.photoUrl || '',
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        console.warn('Public card sync notice:', e);
      }

      // Create Push Notification record for user
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: approvingMember.userId,
        title: '🎉 Cadastro Homologado!',
        message: `Parabéns! Sua adesão como ${data.category} foi aprovada. Sua matrícula é ${finalMatricula}.`,
        type: 'approval',
        read: false,
        createdAt: new Date().toISOString(),
      });

      // Fire push notification alert
      triggerPushNotification(
        '🎉 Cadastro Homologado com Sucesso!',
        `A adesão de ${approvingMember.fullName} como ${data.category} (Matrícula: ${finalMatricula}) foi homologada.`,
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${approvingMember.id}`);
    }
  };

  // Reject Member Action with Email Dispatch recorded
  const handleConfirmReject = async (data: {
    reason: string;
    emailSubject: string;
    emailBody: string;
  }) => {
    if (!rejectingMember) return;
    try {
      const path = 'members';
      const reason = data.reason.trim() || 'Ajuste cadastral solicitado pela administração.';

      await updateDoc(doc(db, path, rejectingMember.id), {
        status: 'rejeitado' as MemberStatus,
        rejectionReason: reason,
        updatedAt: new Date().toISOString(),
      });

      // Save email dispatch record for applicant & audit trail
      const dispatchId = `dispatch_${Date.now()}`;
      await setDoc(doc(db, 'emailDispatches', dispatchId), {
        id: dispatchId,
        toEmail: rejectingMember.email,
        toName: rejectingMember.fullName,
        memberId: rejectingMember.id,
        userId: rejectingMember.userId,
        subject: data.emailSubject,
        body: data.emailBody,
        status: 'enviado',
        sentAt: new Date().toISOString(),
      });

      // Send in-app notification
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: rejectingMember.userId,
        title: 'Ajuste Solicitado no Cadastro',
        message: `A administração registrou orientações para seu cadastro: "${reason}". Acesse o portal para atualizar.`,
        type: 'rejection',
        read: false,
        createdAt: new Date().toISOString(),
      });

      triggerPushNotification(
        'Ajuste Cadastral Solicitado',
        `O cadastro de ${rejectingMember.fullName} necessita de correção: ${reason}`,
        'rejection'
      );

      setRejectingMember(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${rejectingMember.id}`);
    }
  };

  // Renewal Action: Extends by +1 year for an individual member
  const handleRenewOneYear = async (member: Member) => {
    try {
      const currentValid = new Date(member.validUntil || getDefaultOfficialExpiry());
      // Add 1 year
      const newExpiry = new Date(currentValid);
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);

      const path = 'members';
      const newValidStr = newExpiry.toISOString().split('T')[0];

      await updateDoc(doc(db, path, member.id), {
        status: 'aprovado' as MemberStatus,
        validUntil: newValidStr,
        renewalCount: (member.renewalCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });

      // Sync public card
      try {
        await setDoc(doc(db, 'publicCards', member.id), {
          validUntil: newValidStr,
          status: 'aprovado',
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {}

      // Push notification
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: member.userId,
        title: '🌟 Carteirinha Renovada por +1 Ano!',
        message: `Sua renovação estatutária foi aprovada! Nova data limite: ${formatDateBR(newValidStr, newValidStr)}.`,
        type: 'approval',
        read: false,
        createdAt: new Date().toISOString(),
      });

      triggerPushNotification(
        '🌟 Renovação de Filiação Concedida',
        `A carteirinha de ${member.fullName} foi renovada com sucesso até ${formatDateBR(newValidStr, newValidStr)}.`,
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${member.id}`);
    }
  };

  // Bulk Renewal for ALL members ("Renovar validade de todos os sócios")
  const handleBulkRenewAll = async () => {
    if (!bulkRenewDate) {
      await dialog.alert({
        title: 'Data Inválida',
        message: 'Por favor, selecione uma data de validade válida para a renovação de todos os sócios.',
        variant: 'warning',
      });
      return;
    }

    setBulkRenewing(true);
    try {
      const batch = writeBatch(db);
      for (const m of members) {
        const memRef = doc(db, 'members', m.id);
        batch.update(memRef, {
          validUntil: bulkRenewDate,
          renewalCount: (m.renewalCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
        const pubRef = doc(db, 'publicCards', m.id);
        batch.set(pubRef, {
          validUntil: bulkRenewDate,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      await batch.commit();

      setShowBulkRenewModal(false);
      await dialog.alert({
        title: 'Validade Renovada com Sucesso!',
        message: `A validade de todos os ${members.length} associados foi atualizada para ${formatDateBR(bulkRenewDate, bulkRenewDate)}.`,
        variant: 'success',
      });

      triggerPushNotification(
        '🔄 Validade Renovada Coletivamente',
        `A diretoria renovou a validade de todos os associados até ${formatDateBR(bulkRenewDate, bulkRenewDate)}.`,
        'approval'
      );
    } catch (err: any) {
      console.error('Erro na renovação coletiva:', err);
      await dialog.alert({
        title: 'Erro na Renovação Coletiva',
        message: 'Falha ao atualizar validade dos sócios: ' + (err.message || 'Erro no banco de dados.'),
        variant: 'danger',
      });
    } finally {
      setBulkRenewing(false);
    }
  };

  // Save Individual Member Validity
  const handleSaveIndividualValidity = async () => {
    if (!editingValidityMember || !editingValidityDate) return;
    setSavingValidity(true);
    try {
      const path = 'members';
      await updateDoc(doc(db, path, editingValidityMember.id), {
        validUntil: editingValidityDate,
        updatedAt: new Date().toISOString(),
      });
      try {
        await setDoc(doc(db, 'publicCards', editingValidityMember.id), {
          validUntil: editingValidityDate,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {}

      setEditingValidityMember(null);
      await dialog.alert({
        title: 'Validade Atualizada',
        message: `A nova data de validade (${formatDateBR(editingValidityDate, editingValidityDate)}) foi salva com sucesso.`,
        variant: 'success',
      });
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Atualizar',
        message: err.message || 'Erro ao persistir nova validade no banco.',
        variant: 'danger',
      });
    } finally {
      setSavingValidity(false);
    }
  };

  // Delete Member (LGPD right to erasure or test cleanup)
  const handleDeleteMember = async (memberId: string) => {
    const confirmed = await dialog.confirm({
      title: 'Excluir Registro (LGPD)',
      message: 'Tem certeza que deseja excluir permanentemente este registro em atendimento às normas LGPD?',
      confirmText: 'Excluir Permanentemente',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const path = 'members';
      await deleteDoc(doc(db, path, memberId));
      try {
        await deleteDoc(doc(db, 'publicCards', memberId));
      } catch (e) {}
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `members/${memberId}`);
    }
  };

  // Export to CSV with masked CPF, RFC 4180 cell quoting, and audit trail
  const handleExportCSV = async () => {
    try {
      const escapeCell = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        'Matricula',
        'Nome Completo',
        'CPF (Mascarado)',
        'Email',
        'Data Nascimento',
        'Categoria',
        'Status',
        'Validade',
        'Consentimento LGPD'
      ];

      const rows = filteredMembers.map(m => [
        escapeCell(m.membershipNumber || ''),
        escapeCell(m.fullName || ''),
        escapeCell(maskCPF(m.cpf)), // CPF mascarado por segurança e LGPD
        escapeCell(m.email || ''),
        escapeCell(m.birthDate || ''),
        escapeCell(normalizeMemberCategory(m.category)),
        escapeCell(m.status || ''),
        escapeCell(m.validUntil || ''),
        escapeCell(m.lgpdConsentDate || ''),
      ]);

      const csvContent = '\uFEFF' + [
        headers.map(escapeCell).join(';'),
        ...rows.map(r => r.join(';'))
      ].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `socios_associacao_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Audit log: register who exported and when
      const auditId = `audit_export_${Date.now()}`;
      await setDoc(doc(db, 'auditLogs', auditId), {
        id: auditId,
        action: 'EXPORT_MEMBERS_CSV',
        exportedByEmail: currentUser?.email || 'admin',
        exportedByUid: currentUser?.uid || '',
        exportedByName: currentUser?.displayName || 'Administrador',
        totalMembersExported: filteredMembers.length,
        timestamp: new Date().toISOString(),
      });

      triggerPushNotification(
        '📊 Base de Sócios Exportada',
        `A planilha com ${filteredMembers.length} sócios foi exportada em CSV por ${currentUser?.email || 'gestor'}.`,
        'approval'
      );
    } catch (err: any) {
      console.error('Erro ao exportar base de sócios:', err);
      await dialog.alert({
        title: 'Erro ao Exportar',
        message: 'Erro ao exportar planilha: ' + (err.message || 'Erro desconhecido.'),
        variant: 'danger',
      });
    }
  };

  // Filter members
  const filteredMembers = members.filter(m => {
    const matchesSearch =
      m.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.cpf?.includes(searchTerm) ||
      m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.membershipNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;

    const normalizedCat = normalizeMemberCategory(m.category);
    const matchesCategory =
      categoryFilter === 'all' || normalizedCat === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Metrics
  const totalCount = members.length;
  const pendingCount = members.filter(m => m.status === 'pendente').length;
  const approvedCount = members.filter(m => m.status === 'aprovado').length;
  const rejectedCount = members.filter(m => m.status === 'rejeitado').length;
  const expiredCount = members.filter(m => m.status === 'expirado').length;

  return (
    <div className="w-full max-w-7xl mx-auto py-6 sm:py-8 px-3 sm:px-6 space-y-6 sm:space-y-8 overflow-x-hidden">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
              {isSuperAdmin
                ? 'Superadmin Geral (Acesso Total & Configuração de Usuários)'
                : isDiretoriaExecutiva
                ? 'Diretoria Executiva (Homologação & Gestão)'
                : 'Membro da Diretoria (Fiscalização & Validação)'}
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              {currentUser?.email}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Gestão da Associação & Carteirinhas
          </h1>
        </div>

        {/* Quick info chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl">
            Total de Sócios: <strong className="text-emerald-400">{totalCount}</strong>
          </span>
          {pendingCount > 0 && (
            <span className="text-xs text-amber-300 bg-amber-950/60 border border-amber-500/40 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 animate-pulse">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {pendingCount} Pendente(s)
            </span>
          )}
        </div>
      </div>

      {/* Primeiros Passos (Checklist do Administrador) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Primeiros Passos do Administrador</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Associação Rio Camarada
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Guia prático para configuração e implantação do portal da sociedade
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowPrimeirosPassos(!showPrimeirosPassos)}
            className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/80 transition-all flex items-center gap-1 cursor-pointer"
          >
            <span>{showPrimeirosPassos ? 'Recolher' : 'Exibir Checklist'}</span>
            {showPrimeirosPassos ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showPrimeirosPassos && (
          <div className="space-y-4 pt-2 border-t border-zinc-800/80 animate-fade-in">
            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
                <span className="text-zinc-400">Progresso de Implantação do Portal</span>
                <span className="text-emerald-400 font-bold">
                  {members.length > 0 ? '5 de 6 etapas recomendadas (83%)' : '4 de 6 etapas recomendadas (67%)'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-zinc-950 overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: members.length > 0 ? '83%' : '67%' }}
                />
              </div>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">1. Associação & Logotipo</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Nome e brasão oficial da Associação Rio Camarada configurados.
                  </p>
                  <button
                    onClick={() => {
                      setActiveGroup('conteudo');
                      setActiveTab('logo');
                    }}
                    className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer block"
                  >
                    Gerenciar Logo →
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">2. Modelo da Carteirinha</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Layout da credencial com selo 24h e QR Code dinâmico ativado.
                  </p>
                  <button
                    onClick={() => {
                      setActiveGroup('conteudo');
                      setActiveTab('customizer');
                    }}
                    className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer block"
                  >
                    Formatador da Carteirinha →
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  members.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {members.length > 0 ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">3. Sócios Cadastrados</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    {members.length > 0 ? `${members.length} associado(s) na base.` : 'Cadastre ou importe por planilha.'}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => {
                        setActiveGroup('socios');
                        setActiveTab('members');
                      }}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      Ver Sócios →
                    </button>
                    <button
                      onClick={() => setShowExcelImporter(true)}
                      className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 cursor-pointer"
                    >
                      Importar Planilha →
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">4. Notícias & Conteúdo</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Publique notícias de tiro esportivo e artigos culturais para os sócios.
                  </p>
                  <button
                    onClick={() => {
                      setActiveGroup('conteudo');
                      setActiveTab('news');
                    }}
                    className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer block"
                  >
                    Cadastrar Notícias →
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">5. Tesouraria & PIX</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Contas bancárias, mensalidades e chave PIX para prestação de contas.
                  </p>
                  <button
                    onClick={() => {
                      setActiveGroup('financeiro');
                      setActiveTab('fin_dashboard');
                    }}
                    className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer block"
                  >
                    Abrir Módulo Financeiro →
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white">6. Encarregado LGPD (DPO)</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                    Política de privacidade ativa com canal de atendimento a titulares.
                  </p>
                  <button
                    onClick={() => {
                      setActiveGroup('lgpd');
                      setActiveTab('lgpd_policy');
                    }}
                    className="mt-2 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer block"
                  >
                    Ver Política & DPO →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6 GRUPOS PRINCIPAIS DE NAVEGAÇÃO DO ADMINISTRADOR */}
      <div className="space-y-3">
        {/* Grupos Principais */}
        <div className="w-full overflow-x-auto custom-scrollbar pb-1">
          <div className="inline-flex min-w-full sm:min-w-0 items-center gap-1.5 bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 shadow-md">
            <button
              onClick={() => {
                setActiveGroup('socios');
                setActiveTab('members');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'socios'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>1. Sócios</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-950/60 text-emerald-300 font-mono">
                {totalCount}
              </span>
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-zinc-950 font-black animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveGroup('conteudo');
                setActiveTab('news');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'conteudo'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>2. Conteúdo</span>
            </button>

            <button
              onClick={() => {
                setActiveGroup('aniversariantes');
                setActiveTab('birthdays');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'aniversariantes'
                  ? 'bg-pink-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Gift className="w-4 h-4 text-pink-300" />
              <span>3. Aniversariantes</span>
            </button>

            <button
              onClick={() => {
                setActiveGroup('financeiro');
                setActiveTab('fin_dashboard');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'financeiro'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>4. Financeiro</span>
              {isConselhoFiscal && (
                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">Fiscal</span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveGroup('configuracoes');
                setActiveTab('admins');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'configuracoes'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Settings className="w-4 h-4 text-zinc-300" />
              <span>5. Configurações</span>
            </button>

            <button
              onClick={() => {
                setActiveGroup('lgpd');
                setActiveTab('lgpd_overview');
              }}
              className={`whitespace-nowrap shrink-0 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeGroup === 'lgpd'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>6. LGPD</span>
            </button>
          </div>
        </div>

        {/* Sub-Navegação Dinâmica do Grupo Ativo */}
        <div className="w-full overflow-x-auto custom-scrollbar pb-1">
          <div className="inline-flex min-w-full sm:min-w-0 items-center gap-1.5 bg-zinc-950/70 p-1.5 rounded-xl border border-zinc-800/80">
            {activeGroup === 'socios' && (
              <>
                <button
                  onClick={() => setActiveTab('members')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'members'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Gestão & Homologação de Sócios</span>
                </button>
                <button
                  onClick={() => setShowExcelImporter(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5 border border-zinc-700"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Importar Sócios por Planilha</span>
                </button>
              </>
            )}

            {activeGroup === 'conteudo' && (
              <>
                <button
                  onClick={() => setActiveTab('news')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'news'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Newspaper className="w-3.5 h-3.5 text-blue-400" />
                  <span>Notícias de Tiro Esportivo</span>
                </button>
                <button
                  onClick={() => setActiveTab('culture')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'culture'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Espaço Cultural</span>
                </button>
                <button
                  onClick={() => setActiveTab('events')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'events'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Agenda de Eventos</span>
                </button>
                <button
                  onClick={() => setActiveTab('socials')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'socials'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5 text-pink-400" />
                  <span>Redes Sociais</span>
                </button>
                <button
                  onClick={() => setActiveTab('logo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'logo'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Logotipo Oficial</span>
                </button>
                <button
                  onClick={() => setActiveTab('customizer')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'customizer'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Formatador da Carteirinha</span>
                </button>
              </>
            )}

            {activeGroup === 'aniversariantes' && (
              <button
                onClick={() => setActiveTab('birthdays')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'birthdays'
                    ? 'bg-pink-700 text-white shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <Gift className="w-3.5 h-3.5 text-pink-400" />
                <span>Agenda de Aniversários & Parabéns WhatsApp</span>
              </button>
            )}

            {activeGroup === 'financeiro' && (
              <>
                <button
                  onClick={() => setActiveTab('fin_dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'fin_dashboard'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Painel Financeiro Geral</span>
                </button>
                <button
                  onClick={() => setActiveTab('fin_transactions')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'fin_transactions'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Lançamentos & Livro Caixa</span>
                </button>
                <button
                  onClick={() => setActiveTab('fin_fees')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'fin_fees'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mensalidades & Anuidades</span>
                </button>
                <button
                  onClick={() => setActiveTab('fin_reports')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'fin_reports'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>Fechamento Mensal & Balancetes</span>
                </button>
              </>
            )}

            {activeGroup === 'configuracoes' && (
              <>
                <button
                  onClick={() => setActiveTab('admins')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'admins'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span>Gestores & Papéis ({adminList.length + 1})</span>
                </button>
                <button
                  onClick={() => setActiveTab('rejectionEmail')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'rejectionEmail'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 text-red-400" />
                  <span>Texto de Rejeição (E-mail Registrado)</span>
                </button>
                <button
                  onClick={() => setActiveTab('homepageTexts')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'homepageTexts'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Building className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Textos & Subtítulo da Página Inicial</span>
                </button>
              </>
            )}

            {activeGroup === 'lgpd' && (
              <>
                <button
                  onClick={() => setActiveTab('lgpd_overview')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'lgpd_overview'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Métricas Reais & Conformidade</span>
                </button>
                <button
                  onClick={() => setActiveTab('lgpd_requests')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'lgpd_requests'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>Fila de Solicitações de Titulares</span>
                </button>
                <button
                  onClick={() => setActiveTab('lgpd_policy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'lgpd_policy'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Política de Privacidade & Encarregado (DPO)</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: MEMBERS MANAGEMENT */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-sm">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                Total de Sócios
              </span>
              <span className="text-2xl font-black text-white mt-1 block">{totalCount}</span>
            </div>

            <div className="bg-amber-950/20 border border-amber-500/30 p-4 rounded-2xl shadow-sm">
              <span className="text-[11px] font-medium text-amber-300 uppercase tracking-wider block">
                Aguardando Aprovação
              </span>
              <span className="text-2xl font-black text-amber-400 mt-1 block">{pendingCount}</span>
            </div>

            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-2xl shadow-sm">
              <span className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider block">
                Homologados Ativos
              </span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block">{approvedCount}</span>
            </div>

            <div className="bg-red-950/20 border border-red-500/30 p-4 rounded-2xl shadow-sm">
              <span className="text-[11px] font-medium text-red-300 uppercase tracking-wider block">
                Necessitam Ajuste
              </span>
              <span className="text-2xl font-black text-red-400 mt-1 block">{rejectedCount}</span>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-sm">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
                Vigência Expirada
              </span>
              <span className="text-2xl font-black text-zinc-300 mt-1 block">{expiredCount}</span>
            </div>
          </div>

          {/* Action & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 p-3.5 rounded-2xl shadow-md">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por Nome, CPF ou E-mail..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-hidden focus:border-emerald-500"
              >
                <option value="all">Todos os Status</option>
                <option value="pendente">Apenas Pendentes ({pendingCount})</option>
                <option value="aprovado">Apenas Aprovados ({approvedCount})</option>
                <option value="rejeitado">Apenas Rejeitados ({rejectedCount})</option>
                <option value="expirado">Apenas Expirados ({expiredCount})</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-hidden focus:border-emerald-500"
              >
                <option value="all">Todas as Categorias</option>
                {MEMBER_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Actions: Bulk Renew & Export */}
            <div className="flex items-center gap-2 flex-wrap">
              {canManageMembers && (
                <button
                  onClick={() => {
                    setBulkRenewDate(getDefaultOfficialExpiry());
                    setShowBulkRenewModal(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  title="Renovar a validade de todos os sócios cadastrados"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Renovar validade de todos os sócios</span>
                </button>
              )}

              <button
                onClick={handleExportCSV}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-zinc-700 cursor-pointer"
                title="Exportar dados em formato CSV para Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            {loading ? (
              <div className="p-12 text-center text-zinc-500 text-sm flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Carregando base de sócios...</span>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 text-sm">
                Nenhum sócio encontrado para os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-3.5 px-4 font-semibold">Sócio / Foto</th>
                      <th className="py-3.5 px-4 font-semibold">CPF do Titular</th>
                      <th className="py-3.5 px-4 font-semibold">Data Nasc. / Contato</th>
                      <th className="py-3.5 px-4 font-semibold">Classificação</th>
                      <th className="py-3.5 px-4 font-semibold">Status</th>
                      <th className="py-3.5 px-4 font-semibold">Vigência Carteirinha</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Ações do Administrador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredMembers.map(m => {
                      const officialStatus = checkOfficialCardStatus(m.validUntil);
                      return (
                        <tr key={m.id} className="hover:bg-zinc-800/40 transition-colors">
                          {/* Photo & Name */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-12 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-950 shrink-0">
                                {m.photoUrl ? (
                                  <img src={m.photoUrl} alt={m.fullName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px]">
                                    3x4
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="font-bold text-white text-sm block leading-snug">
                                  {m.fullName}
                                </span>
                                <span className="text-[11px] text-zinc-400 block">{m.email}</span>
                              </div>
                            </div>
                          </td>

                          {/* CPF do Titular (Matrícula removida) */}
                          <td className="py-3 px-4 font-mono">
                            <div className="font-semibold text-white text-xs">{maskCPF(m.cpf)}</div>
                          </td>

                          {/* BirthDate & Contact */}
                          <td className="py-3 px-4">
                            <div className="font-mono text-zinc-200">{formatDateBR(m.birthDate)}</div>
                            <div className="text-zinc-400 text-[11px]">{m.phone || '-'}</div>
                          </td>

                          {/* Category (Sócio Efetivo vs Membro da Diretoria vs Membro Diretoria Executiva) */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              {(() => {
                                const normCat = normalizeMemberCategory(m.category);
                                if (normCat === 'Membro Diretoria Executiva') {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-400 text-zinc-950 border border-amber-300 shadow-xs">
                                      <Crown className="w-2.5 h-2.5" />
                                      <span>Membro Diretoria Executiva</span>
                                    </span>
                                  );
                                }
                                if (normCat === 'Membro da Diretoria') {
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-sky-400 text-zinc-950 border border-sky-300 shadow-xs">
                                      <ShieldCheck className="w-2.5 h-2.5" />
                                      <span>Membro da Diretoria</span>
                                    </span>
                                  );
                                }
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    <User className="w-2.5 h-2.5" />
                                    <span>Sócio Efetivo</span>
                                  </span>
                                );
                              })()}

                              {canManageMembers && (
                                <select
                                  value={normalizeMemberCategory(m.category)}
                                  onChange={e => handleQuickChangeCategory(m.id, e.target.value as MemberCategory)}
                                  className="bg-zinc-950 border border-zinc-700 text-[10px] text-zinc-300 rounded px-1.5 py-0.5 cursor-pointer outline-hidden hover:border-emerald-500 mt-0.5"
                                  title="Alterar cargo de diretoria ou sócio no banco de dados"
                                >
                                  {MEMBER_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>
                                      {cat}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            {m.status === 'aprovado' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Aprovado
                              </span>
                            )}
                            {m.status === 'pendente' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                <Clock className="w-2.5 h-2.5" /> Pendente
                              </span>
                            )}
                            {m.status === 'rejeitado' && (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40"
                                title={m.rejectionReason}
                              >
                                <XCircle className="w-2.5 h-2.5" /> Ajuste
                              </span>
                            )}
                            {m.status === 'expirado' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Expirado
                              </span>
                            )}
                          </td>

                          {/* Expiration Date with edit button */}
                          <td className="py-3 px-4 font-mono text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className={officialStatus.isExpired ? 'text-amber-400 font-bold' : 'text-zinc-200'}>
                                {officialStatus.formattedDate}
                              </span>
                              {canManageMembers && (
                                <button
                                  onClick={() => {
                                    setEditingValidityMember(m);
                                    setEditingValidityDate(m.validUntil || getDefaultOfficialExpiry());
                                  }}
                                  className="p-1 rounded-md text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                                  title="Editar data de validade deste sócio"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {m.renewalCount > 0 && (
                              <span className="text-[10px] text-emerald-400 font-sans block">
                                Renovada ({m.renewalCount}x)
                              </span>
                            )}
                          </td>

                          {/* Admin Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canManageMembers ? (
                                <>
                                  {/* Approve Button -> Opens Modal with SÓCIO vs DIRETORIA EXECUTIVA vs DIRETORIA */}
                                  {m.status !== 'aprovado' ? (
                                    <button
                                      onClick={() => handleOpenApproveModal(m)}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                                      title="Homologar e definir como SÓCIO, DIRETORIA EXECUTIVA ou DIRETORIA"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Homologar</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleOpenApproveModal(m)}
                                      className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-medium transition-colors border border-zinc-700 cursor-pointer"
                                      title="Alterar cargo/categoria ou dados do associado"
                                    >
                                      Alterar
                                    </button>
                                  )}

                                  {/* Reject / Request Correction Button */}
                                  {m.status === 'pendente' && (
                                    <button
                                      onClick={() => setRejectingMember(m)}
                                      className="px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-900 border border-red-500/40 text-red-300 font-semibold text-[11px] transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                                      title="Solicitar correção ao associado"
                                    >
                                      <XCircle className="w-3 h-3" />
                                      <span>Ajuste</span>
                                    </button>
                                  )}

                                  {/* Renewal Button (for expired cards after October 2027) */}
                                  {officialStatus.isExpired && (
                                    <button
                                      onClick={() => handleRenewOneYear(m)}
                                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                                      title="Renovar validade da carteirinha por mais 1 ano"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>Renovar (+1 Ano)</span>
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] text-zinc-500 italic px-1.5 font-mono">
                                  Somente Leitura
                                </span>
                              )}

                              {/* View Card */}
                              {m.status === 'aprovado' && (
                                <button
                                  onClick={() => setPreviewingMember(m)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                  title="Visualizar carteirinha"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete for LGPD rights */}
                              {canManageMembers && (
                                <button
                                  onClick={() => handleDeleteMember(m.id)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950/80 hover:text-red-400 text-zinc-500 transition-colors cursor-pointer"
                                  title="Excluir dados (Direito ao esquecimento LGPD)"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
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
      )}

      {/* TAB 2: CARD CUSTOMIZER & TEMPLATES */}
      {activeTab === 'customizer' && (
        <AdminCardCustomizer
          activeTemplate={activeTemplate}
          onUpdateActiveTemplate={setActiveTemplate}
          templates={templates}
        />
      )}

      {/* TAB: LOGO DA ASSOCIAÇÃO */}
      {activeTab === 'logo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <AssociationLogoUploader
              currentLogoUrl={activeTemplate.logoUrl}
              activeTemplate={activeTemplate}
              onLogoChange={newLogo => {
                setActiveTemplate({
                  ...activeTemplate,
                  logoUrl: newLogo,
                });
              }}
              onLogoSizeChange={newSize => {
                setActiveTemplate({
                  ...activeTemplate,
                  logoSize: newSize,
                });
              }}
            />
          </div>

          <div className="lg:col-span-5 sticky top-24 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-bold text-sm text-white">Aplicação da Logo na Carteirinha</h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-500/30">
                  Ao Vivo
                </span>
              </div>

              {/* Live Preview with dummy sample member */}
              <DigitalCard
                member={{
                  id: 'sample_logo_prev',
                  userId: 'sample_uid',
                  fullName: 'Associação Beneficente Oficial',
                  cpf: '000.000.000-00',
                  birthDate: '1984-10-15',
                  email: 'contato@associacao.org.br',
                  membershipNumber: 'SOC-OFICIAL',
                  category: 'Quadro Social Ativo',
                  status: 'aprovado',
                  lgpdConsent: true,
                  lgpdConsentDate: new Date().toISOString(),
                  validUntil: DEFAULT_OFFICIAL_EXPIRY,
                  renewalCount: 0,
                  lastGeneratedAt: new Date().toISOString(),
                  lastViewToken: 'AUTH-LOGO-VERIFIED',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }}
                template={activeTemplate}
              />

              <div className="mt-4 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400 text-center leading-relaxed">
                👆 Verifique como a logo se integra com as cores e o contraste do modelo ativo.
                Ao clicar em <strong>"Salvar Logo na Carteirinha"</strong>, a imagem é persistida no banco e atualizada para todos os associados.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: NOTÍCIAS DE TIRO ESPORTIVO */}
      {activeTab === 'news' && <NewsManagerView />}

      {/* TAB: EVENTOS & AGENDA DA SOCIEDADE */}
      {activeTab === 'events' && <EventsCalendarView />}

      {/* TAB: ESPAÇO CULTURAL & HISTÓRICO */}
      {activeTab === 'culture' && <AdminCultureManager />}

      {/* TAB: REDES SOCIAIS */}
      {activeTab === 'socials' && <AdminSocialsManager />}

      {/* TAB: ANIVERSARIANTES & PARABÉNS WHATSAPP */}
      {activeTab === 'birthdays' && <BirthdaysView isAdmin={true} />}

      {/* TAB: MÓDULO FINANCEIRO (PAINEL, LANÇAMENTOS, MENSALIDADES, FECHAMENTO & RELATÓRIOS) */}
      {(activeGroup === 'financeiro' || activeTab.startsWith('fin_')) && (
        <AdminFinancialManager
          members={members}
          initialSubTab={
            activeTab === 'fin_transactions'
              ? 'transactions'
              : activeTab === 'fin_fees'
              ? 'fees'
              : activeTab === 'fin_reports'
              ? 'reports'
              : 'dashboard'
          }
        />
      )}

      {/* TAB: GESTÃO DE ADMINISTRADORES */}
      {activeTab === 'admins' && <AdminManagementView />}

      {/* TAB: TEXTO PADRÃO DE REJEIÇÃO / E-MAIL REGISTRADO */}
      {activeTab === 'rejectionEmail' && <RejectionEmailConfig />}

      {/* TAB: TEXTOS DA PÁGINA INICIAL & SUBTÍTULO */}
      {activeTab === 'homepageTexts' && <AdminHomepageSettingsManager />}

      {/* TAB: LGPD - SOLICITAÇÕES DE TITULARES */}
      {activeTab === 'lgpd_requests' && <AdminDataRequestsView />}

      {/* TAB: LGPD - POLÍTICA DE PRIVACIDADE E DPO */}
      {activeTab === 'lgpd_policy' && <PrivacyPolicyView isAdmin={true} />}

      {/* TAB: LGPD - CONFORMIDADE & MÉTRICAS REAIS */}
      {(activeTab === 'lgpd_overview' || (activeTab as any) === 'lgpd') && (() => {
        const totalLgpd = members.length;
        const consentedMembers = members.filter(m => Boolean(m.lgpdConsent));
        const unconsentedMembers = members.filter(m => !m.lgpdConsent);
        const consentRate = totalLgpd > 0 ? Math.round((consentedMembers.length / totalLgpd) * 100) : 0;

        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Relatório de Conformidade LGPD (Lei nº 13.709/2018)</h3>
                <p className="text-xs text-zinc-400">
                  Governança, registro de consentimento dos associados e segurança de dados pessoais
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] uppercase font-mono text-emerald-400">Termos de Consentimento</span>
                <span className="text-xl font-bold text-white block">
                  {consentRate}% ({consentedMembers.length}/{totalLgpd})
                </span>
                <p className="text-[11px] text-zinc-400">
                  {unconsentedMembers.length === 0
                    ? 'Todos os sócios possuem consentimento expresso gravado.'
                    : `${unconsentedMembers.length} sócio(s) cadastrado(s) sem consentimento expresso gravado.`}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] uppercase font-mono text-emerald-400">Base Legal Utilizada</span>
                <span className="text-base font-bold text-white block">Art. 7º, V (Contrato) & I (Consentimento)</span>
                <p className="text-[11px] text-zinc-400">Tratamento estrito para identificação associativa e emissão de credencial.</p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-[11px] uppercase font-mono text-emerald-400">Banco de Dados & Criptografia</span>
                <span className="text-base font-bold text-white block">Google Cloud Firestore</span>
                <p className="text-[11px] text-zinc-400">Políticas Zero-Trust com regras de segurança ativas no backend.</p>
              </div>
            </div>

            {/* Warning Section for Unconsented Members */}
            {unconsentedMembers.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Atenção: {unconsentedMembers.length} sócio(s) sem consentimento LGPD registrado</span>
                </div>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Os seguintes associados foram cadastrados sem o registro formal do termo de consentimento LGPD. Recomenda-se solicitar atualização cadastral:
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {unconsentedMembers.map(um => (
                    <span
                      key={um.id}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-amber-500/30 text-amber-300 text-xs font-medium"
                    >
                      {um.fullName} ({maskCPF(um.cpf)})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Table of Consents */}
            <div>
              <h4 className="text-sm font-bold text-white mb-3">Registros de Consentimento de Titulares</h4>
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-950 text-[10px] uppercase font-mono text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-4">Titular</th>
                      <th className="py-2.5 px-4">CPF (Mascarado)</th>
                      <th className="py-2.5 px-4">Status Consentimento</th>
                      <th className="py-2.5 px-4">Data/Hora do Aceite</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40 font-mono">
                    {members.map(m => (
                      <tr key={m.id}>
                        <td className="py-2.5 px-4 font-sans font-medium text-white">{m.fullName}</td>
                        <td className="py-2.5 px-4">{maskCPF(m.cpf)}</td>
                        <td className="py-2.5 px-4">
                          {m.lgpdConsent ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Registrado no Sistema
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Pendente de Registro
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-zinc-400">
                          {(() => {
                            if (!m.lgpdConsentDate) {
                              return m.lgpdConsent ? 'Registrado no cadastro' : 'Não registrado';
                            }
                            try {
                              const d = new Date(m.lgpdConsentDate);
                              return isNaN(d.getTime()) ? 'Registrado no cadastro' : d.toLocaleString('pt-BR');
                            } catch {
                              return 'Registrado no cadastro';
                            }
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reject Modal with Email Dispatch & Live Preview */}
      {rejectingMember && (
        <RejectMemberModal
          member={rejectingMember}
          activeTemplate={activeTemplate}
          onConfirmReject={handleConfirmReject}
          onClose={() => setRejectingMember(null)}
        />
      )}

      {/* Preview Card Modal */}
      {previewingMember && (
        <div
          onClick={() => setPreviewingMember(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-zinc-100 flex flex-col items-center cursor-default animate-scale-in"
          >
            <div className="w-full flex items-center justify-between border-b border-zinc-800 pb-3 mb-5">
              <h4 className="font-bold text-sm text-white">Visualização da Carteirinha Oficial</h4>
              <button
                onClick={() => setPreviewingMember(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <DigitalCard
              member={previewingMember}
              template={activeTemplate}
              onVerify={() => setVerifyingMember(previewingMember)}
            />
          </div>
        </div>
      )}

      {/* Verification Modal for testing QR inspection */}
      {verifyingMember && (
        <VerificationModal
          member={verifyingMember}
          template={activeTemplate}
          onClose={() => setVerifyingMember(null)}
        />
      )}

      {/* Approval & Category Definition Modal (Unified Categories & Sequential Number) */}
      {approvingMember && (
        <ApproveMemberModal
          member={approvingMember}
          suggestedMembershipNumber={generateNextMembershipNumber(members)}
          onConfirmApprove={handleConfirmApproval}
          onClose={() => setApprovingMember(null)}
        />
      )}

      {/* Bulk Renewal Modal ("Renovar validade de todos os sócios") */}
      {showBulkRenewModal && (
        <div
          onClick={() => !bulkRenewing && setShowBulkRenewModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-6 shadow-2xl text-zinc-100 cursor-default animate-scale-in space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-base text-white">Renovar Validade de Todos os Sócios</h4>
              </div>
              <button
                onClick={() => !bulkRenewing && setShowBulkRenewModal(false)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Esta ação atualizará a data de validade de todos os <strong>{members.length}</strong> sócios cadastrados no sistema e sincronizará seus cartões digitais.
            </p>

            <div>
              <label className="text-xs text-zinc-400 block mb-1 font-medium">Nova Data de Validade:</label>
              <input
                type="date"
                value={bulkRenewDate}
                onChange={e => setBulkRenewDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white outline-hidden focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                disabled={bulkRenewing}
                onClick={() => setShowBulkRenewModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={bulkRenewing || !bulkRenewDate}
                onClick={handleBulkRenewAll}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
              >
                {bulkRenewing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Renovando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirmar Renovação Geral</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Individual Member Validity Modal */}
      {editingValidityMember && (
        <div
          onClick={() => setEditingValidityMember(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-6 shadow-2xl text-zinc-100 cursor-default animate-scale-in space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-base text-white">Editar Validade da Carteirinha</h4>
              </div>
              <button
                onClick={() => setEditingValidityMember(null)}
                className="text-zinc-400 hover:text-white p-1 cursor-pointer"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-1">
              <div>Sócio: <strong className="text-white">{editingValidityMember.fullName}</strong></div>
              <div className="font-mono text-zinc-400">CPF: {maskCPF(editingValidityMember.cpf)}</div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1 font-medium">Data de Validade:</label>
              <input
                type="date"
                value={editingValidityDate}
                onChange={e => setEditingValidityDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-white outline-hidden focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingValidityMember(null)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!editingValidityDate}
                onClick={handleSaveIndividualValidity}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Salvar Validade</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Excel/CSV Importer Modal with Real-time CPF Validation */}
      {showExcelImporter && (
        <MemberExcelImporterModal
          isOpen={showExcelImporter}
          onClose={() => setShowExcelImporter(false)}
        />
      )}
    </div>
  );
};
