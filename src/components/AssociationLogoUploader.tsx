import React, { useState, useRef, useEffect } from 'react';
import { AssociationLogo, PRESET_LOGOS } from './AssociationLogos.tsx';
import { CardTemplate } from '../types/index.ts';
import { db } from '../firebase/config.ts';
import { doc, setDoc } from 'firebase/firestore';
import {
  Upload,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles,
  Save,
  HelpCircle,
  Eye,
  Check,
  Maximize2,
  Sliders,
  Database,
} from 'lucide-react';

interface LogoUploaderProps {
  currentLogoUrl: string;
  activeTemplate: CardTemplate;
  onLogoChange: (newLogoUrl: string) => void;
  onLogoSizeChange?: (newSize: number) => void;
  onSaveTemplate?: () => void;
  compact?: boolean;
}

export const AssociationLogoUploader: React.FC<LogoUploaderProps> = ({
  currentLogoUrl,
  activeTemplate,
  onLogoChange,
  onLogoSizeChange,
  onSaveTemplate,
  compact = false,
}) => {
  const [logoInput, setLogoInput] = useState(
    currentLogoUrl.startsWith('http') || currentLogoUrl.startsWith('data:image')
      ? currentLogoUrl
      : ''
  );
  const [logoSize, setLogoSize] = useState<number>(activeTemplate.logoSize || 44);
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTemplate.logoSize) {
      setLogoSize(activeTemplate.logoSize);
    }
  }, [activeTemplate.logoSize]);

  const isCustomImage =
    currentLogoUrl.startsWith('http') || currentLogoUrl.startsWith('data:image');

  // Process uploaded image file
  const processFile = (file: File) => {
    setStatusMessage(null);

    // Validate type
    if (!file.type.startsWith('image/')) {
      setStatusMessage({
        type: 'error',
        text: 'Formato inválido. Por favor, selecione um arquivo de imagem (PNG, JPG, SVG, WebP).',
      });
      return;
    }

    // Limit size to 2.5MB to fit nicely in Firestore document
    if (file.size > 2.5 * 1024 * 1024) {
      setStatusMessage({
        type: 'error',
        text: 'A imagem é muito grande. O tamanho máximo permitido é de 2.5MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      if (result) {
        onLogoChange(result);
        setLogoInput('');
        setStatusMessage({
          type: 'success',
          text: `Logo carregada com sucesso (${(file.size / 1024).toFixed(1)} KB)! Clique em "Salvar Logo no Banco de Dados" abaixo para fixar.`,
        });
      }
    };
    reader.onerror = () => {
      setStatusMessage({
        type: 'error',
        text: 'Erro ao ler o arquivo de imagem. Tente novamente.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (!logoInput.trim()) {
      setStatusMessage({ type: 'error', text: 'Informe a URL da imagem da logo.' });
      return;
    }
    onLogoChange(logoInput.trim());
    setStatusMessage({
      type: 'success',
      text: 'Logo atualizada a partir da URL com sucesso! Clique em "Salvar Logo no Banco de Dados" para gravar.',
    });
  };

  const handleSelectPreset = (presetId: string) => {
    onLogoChange(presetId);
    setLogoInput('');
    setStatusMessage({
      type: 'success',
      text: 'Emblema institucional selecionado!',
    });
  };

  const handleRemoveLogo = () => {
    onLogoChange('shield');
    setLogoInput('');
    setStatusMessage({
      type: 'success',
      text: 'Logo personalizada removida. Brasão padrão ativado.',
    });
  };

  const handleSizeChange = (newSize: number) => {
    setLogoSize(newSize);
    if (onLogoSizeChange) {
      onLogoSizeChange(newSize);
    }
  };

  // Quick save to Firestore directly from this component
  const handleQuickSaveToDatabase = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const path = 'cardTemplates';
      const updated: CardTemplate = {
        ...activeTemplate,
        logoUrl: currentLogoUrl,
        logoSize: logoSize,
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, path, activeTemplate.id), updated, { merge: true });
      setStatusMessage({
        type: 'success',
        text: '✅ Logotipo e tamanho salvos com sucesso no Banco de Dados (Firestore)! Todas as carteirinhas ativas foram atualizadas.',
      });
      if (onSaveTemplate) onSaveTemplate();
    } catch (err: any) {
      console.error('Erro ao salvar template no Firestore:', err);
      setStatusMessage({
        type: 'error',
        text: `Erro ao gravar no banco: ${err.message || 'Verifique as permissões de administrador.'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ImageIcon className="w-5 h-5" />
            </span>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Logo e Identidade Visual da Associação
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Faça upload do logotipo oficial da entidade, regule o tamanho e salve no banco de dados para todas as carteirinhas.
          </p>
        </div>

        {/* Action Save Button */}
        <button
          onClick={handleQuickSaveToDatabase}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:scale-102"
        >
          <Database className="w-4 h-4 text-emerald-200" />
          <span>{saving ? 'Gravando no Banco...' : 'Salvar Logo no Banco de Dados'}</span>
        </button>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* CONTROLE DE TAMANHO DA LOGO (Novo / Solicitado) */}
      <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Maximize2 className="w-4 h-4 text-emerald-400" />
            <span>Tamanho da Logo na Carteirinha</span>
          </div>
          <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-emerald-300 font-bold">
            {logoSize}px
          </span>
        </div>

        {/* Quick Size Presets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Pequeno', px: 32 },
            { label: 'Médio (Padrão)', px: 44 },
            { label: 'Grande', px: 62 },
            { label: 'Extra Grande', px: 78 },
          ].map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleSizeChange(preset.px)}
              className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all cursor-pointer text-center ${
                logoSize === preset.px
                  ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-xs ring-1 ring-emerald-500 font-bold'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              {preset.label} ({preset.px}px)
            </button>
          ))}
        </div>

        {/* Fine Tuning Range Slider */}
        <div className="pt-2 flex items-center gap-4">
          <span className="text-[11px] text-zinc-400 shrink-0">Ajuste Fino:</span>
          <input
            type="range"
            min={28}
            max={96}
            step={2}
            value={logoSize}
            onChange={e => handleSizeChange(Number(e.target.value))}
            className="flex-1 accent-emerald-500 cursor-pointer"
          />
          <span className="text-[11px] text-zinc-500 font-mono w-12 text-right">
            28-96px
          </span>
        </div>
      </div>

      {/* Dual Preview Box: Shows how the logo renders with the selected size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-950/80 p-4 rounded-2xl border border-zinc-800">
        {/* Dark Preview (Carteirinha) */}
        <div
          className="p-4 rounded-xl flex items-center justify-between gap-4 border min-h-[90px]"
          style={{
            background: `linear-gradient(135deg, ${activeTemplate.primaryColor}, ${activeTemplate.secondaryColor})`,
            borderColor: `${activeTemplate.accentColor}40`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl bg-black/30 border border-white/20 p-1 flex items-center justify-center shadow-inner overflow-hidden transition-all shrink-0"
              style={{
                width: `${logoSize}px`,
                height: `${logoSize}px`,
                color: activeTemplate.accentColor,
              }}
            >
              <AssociationLogo logoKeyOrUrl={currentLogoUrl} className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-white/70 block">
                Prévia na Carteirinha ({logoSize}px)
              </span>
              <h5 className="font-bold text-xs text-white line-clamp-1">{activeTemplate.associationName}</h5>
              <span className="text-[9px] text-white/75 font-mono">Fundo Escuro / Gradiente</span>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-emerald-300 border border-white/10 shrink-0">
            Ativa
          </span>
        </div>

        {/* Light Preview (Documentos / Impressão) */}
        <div className="p-4 rounded-xl bg-white text-zinc-900 border border-zinc-300 flex items-center justify-between gap-4 min-h-[90px]">
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl bg-zinc-100 border border-zinc-300 p-1 flex items-center justify-center shadow-xs overflow-hidden text-zinc-800 transition-all shrink-0"
              style={{
                width: `${logoSize}px`,
                height: `${logoSize}px`,
              }}
            >
              <AssociationLogo logoKeyOrUrl={currentLogoUrl} className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono text-zinc-500 block">
                Prévia em Fundo Claro ({logoSize}px)
              </span>
              <h5 className="font-bold text-xs text-zinc-900 line-clamp-1">{activeTemplate.associationName}</h5>
              <span className="text-[9px] text-zinc-500 font-mono">Impressão / Papel Timbrado</span>
            </div>
          </div>
          {isCustomImage && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              className="px-2 py-1 rounded-lg bg-zinc-100 hover:bg-red-50 text-red-600 text-[10px] font-semibold border border-zinc-300 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              title="Remover logotipo e voltar ao brasão padrão"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remover</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs: Upload / URL / Presets */}
      <div>
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>1. Carregar Arquivo de Imagem</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'url'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>2. Link / URL Externa</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>3. Galeria de Emblemas</span>
          </button>
        </div>

        {/* TAB 1: FILE UPLOAD DROPZONE */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-950/30 scale-101'
                  : 'border-zinc-700 bg-zinc-950/60 hover:border-emerald-500/70 hover:bg-zinc-900/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
                <Upload className="w-8 h-8 animate-bounce" />
              </div>

              <div>
                <h4 className="font-bold text-sm text-white">
                  Clique para selecionar ou arraste o arquivo da logo aqui
                </h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Formatos aceitos: <strong>PNG (com transparência)</strong>, <strong>SVG</strong>, <strong>JPG</strong> ou <strong>WebP</strong> (máx. 2.5MB).
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-[11px] text-zinc-300 font-medium border border-zinc-700">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Recomendado: Imagem quadrada (ex: 512x512px) com fundo transparente</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXTERNAL URL */}
        {activeTab === 'url' && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Cole o link direto da imagem da logo:
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://exemplo.com/imagens/logo-associacao.png"
                value={logoInput}
                onChange={e => setLogoInput(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white font-mono outline-hidden focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shrink-0 cursor-pointer shadow-md"
              >
                Carregar Logo
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">
              Certifique-se de que o link termine em .png, .svg ou .jpg e que o servidor permita acesso público.
            </p>
          </div>
        )}

        {/* TAB 3: PRESET EMBLEMS */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <span className="text-xs text-zinc-400 block">
              Não tem uma logo própria em formato digital? Escolha um brasão oficial estilizado:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {PRESET_LOGOS.map(logo => {
                const Icon = logo.icon;
                const isSelected = currentLogoUrl === logo.id;
                return (
                  <button
                    key={logo.id}
                    type="button"
                    onClick={() => handleSelectPreset(logo.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/50 text-emerald-400 shadow-md ring-1 ring-emerald-500'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-[10px] text-center font-medium truncate w-full">
                      {logo.label}
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Database Save Confirmation Bar */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 to-zinc-950 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h5 className="text-xs font-bold text-white">Persistência em Nuvem (Firestore)</h5>
            <p className="text-[11px] text-zinc-400">
              Grave a logo e o tamanho ajustado diretamente na coleção do banco de dados para sincronizar com todos os sócios.
            </p>
          </div>
        </div>

        <button
          onClick={handleQuickSaveToDatabase}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Gravando...' : 'Gravar Alterações no Banco'}</span>
        </button>
      </div>

      {/* Tips footer */}
      <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-start gap-2.5">
        <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong>Dica do Sistema:</strong> Ao definir ou atualizar a logo e seu tamanho, as configurações são salvas
          no documento do banco de dados e refletidas instantaneamente na visualização da carteirinha digital de sócios e diretores.
        </div>
      </div>
    </div>
  );
};
