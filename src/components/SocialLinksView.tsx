import React, { useState, useEffect } from 'react';
import { SocialLink, SocialPlatform } from '../types/index.ts';
import { DEFAULT_SOCIAL_LINKS } from '../data/defaultSocialData.ts';
import { db } from '../firebase/config.ts';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  Instagram,
  Facebook,
  Youtube,
  MessageCircle,
  Globe,
  Share2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';

interface SocialLinksViewProps {
  isAdmin?: boolean;
  onGoToAdminManager?: () => void;
}

export const SocialLinksView: React.FC<SocialLinksViewProps> = ({
  isAdmin = false,
  onGoToAdminManager,
}) => {
  const [links, setLinks] = useState<SocialLink[]>(DEFAULT_SOCIAL_LINKS);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const q = query(collection(db, 'socialLinks'), orderBy('order', 'asc'));
      const unsubscribe = onSnapshot(
        q,
        snap => {
          if (!snap.empty) {
            const list: SocialLink[] = [];
            snap.forEach(d => {
              list.push({ ...d.data(), id: d.id } as SocialLink);
            });
            setLinks(list);
          } else {
            setLinks(DEFAULT_SOCIAL_LINKS);
          }
        },
        err => {
          console.warn('Syncing social links fallback:', err.message);
          setLinks(DEFAULT_SOCIAL_LINKS);
        }
      );
      return () => unsubscribe();
    } catch {
      setLinks(DEFAULT_SOCIAL_LINKS);
    }
  }, []);

  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const getPlatformIcon = (platform: SocialPlatform) => {
    switch (platform) {
      case 'instagram':
        return <Instagram className="w-6 h-6 text-pink-400" />;
      case 'facebook':
        return <Facebook className="w-6 h-6 text-blue-400" />;
      case 'whatsapp':
        return <MessageCircle className="w-6 h-6 text-emerald-400" />;
      case 'youtube':
        return <Youtube className="w-6 h-6 text-red-400" />;
      case 'tiktok':
        return <Video className="w-6 h-6 text-cyan-400" />;
      default:
        return <Globe className="w-6 h-6 text-amber-400" />;
    }
  };

  const getPlatformBadgeStyle = (platform: SocialPlatform) => {
    switch (platform) {
      case 'instagram':
        return 'from-pink-950/80 via-purple-950/60 to-zinc-900 border-pink-500/30 text-pink-200';
      case 'facebook':
        return 'from-blue-950/80 via-indigo-950/60 to-zinc-900 border-blue-500/30 text-blue-200';
      case 'whatsapp':
        return 'from-emerald-950/80 via-teal-950/60 to-zinc-900 border-emerald-500/30 text-emerald-200';
      case 'youtube':
        return 'from-red-950/80 via-rose-950/60 to-zinc-900 border-red-500/30 text-red-200';
      case 'tiktok':
        return 'from-cyan-950/80 via-zinc-900 to-zinc-900 border-cyan-500/30 text-cyan-200';
      default:
        return 'from-emerald-950/60 via-zinc-900 to-zinc-900 border-zinc-700 text-zinc-200';
    }
  };

  const activeLinks = links.filter(l => l.active);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                Canais Oficiais
              </span>
              <span className="text-xs text-zinc-400 font-mono">Comunidade & Informação</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Redes Sociais da Associação Rio Camarada
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Acompanhe as fotos das competições de tiro, transmissões de festas de rei, coberturas da Schützenfest, comunicados estatutários e novidades para os associados de Schroeder e região.
            </p>
          </div>

          {isAdmin && onGoToAdminManager && (
            <button
              onClick={onGoToAdminManager}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer shrink-0"
            >
              Gerenciar Redes (Admin)
            </button>
          )}
        </div>
      </div>

      {/* Grid of Social Channels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeLinks.map(link => {
          const badgeClass = getPlatformBadgeStyle(link.platform);
          return (
            <div
              key={link.id}
              className={`bg-gradient-to-br ${badgeClass} border rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col justify-between gap-4 transition-all hover:scale-[1.01] hover:shadow-2xl`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center shadow-inner">
                      {getPlatformIcon(link.platform)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">
                        {link.title}
                      </h3>
                      {link.username && (
                        <span className="text-xs font-mono opacity-80 block mt-0.5">
                          {link.username}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-mono font-bold bg-white/10 text-white/90">
                    Oficial
                  </span>
                </div>

                {link.description && (
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {link.description}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>Acessar {link.title}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => handleCopyLink(link.url, link.id)}
                  className="py-2.5 px-3 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-zinc-300 hover:text-white text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Copiar link"
                >
                  {copiedId === link.id ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400 font-bold">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-[11px]">Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Community Engagement Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
          <Users className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-white">Participe da Vida Social da Associação</h4>
        <p className="text-xs text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Marque a <strong>@associacaoriocamarada</strong> em suas publicações nas festas de rei, torneios de tiro e treinos de fim de semana para ser destacado em nossos canais oficiais!
        </p>
      </div>
    </div>
  );
};
