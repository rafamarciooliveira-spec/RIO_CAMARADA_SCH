import React, { useState, useEffect } from 'react';
import { CultureArticle, CultureCategory } from '../types/index.ts';
import { DEFAULT_CULTURE_ARTICLES } from '../data/defaultCultureData.ts';
import { useAppDialog } from '../context/DialogContext.tsx';
import { markdownToHtml } from '../utils/richText.ts';
import { RichTextEditor } from './RichTextEditor.tsx';
import { PhotoUploader } from './PhotoUploader.tsx';
import { db } from '../firebase/config.ts';
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
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Save,
  Eye,
  Crown,
  Target,
  Award,
  Trees,
  Landmark,
  Image as ImageIcon,
  Send,
  FileEdit,
} from 'lucide-react';

const CATEGORY_OPTIONS: { id: CultureCategory; label: string }[] = [
  { id: 'tiro_ao_alvo', label: 'Sociedades de Tiro ao Alvo' },
  { id: 'festas_de_rei', label: 'Festas de Rei e Rainha' },
  { id: 'modalidades', label: 'Modalidades (Chumbinho, Pássaro e Dado)' },
  { id: 'schutzenfest', label: 'Schützenfest & Schützenbaum' },
  { id: 'sociedade_rio_camarada', label: 'Sociedade / Associação Rio Camarada' },
  { id: 'outros', label: 'Outros Temas Culturais' },
];

