import React, { useState, useEffect } from 'react';
import { NewsArticle, NewsKeywordConfig } from '../types/index.ts';
import { DEFAULT_NEWS_ARTICLES } from '../data/defaultNewsData.ts';
import { db } from '../firebase/config.ts';
import { useAppDialog } from '../context/DialogContext.tsx';
import { PhotoUploader } from './PhotoUploader.tsx';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  Newspaper,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Tag,
  Search,
  Eye,
  X,
  Save,
  Radio,
  Sliders,
  AlertTriangle,
  Send,
  FileEdit,
} from 'lucide-react';
import { formatDateBR } from '../utils/date.ts';

export const NewsManagerView: React.FC = () => {
  const dialog = useAppDialog();
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tagsString, setTagsString] = useState('Tiro Esportivo, Schroeder');
  const [status, setStatus] = useState<'rascunho' | 'publicada'>('publicada');
  const [highlighted, setHighlighted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Automated News Scraper / Keyword Config State (prepared, off by default)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [autoNewsEnabled, setAutoNewsEnabled] = useState(false);
  const [keywords, setKeywords] = useState('Tiro Esportivo, Tiro ao Alvo, Schützenfest, Festa de Rei, ACSTVI, CBTE');

  // Load news from Firestore
  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => {
        if (!snap.empty) {
          const list: NewsArticle[] = [];
          snap.forEach(d => list.push({ ...d.data(), id: d.id } as NewsArticle));
          setNews(list);
        } else {
          setNews(DEFAULT_NEWS_ARTICLES);
        }
        setLoading(false);
      },
      err => {
        console.warn('Syncing news manager fallback:', err.message);
        setNews(DEFAULT_NEWS_ARTICLES);
        setLoading(false);
      }
    );

    // Load keyword config
    const configUnsub = onSnapshot(doc(db, 'siteSettings', 'news_keywords'), docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as NewsKeywordConfig;
        setAutoNewsEnabled(data.enabled || false);
        if (data.keywords && data.keywords.length > 0) {
          setKeywords(data.keywords.join(', '));
        }
      }
    });

    return () => {
      unsub();
      configUnsub();
    };
  }, []);

  const handleOpenNew = () => {
    setEditingId(null);
    setTitle('');
    setSummary('');
    setSourceUrl('');
    setSourceName('Federação Catarinense / Notícias');
    setImageUrl('');
    setTagsString('Tiro Esportivo, Schroeder, Vale do Itapocu');
    setStatus('publicada');
    setHighlighted(false);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (item: NewsArticle) => {
    setEditingId(item.id);
    setTitle(item.title);
    setSummary(item.summary);
    setSourceUrl(item.sourceUrl);
    setSourceName(item.sourceName);
    setImageUrl(item.imageUrl || '');
    setTagsString(item.tags?.join(', ') || '');
    setStatus(item.status);
    setHighlighted(item.highlighted);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSave = async (overrideStatus?: 'rascunho' | 'publicada') => {
    if (!title.trim() || !summary.trim() || !sourceUrl.trim() || !sourceName.trim()) {
      setErrorMsg('Título, resumo, link da fonte e nome da fonte são obrigatórios.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const targetStatus = overrideStatus || status;

    try {
      const newsId = editingId || `news_${Date.now()}`;
      const tags = tagsString
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const newsData: NewsArticle = {
        id: newsId,
        title: title.trim(),
        summary: summary.trim(),
        sourceUrl: sourceUrl.trim(),
        sourceName: sourceName.trim(),
        imageUrl: imageUrl.trim() || undefined,
        tags,
        status: targetStatus,
        highlighted,
        publishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: 'Administrador',
      };

      await setDoc(doc(db, 'news', newsId), newsData);
      setShowModal(false);
      await dialog.alert({
        title: targetStatus === 'publicada' ? 'Notícia Publicada' : 'Rascunho Salvo',
        message: targetStatus === 'publicada'
          ? 'A notícia foi publicada com sucesso e já está visível para os sócios.'
          : 'A notícia foi gravada como rascunho.',
        variant: 'success',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao persistir notícia no banco de dados.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Excluir Notícia',
      message: 'Tem certeza que deseja excluir esta notícia permanentemente?',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'news', id));
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Excluir',
        message: err.message,
        variant: 'danger',
      });
    }
  };

  const handleTogglePublish = async (item: NewsArticle) => {
    try {
      const nextStatus = item.status === 'publicada' ? 'rascunho' : 'publicada';
      await updateDoc(doc(db, 'news', item.id), {
        status: nextStatus,
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Erro ao alternar status:', err);
    }
  };

  const handleToggleHighlight = async (item: NewsArticle) => {
    try {
      await updateDoc(doc(db, 'news', item.id), {
        highlighted: !item.highlighted,
      });
    } catch (err) {
      console.warn('Erro ao alternar destaque:', err);
    }
  };

  // Save Scraper Config
  const handleSaveKeywordConfig = async () => {
    try {
      const kwList = keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      await setDoc(doc(db, 'siteSettings', 'news_keywords'), {
        id: 'news_keywords',
        enabled: autoNewsEnabled,
        keywords: kwList,
        lastCheckedAt: new Date().toISOString(),
      });
      setShowConfigModal(false);
      await dialog.alert({
        title: 'Configuração Salva',
        message: 'Diretrizes de busca de notícias atualizadas com sucesso.',
        variant: 'success',
      });
    } catch (e: any) {
      await dialog.alert({ title: 'Erro ao Salvar', message: e.message, variant: 'danger' });
    }
  };

  // Trigger manual collector simulation (creates draft news pending approval)
  const handleTriggerCollectorSuggestions = async () => {
    const confirmed = await dialog.confirm({
      title: 'Buscar Notícias por Palavras-chave',
      message: 'Deseja buscar sugestões de notícias recentes sobre Tiro Esportivo e Sociedades de Tiro e gravá-las como rascunhos para sua aprovação?',
      confirmLabel: 'Buscar Rascunhos',
      cancelLabel: 'Cancelar',
      variant: 'info',
    });
    if (!confirmed) return;

    try {
      for (const item of DEFAULT_NEWS_ARTICLES) {
        await setDoc(doc(db, 'news', item.id), item);
      }
      await dialog.alert({
        title: 'Rascunhos de Notícias Coletados',
        message: 'As matérias sugeridas foram gravadas na fila com sucesso. Você pode revisá-las e publicá-las quando desejar.',
        variant: 'success',
      });
    } catch (e: any) {
      await dialog.alert({ title: 'Erro na Coleta', message: e.message, variant: 'danger' });
    }
  };

  const filteredList = news.filter(n => {
    return (
      n.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.summary?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.sourceName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border border-zinc-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-emerald-400" />
              Gestão de Notícias & Informativos
            </span>
            <span className="text-xs text-zinc-400 font-mono">Tiro Esportivo & Tradições</span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Notícias Oficiais e Clipping de Tiro
          </h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Cadastre notícias com link da fonte oficial. O sócio lê o título, resumo e acessa diretamente a matéria original.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 cursor-pointer"
            title="Configurar busca automática de notícias por palavras-chave"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Busca Automática ({autoNewsEnabled ? 'Ativa' : 'Desligada'})</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Notícia</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-2xl flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Filtrar matérias por título, resumo ou fonte..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-hidden focus:border-emerald-500"
          />
        </div>

        <span className="text-xs text-zinc-400 font-mono shrink-0">
          Total: <strong className="text-white">{filteredList.length}</strong>
        </span>
      </div>

      {/* News Items Table / List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-zinc-400 text-xs">Carregando notícias...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">
            Nenhuma notícia cadastrada. Clique em "Nova Notícia" para publicar.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/70">
            {filteredList.map(item => (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-zinc-800"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-600">
                      <Newspaper className="w-6 h-6" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'publicada'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {item.status === 'publicada' ? 'Publicada' : 'Rascunho'}
                      </span>

                      {item.highlighted && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" /> Destaque
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-400 font-mono">
                        Fonte: <strong className="text-zinc-200">{item.sourceName}</strong>
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white leading-snug">
                      {item.title}
                    </h4>

                    <p className="text-xs text-zinc-400 line-clamp-1 max-w-2xl">
                      {item.summary}
                    </p>

                    <div className="flex items-center gap-3 pt-0.5 text-[11px] text-zinc-500 font-mono">
                      <span>Publicada em: {formatDateBR(item.publishedAt)}</span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <span>Link da fonte</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleToggleHighlight(item)}
                    className={`p-2 rounded-xl text-xs border transition-colors cursor-pointer ${
                      item.highlighted
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                    title="Alternar destaque"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePublish(item)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      item.status === 'publicada'
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item.status === 'publicada' ? 'Ocultar' : 'Publicar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Editar matéria"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-700 transition-colors cursor-pointer"
                    title="Excluir notícia"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Form Nova / Editar Notícia */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto cursor-default text-zinc-100 animate-scale-in"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {editingId ? 'Editar Notícia' : 'Nova Notícia'}
                </span>
                <h3 className="text-xl font-bold text-white mt-1">
                  {editingId ? 'Atualizar Notícia de Tiro' : 'Cadastrar Notícia'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Título da Notícia *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Vale do Itapocu Abre Circuito Regional de Carabina"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-bold outline-hidden focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">
                  Resumo Curto (Apenas a síntese, nunca o texto inteiro) *
                </label>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={3}
                  placeholder="Síntese informativa com 2 a 3 frases apresentando o assunto."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-hidden focus:border-emerald-500 resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1 font-bold">Nome da Fonte *</label>
                  <input
                    type="text"
                    value={sourceName}
                    onChange={e => setSourceName(e.target.value)}
                    placeholder="Ex: CBTE, Gazeta de Schroeder, ACSTVI"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-bold">Link da Fonte Oficial (URL) *</label>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://exemplo.com.br/noticia"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono text-[11px] outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <PhotoUploader
                  aspectRatio="16:9"
                  currentPhotoUrl={imageUrl}
                  onPhotoSelected={setImageUrl}
                  storageFolder="news_photos"
                  label="Foto da Notícia"
                  helperText="Selecione ou arraste uma foto ilustrativa para o card da matéria."
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">
                  Etiquetas / Tags (Separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={tagsString}
                  onChange={e => setTagsString(e.target.value)}
                  placeholder="Tiro Esportivo, Carabina, Schützenfest, Schroeder"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={highlighted}
                    onChange={e => setHighlighted(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-zinc-300 font-medium">Destacar no Topo da Lista</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave('rascunho')}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold border border-zinc-700 flex items-center gap-1.5"
                >
                  <FileEdit className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Salvar Rascunho</span>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave('publicada')}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{saving ? 'Gravando...' : 'Publicar Notícia'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Configuração de Busca Automática por Palavras-Chave (Prepared, Off by Default) */}
      {showConfigModal && (
        <div
          onClick={() => setShowConfigModal(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl text-zinc-100 space-y-4 cursor-default animate-scale-in text-xs"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Busca Automática de Notícias por Palavras-chave
              </h4>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-zinc-400 leading-relaxed">
              Mecanismo preparado para monitorar e sugerir notícias sobre tiro esportivo e sociedades tradicionais.
              Por padrão de segurança, fica <strong>desligada</strong> e requer aprovação do administrador antes de qualquer publicação.
            </p>

            <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="font-bold text-white block">Status da Busca Automática:</span>
                <span className="text-[11px] text-zinc-400">
                  {autoNewsEnabled ? 'Ativada (Monitoramento ativo)' : 'Desligada (Manual apenas)'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoNewsEnabled}
                  onChange={e => setAutoNewsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
              </label>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-bold">
                Palavras-chave Monitoradas (Editáveis pelo Administrador):
              </label>
              <textarea
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                rows={3}
                placeholder="Ex: Tiro Esportivo, Schützenfest, Festa de Rei..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-white outline-hidden focus:border-emerald-500 leading-relaxed font-mono text-[11px]"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Separe os termos por vírgula. As notícias capturadas entram como rascunho na fila de moderação.
              </span>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={handleTriggerCollectorSuggestions}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-semibold flex items-center justify-center gap-1.5 border border-zinc-700 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Buscar Sugestões Agora</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveKeywordConfig}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
                >
                  Salvar Diretrizes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
