import React, { useState, useEffect, useMemo } from 'react';
import { NewsArticle } from '../types/index.ts';
import { DEFAULT_NEWS_ARTICLES } from '../data/defaultNewsData.ts';
import { db } from '../firebase/config.ts';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  Newspaper,
  Search,
  ExternalLink,
  Tag,
  Calendar,
  Sparkles,
  Bookmark,
  Share2,
  Clock,
  Filter,
} from 'lucide-react';
import { formatDateBR } from '../utils/date.ts';

export const NewsListView: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>(DEFAULT_NEWS_ARTICLES);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Sync news from Firestore
  useEffect(() => {
    try {
      const q = query(collection(db, 'news'), orderBy('publishedAt', 'desc'));
      const unsubscribe = onSnapshot(
        q,
        snap => {
          if (!snap.empty) {
            const list: NewsArticle[] = [];
            snap.forEach(d => {
              const data = d.data() as NewsArticle;
              if (data.status === 'publicada') {
                list.push({ ...data, id: d.id });
              }
            });
            setArticles(list);
          } else {
            setArticles(DEFAULT_NEWS_ARTICLES);
          }
          setLoading(false);
        },
        err => {
          console.warn('Syncing news fallback:', err.message);
          setArticles(DEFAULT_NEWS_ARTICLES);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    } catch {
      setArticles(DEFAULT_NEWS_ARTICLES);
      setLoading(false);
    }
  }, []);

  // Collect all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    articles.forEach(a => {
      a.tags?.forEach(t => tagSet.add(t.trim()));
    });
    return Array.from(tagSet);
  }, [articles]);

  // Filtered & sorted: highlights first, then newest first
  const filteredArticles = useMemo(() => {
    return articles
      .filter(a => {
        const matchesTag = selectedTag === 'all' || a.tags?.includes(selectedTag);
        const matchesSearch =
          searchTerm.trim() === '' ||
          a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
          a.sourceName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesTag && matchesSearch;
      })
      .sort((a, b) => {
        if (a.highlighted && !b.highlighted) return -1;
        if (!a.highlighted && b.highlighted) return 1;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });
  }, [articles, selectedTag, searchTerm]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border border-zinc-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-emerald-400" />
              Informativo & Giro Esportivo
            </span>
            <span className="text-xs text-zinc-400 font-mono">Tiro ao Alvo • Schützenverein</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">
            Notícias do Tiro Esportivo & Tradições
          </h2>
          <p className="text-xs text-zinc-400 max-w-xl">
            Acompanhe as principais novidades, torneios e acontecimentos das sociedades de tiro de Santa Catarina e do Brasil.
          </p>
        </div>
      </div>

      {/* Search and Tag Filters Toolbar */}
      <div className="space-y-3 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-md">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Pesquisar notícias por título, resumo ou fonte..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-hidden focus:border-emerald-500"
          />
        </div>

        {/* Tag Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition-all shrink-0 cursor-pointer ${
              selectedTag === 'all'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            Todas as Notícias ({articles.length})
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
                selectedTag === tag
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>{tag}</span>
            </button>
          ))}
        </div>
      </div>

      {/* News Grid */}
      {filteredArticles.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-400 space-y-2">
          <Newspaper className="w-10 h-10 text-zinc-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">Nenhuma notícia encontrada</h4>
          <p className="text-xs text-zinc-500">
            Tente buscar com outros termos ou selecione outra etiqueta de assunto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredArticles.map(item => (
            <div
              key={item.id}
              className={`bg-zinc-900 border rounded-3xl overflow-hidden shadow-lg flex flex-col justify-between transition-all hover:border-emerald-500/50 hover:shadow-xl group ${
                item.highlighted
                  ? 'border-emerald-500/40 ring-1 ring-emerald-500/30'
                  : 'border-zinc-800'
              }`}
            >
              <div>
                {/* News Image */}
                <div className="relative aspect-16/9 w-full bg-zinc-950 overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-700">
                      <Newspaper className="w-12 h-12 opacity-30" />
                    </div>
                  )}

                  {item.highlighted && (
                    <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-md">
                      <Sparkles className="w-3 h-3" /> Destaque
                    </span>
                  )}

                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] text-zinc-300 font-mono">
                    {formatDateBR(item.publishedAt)}
                  </span>
                </div>

                {/* Content Area */}
                <div className="p-5 space-y-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 font-mono">
                      Fonte: {item.sourceName}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                    {item.summary}
                  </p>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {item.tags.map(t => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md bg-zinc-950 text-[10px] font-medium text-zinc-400 border border-zinc-800"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Footer: Strict requirement "Mostre só título, resumo curto e o botão 'Ler na fonte', nunca o texto inteiro" */}
              <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono">
                  Cobertura Oficial
                </span>

                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Abrir matéria completa diretamente no site de origem"
                >
                  <span>Ler na Fonte</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
