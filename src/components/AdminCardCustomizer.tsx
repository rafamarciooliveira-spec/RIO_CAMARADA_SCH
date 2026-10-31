import React, { useState } from 'react';
import { CardTemplate, CustomCardField, Member, InfoAlignment, FontSizeOption } from '../types/index.ts';
import { DigitalCard } from './DigitalCard.tsx';
import { AssociationLogo, PRESET_LOGOS } from './AssociationLogos.tsx';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates.ts';
import { extractPaletteFromLogo, ExtractedLogoPalette } from '../utils/logoColorExtractor.ts';
import {
  Palette,
  Layout,
  Plus,
  Trash2,
  Check,
  Save,
  Sliders,
  Type,
  FileCheck,
  Eye,
  Upload,
  Image as ImageIcon,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  Smartphone,
  Layers,
  Shield,
  Sparkles,
  Wand2,
  RefreshCw,
  CheckCircle2,
  Pipette,
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
}) => {
  const { saveActiveTemplate } = useAuth();
  const [currentEdit, setCurrentEdit] = useState<CardTemplate>({
    ...activeTemplate,
    logoBgTransparent: activeTemplate.logoBgTransparent !== false,
    infoAlignment: activeTemplate.infoAlignment || 'center',
    nameFontSize: activeTemplate.nameFontSize || 'lg',
    detailsFontSize: activeTemplate.detailsFontSize || 'xs',
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [mobilePreviewMode, setMobilePreviewMode] = useState(true);

  // NOVO: Modo de configuração de cores baseado na Logo
  const [colorMode, setColorMode] = useState<'logo' | 'custom' | 'presets'>('logo');
  const [extractedPalette, setExtractedPalette] = useState<ExtractedLogoPalette | null>(null);
  const [extractingColors, setExtractingColors] = useState(false);
  const [paletteAppliedToast, setPaletteAppliedToast] = useState(false);

  // Auto-extração das cores da logo ativa
  React.useEffect(() => {
    let isCurrent = true;
    const analyze = async () => {
      if (!currentEdit.logoUrl) return;
      setExtractingColors(true);
      try {
        const palette = await extractPaletteFromLogo(currentEdit.logoUrl);
        if (isCurrent) {
          setExtractedPalette(palette);
        }
      } catch (e) {
        console.warn('Erro ao analisar paleta da logo:', e);
      } finally {
        if (isCurrent) setExtractingColors(false);
      }
    };
    analyze();
    return () => {
      isCurrent = false;
    };
  }, [currentEdit.logoUrl]);

  const handleApplyLogoPalette = (palette?: ExtractedLogoPalette | null) => {
    const target = palette || extractedPalette;
    if (!target) return;
    setCurrentEdit(prev => ({
      ...prev,
      primaryColor: target.primaryColor,
      secondaryColor: target.secondaryColor,
      accentColor: target.accentColor,
      textColor: target.textColor || '#ffffff',
    }));
    setPaletteAppliedToast(true);
    setTimeout(() => setPaletteAppliedToast(false), 3500);
  };

  // Keep editor in sync if activeTemplate changes from Firestore snapshot
  React.useEffect(() => {
    setCurrentEdit(prev => {
      if (prev.id === activeTemplate.id && prev.updatedAt === activeTemplate.updatedAt) {
        return prev;
      }
      return {
        ...activeTemplate,
        logoBgTransparent: activeTemplate.logoBgTransparent !== false,
        infoAlignment: activeTemplate.infoAlignment || 'center',
        nameFontSize: activeTemplate.nameFontSize || 'lg',
        detailsFontSize: activeTemplate.detailsFontSize || 'xs',
      };
    });
  }, [activeTemplate.id, activeTemplate.updatedAt]);

  // Handle template selection from preset models
  const handleSelectTemplate = (template: CardTemplate) => {
    const updated: CardTemplate = {
      ...template,
      logoSize: template.logoSize || 76,
      logoBgTransparent: template.logoBgTransparent !== false,
      infoAlignment: template.infoAlignment || 'center',
      nameFontSize: template.nameFontSize || 'lg',
      detailsFontSize: template.detailsFontSize || 'xs',
    };
    setCurrentEdit(updated);
    onUpdateActiveTemplate(updated);
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
        setCurrentEdit(prev => ({
          ...prev,
          logoUrl: result,
          logoBgTransparent: true, // Transparent by default
        }));

        // Sincroniza automaticamente a paleta com a nova logo anexada
        extractPaletteFromLogo(result).then(pal => {
          setExtractedPalette(pal);
          if (colorMode === 'logo') {
            setCurrentEdit(prev => ({
              ...prev,
              primaryColor: pal.primaryColor,
              secondaryColor: pal.secondaryColor,
              accentColor: pal.accentColor,
              textColor: pal.textColor || '#ffffff',
            }));
            setPaletteAppliedToast(true);
            setTimeout(() => setPaletteAppliedToast(false), 3500);
          }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // Save template to Firestore (persists both to canonical active_template and Firestore collection)
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
        logoBgTransparent: currentEdit.logoBgTransparent !== false,
        infoAlignment: currentEdit.infoAlignment || 'center',
        nameFontSize: currentEdit.nameFontSize || 'lg',
        detailsFontSize: currentEdit.detailsFontSize || 'xs',
        isDefault: true,
        updatedAt: new Date().toISOString(),
      };

      await saveActiveTemplate(updatedTemplate);
      onUpdateActiveTemplate(updatedTemplate);
      setCurrentEdit(updatedTemplate);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Erro ao salvar template:', err);
      alert('Erro ao salvar no banco de dados: ' + (err.message || 'Verifique sua conexão.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: Quick Template Selector & Save Action */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              Formatador Visual da Carteirinha & Banco de Dados
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Personalize o layout para celulares, posições, tamanhos, logo com fundo transparente e cores. Tudo é salvo no Firebase.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSaveTemplate(false)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-950/60 cursor-pointer disabled:opacity-50 hover:scale-102"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Gravando no Banco...' : 'Salvar no Banco de Dados'}</span>
            </button>
            <button
              onClick={() => handleSaveTemplate(true)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-colors flex items-center gap-1.5 border border-zinc-700 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Novo Modelo</span>
            </button>
          </div>
        </div>

        {saveSuccess && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2.5 shadow-md animate-fade-in">
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <strong className="block font-bold">Salvo com Sucesso no Banco de Dados!</strong>
              <span className="opacity-90">Todas as configurações visuais, logotipos, fontes e alinhamentos estão ativos e sincronizados.</span>
            </div>
          </div>
        )}

        {/* Templates presets list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {DEFAULT_TEMPLATES.map(t => {
            const isSelected = currentEdit.name === t.name;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTemplate(t)}
                className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-950/40 shadow-lg ring-1 ring-emerald-500'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <div
                  className="w-full h-8 rounded-lg mb-2 flex items-center justify-center text-xs font-bold shadow-inner"
                  style={{
                    background: `linear-gradient(135deg, ${t.primaryColor}, ${t.secondaryColor})`,
                    color: t.textColor,
                    border: `1px solid ${t.accentColor}40`,
                  }}
                >
                  <span className="text-[10px] tracking-wider truncate px-1">
                    {t.orientation === 'vertical' ? '📱 CELULAR (VERTICAL)' : 'HORIZONTAL'}
                  </span>
                </div>
                <h5 className="font-bold text-xs text-white truncate">{t.name}</h5>
                <span className="text-[10px] text-zinc-400 block truncate">{t.associationName}</span>
                {isSelected && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Grid: Controls on Left, Mobile-Optimized Live Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT: Customizer Form Controls (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-4">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h4 className="font-extrabold text-lg text-white">Configuração Visual da Carteirinha</h4>
          </div>

          {/* NOVO: Configurador de Posição & Alinhamento das Informações */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-emerald-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" /> Posição & Alinhamento das Informações
              </h5>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/40">
                Alinhamento: {currentEdit.infoAlignment === 'center' ? 'Centralizado' : currentEdit.infoAlignment === 'left' ? 'À Esquerda' : currentEdit.infoAlignment === 'right' ? 'À Direita' : 'Justificado'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'center' as InfoAlignment, label: 'Centralizado', icon: AlignCenter },
                { id: 'left' as InfoAlignment, label: 'À Esquerda', icon: AlignLeft },
                { id: 'right' as InfoAlignment, label: 'À Direita', icon: AlignRight },
                { id: 'justify' as InfoAlignment, label: 'Justificado', icon: AlignJustify },
              ].map(opt => {
                const Icon = opt.icon;
                const isSelected = (currentEdit.infoAlignment || 'center') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, infoAlignment: opt.id }))}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300 shadow-md font-bold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Configurador de Tamanho do Nome do Sócio */}
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-emerald-400" />
                  Tamanho do Nome do Sócio
                </span>
                <span className="font-mono text-emerald-300 text-xs">
                  {currentEdit.nameFontSize === 'sm' ? 'Pequeno (14px)' : currentEdit.nameFontSize === 'base' ? 'Médio (16px)' : currentEdit.nameFontSize === 'xl' ? 'Destaque (20px)' : currentEdit.nameFontSize === '2xl' ? 'Máximo (24px)' : 'Grande (18px)'}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { id: 'sm' as FontSizeOption, label: 'P' },
                  { id: 'base' as FontSizeOption, label: 'M' },
                  { id: 'lg' as FontSizeOption, label: 'G (Padrão)' },
                  { id: 'xl' as FontSizeOption, label: 'GG' },
                  { id: '2xl' as FontSizeOption, label: 'XG' },
                ].map(sz => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, nameFontSize: sz.id }))}
                    className={`py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer text-center ${
                      (currentEdit.nameFontSize || 'lg') === sz.id
                        ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300 font-bold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Configurador de Tamanho dos Detalhes (CPF, Nascimento, Campos) */}
            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">Tamanho dos Dados Adicionais (CPF, Nascimento, Campos)</span>
                <span className="font-mono text-emerald-300 text-xs">
                  {currentEdit.detailsFontSize === 'sm' ? 'Médio (12px)' : currentEdit.detailsFontSize === 'base' ? 'Aumentado (14px)' : 'Compacto (10px)'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'xs' as const, label: 'Compacto' },
                  { id: 'sm' as const, label: 'Médio / Legível' },
                  { id: 'base' as const, label: 'Aumentado' },
                ].map(sz => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, detailsFontSize: sz.id }))}
                    className={`py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      (currentEdit.detailsFontSize || 'xs') === sz.id
                        ? 'border-emerald-500 bg-emerald-950/70 text-emerald-300 font-bold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>
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

          {/* Section: Símbolo / Logo da Associação com Fundo Transparente */}
          <div className="space-y-4 pt-4 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4" /> Logotipo Oficial da Associação (Fundo Transparente)
              </h5>
              {currentEdit.logoUrl.startsWith('data:image') || currentEdit.logoUrl.startsWith('http') ? (
                <button
                  type="button"
                  onClick={() => setCurrentEdit(prev => ({ ...prev, logoUrl: 'shield' }))}
                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Restaurar Emblema</span>
                </button>
              ) : null}
            </div>

            {/* Logo Preview & File Upload Box */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row items-center gap-4">
              <div
                className={`w-18 h-18 rounded-2xl flex items-center justify-center shrink-0 shadow-inner overflow-hidden ${
                  currentEdit.logoBgTransparent !== false
                    ? 'bg-transparent border-0'
                    : 'bg-white/10 border border-white/20'
                }`}
                style={{ color: currentEdit.accentColor }}
              >
                {currentEdit.logoUrl.startsWith('http') || currentEdit.logoUrl.startsWith('data:image') ? (
                  <img
                    src={currentEdit.logoUrl}
                    alt="Logo da Associação"
                    className="w-full h-full object-contain drop-shadow-md"
                  />
                ) : (
                  <Shield className="w-10 h-10 drop-shadow-md" />
                )}
              </div>

              <div className="space-y-2 flex-1 text-center sm:text-left">
                <span className="text-xs font-bold text-white block">
                  {currentEdit.logoUrl.startsWith('data:image')
                    ? 'Logotipo Personalizado Carregado (Base64)'
                    : currentEdit.logoUrl.startsWith('http')
                    ? 'Logotipo Carregado via URL'
                    : 'Emblema Oficial Selecionado'}
                </span>
                <p className="text-[11px] text-zinc-400">
                  Carregue um arquivo PNG com fundo transparente ou selecione um brasão vetorial.
                </p>

                <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer shadow-sm transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Carregar Logo do Dispositivo</span>
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

            {/* Fundo Transparente Toggle */}
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Fundo da Logo Transparente</span>
                <span className="text-[11px] text-zinc-400">Remove qualquer fundo branco ou cinza por trás do logotipo</span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentEdit(prev => ({ ...prev, logoBgTransparent: !prev.logoBgTransparent }))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  currentEdit.logoBgTransparent !== false
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {currentEdit.logoBgTransparent !== false ? 'Transparente (Ativo)' : 'Com Moldura'}
              </button>
            </div>

            {/* Presets Gallery */}
            <div>
              <span className="block text-[11px] font-mono uppercase text-zinc-400 mb-2">
                Ou selecione um emblema vetorial institucional:
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

            {/* Controle de Tamanho da Logo */}
            <div className="pt-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Tamanho e Destaque da Logo na Carteirinha
                </span>
                <span className="font-mono text-emerald-300 font-extrabold bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/40 text-xs">
                  {currentEdit.logoSize || 76}px
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Médio', px: 64 },
                  { label: 'Padrão', px: 76 },
                  { label: 'Destaque', px: 96 },
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

          {/* Section: Cores & Gradiente - Padrão Cores da Logo & Customizador */}
          <div className="space-y-4 pt-3 border-t border-zinc-800">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Palette className="w-4 h-4" /> Configuração de Cores da Carteirinha
              </h5>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setColorMode('logo');
                    if (extractedPalette) {
                      handleApplyLogoPalette(extractedPalette);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    colorMode === 'logo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title="Configuração automática baseada na logo anexada"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                  <span>Padrão Cores da Logo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setColorMode('custom')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    colorMode === 'custom'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>Manual</span>
                </button>

                <button
                  type="button"
                  onClick={() => setColorMode('presets')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    colorMode === 'presets'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>Paletas Clássicas</span>
                </button>
              </div>
            </div>

            {/* Toast when palette from logo is applied */}
            {paletteAppliedToast && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in shadow-md">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Cores da Logo Aplicadas!</strong> A carteirinha foi harmonizada com a paleta encontrada na logo anexada.
                </span>
              </div>
            )}

            {/* MODE 1: PADRÃO CORES DA LOGO (Principal funcionalidade solicitada) */}
            {colorMode === 'logo' && (
              <div className="p-4 rounded-2xl bg-zinc-950/90 border border-emerald-500/30 space-y-4 shadow-inner">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 p-1.5 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                      <AssociationLogo logoKeyOrUrl={currentEdit.logoUrl} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white">
                          Cores Encontradas na Logo Anexada
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {extractedPalette?.sourceName || 'Logo Oficial'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Os tons da carteirinha são calculados automaticamente para combinar com a sua logo.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyLogoPalette(extractedPalette)}
                    disabled={extractingColors}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/60 cursor-pointer hover:scale-102 self-stretch sm:self-auto justify-center"
                    title="Aplica a paleta harmonizada extraída da logo"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${extractingColors ? 'animate-spin' : ''}`} />
                    <span>Sincronizar Cores da Logo</span>
                  </button>
                </div>

                {/* Swatches detectados na logo */}
                {extractedPalette && extractedPalette.detectedSwatches && extractedPalette.detectedSwatches.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-400 font-medium flex items-center gap-1">
                        <Pipette className="w-3.5 h-3.5 text-emerald-400" />
                        Tons Detectados na Imagem da Logo:
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        Clique em um tom para atribuir à carteirinha
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {extractedPalette.detectedSwatches.map((hex, idx) => (
                        <div key={idx} className="group relative">
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentEdit(prev => ({
                                ...prev,
                                accentColor: hex,
                              }));
                            }}
                            className="w-8 h-8 rounded-xl border border-white/20 transition-transform group-hover:scale-110 shadow-sm cursor-pointer flex items-center justify-center"
                            style={{ backgroundColor: hex }}
                            title={`Cor da logo: ${hex} (Clique para usar como Destaque)`}
                          >
                            {(currentEdit.accentColor === hex || currentEdit.primaryColor === hex) && (
                              <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                            )}
                          </button>

                          {/* Quick assign buttons on hover */}
                          <div className="hidden group-hover:flex absolute -top-9 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 rounded-lg shadow-xl text-[9px] gap-1 z-20 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentEdit(prev => ({ ...prev, primaryColor: hex }));
                              }}
                              className="px-1 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white"
                              title="Definir como Cor de Fundo Primária"
                            >
                              Fundo
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentEdit(prev => ({ ...prev, secondaryColor: hex }));
                              }}
                              className="px-1 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white"
                              title="Definir como Gradiente Fim"
                            >
                              Gradiente
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentEdit(prev => ({ ...prev, accentColor: hex }));
                              }}
                              className="px-1 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white"
                              title="Definir como Destaque / Bordas"
                            >
                              Destaque
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cores ativas da carteirinha (sincronizadas com a logo) */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <span className="block text-[11px] font-semibold text-zinc-400 mb-2">
                    Cores Ativas da Carteirinha (Baseadas na Logo):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800 flex items-center gap-2">
                      <input
                        type="color"
                        value={currentEdit.primaryColor}
                        onChange={e => setCurrentEdit(prev => ({ ...prev, primaryColor: e.target.value }))}
                        className="w-6 h-6 rounded-md border-0 cursor-pointer bg-transparent shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] text-zinc-400 block truncate">Fundo Primário</span>
                        <span className="text-xs font-mono text-white block">{currentEdit.primaryColor}</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800 flex items-center gap-2">
                      <input
                        type="color"
                        value={currentEdit.secondaryColor}
                        onChange={e => setCurrentEdit(prev => ({ ...prev, secondaryColor: e.target.value }))}
                        className="w-6 h-6 rounded-md border-0 cursor-pointer bg-transparent shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] text-zinc-400 block truncate">Gradiente Fim</span>
                        <span className="text-xs font-mono text-white block">{currentEdit.secondaryColor}</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800 flex items-center gap-2">
                      <input
                        type="color"
                        value={currentEdit.accentColor}
                        onChange={e => setCurrentEdit(prev => ({ ...prev, accentColor: e.target.value }))}
                        className="w-6 h-6 rounded-md border-0 cursor-pointer bg-transparent shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] text-zinc-400 block truncate">Destaque da Logo</span>
                        <span className="text-xs font-mono text-white block">{currentEdit.accentColor}</span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/80 p-2 rounded-xl border border-zinc-800 flex items-center gap-2">
                      <input
                        type="color"
                        value={currentEdit.textColor}
                        onChange={e => setCurrentEdit(prev => ({ ...prev, textColor: e.target.value }))}
                        className="w-6 h-6 rounded-md border-0 cursor-pointer bg-transparent shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] text-zinc-400 block truncate">Texto</span>
                        <span className="text-xs font-mono text-white block">{currentEdit.textColor}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MODE 2: PERSONALIZADO MANUAL */}
            {colorMode === 'custom' && (
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <span className="block text-xs font-semibold text-zinc-400">
                  Ajuste Livre dos Tons da Carteirinha:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Cor Primária</label>
                    <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
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
                    <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
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
                    <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
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
                    <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
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
            )}

            {/* MODE 3: PALETAS INSTITUCIONAIS PRONTAS */}
            {colorMode === 'presets' && (
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                <span className="block text-xs font-semibold text-zinc-400">
                  Selecione uma Paleta Institucional Consagrada:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { label: 'Verde Esmeralda Nobre', primary: '#064e3b', secondary: '#022c22', accent: '#10b981', text: '#ffffff' },
                    { label: 'Azul Marinho Real', primary: '#0f172a', secondary: '#1e293b', accent: '#38bdf8', text: '#ffffff' },
                    { label: 'Dourado Imperial', primary: '#1c1917', secondary: '#292524', accent: '#fbbf24', text: '#ffffff' },
                    { label: 'Rubi & Vinho Social', primary: '#4c0519', secondary: '#881337', accent: '#fb7185', text: '#ffffff' },
                    { label: 'Grafite Titânio', primary: '#18181b', secondary: '#09090b', accent: '#f59e0b', text: '#ffffff' },
                    { label: 'Safira Atlântica', primary: '#082f49', secondary: '#0c4a6e', accent: '#0284c7', text: '#ffffff' },
                  ].map(pal => (
                    <button
                      key={pal.label}
                      type="button"
                      onClick={() => {
                        setCurrentEdit(prev => ({
                          ...prev,
                          primaryColor: pal.primary,
                          secondaryColor: pal.secondary,
                          accentColor: pal.accent,
                          textColor: pal.text,
                        }));
                      }}
                      className="p-2.5 rounded-xl border border-zinc-800 hover:border-emerald-500 bg-zinc-900 text-left transition-all cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-lg border border-white/20 shadow-xs"
                          style={{
                            background: `linear-gradient(135deg, ${pal.primary}, ${pal.secondary})`,
                            borderColor: pal.accent,
                          }}
                        />
                        <span className="text-xs font-semibold text-white">{pal.label}</span>
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pal.accent }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Layout, Orientação e Padrão de Fundo */}
          <div className="space-y-3 pt-3 border-t border-zinc-800">
            <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layout className="w-4 h-4" /> Formato & Textura de Segurança
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Orientação do Documento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentEdit(prev => ({ ...prev, orientation: 'vertical' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      currentEdit.orientation === 'vertical'
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Vertical (Celular)</span>
                  </button>
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
              <FileCheck className="w-4 h-4" /> Elementos Exibidos na Carteirinha
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

        {/* RIGHT: Live Interactive Preview Optimized for Mobile Device Screen (5 cols) */}
        <div className="lg:col-span-5 sticky top-20 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col items-center">
            {/* Header controls for preview */}
            <div className="w-full flex items-center justify-between mb-4 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-sm text-white">Prévia em Tempo Real</h4>
              </div>

              <button
                type="button"
                onClick={() => setMobilePreviewMode(!mobilePreviewMode)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  mobilePreviewMode
                    ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{mobilePreviewMode ? 'Moldura Celular Ativa' : 'Exibição Livre'}</span>
              </button>
            </div>

            {/* Mobile frame wrapper */}
            <div
              className={`w-full flex justify-center transition-all ${
                mobilePreviewMode
                  ? 'max-w-[370px] p-4 bg-zinc-950/90 rounded-[40px] border-4 border-zinc-800 shadow-2xl'
                  : ''
              }`}
            >
              <DigitalCard member={SAMPLE_MEMBER} template={currentEdit} />
            </div>

            <div className="mt-4 text-[11px] text-zinc-400 text-center leading-relaxed">
              📱 <strong>Visualização otimizada para smartphones:</strong> A carteirinha tem a logo no topo com fundo transparente, nome da associação abaixo, foto do sócio, nome, categoria, validade até Outubro/2027 e selo de 24 horas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
