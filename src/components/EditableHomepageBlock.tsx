import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config.ts';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.tsx';
import { useAppDialog } from '../context/DialogContext.tsx';
import { Edit3, Check, X, Sparkles, Building, Phone, MapPin, FileText } from 'lucide-react';
import { HomepageSettings } from '../types/index.ts';

export const DEFAULT_HOMEPAGE_SETTINGS: HomepageSettings = {
  id: 'homepage',
  heroBadge: 'Associação Sem Fins Lucrativos • Schroeder / SC',
  heroTitle: 'Sociedade de Tiro & Tradições Vivas',
  heroSubtitle: 'Preservando a cultura germânica, a camaradagem (Gemütlichkeit) e o esporte de precisão no coração do Vale do Itapocu desde as primeiras décadas do século XX.',
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

  return { settings, loading, updateSetting };
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
