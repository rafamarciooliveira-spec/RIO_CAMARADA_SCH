import React, { useState } from 'react';
import { CardTemplate, CustomCardField, Member } from '../types/index.ts';
import { DigitalCard } from './DigitalCard.tsx';
import { PRESET_LOGOS } from './AssociationLogos.tsx';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates.ts';
import { db, handleFirestoreError, OperationType } from '../firebase/config.ts';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  Palette,
  Layout,
  Plus,
  Trash2,
  Check,
  Save,
  RotateCw,
  Sparkles,
  Shield,
  Layers,
  Sliders,
  Type,
  FileCheck,
  Eye,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.tsx';

interface CustomizerProps {
  activeTemplate: CardTemplate;
  onUpdateActiveTemplate: (tmpl: CardTemplate) => void;
  templates: CardTemplate[];
  onReloadTemplates?: () => void;
}

// Sample member for realistic card preview
const SAMPLE_MEMBER: Member = {
  id: 'sample_member_123',
  userId: 'usr_preview',
  fullName: 'Ana Beatriz Souza',
  cpf: '123.456.789-00',
  birthDate: '1989-05-14',
  email: 'ana.beatriz@associacao.org.br',
  phone: '(11) 98765-4321',
  photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80',
  category: 'MEMBRO DA DIRETORIA',
  status: 'aprovado',
  lgpdConsent: true,
  lgpdConsentDate: new Date().toISOString(),
  validUntil: '2027-10-31',
  renewalCount: 0,
  lastGeneratedAt: new Date().toISOString(),
  lastViewToken: 'AUTH-PREVIEW-24H-SECURE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const AdminCardCustomizer: React.FC<CustomizerProps> = ({
  activeTemplate,
  onUpdateActiveTemplate,
  templates,
}) => {
  const { saveActiveTemplate } = useAuth();
  const [currentEdit, setCurrentEdit] = useState<CardTemplate>({ ...activeTemplate });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  // Keep editor in sync if activeTemplate changes from Firestore snapshot
  React.useEffect(() => {
    setCurrentEdit(prev => {
      if (prev.id === activeTemplate.id && prev.updatedAt === activeTemplate.updatedAt) {
        return prev;
      }
      return { ...activeTemplate };
    });
  }, [activeTemplate.id, activeTemplate.updatedAt]);

  // Handle template selection from preset models
  const handleSelectTemplate = (template: CardTemplate) => {
    const updated = {
      ...template,
      logoSize: template.logoSize || 76,
    };
    setCurrentEdit(updated);
    onUpdateActiveTemplate(updated);
  };

  const handleApplyPresetAsActive = async (template: CardTemplate) => {
    setSaving(true);
    try {
      const updated: CardTemplate = {
        ...template,
        logoSize: template.logoSize || 76,
        isDefault: true,
        updatedAt: new Date().toISOString(),
      };
      setCurrentEdit(updated);
      onUpdateActiveTemplate(updated);
      await saveActiveTemplate(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.warn('Erro ao ativar preset no banco:', err);
      alert('Erro ao ativar modelo no banco: ' + (err.message || 'Erro temporário.'));
    } finally {
      setSaving(false);
    }
  };

  const handleFieldToggle = (fieldKey: keyof CardTemplate, val: boolean) => {
    setCurrentEdit(prev => ({ ...prev, [fieldKey]: val }));
  };

  const handleAddCustomField = () => {
    if (!newFieldName.trim() || !newFieldValue.trim()) return;
    const newField: CustomCardField = {
      id: `custom_${Date.now()}`,
      label: newFieldName.trim(),
      value: newFieldValue.trim(),
      visible: true,
    };
    setCurrentEdit(prev => ({
      ...prev,
      customFields: [...(prev.customFields || []), newField],
    }));
    setNewFieldName('');
    setNewFieldValue('');
  };

  const handleRemoveCustomField = (id: string) => {
    setCurrentEdit(prev => ({
      ...prev,
      customFields: prev.customFields.filter(f => f.id !== id),
    }));
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      alert('A imagem da logo deve ter no máximo 2.5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (result) {
        setCurrentEdit(prev => ({ ...prev, logoUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Save template to Firestore (both canonical active_template and template entry)
  const handleSaveTemplate = async (isNew = false) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      const templateId = isNew
        ? `tmpl_${Date.now()}`
        : currentEdit.id === 'active_template'
        ? `tmpl_${Date.now()}`
        : currentEdit.id;

      const updatedTemplate: CardTemplate = {
        ...currentEdit,
        id: templateId,
        logoSize: currentEdit.logoSize || 76,
        isDefault: true,
        updatedAt: new Date().toISOString(),
      };

      await saveActiveTemplate(updatedTemplate);
      onUpdateActiveTemplate(updatedTemplate);
      setCurrentEdit(updatedTemplate);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Erro ao salvar template:', err);
      alert('Erro ao salvar no banco de dados: ' + (err.message || 'Verifique sua conexão.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: Quick Template Selector */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              Modelos de Carteirinha Salvos (Presets Prontos)
            </h3>
            <p className="text-xs text-zinc-400">
              Alterne entre layouts rápidos ou personalize todos os elementos visuais abaixo:
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSaveTemplate(false)}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
            </button>
            <button
              onClick={() => handleSaveTemplate(true)}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-colors flex items-center gap-1.5 border border-zinc-700 shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Salvar Novo Modelo</span>
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Configurações visuais e template salvos no banco de dados com sucesso!</span>
          </div>
        )}

        {/* Templates cards list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DEFAULT_TEMPLATES.map(t => {
            const isSelected = currentEdit.name === t.name;
            return (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t)}
                className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-950/30 shadow-md'
                    : 'border-zinc-800 bg-zinc-950/50 hover:border-zinc-700'
                }`}
              >
                <div
                  className="w-full h-8 rounded-md mb-2 flex items-center justify-center text-xs font-bold shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${t.primaryColor}, ${t.secondaryColor})`,
                    color: t.textColor,
                    border: `1px solid ${t.accentColor}40`,
                  }}
                >
                  <span className="text-[10px] tracking-wider truncate px-1">{t.orientation.toUpperCase()}</span>
                </div>
                <h5 className="font-bold text-xs text-white truncate">{t.name}</h5>
                <span className="text-[10px] text-zinc-400 block truncate">{t.associationName}</span>
                {isSelected && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Grid: Controls on Left, Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT: Customizer Form Controls (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-4">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h4 className="font-bold text-lg text-white">Configuração Visual da Carteirinha</h4>
          </div>

          {/* Section: Identidade & Associação */}
          <div className="space-y-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Type className="w-4 h-4" /> Identidade Institucional
            </h5>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nome do Modelo</label>
              <input
                type="text"
                value={currentEdit.name}
                onChange={e => setCurrentEdit(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Nome da Associação</label>
              <input
                type="text"
                value={currentEdit.associationName}
                onChange={e => setCurrentEdit(prev => ({ ...prev, associationName: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Subtítulo / CNPJ / Registro</label>
              <input
                type="text"
                value={currentEdit.associationSubtitle}
                onChange={e => setCurrentEdit(prev => ({ ...prev, associationSubtitle: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white focus:border-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Section: Símbolo / Logo da Associação */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" /> Logotipo & Brasão Oficial da Associação
              </h5>
              {currentEdit.logoUrl.startsWith('data:image') || currentEdit.logoUrl.startsWith('http') ? (
                <button
                  type="button"
                  onClick={() => setCurrentEdit(prev => ({ ...prev, logoUrl: 'shield' }))}
                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Restaurar Padrão</span>
                </button>
              ) : null}
            </div>

            {/* Logo Preview & File Upload Box */}
            <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 flex flex-col sm:flex-row items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl bg-black/40 border border-white/20 p-2 flex items-center justify-center shrink-0 shadow-inner overflow-hidden"
                style={{ color: currentEdit.accentColor }}
              >
                {currentEdit.logoUrl.startsWith('http') || currentEdit.logoUrl.startsWith('data:image') ? (
                  <img
                    src={currentEdit.logoUrl}
                    alt="Logo da Associação"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Shield className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-2 flex-1 text-center sm:text-left">
                <span className="text-xs font-bold text-white block">
                  {currentEdit.logoUrl.startsWith('data:image')
                    ? 'Logotipo Personalizado Carregado'
                    : currentEdit.logoUrl.startsWith('http')
                    ? 'Logotipo Carregado via URL'
                    : 'Emblema Vetorial Selecionado'}
                </span>
                <p className="text-[11px] text-zinc-400">
                  Faça o upload do emblema ou logo oficial (PNG transparente, SVG ou JPG).
                </p>

                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Carregar Logo do Arquivo</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Presets Gallery */}
            <div>
              <span className="block text-[11px] font-mono uppercase text-zinc-400 mb-2">
                Ou selecione um brasão vetorial da galeria:
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PRESET_LOGOS.map(logo => {
                  const Icon = logo.icon;
                  const isSelected = currentEdit.logoUrl === logo.id;
                  return (
                    <button
                      key={logo.id}
                      type="button"
                      onClick={() => setCurrentEdit(prev => ({ ...prev, logoUrl: logo.id }))}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-950/40 text-emerald-400 shadow-sm'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[9px] text-center truncate w-full">{logo.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* External URL Input */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Ou cole uma URL da Logo (Web):</label>
              <input
                type="text"
                placeholder="https://exemplo.com/logo-associacao.png"
                value={currentEdit.logoUrl.startsWith('http') ? currentEdit.logoUrl : ''}
                onChange={e => setCurrentEdit(prev => ({ ...prev, logoUrl: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500 outline-hidden font-mono"
              />
            </div>

            {/* Controle de Tamanho e Destaque da Logo */}
            <div className="pt-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Tamanho e Destaque Visual da Logo
                </span>
                <span className="font-mono text-emerald-300 font-extrabold bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-xs">
                  {currentEdit.logoSize || 76}px
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Médio', px: 64 },
                  { label: 'Grande (Padrão)', px: 76 },
                  { label: 'Destaque Nobre', px: 96 },
                  { label: 'Imponente', px: 120 },
                ].map(sz => (
                  <button
                    key={sz.label}
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, logoSize: sz.px }))}
                    className={`py-2 px-2 rounded-xl text-[11px] border font-semibold transition-all cursor-pointer ${
                      (currentEdit.logoSize || 76) === sz.px
                        ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300 font-bold shadow-md'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="range"
                  min={48}
                  max={140}
                  step={2}
                  value={currentEdit.logoSize || 76}
                  onChange={e => setCurrentEdit(prev => ({ ...prev, logoSize: Number(e.target.value) }))}
                  className="flex-1 accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
                />
                <span className="text-[10px] font-mono text-zinc-400">48-140px</span>
              </div>
            </div>
          </div>

          {/* Section: Cores & Gradiente */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Palette className="w-4 h-4" /> Paleta de Cores da Carteirinha
            </h5>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Cor Primária</label>
                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                  <input
                    type="color"
                    value={currentEdit.primaryColor}
                    onChange={e => setCurrentEdit(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-300">{currentEdit.primaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Gradiente Fim</label>
                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                  <input
                    type="color"
                    value={currentEdit.secondaryColor}
                    onChange={e => setCurrentEdit(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-300">{currentEdit.secondaryColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Destaque / Bordas</label>
                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                  <input
                    type="color"
                    value={currentEdit.accentColor}
                    onChange={e => setCurrentEdit(prev => ({ ...prev, accentColor: e.target.value }))}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-300">{currentEdit.accentColor}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Cor do Texto</label>
                <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                  <input
                    type="color"
                    value={currentEdit.textColor}
                    onChange={e => setCurrentEdit(prev => ({ ...prev, textColor: e.target.value }))}
                    className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-300">{currentEdit.textColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Layout, Orientação e Padrão de Fundo */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layout className="w-4 h-4" /> Formato & Textura Antifraude
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Orientação do Documento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, orientation: 'horizontal' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      currentEdit.orientation === 'horizontal'
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    Horizontal (Cartão)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, orientation: 'vertical' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      currentEdit.orientation === 'vertical'
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    Vertical (Crachá)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Padrão de Fundo (Guilhoché)</label>
                <select
                  value={currentEdit.backgroundPattern}
                  onChange={e => setCurrentEdit(prev => ({ ...prev, backgroundPattern: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="guilloche">Guilhoché Segurança (Pontilhado fino)</option>
                  <option value="waves">Ondas Holográficas</option>
                  <option value="mesh">Malha de Iluminação Suave</option>
                  <option value="geometric">Geométrico Diamante</option>
                  <option value="clean">Superfície Lisa & Limpa</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Toggles de Campos Pré-Definidos */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4" /> Campos Pré-definidos & Elementos de Segurança
            </h5>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Foto do Sócio (3x4)', key: 'showPhoto' as const },
                { label: 'Exibir CPF', key: 'showCpf' as const },
                { label: 'Data de Nascimento', key: 'showBirthDate' as const },
                { label: 'Categoria de Sócio', key: 'showCategory' as const },
                { label: 'QR Code de Validação', key: 'showQrCode' as const },
                { label: 'Selo Segurança 24h', key: 'showSecurityStamp' as const },
              ].map(item => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 cursor-pointer hover:border-zinc-700 select-none"
                >
                  <input
                    type="checkbox"
                    checked={currentEdit[item.key] as boolean}
                    onChange={e => handleFieldToggle(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1">Título da Assinatura (Verso)</label>
              <input
                type="text"
                value={currentEdit.signatureLabel}
                onChange={e => setCurrentEdit(prev => ({ ...prev, signatureLabel: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white focus:border-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Section: Campos Customizados Extras */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Campos Customizados Adicionais
            </h5>
            <p className="text-xs text-zinc-400">
              Adicione dados específicos da sua associação (ex: Clube de Campo, Filial Regional, Dependente, Tipo Sanguíneo).
            </p>

            {/* Existing custom fields */}
            <div className="space-y-2">
              {currentEdit.customFields?.map(f => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs"
                >
                  <div>
                    <span className="font-semibold text-white">{f.label}: </span>
                    <span className="text-zinc-400">{f.value}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomField(f.id)}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Remover campo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new field */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Rótulo (ex: Filial)"
                value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                className="w-1/2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Valor (ex: Sede Campestre)"
                value={newFieldValue}
                onChange={e => setNewFieldValue(e.target.value)}
                className="w-1/2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white outline-hidden focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddCustomField}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Live Interactive Preview (5 cols) */}
        <div className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-sm text-white">Visualização em Tempo Real</h4>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800">
                Sócio de Exemplo
              </span>
            </div>

            <DigitalCard member={SAMPLE_MEMBER} template={currentEdit} />

            <div className="mt-4 text-[11px] text-zinc-400 text-center leading-relaxed">
              💡 As mudanças feitas nos controles acima refletem imediatamente nesta prévia.
              Clique em <strong>Salvar Alterações</strong> para atualizar a carteirinha de todos os associados homologados.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
