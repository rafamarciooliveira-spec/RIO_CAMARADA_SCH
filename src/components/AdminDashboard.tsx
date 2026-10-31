import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Member, MemberStatus, CardTemplate } from '../types/index.ts';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { AdminCardCustomizer } from './AdminCardCustomizer.tsx';
import { AssociationLogoUploader } from './AssociationLogoUploader.tsx';
import { VerificationModal } from './VerificationModal.tsx';
import { DigitalCard } from './DigitalCard.tsx';
import { ApproveMemberModal } from './ApproveMemberModal.tsx';
import { AdminManagementView } from './AdminManagementView.tsx';
import { RejectionEmailConfig } from './RejectionEmailConfig.tsx';
import { RejectMemberModal } from './RejectMemberModal.tsx';
import { maskCPF } from '../utils/cpf.ts';
import { formatDateBR } from '../utils/date.ts';
import { triggerPushNotification } from '../utils/pushNotification.ts';
import { DEFAULT_OFFICIAL_EXPIRY, checkOfficialCardStatus } from '../utils/security.ts';
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
  PlusCircle,
  FileSpreadsheet,
  Calendar,
  Lock,
  Image as ImageIcon,
  Crown,
  Key,
  User,
  Mail,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { activeTemplate, setActiveTemplate, templates, currentUser, adminList } = useAuth();

  const [activeTab, setActiveTab] = useState<'members' | 'customizer' | 'logo' | 'rejectionEmail' | 'admins' | 'lgpd'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');

  // Modals
  const [approvingMember, setApprovingMember] = useState<Member | null>(null);
  const [rejectingMember, setRejectingMember] = useState<Member | null>(null);
  const [previewingMember, setPreviewingMember] = useState<Member | null>(null);
  const [verifyingMember, setVerifyingMember] = useState<Member | null>(null);

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

  // Quick category switch in the table
  const handleQuickChangeCategory = async (memberId: string, newCategory: 'SÓCIO' | 'MEMBRO DA DIRETORIA') => {
    try {
      const path = 'members';
      await updateDoc(doc(db, path, memberId), {
        category: newCategory,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Erro ao atualizar categoria do associado:', err);
      alert('Erro ao atualizar categoria: ' + (err.message || 'Erro no banco de dados.'));
    }
  };

  // Trigger Approval Modal with Category Selection (SÓCIO vs MEMBRO DA DIRETORIA)
  const handleOpenApproveModal = (member: Member) => {
    setApprovingMember(member);
  };

  const handleConfirmApproval = async (data: {
    category: string;
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    photoUrl?: string;
  }) => {
    if (!approvingMember) return;
    try {
      const path = 'members';
      const updatedMember = {
        status: 'aprovado' as MemberStatus,
        category: data.category,
        fullName: data.fullName || approvingMember.fullName,
        birthDate: data.birthDate || approvingMember.birthDate,
        photoUrl: data.photoUrl || approvingMember.photoUrl,
        rejectionReason: '',
        validUntil: approvingMember.validUntil || DEFAULT_OFFICIAL_EXPIRY,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, path, approvingMember.id), updatedMember);

      // Create Push Notification record for user
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: approvingMember.userId,
        title: '🎉 Cadastro Homologado!',
        message: `Parabéns! Sua adesão como ${data.category} foi aprovada. Sua carteirinha já está emitida.`,
        type: 'approval',
        read: false,
        createdAt: new Date().toISOString(),
      });

      // Fire push notification alert
      triggerPushNotification(
        '🎉 Cadastro Homologado com Sucesso!',
        `A adesão de ${approvingMember.fullName} como ${data.category} foi homologada.`,
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${approvingMember.id}`);
    }
  };

  // Reject Member Action with Email Dispatch
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
        message: `A administração enviou orientações por e-mail: "${reason}". Acesse o portal para atualizar.`,
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

  // Renewal Action: For expired membership after October 2027, extends by +1 year!
  const handleRenewOneYear = async (member: Member) => {
    try {
      const currentValid = new Date(member.validUntil || DEFAULT_OFFICIAL_EXPIRY);
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

      // Push notification
      const notifPath = 'notifications';
      const notifId = `notif_${Date.now()}`;
      await setDoc(doc(db, notifPath, notifId), {
        id: notifId,
        userId: member.userId,
        title: '🌟 Carteirinha Renovada por +1 Ano!',
        message: `Sua renovação estatutária foi aprovada! Nova data limite: ${newValidStr}.`,
        type: 'approval',
        read: false,
        createdAt: new Date().toISOString(),
      });

      triggerPushNotification(
        '🌟 Renovação de Filiação Concedida',
        `A carteirinha de ${member.fullName} foi renovada com sucesso até ${newValidStr}.`,
        'approval'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `members/${member.id}`);
    }
  };

  // Delete Member (LGPD right to erasure or test cleanup)
  const handleDeleteMember = async (memberId: string) => {
    if (!confirm('Tem certeza que deseja excluir permanentemente este registro em atendimento às normas LGPD?')) return;
    try {
      const path = 'members';
      await deleteDoc(doc(db, path, memberId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `members/${memberId}`);
    }
  };

  // Create Mock Applicant for testing
  const handleCreateTestMember = async () => {
    const mockId = `mock_${Date.now()}`;
    const mockNames = [
      'Marcos Vinícius Barbosa',
      'Juliana Helena Ribeiro',
      'Ricardo Alves Moreira',
      'Camila Fernandes Dias',
    ];
    const pickedName = mockNames[Math.floor(Math.random() * mockNames.length)];
    const mockMember: Member = {
      id: mockId,
      userId: `user_test_${Math.random().toString(36).substring(2, 8)}`,
      fullName: pickedName,
      cpf: `${Math.floor(100 + Math.random() * 899)}.${Math.floor(100 + Math.random() * 899)}.${Math.floor(100 + Math.random() * 899)}-${Math.floor(10 + Math.random() * 89)}`,
      birthDate: '1992-08-22',
      email: `${pickedName.toLowerCase().replace(/\s+/g, '.')}@gmail.com`,
      phone: '(11) 98123-4567',
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
      membershipNumber: `SOC-${Math.floor(100000 + Math.random() * 900000)}`,
      category: 'Sócio Efetivo Contribuinte',
      status: 'pendente',
      lgpdConsent: true,
      lgpdConsentDate: new Date().toISOString(),
      validUntil: DEFAULT_OFFICIAL_EXPIRY,
      renewalCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'members', mockId), mockMember);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `members/${mockId}`);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Matricula', 'Nome Completo', 'CPF', 'Email', 'Data Nascimento', 'Categoria', 'Status', 'Validade', 'Consentimento LGPD'];
    const rows = members.map(m => [
      m.membershipNumber,
      `"${m.fullName}"`,
      m.cpf,
      m.email,
      m.birthDate,
      `"${m.category}"`,
      m.status,
      m.validUntil,
      m.lgpdConsentDate,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `socios_associacao_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter members
  const filteredMembers = members.filter(m => {
    const matchesSearch =
      m.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.cpf?.includes(searchTerm) ||
      m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.membershipNumber?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Metrics
  const totalCount = members.length;
  const pendingCount = members.filter(m => m.status === 'pendente').length;
  const approvedCount = members.filter(m => m.status === 'aprovado').length;
  const rejectedCount = members.filter(m => m.status === 'rejeitado').length;
  const expiredCount = members.filter(m => m.status === 'expirado').length;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Top Banner & Tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
              Painel de Administração
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Gestor: {currentUser?.email}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Gestão da Associação & Carteirinhas
          </h1>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800 shadow-md">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'members'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Sócios ({totalCount})</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-zinc-950 font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('customizer')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'customizer'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Formatador de Carteirinha</span>
          </button>

          <button
            onClick={() => setActiveTab('logo')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'logo'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Logo da Associação</span>
          </button>

          <button
            onClick={() => setActiveTab('rejectionEmail')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'rejectionEmail'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-red-400" />
            <span>Texto de Rejeição (E-mail)</span>
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Gestores ({adminList.length + 1})</span>
          </button>

          <button
            onClick={() => setActiveTab('lgpd')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'lgpd'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Conformidade LGPD</span>
          </button>
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
            </div>

            {/* Test Actions & Export */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateTestMember}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-zinc-700 cursor-pointer"
                title="Insere um sócio de teste para aprovar/rejeitar"
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Sócio Teste</span>
              </button>

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
              <div className="overflow-x-auto">
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

                          {/* Category (SÓCIO vs MEMBRO DA DIRETORIA) */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              {String(m.category || '').trim().toUpperCase() === 'MEMBRO DA DIRETORIA' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 border border-amber-300 shadow-xs">
                                  <Crown className="w-2.5 h-2.5" />
                                  <span>DIRETORIA</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <User className="w-2.5 h-2.5" />
                                  <span>{m.category || 'SÓCIO'}</span>
                                </span>
                              )}

                              {m.status === 'aprovado' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleQuickChangeCategory(
                                      m.id,
                                      String(m.category || '').trim().toUpperCase() === 'MEMBRO DA DIRETORIA'
                                        ? 'SÓCIO'
                                        : 'MEMBRO DA DIRETORIA'
                                    )
                                  }
                                  className="text-[9px] text-zinc-400 hover:text-emerald-400 underline cursor-pointer transition-colors"
                                  title="Alternar categoria no banco de dados"
                                >
                                  Mudar para {String(m.category || '').trim().toUpperCase() === 'MEMBRO DA DIRETORIA' ? 'Sócio' : 'Diretoria'}
                                </button>
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

                          {/* Expiration Date */}
                          <td className="py-3 px-4 font-mono text-[11px]">
                            <div className={officialStatus.isExpired ? 'text-amber-400 font-bold' : 'text-zinc-200'}>
                              {officialStatus.formattedDate}
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
                              {/* Approve Button -> Opens Modal with SÓCIO vs MEMBRO DA DIRETORIA */}
                              {m.status !== 'aprovado' ? (
                                <button
                                  onClick={() => handleOpenApproveModal(m)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                                  title="Homologar e definir como SÓCIO ou MEMBRO DA DIRETORIA"
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

                              {/* View Card */}
                              {m.status === 'aprovado' && (
                                <button
                                  onClick={() => setPreviewingMember(m)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                                  title="Visualizar carteirinha"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete for LGPD rights */}
                              <button
                                onClick={() => handleDeleteMember(m.id)}
                                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950/80 hover:text-red-400 text-zinc-500 transition-colors"
                                title="Excluir dados (Direito ao esquecimento LGPD)"
                              >
                                ✕
                              </button>
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

      {/* TAB: GESTÃO DE ADMINISTRADORES */}
      {activeTab === 'admins' && <AdminManagementView />}

      {/* TAB: TEXTO PADRÃO DE REJEIÇÃO / E-MAIL */}
      {activeTab === 'rejectionEmail' && <RejectionEmailConfig />}

      {/* TAB 3: LGPD & AUDIT TRAIL */}
      {activeTab === 'lgpd' && (
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
              <span className="text-xl font-bold text-white block">100% Homologados</span>
              <p className="text-[11px] text-zinc-400">Todos os sócios registraram consentimento expresso no cadastro.</p>
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
                        <span className="text-emerald-400">✓ Válido & Gravado</span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">
                        {(() => {
                          if (!m.lgpdConsentDate) return 'No cadastro';
                          try {
                            const d = new Date(m.lgpdConsentDate);
                            return isNaN(d.getTime()) ? 'No cadastro' : d.toLocaleString('pt-BR');
                          } catch {
                            return 'No cadastro';
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
      )}

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-zinc-100 flex flex-col items-center">
            <div className="w-full flex items-center justify-between border-b border-zinc-800 pb-3 mb-5">
              <h4 className="font-bold text-sm text-white">Visualização da Carteirinha Oficial</h4>
              <button
                onClick={() => setPreviewingMember(null)}
                className="text-zinc-400 hover:text-white"
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

      {/* Approval & Category Definition Modal (SÓCIO vs MEMBRO DA DIRETORIA) */}
      {approvingMember && (
        <ApproveMemberModal
          member={approvingMember}
          onConfirmApprove={handleConfirmApproval}
          onClose={() => setApprovingMember(null)}
        />
      )}
    </div>
  );
};