export const AdminCultureManager: React.FC = () => {
  const dialog = useAppDialog();
  const [articles, setArticles] = useState<CultureArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<CultureCategory>('tiro_ao_alvo');
  const [categoryLabel, setCategoryLabel] = useState('Sociedades de Tiro ao Alvo');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [order, setOrder] = useState<number>(1);
  const [highlighted, setHighlighted] = useState(true);
  const [published, setPublished] = useState(true);

  // Sync with Firestore
  useEffect(() => {
    const q = query(collection(db, 'cultureArticles'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      snap => {
        if (!snap.empty) {
          const list: CultureArticle[] = [];
          snap.forEach(d => {
            list.push({ ...d.data(), id: d.id } as CultureArticle);
          });
          setArticles(list);
        } else {
          setArticles(DEFAULT_CULTURE_ARTICLES);
        }
        setLoading(false);
      },
      err => {
        console.warn('Erro ao carregar acervo cultural:', err.message);
        setArticles(DEFAULT_CULTURE_ARTICLES);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleOpenNew = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setCategory('tiro_ao_alvo');
    setCategoryLabel('Sociedades de Tiro ao Alvo');
    setSummary('');
    setContent('');
    setImageUrl('');
    setOrder(articles.length + 1);
    setHighlighted(false);
    setPublished(true);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (a: CultureArticle) => {
    setEditingId(a.id);
    setTitle(a.title);
    setSubtitle(a.subtitle || '');
    setCategory(a.category);
    setCategoryLabel(a.categoryLabel);
    setSummary(a.summary);
    setContent(markdownToHtml(a.content));
    setImageUrl(a.imageUrl || '');
    setOrder(a.order);
    setHighlighted(!!a.highlighted);
    setPublished(a.published);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSave = async (overridePublish?: boolean) => {
    if (!title.trim() || !summary.trim() || !content.trim()) {
      setErrorMsg('Título, resumo e conteúdo completo são obrigatórios.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const willPublish = overridePublish !== undefined ? overridePublish : published;

    try {
      const artId = editingId || `art_${Date.now()}`;
      const slug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const foundCat = CATEGORY_OPTIONS.find(c => c.id === category);

      const artData: CultureArticle = {
        id: artId,
        slug,
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        category,
        categoryLabel: foundCat ? foundCat.label : categoryLabel,
        summary: summary.trim(),
        content: content.trim(),
        imageUrl: imageUrl.trim() || undefined,
        order: Number(order) || 1,
        highlighted,
        published: willPublish,
        updatedAt: new Date().toISOString(),
        updatedBy: 'Administrador',
      };

      await setDoc(doc(db, 'cultureArticles', artId), artData);
      setSuccessMsg(willPublish ? 'Artigo publicado com sucesso!' : 'Rascunho salvo com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowModal(false);
    } catch (err: any) {
      console.error('Erro ao salvar artigo cultural:', err);
      setErrorMsg(err.message || 'Erro ao persistir no Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await dialog.confirm({
      title: 'Remover Artigo Cultural',
      message: 'Deseja realmente remover este artigo do acervo cultural?',
      confirmLabel: 'Remover Artigo',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'cultureArticles', id));
      setSuccessMsg('Artigo removido.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Excluir',
        message: 'Erro ao excluir artigo: ' + (err.message || 'Erro inesperado.'),
        variant: 'danger',
      });
    }
  };

  const handleTogglePublish = async (art: CultureArticle) => {
    try {
      await updateDoc(doc(db, 'cultureArticles', art.id), {
        published: !art.published,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Erro ao alternar publicação:', err);
    }
  };

  const handleSeedDefaults = async () => {
    const confirmed = await dialog.confirm({
      title: 'Carregar Acervo Histórico Padrão',
      message: 'Deseja carregar os registros históricos padrão (Sociedades de Tiro, Festas de Rei, Modalidades Chumbinho/Pássaro/Dado, Schützenfest e Associação Rio Camarada) no banco de dados?',
      confirmLabel: 'Carregar Padrão',
      cancelLabel: 'Cancelar',
      variant: 'info',
    });
    if (!confirmed) return;

    setSaving(true);
    try {
      for (const art of DEFAULT_CULTURE_ARTICLES) {
        await setDoc(doc(db, 'cultureArticles', art.id), art);
      }
      setSuccessMsg('Acervo histórico padrão salvo no Firestore com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Gravar',
        message: 'Erro ao gravar acervo padrão: ' + err.message,
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              Gestão do Acervo Cultural
            </span>
            <span className="text-xs text-zinc-400 font-mono">Tradições & Schroeder / SC</span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Registros Culturais, Históricos e Tradições do Tiro
          </h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Edite ou adicione relatos sobre as sociedades de tiro, modalidades esportivas, festas de rei e a história viva da Associação Rio Camarada.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDefaults}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Recarregar os 5 textos históricos completos padrão"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Restaurar Textos Padrão</span>
          </button>

          <button
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Registro</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* List of Cultural Articles */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl space-y-4">
        <h4 className="text-sm font-bold text-white">
          Artigos no Acervo ({articles.length})
        </h4>

        <div className="divide-y divide-zinc-800">
          {articles.map(art => (
            <div
              key={art.id}
              className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-zinc-950/30 px-3 rounded-2xl transition-colors"
            >
              <div className="flex items-start gap-3.5">
                {art.imageUrl ? (
                  <img
                    src={art.imageUrl}
                    alt={art.title}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-zinc-800 bg-zinc-950"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-emerald-400 shrink-0">
                    <BookOpen className="w-6 h-6" />
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {art.categoryLabel}
                    </span>
                    <span
                      className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        art.published
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {art.published ? 'Publicado' : 'Rascunho'}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Ordem: #{art.order}
                    </span>
                  </div>

                  <h5 className="font-bold text-sm text-white leading-tight">
                    {art.title}
                  </h5>

                  <p className="text-xs text-zinc-400 line-clamp-1 max-w-xl">
                    {art.summary}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  onClick={() => handleTogglePublish(art)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    art.published
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  {art.published ? 'Ocultar' : 'Publicar'}
                </button>

                <button
                  onClick={() => handleOpenEdit(art)}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                  title="Editar registro"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDelete(art.id)}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950/80 hover:text-red-300 border border-zinc-700 text-zinc-400 transition-colors cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: Formulário de Artigo Cultural */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-5 shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto cursor-default text-zinc-100 animate-scale-in"
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {editingId ? 'Editar Registro Cultural' : 'Novo Registro Cultural'}
              </span>
              <h3 className="text-xl font-bold text-white mt-1">
                {editingId ? 'Atualizar Texto e Registro Histórico' : 'Registrar Novo Artigo Cultural'}
              </h3>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); handleSave(); }} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1 font-bold">Categoria Temática *</label>
                  <select
                    value={category}
                    onChange={e => {
                      const val = e.target.value as CultureCategory;
                      setCategory(val);
                      const f = CATEGORY_OPTIONS.find(c => c.id === val);
                      if (f) setCategoryLabel(f.label);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                  >
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 font-bold">Ordem de Exibição (#)</label>
                  <input
                    type="number"
                    min="1"
                    value={order}
                    onChange={e => setOrder(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Título do Artigo / Relato Histórico *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: As Festas de Rei e Rainha: O Königsschießen"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-bold outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Subtítulo / Linha Fina (Opcional)</label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value)}
                  placeholder="Ex: A busca do Rei com banda de sopro, trajes típicos e o baile de gala"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <PhotoUploader
                  aspectRatio="16:9"
                  currentPhotoUrl={imageUrl}
                  onPhotoSelected={setImageUrl}
                  storageFolder="culture_covers"
                  label="Foto Ilustrativa de Capa"
                  helperText="Arraste uma foto ou selecione do aparelho (otimizada automaticamente)."
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Resumo / Chamada (Obrigatório) *</label>
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={2}
                  placeholder="Breve síntese que aparecerá no card do artigo para os associados."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none text-xs"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-zinc-300 font-bold">
                    Texto Completo do Artigo (Editor Visual Estilo Word) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Visualizar como o sócio vê</span>
                  </button>
                </div>

                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  draftKey={`draft_culture_${editingId || 'new'}`}
                  onPreviewToggle={() => setShowPreviewModal(true)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={highlighted}
                    onChange={e => setHighlighted(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span className="text-zinc-300 font-medium">Destacar Artigo no Topo</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(true)}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-semibold text-xs flex items-center gap-1.5 border border-zinc-700 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visualizar como o Sócio Vê</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold transition-colors cursor-pointer text-xs"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 border border-zinc-700 text-xs"
                    title="Salvar como rascunho sem publicar imediatamente para os associados"
                  >
                    <FileEdit className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Salvar Rascunho</span>
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(true)}
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50 text-xs"
                    title="Publicar artigo para visualização oficial de todos os associados"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{saving ? 'Publicando...' : 'Publicar Artigo'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Visualizar como o Sócio Vê */}
      {showPreviewModal && (
        <div
          onClick={() => setShowPreviewModal(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto cursor-default text-zinc-100 animate-scale-in"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Modo de Visualização do Associado
              </span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-block">
                {CATEGORY_OPTIONS.find(c => c.id === category)?.label || 'Espaço Cultural'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                {title || 'Título do Artigo Cultural'}
              </h2>
              {subtitle && (
                <p className="text-sm font-medium text-emerald-300 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>

            {imageUrl && (
              <div className="rounded-2xl overflow-hidden max-h-72 w-full bg-zinc-950 border border-zinc-800">
                <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
              </div>
            )}

            <div
              className="prose prose-invert max-w-none text-sm text-zinc-300 leading-relaxed space-y-4"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
            />

            <div className="pt-4 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Voltar à Edição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
