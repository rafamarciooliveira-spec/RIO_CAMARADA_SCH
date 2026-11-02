import React, { useState, useEffect } from 'react';
import { CultureArticle, CultureCategory } from '../types/index.ts';
import { DEFAULT_CULTURE_ARTICLES } from '../data/defaultCultureData.ts';
import { markdownToHtml } from '../utils/richText.ts';
import { db } from '../firebase/config.ts';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  BookOpen,
  Sparkles,
  Search,
  Tag,
  Calendar,
  Share2,
  Clock,
  Printer,
  X,
  ChevronRight,
  Award,
  Crown,
  Target,
  Trees,
  Landmark,
  ExternalLink,
  Check,
} from 'lucide-react';

interface CultureArticlesViewProps {
  isAdmin?: boolean;
  onGoToAdminManager?: () => void;
}

export const CultureArticlesView: React.FC<CultureArticlesViewProps> = ({
  isAdmin = false,
  onGoToAdminManager,
}) => {
  const [articles, setArticles] = useState<CultureArticle[]>(DEFAULT_CULTURE_ARTICLES);
  const [selectedCategory, setSelectedCategory] = useState<'all' | CultureCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [readingArticle, setReadingArticle] = useState<CultureArticle | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    try {
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
        },
        err => {
          console.warn('Syncing culture articles fallback:', err.message);
          setArticles(DEFAULT_CULTURE_ARTICLES);
        }
      );
      return () => unsubscribe();
    } catch {
      setArticles(DEFAULT_CULTURE_ARTICLES);
    }
  }, []);

  // Handle Escape key to close reader modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && readingArticle) {
        setReadingArticle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readingArticle]);

  const filteredArticles = articles.filter(a => {
    if (!a.published) return false;
    const matchCat = selectedCategory === 'all' || a.category === selectedCategory;
    const matchSearch =
      searchTerm.trim() === '' ||
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchCat && matchSearch;
  });

  const getCategoryIcon = (cat: CultureCategory) => {
    switch (cat) {
      case 'tiro_ao_alvo':
        return <Target className="w-4 h-4 text-emerald-400" />;
      case 'festas_de_rei':
        return <Crown className="w-4 h-4 text-amber-400" />;
      case 'modalidades':
        return <Award className="w-4 h-4 text-teal-400" />;
      case 'schutzenfest':
        return <Trees className="w-4 h-4 text-blue-400" />;
      case 'sociedade_rio_camarada':
        return <Landmark className="w-4 h-4 text-emerald-400" />;
      default:
        return <BookOpen className="w-4 h-4 text-purple-400" />;
    }
  };

  const handleShareArticle = (art: CultureArticle) => {
    if (navigator.share) {
      navigator.share({
        title: art.title,
        text: art.summary,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero Presentation Banner */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                Espaço Cultural & Memória Histórica
              </span>
              <span className="text-xs text-zinc-400 font-mono">Schroeder & Vale do Itapocu (SC)</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              Cultura Germânica, Tradições do Tiro & Associação Rio Camarada
            </h2>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Explore o acervo histórico sobre as sociedades de tiro ao alvo no norte catarinense, os rituais das Festas de Rei e Rainha, as modalidades de chumbinho, pássaro e dado, o simbolismo do Schützenbaum e as origens da Sociedade de Tiro ao Alvo Rio Camarada em Schroeder.
            </p>
          </div>

          {isAdmin && onGoToAdminManager && (
            <button
              onClick={onGoToAdminManager}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer shrink-0"
            >
              Editar Acervo (Admin)
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Categories Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            Todos ({articles.length})
          </button>

          <button
            onClick={() => setSelectedCategory('tiro_ao_alvo')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'tiro_ao_alvo'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Sociedades de Tiro</span>
          </button>

          <button
            onClick={() => setSelectedCategory('festas_de_rei')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'festas_de_rei'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>Festas de Rei</span>
          </button>

          <button
            onClick={() => setSelectedCategory('modalidades')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'modalidades'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Chumbinho, Pássaro e Dado</span>
          </button>

          <button
            onClick={() => setSelectedCategory('schutzenfest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'schutzenfest'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Trees className="w-3.5 h-3.5" />
            <span>Schützenfest & Schützenbaum</span>
          </button>

          <button
            onClick={() => setSelectedCategory('sociedade_rio_camarada')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
              selectedCategory === 'sociedade_rio_camarada'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Associação Rio Camarada</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar história..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredArticles.map(art => {
          return (
            <article
              key={art.id}
              onClick={() => setReadingArticle(art)}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl hover:border-emerald-500/50 transition-all flex flex-col justify-between cursor-pointer group hover:scale-[1.01]"
            >
              <div>
                {art.imageUrl && (
                  <div className="h-44 w-full relative overflow-hidden bg-zinc-950">
                    <img
                      src={art.imageUrl}
                      alt={art.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-black/75 backdrop-blur-md text-emerald-300 border border-white/10 flex items-center gap-1.5 shadow-md">
                        {getCategoryIcon(art.category)}
                        <span>{art.categoryLabel}</span>
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-5 sm:p-6 space-y-2.5">
                  {!art.imageUrl && (
                    <div className="mb-2">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-emerald-300 border border-zinc-700 flex items-center gap-1.5 w-fit">
                        {getCategoryIcon(art.category)}
                        <span>{art.categoryLabel}</span>
                      </span>
                    </div>
                  )}

                  <h3 className="text-base font-extrabold text-white group-hover:text-emerald-300 transition-colors leading-snug">
                    {art.title}
                  </h3>

                  {art.subtitle && (
                    <p className="text-xs font-medium text-emerald-400/90 leading-relaxed line-clamp-2">
                      {art.subtitle}
                    </p>
                  )}

                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                    {art.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                <span className="text-[11px] font-mono text-zinc-500">
                  Leitura completa
                </span>

                <span className="text-emerald-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Ler artigo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {filteredArticles.length === 0 && (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-3">
          <BookOpen className="w-10 h-10 text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhum artigo encontrado</h4>
          <p className="text-xs text-zinc-400">
            Tente buscar com outros termos ou selecione outra categoria.
          </p>
        </div>
      )}

      {/* FULL READER MODAL */}
      {readingArticle && (
        <div
          onClick={() => setReadingArticle(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto cursor-default text-zinc-100 animate-scale-in"
          >
            {/* Close Button */}
            <button
              onClick={() => setReadingArticle(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Fechar (ou clique fora)"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="space-y-3 border-b border-zinc-800 pb-5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                  {getCategoryIcon(readingArticle.category)}
                  <span>{readingArticle.categoryLabel}</span>
                </span>
                <span className="text-xs text-zinc-500 font-mono">Registro Histórico & Cultural</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                {readingArticle.title}
              </h2>

              {readingArticle.subtitle && (
                <p className="text-sm font-medium text-emerald-300 leading-relaxed">
                  {readingArticle.subtitle}
                </p>
              )}
            </div>

            {/* Article Image Banner */}
            {readingArticle.imageUrl && (
              <div className="rounded-2xl overflow-hidden max-h-72 w-full bg-zinc-950 border border-zinc-800">
                <img
                  src={readingArticle.imageUrl}
                  alt={readingArticle.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Article Body Content */}
            <div
              className="prose prose-invert max-w-none text-sm text-zinc-300 leading-relaxed space-y-4"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(readingArticle.content) }}
            />

            {/* Footer with Actions */}
            <div className="pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-zinc-500">
                Acervo mantido pela Associação Rio Camarada • Schroeder / SC
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleShareArticle(readingArticle)}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copiado' : 'Compartilhar'}</span>
                </button>

                <button
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>

                <button
                  onClick={() => setReadingArticle(null)}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer"
                >
                  Concluir Leitura
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
