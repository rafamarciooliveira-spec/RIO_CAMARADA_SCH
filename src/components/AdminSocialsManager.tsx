import React, { useState, useEffect } from 'react';
import { SocialLink, SocialPlatform } from '../types/index.ts';
import { DEFAULT_SOCIAL_LINKS } from '../data/defaultSocialData.ts';
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
  Instagram,
  Facebook,
  Youtube,
  MessageCircle,
  Globe,
  Share2,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Video,
  X,
  Save,
} from 'lucide-react';

export const AdminSocialsManager: React.FC = () => {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  // Listen to Firestore socialLinks
  useEffect(() => {
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
          // If empty in Firestore, show default links
          setLinks(DEFAULT_SOCIAL_LINKS);
        }
        setLoading(false);
      },
      err => {
        console.warn('Erro ao carregar redes sociais:', err.message);
        setLinks(DEFAULT_SOCIAL_LINKS);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleOpenNew = () => {
    setEditingId(null);
    setPlatform('instagram');
    setTitle('Instagram Oficial');
    setUrl('https://instagram.com/');
    setUsername('@');
    setDescription('');
    setActive(true);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (l: SocialLink) => {
    setEditingId(l.id);
    setPlatform(l.platform);
    setTitle(l.title);
    setUrl(l.url);
    setUsername(l.username || '');
    setDescription(l.description || '');
    setActive(l.active);
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) {
      setErrorMsg('Título e Link / URL são obrigatórios.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const linkId = editingId || `soc_${Date.now()}`;
      const newOrder = editingId
        ? (links.find(l => l.id === editingId)?.order ?? links.length + 1)
        : links.length + 1;

      const linkData: SocialLink = {
        id: linkId,
        platform,
        title: title.trim(),
        url: url.trim(),
        username: username.trim() || undefined,
        description: description.trim() || undefined,
        order: newOrder,
        active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'socialLinks', linkId), linkData);
      setSuccessMsg('Rede social salva com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
      setShowModal(false);
    } catch (err: any) {
      console.error('Erro ao salvar rede social:', err);
      setErrorMsg(err.message || 'Erro ao persistir no Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (link: SocialLink) => {
    try {
      await updateDoc(doc(db, 'socialLinks', link.id), {
        active: !link.active,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Erro ao alternar status da rede social:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta rede social?')) return;
    try {
      await deleteDoc(doc(db, 'socialLinks', id));
      setSuccessMsg('Rede social removida.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Erro ao excluir: ' + (err.message || 'Erro desconhecido.'));
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm('Deseja carregar as redes sociais oficiais padrão da Associação Rio Camarada?')) return;
    setSaving(true);
    try {
      for (const item of DEFAULT_SOCIAL_LINKS) {
        await setDoc(doc(db, 'socialLinks', item.id), item);
      }
      setSuccessMsg('Redes sociais padrão gravadas no Firestore!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert('Erro ao carregar dados padrão: ' + err.message);
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
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              Gestão de Redes Sociais
            </span>
            <span className="text-xs text-zinc-400 font-mono">Facebook, Instagram & Mais</span>
          </div>
          <h3 className="text-xl font-bold text-white">
            Cadastro e Configuração de Redes Sociais
          </h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Configure os links oficiais da Associação Rio Camarada para que todos os sócios e visitantes tenham acesso rápido pelo portal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDefaults}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors cursor-pointer flex items-center gap-1.5"
            title="Carregar links padrão do Facebook, Instagram, WhatsApp, etc."
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Redes Padrão</span>
          </button>

          <button
            onClick={handleOpenNew}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Rede</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* List of Configured Networks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl space-y-4">
        <h4 className="text-sm font-bold text-white">
          Redes Cadastradas ({links.length})
        </h4>

        {links.length === 0 ? (
          <p className="text-zinc-500 text-center py-8 text-xs">
            Nenhuma rede social configurada ainda. Clique em "Redes Padrão" ou "Adicionar Rede".
          </p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {links.map(l => (
              <div
                key={l.id}
                className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-zinc-950/30 px-3 rounded-2xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                    {l.platform === 'instagram' && <Instagram className="w-5 h-5 text-pink-400" />}
                    {l.platform === 'facebook' && <Facebook className="w-5 h-5 text-blue-400" />}
                    {l.platform === 'whatsapp' && <MessageCircle className="w-5 h-5 text-emerald-400" />}
                    {l.platform === 'youtube' && <Youtube className="w-5 h-5 text-red-400" />}
                    {l.platform === 'tiktok' && <Video className="w-5 h-5 text-cyan-400" />}
                    {l.platform !== 'instagram' &&
                      l.platform !== 'facebook' &&
                      l.platform !== 'whatsapp' &&
                      l.platform !== 'youtube' &&
                      l.platform !== 'tiktok' && <Globe className="w-5 h-5 text-amber-400" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-sm text-white">{l.title}</h5>
                      <span
                        className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                          l.active
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {l.active ? 'Ativo' : 'Oculto'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                      {l.username && <span className="font-mono text-zinc-300">{l.username}</span>}
                      <span>•</span>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline truncate max-w-xs flex items-center gap-1"
                      >
                        {l.url}
                        <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    onClick={() => handleToggleActive(l)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      l.active
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {l.active ? 'Desativar' : 'Ativar'}
                  </button>

                  <button
                    onClick={() => handleOpenEdit(l)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(l.id)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-red-950/80 hover:text-red-300 border border-zinc-700 text-zinc-400 transition-colors cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: Criar / Editar Rede Social */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto cursor-pointer animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative cursor-default animate-scale-in"
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {editingId ? 'Editar Rede Social' : 'Nova Rede Social'}
              </span>
              <h3 className="text-xl font-bold text-white mt-1">
                {editingId ? 'Atualizar Dados da Rede' : 'Cadastrar Link de Rede Social'}
              </h3>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Plataforma / Tipo *</label>
                <select
                  value={platform}
                  onChange={e => {
                    const p = e.target.value as SocialPlatform;
                    setPlatform(p);
                    if (!editingId) {
                      if (p === 'instagram') {
                        setTitle('Instagram Oficial');
                        setUrl('https://instagram.com/associacaoriocamarada');
                      } else if (p === 'facebook') {
                        setTitle('Facebook da Associação');
                        setUrl('https://facebook.com/associacaoriocamarada');
                      } else if (p === 'whatsapp') {
                        setTitle('WhatsApp da Secretaria');
                        setUrl('https://wa.me/5547999999999');
                      } else if (p === 'youtube') {
                        setTitle('Canal no YouTube');
                        setUrl('https://youtube.com/');
                      } else if (p === 'tiktok') {
                        setTitle('TikTok Oficial');
                        setUrl('https://tiktok.com/@');
                      }
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                  <option value="website">Site Oficial / Portal</option>
                  <option value="other">Outra Plataforma / Personalizada</option>
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Título de Exibição *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ex: Instagram Oficial, Facebook da Sociedade"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Link Completo (URL) *</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://instagram.com/sua_associacao"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono text-[11px] outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Nome de Usuário / @handle / Telefone (Opcional)</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Ex: @associacaoriocamarada ou (47) 99999-9999"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-bold">Descrição Curta (Opcional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Ex: Fotos das festas de rei, coberturas de torneios e avisos para os sócios."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                />
                <label htmlFor="activeCheck" className="text-zinc-300 font-medium cursor-pointer">
                  Exibir esta rede social publicamente para os sócios e visitantes
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Gravando...' : 'Salvar Rede'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
