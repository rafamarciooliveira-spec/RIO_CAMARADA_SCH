import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config.ts';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.tsx';
import { useAppDialog } from '../context/DialogContext.tsx';
import { Edit3, Check, X, Sparkles, Building, Phone, MapPin, FileText, Mail, Save, RotateCcw } from 'lucide-react';
import { HomepageSettings } from '../types/index.ts';

export const DEFAULT_HOMEPAGE_SETTINGS: HomepageSettings = {
  id: 'homepage',
  heroBadge: 'Associação Sem Fins Lucrativos • Schroeder / SC',
  heroTitle: 'Sociedade de Tiro & Tradições Vivas',
  heroSubtitle: 'Preservando a cultura germânica, a camaradagem (Gemütlichkeit) e o esporte de precisão no coração do Vale do Itapocu desde as primeiras décadas do século XX.',
  associationSubtitle: 'Schroeder SC, fundado em 21 de Julho de 1955',
  aboutTitle: 'Quem Somos: Nossa História e Comunidade',
  aboutText: 'A Associação Rio Camarada congrega famílias, atiradores esportivos e amantes das tradições culturais de Schroeder e região. Promovemos a integração comunitária através do tiro ao alvo, das célebres Festas de Rei e Rainha e do resgate histórico dos pioneiros colonizadores.',
  associationAddress: 'Rua Rio Camarada, 1200 - Bairro Rio Camarada, Schroeder - SC, CEP 89275-000',
  associationCnpj: '83.123.456/0001-78',
  associationPhone: '(47) 3374-1234 / (47) 99876-5432',
  associationEmail: 'contato@riocamarada.com.br',
  footerNotice: 'Em estrita conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018). Dados protegidos em trânsito e em repouso pela infraestrutura do Google Cloud.',
  updatedAt: new Date().toISOString(),
};

