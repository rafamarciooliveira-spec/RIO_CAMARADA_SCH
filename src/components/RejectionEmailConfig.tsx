import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase/config.ts';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.tsx';
import { RejectionEmailTemplate, EmailDispatchRecord } from '../types/index.ts';
import {
  DEFAULT_REJECTION_SUBJECT,
  DEFAULT_REJECTION_BODY,
  AVAILABLE_TEMPLATE_TAGS,
  replaceTemplateVariables,
} from '../utils/emailTemplate.ts';
import {
  Mail,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Tag,
  Send,
  History,
  Clock,
  UserCheck,
  Shield,
  FileText,
} from 'lucide-react';

export const RejectionEmailConfig: React.FC = () => {
  const { currentUser, activeTemplate } = useAuth();

  const [subject, setSubject] = useState(DEFAULT_REJECTION_SUBJECT);
  const [body, setBody] = useState(DEFAULT_REJECTION_BODY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  // Email Dispatches History
  const [dispatches, setDispatches] = useState<EmailDispatchRecord[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'editor' | 'history'>('editor');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from Firestore on mount
  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const docRef = doc(db, 'systemSettings', 'rejection_email');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data() as RejectionEmailTemplate;
          if (data.subject) setSubject(data.subject);
          if (data.body) setBody(data.body);
          if (data.updatedAt) setLastUpdated(data.updatedAt);
          if (data.updatedBy) setUpdatedBy(data.updatedBy);
        }
      } catch (err) {
        console.warn('Erro ao carregar modelo de e-mail de rejeição:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, []);

  // Real-time listener for recent dispatches
  useEffect(() => {
    try {
      const q = query(collection(db, 'emailDispatches'), orderBy('sentAt', 'desc'), limit(15));
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const list: EmailDispatchRecord[] = [];
          snapshot.forEach(docSnap => {
            list.push({ ...docSnap.data(), id: docSnap.id } as EmailDispatchRecord);
          });
          setDispatches(list);
        },
        err => {
          console.warn('Notificação de escuta de disparos:', err.message);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Query email dispatches error:', e);
    }
  }, []);

  // Insert tag at cursor position
  const handleInsertTag = (tag: string) => {
    if (!textareaRef.current) {
      setBody(prev => prev + ' ' + tag);
      return;
    }
    const elem = textareaRef.current;
    const start = elem.selectionStart;
    const end = elem.selectionEnd;
    const currentText = body;
    const newText = currentText.substring(0, start) + tag + currentText.substring(end);
    setBody(newText);

    setTimeout(() => {
      elem.focus();
      elem.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Save to Firestore
  const handleSaveTemplate = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const now = new Date().toISOString();
      const adminEmail = currentUser?.email || 'admin@associacao.org.br';
      await setDoc(doc(db, 'systemSettings', 'rejection_email'), {
        id: 'rejection_email',
        subject: subject.trim(),
        body: body.trim(),
        updatedAt: now,
        updatedBy: adminEmail,
      });

      setLastUpdated(now);
      setUpdatedBy(adminEmail);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Erro ao salvar modelo de e-mail:', err);
      alert('Erro ao salvar no banco de dados: ' + (err.message || 'Verifique sua conexão.'));
    } finally {
      setSaving(false);
    }
  };

  // Restore Default Template
  const handleRestoreDefault = () => {
    if (confirm('Deseja restaurar o texto de e-mail padrão do sistema?')) {
      setSubject(DEFAULT_REJECTION_SUBJECT);
      setBody(DEFAULT_REJECTION_BODY);
    }
  };

  // Live preview simulated variables
  const sampleVariables = {
    nomeAssociado: 'Mariana Silva Santos',
    motivoRejeicao: 'A foto do documento de identidade está com baixa resolução. Solicitamos enviar nova foto 3x4 nítida.',
    nomeAssociacao: activeTemplate.associationName || 'Associação Brasileira dos Membros',
    dataSolicitacao: new Date().toLocaleDateString('pt-BR'),
    cpfAssociado: '123.456.789-00',
    emailAssociado: 'mariana.silva@email.com',
  };

  const previewSubject = replaceTemplateVariables(subject, sampleVariables);
  const previewBody = replaceTemplateVariables(body, sampleVariables);

  if (loading) {
    return (
      <div className="p-12 text-center text-zinc-500 text-sm flex items-center justify-center gap-2">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Carregando configurações de e-mail institucional...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-center shrink-0 shadow-inner">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Texto Padrão de Não-Aprovação / Rejeição de Cadastro
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Defina a mensagem oficial que o associado receberá por e-mail e no painel caso seu cadastro necessite de ajustes ou seja recusado.
            </p>
          </div>
        </div>

        {/* SubTab switcher */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveSubTab('editor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeSubTab === 'editor'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Editor de Texto</span>
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeSubTab === 'history'
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Histórico de Envios ({dispatches.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form & Placeholders */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                Configurar Assunto e Corpo do E-mail
              </span>
              {lastUpdated && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  Salvo em {new Date(lastUpdated).toLocaleString('pt-BR')} por {updatedBy}
                </span>
              )}
            </div>

            {/* Subject field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 block">
                Assunto do E-mail (Subject)
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Ex: Associação {NOME_ASSOCIACAO} - Ajuste necessário no cadastro"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Clickable Variable Tags */}
            <div className="space-y-2 bg-zinc-950/70 p-4 rounded-2xl border border-zinc-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Variáveis Dinâmicas Disponíveis
                </span>
                <span className="text-[10px] text-zinc-400">Clique para inserir no texto</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TEMPLATE_TAGS.map(item => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => handleInsertTag(item.tag)}
                    title={item.description}
                    className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-emerald-950/60 border border-zinc-700 hover:border-emerald-500/50 text-[11px] font-mono text-zinc-200 hover:text-emerald-300 transition-all cursor-pointer shadow-xs"
                  >
                    + {item.tag}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Ao rejeitar uma solicitação, o sistema substitui automaticamente as tags acima com os dados reais do associado e a justificativa preenchida.
              </p>
            </div>

            {/* Body textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 block">
                  Mensagem / Corpo do E-mail
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {body.length} caracteres
                </span>
              </div>
              <textarea
                ref={textareaRef}
                rows={12}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Escreva aqui a mensagem padrão..."
                className="w-full p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 font-sans leading-relaxed outline-hidden focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer w-full sm:w-auto justify-center"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Restaurar Texto Padrão</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {saveSuccess && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-4 h-4" />
                    Salvo no banco de dados!
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50 w-full sm:w-auto"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Gravando no Firebase...' : 'Salvar Texto Padrão'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Email Inbox Simulation */}
          <div className="lg:col-span-5 sticky top-24 space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Visualização da Caixa de Entrada
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  Ao Vivo
                </span>
              </div>

              {/* Email Client Window Mockup */}
              <div className="rounded-2xl border border-zinc-700 bg-zinc-950 overflow-hidden shadow-2xl text-xs">
                {/* Email Client Header Bar */}
                <div className="bg-zinc-900 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Notificação Oficial de Rejeição
                  </span>
                </div>

                {/* Email metadata headers */}
                <div className="p-4 border-b border-zinc-800/80 bg-zinc-950 space-y-1.5 text-[11px]">
                  <div className="flex items-baseline gap-2">
                    <span className="text-zinc-500 font-semibold w-14 shrink-0">De:</span>
                    <span className="text-white font-medium">
                      Diretoria da {activeTemplate.associationName || 'Associação'}{' '}
                      <span className="text-zinc-500">&lt;diretoria@associacao.org.br&gt;</span>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-zinc-500 font-semibold w-14 shrink-0">Para:</span>
                    <span className="text-zinc-300">
                      Mariana Silva Santos <span className="text-zinc-500">&lt;mariana.silva@email.com&gt;</span>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-zinc-500 font-semibold w-14 shrink-0">Assunto:</span>
                    <span className="text-amber-400 font-bold">{previewSubject}</span>
                  </div>
                </div>

                {/* Email Content Body */}
                <div className="p-5 bg-white text-zinc-900 space-y-4">
                  {/* Association Brand Bar */}
                  <div className="border-b border-zinc-200 pb-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-black text-sm text-zinc-950 uppercase tracking-wide">
                        {activeTemplate.associationName || 'Associação Oficial'}
                      </h4>
                      <p className="text-[10px] text-zinc-500">
                        {activeTemplate.associationSubtitle || 'Secretaria Administrativa & Quadro Social'}
                      </p>
                    </div>
                    {activeTemplate.logoUrl && (
                      <img
                        src={activeTemplate.logoUrl}
                        alt="Logo"
                        className="w-9 h-9 object-contain rounded-md"
                      />
                    )}
                  </div>

                  {/* Body Text */}
                  <div className="text-[12px] leading-relaxed whitespace-pre-line text-zinc-800 font-sans">
                    {previewBody}
                  </div>

                  {/* Call to action button inside email */}
                  <div className="pt-2">
                    <div className="inline-block px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider shadow-sm text-center">
                      Acessar Portal do Associado para Ajuste
                    </div>
                  </div>

                  {/* Footer disclaimer */}
                  <div className="pt-4 border-t border-zinc-200 text-[10px] text-zinc-400 leading-relaxed">
                    Mensagem automática gerada de acordo com as normas da Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
                    Este e-mail é destinado exclusivamente ao titular do cadastro.
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-start gap-2">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  O texto configurado nesta tela é salvo no banco de dados e será carregado automaticamente no modal sempre que o administrador rejeitar um candidato.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB: HISTORY OF DISPATCHES */}
      {activeSubTab === 'history' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white">
                Registro de E-mails e Notificações Enviadas aos Associados
              </h4>
              <p className="text-xs text-zinc-400">
                Auditoria de comunicações oficiais de não-aprovação e solicitações de ajuste cadastral
              </p>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              Total: {dispatches.length} envios registrados
            </span>
          </div>

          {dispatches.length === 0 ? (
            <div className="p-10 text-center text-zinc-500 text-xs">
              Nenhum e-mail de não-aprovação foi enviado até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 text-[10px] uppercase font-mono text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Data / Hora</th>
                    <th className="py-3 px-4 font-semibold">Destinatário</th>
                    <th className="py-3 px-4 font-semibold">Assunto do E-mail</th>
                    <th className="py-3 px-4 font-semibold">Status de Envio</th>
                    <th className="py-3 px-4 font-semibold text-right">Mensagem Registrada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
                  {dispatches.map(item => (
                    <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                        {item.sentAt ? new Date(item.sentAt).toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{item.toName}</div>
                        <div className="text-[11px] text-zinc-400 font-mono">{item.toEmail}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-200">
                        {item.subject}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3" /> Entregue / Registrado
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            alert(`ASSUNTO:\n${item.subject}\n\nCORPO DO E-MAIL:\n${item.body}`);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700 transition-colors cursor-pointer"
                        >
                          Ver Conteúdo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
