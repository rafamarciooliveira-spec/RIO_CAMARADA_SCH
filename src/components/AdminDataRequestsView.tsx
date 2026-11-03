import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { DataSubjectRequest, DataRequestStatus } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useDialog } from '../context/DialogContext.tsx';
import { maskCPF } from '../utils/cpf.ts';
import {
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  FileText,
  UserCheck,
  Search,
  MessageSquare,
  X,
} from 'lucide-react';

export const AdminDataRequestsView: React.FC = () => {
  const { currentUser } = useAuth();
  const dialog = useDialog();

  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution modal
  const [resolvingReq, setResolvingReq] = useState<DataSubjectRequest | null>(null);
  const [newStatus, setNewStatus] = useState<DataRequestStatus>('atendido');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'dataRequests'), snap => {
      const fetched: DataSubjectRequest[] = [];
      snap.forEach(d => fetched.push({ ...d.data(), id: d.id } as DataSubjectRequest));
      fetched.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      setRequests(fetched);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = requests.filter(r => {
    if (filterStatus !== 'todos' && r.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = r.memberName.toLowerCase().includes(q);
      const matchEmail = r.memberEmail.toLowerCase().includes(q);
      const matchCpf = r.memberCpf.includes(q);
      if (!matchName && !matchEmail && !matchCpf) return false;
    }
    return true;
  });

  const handleSaveResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingReq) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'dataRequests', resolvingReq.id), {
        status: newStatus,
        resolutionNotes: resolutionNotes.trim() || undefined,
        resolvedAt: new Date().toISOString(),
        resolvedByEmail: currentUser?.email || 'admin',
      });
      setResolvingReq(null);
      setResolutionNotes('');
      await dialog.alert('Solicitação de titular atualizada com sucesso!', { title: 'Atendimento Registrado' });
    } catch (err: any) {
      await dialog.alert(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Fila de Solicitações de Titulares (LGPD)
              <span className="text-xs px-2.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-normal">
                {requests.filter(r => r.status === 'pendente').length} pendente(s)
              </span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Canal de cumprimento dos direitos previstos no Art. 18 da Lei 13.709/2018
            </p>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['todos', 'pendente', 'em_analise', 'atendido', 'rejeitado'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filterStatus === st ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {st === 'todos' ? 'Todos' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por titular ou CPF..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-xs">Carregando solicitações...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            Nenhuma solicitação de titular encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Titular / CPF</th>
                  <th className="py-3 px-4">Tipo de Direito</th>
                  <th className="py-3 px-4">Data do Pedido</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Detalhes</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map(req => (
                  <tr key={req.id} className="hover:bg-zinc-800/20">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{req.memberName}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {maskCPF(req.memberCpf)} • {req.memberEmail}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px] font-semibold">
                        {req.type === 'copia_dados'
                          ? 'Cópia de Dados'
                          : req.type === 'retificacao'
                          ? 'Retificação Cadastral'
                          : req.type === 'exclusao_dados'
                          ? 'Exclusão / Desfiliação'
                          : 'Revogação de Consentimento'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-zinc-400">
                      {new Date(req.requestedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          req.status === 'atendido'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : req.status === 'pendente'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : req.status === 'em_analise'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {req.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-zinc-400" title={req.details}>
                      {req.details || '-'}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => {
                          setResolvingReq(req);
                          setNewStatus(req.status);
                          setResolutionNotes(req.resolutionNotes || '');
                        }}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-semibold rounded-lg text-[11px] transition"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {resolvingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Atender Solicitação de Titular
              </h3>
              <button onClick={() => setResolvingReq(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveResolution} className="p-5 space-y-3 text-xs">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-1">
                <div><span className="text-zinc-500">Titular:</span> <strong className="text-white">{resolvingReq.memberName}</strong></div>
                <div><span className="text-zinc-500">CPF:</span> <span className="font-mono text-zinc-300">{maskCPF(resolvingReq.memberCpf)}</span></div>
                <div><span className="text-zinc-500">Pedido:</span> <span className="text-zinc-300">{resolvingReq.details}</span></div>
              </div>

              <div>
                <label className="text-zinc-400 font-semibold block mb-1">Status do Atendimento *</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value as DataRequestStatus)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                >
                  <option value="pendente">Pendente</option>
                  <option value="em_analise">Em Análise Técnica / Jurídica</option>
                  <option value="atendido">Atendido / Concluído</option>
                  <option value="rejeitado">Rejeitado com Justificativa</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 font-semibold block mb-1">Parecer / Resposta ao Titular</label>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  placeholder="Ex: Dados cadastrais retificados conforme documentação apresentada."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setResolvingReq(null)}
                  className="px-4 py-2 bg-zinc-800 text-white rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg"
                >
                  {saving ? 'Gravando...' : 'Salvar Resolução'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