export function useHomepageSettings() {
  const [settings, setSettings] = useState<HomepageSettings>(DEFAULT_HOMEPAGE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'siteSettings', 'homepage'),
      docSnap => {
        if (docSnap.exists()) {
          setSettings({
            ...DEFAULT_HOMEPAGE_SETTINGS,
            ...docSnap.data(),
          } as HomepageSettings);
        } else {
          setSettings(DEFAULT_HOMEPAGE_SETTINGS);
        }
        setLoading(false);
      },
      err => {
        console.warn('Syncing homepage settings fallback:', err.message);
        setSettings(DEFAULT_HOMEPAGE_SETTINGS);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const updateSetting = async (field: keyof HomepageSettings, value: string, userEmail?: string) => {
    const docRef = doc(db, 'siteSettings', 'homepage');
    await setDoc(
      docRef,
      {
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || 'Administrador',
      },
      { merge: true }
    );
  };

  const saveAllSettings = async (newSettings: Partial<HomepageSettings>, userEmail?: string) => {
    const docRef = doc(db, 'siteSettings', 'homepage');
    await setDoc(
      docRef,
      {
        ...newSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || 'Administrador',
      },
      { merge: true }
    );
  };

  return { settings, loading, updateSetting, saveAllSettings };
}

interface EditBlockModalProps {
  title: string;
  fieldLabel: string;
  initialValue: string;
  multiline?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (val: string) => Promise<void>;
}

export const EditBlockModal: React.FC<EditBlockModalProps> = ({
  title,
  fieldLabel,
  initialValue,
  multiline = false,
  isOpen,
  onClose,
  onSave,
}) => {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(value.trim());
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in cursor-pointer"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-zinc-100 space-y-4 cursor-default animate-scale-in"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h4 className="font-bold text-sm text-white flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-emerald-400" />
            {title}
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 mb-1 font-semibold">{fieldLabel}:</label>
            {multiline ? (
              <textarea
                value={value}
                onChange={e => setValue(e.target.value)}
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-white text-xs leading-relaxed outline-hidden focus:border-emerald-500 resize-y"
                required
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-hidden focus:border-emerald-500 font-medium"
                required
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Salvando...' : 'Salvar Alteração'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminHomepageSettingsManager: React.FC = () => {
  const { currentUser } = useAuth();
  const dialog = useAppDialog();
  const { settings, loading, saveAllSettings } = useHomepageSettings();
  const [formData, setFormData] = useState<HomepageSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await saveAllSettings(formData, currentUser?.email || 'Administrador');
      await dialog.alert({
        title: 'Textos Atualizados',
        message: 'Todas as informações da página inicial foram atualizadas com sucesso no banco de dados.',
        variant: 'success',
      });
    } catch (err: any) {
      await dialog.alert({
        title: 'Erro ao Salvar',
        message: 'Não foi possível salvar os textos: ' + (err.message || 'Erro desconhecido'),
        variant: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    const confirmed = await dialog.confirm({
      title: 'Restaurar Textos Padrão',
      message: 'Deseja realmente restaurar os textos padrão da Sociedade Rio Camarada? Esta ação substituirá as personalizações atuais.',
      variant: 'warning',
      confirmText: 'Sim, Restaurar',
    });
    if (!confirmed) return;

    setFormData(DEFAULT_HOMEPAGE_SETTINGS);
    setIsSaving(true);
    try {
      await saveAllSettings(DEFAULT_HOMEPAGE_SETTINGS, currentUser?.email || 'Administrador');
      await dialog.alert({
        title: 'Textos Restaurados',
        message: 'Os textos padrão foram restaurados com sucesso.',
        variant: 'success',
      });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-zinc-400">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span className="text-xs">Carregando textos institucionais...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/80 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase tracking-wider font-bold mb-1">
            <Building className="w-4 h-4" />
            <span>Personalização Institucional</span>
          </div>
          <h2 className="text-xl font-black text-white">Textos da Página Inicial & Subtítulo</h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Edite o texto que aparece abaixo do nome da sociedade, dados de contato, &quot;Quem Somos&quot; e rodapé diretamente aqui, sem mexer no código.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-zinc-700"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar Padrão</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Subtítulo / Local e Fundação */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Subtítulo Oficial (Abaixo do Nome da Sociedade)
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Texto exibido logo abaixo de &quot;Associação Rio Camarada&quot; na entrada do Portal do Associado.
          </p>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Texto do Subtítulo / Fundação:
            </label>
            <input
              type="text"
              value={formData.associationSubtitle || ''}
              onChange={e => setFormData(prev => ({ ...prev, associationSubtitle: e.target.value }))}
              placeholder="Schroeder SC, fundado em 21 de Julho de 1955"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-hidden focus:border-emerald-500 font-medium"
              required
            />
            <span className="text-[11px] text-zinc-500 mt-1 block">
              Padrão configurado: <strong>Schroeder SC, fundado em 21 de Julho de 1955</strong>
            </span>
          </div>
        </div>

        {/* Quem Somos */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Apresentação &quot;Quem Somos&quot;
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Título da Seção:
              </label>
              <input
                type="text"
                value={formData.aboutTitle || ''}
                onChange={e => setFormData(prev => ({ ...prev, aboutTitle: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-hidden focus:border-emerald-500 font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Texto Institucional:
              </label>
              <textarea
                value={formData.aboutText || ''}
                onChange={e => setFormData(prev => ({ ...prev, aboutText: e.target.value }))}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3.5 text-white text-xs leading-relaxed outline-hidden focus:border-emerald-500 resize-y"
                required
              />
            </div>
          </div>
        </div>

        {/* Endereço, CNPJ e Telefones */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Building className="w-4 h-4 text-emerald-400" />
            Dados Institucionais de Contato e Sede
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Endereço da Sociedade:
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={formData.associationAddress || ''}
                  onChange={e => setFormData(prev => ({ ...prev, associationAddress: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-xs outline-hidden focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                CNPJ da Sociedade:
              </label>
              <input
                type="text"
                value={formData.associationCnpj || ''}
                onChange={e => setFormData(prev => ({ ...prev, associationCnpj: e.target.value }))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-xs outline-hidden focus:border-emerald-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Telefone / WhatsApp de Contato:
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={formData.associationPhone || ''}
                  onChange={e => setFormData(prev => ({ ...prev, associationPhone: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-xs outline-hidden focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                E-mail Institucional:
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="email"
                  value={formData.associationEmail || ''}
                  onChange={e => setFormData(prev => ({ ...prev, associationEmail: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-9 pr-4 py-2.5 text-white text-xs outline-hidden focus:border-emerald-500"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé e Nota de Conformidade */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Texto do Rodapé
          </h3>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Nota Legal / Conformidade exibida no rodapé do portal:
            </label>
            <input
              type="text"
              value={formData.footerNotice || ''}
              onChange={e => setFormData(prev => ({ ...prev, footerNotice: e.target.value }))}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-xs outline-hidden focus:border-emerald-500"
              required
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

