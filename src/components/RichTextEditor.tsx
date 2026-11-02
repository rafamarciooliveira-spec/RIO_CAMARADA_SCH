import React, { useRef, useEffect, useState } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  RotateCcw,
  Eye,
  CheckCircle2,
  Sparkles,
  FileText,
} from 'lucide-react';
import { PhotoUploader } from './PhotoUploader.tsx';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onSaveDraft?: (html: string) => void;
  draftKey?: string;
  placeholder?: string;
  onPreviewToggle?: () => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  onSaveDraft,
  draftKey = 'culture_article_draft',
  placeholder = 'Escreva o conteúdo completo do artigo com formatação visual rica...',
  onPreviewToggle,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // Initial populate
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, []);

  // Periodic Auto-save draft every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (editorRef.current) {
        const content = editorRef.current.innerHTML;
        if (content && content.trim() !== '<br>') {
          try {
            localStorage.setItem(draftKey, content);
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR');
            setDraftSavedAt(timeStr);
            if (onSaveDraft) onSaveDraft(content);
          } catch (e) {}
        }
      }
    }, 8000);

    return () => clearInterval(timer);
  }, [draftKey, onSaveDraft]);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      onChange(html);
    }
  };

  const execCmd = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const url = linkUrl.startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    const selected = window.getSelection()?.toString();
    if (selected) {
      execCmd('createLink', url);
    } else {
      const text = linkText.trim() || url;
      const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-emerald-400 underline hover:text-emerald-300">${text}</a>`;
      execCmd('insertHTML', linkHtml);
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
  };

  const handleInsertImage = (url: string) => {
    if (!url) return;
    const imgHtml = `<figure class="my-4"><img src="${url}" alt="Imagem do Artigo" class="w-full max-h-96 object-cover rounded-2xl shadow-lg border border-zinc-700" /><figcaption class="text-center text-xs text-zinc-400 mt-1.5 italic">Registro fotográfico do acervo</figcaption></figure><p><br></p>`;
    execCmd('insertHTML', imgHtml);
    setShowImageModal(false);
  };

  return (
    <div className="border border-zinc-700 rounded-2xl bg-zinc-950 overflow-hidden shadow-lg space-y-0">
      {/* Visual Word-like Toolbar */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {/* Formatação Básica */}
          <button
            type="button"
            onClick={() => execCmd('bold')}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Negrito (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('italic')}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Itálico (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>

          <span className="w-px h-5 bg-zinc-800 mx-1" />

          {/* Títulos */}
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<h1>')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-black text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Título Principal (H1)"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<h2>')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Subtítulo da Seção (H2)"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<h3>')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Subtítulo Menor (H3)"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<p>')}
            className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Parágrafo Normal"
          >
            Normal
          </button>

          <span className="w-px h-5 bg-zinc-800 mx-1" />

          {/* Listas & Citação */}
          <button
            type="button"
            onClick={() => execCmd('insertUnorderedList')}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Lista com Marcadores"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('insertOrderedList')}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Lista Numerada"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('formatBlock', '<blockquote>')}
            className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Citação em Destaque"
          >
            <Quote className="w-4 h-4" />
          </button>

          <span className="w-px h-5 bg-zinc-800 mx-1" />

          {/* Links e Imagens */}
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="p-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Inserir Link"
          >
            <LinkIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowImageModal(true)}
            className="p-2 rounded-lg text-zinc-300 hover:text-emerald-400 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Inserir Foto no Meio do Artigo"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => execCmd('removeFormat')}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Limpar Formatação do Trecho"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Controls: Auto-save status and Preview button */}
        <div className="flex items-center gap-2">
          {draftSavedAt && (
            <span className="text-[10px] text-emerald-400 font-mono hidden sm:flex items-center gap-1 bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3" />
              <span>Rascunho salvo às {draftSavedAt}</span>
            </span>
          )}

          {onPreviewToggle && (
            <button
              type="button"
              onClick={onPreviewToggle}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Visualizar como o Sócio Vê</span>
            </button>
          )}
        </div>
      </div>

      {/* ContentEditable Workspace Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="p-5 min-h-[300px] max-h-[500px] overflow-y-auto text-sm text-zinc-200 leading-relaxed outline-hidden focus:ring-1 focus:ring-emerald-500/40 prose prose-invert max-w-none custom-scrollbar"
        style={{ minHeight: '260px' }}
        data-placeholder={placeholder}
      />

      {/* Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-zinc-100 space-y-3">
            <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
              <LinkIcon className="w-4 h-4 text-emerald-400" /> Inserir Link
            </h4>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Endereço da Web (URL):</label>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://exemplo.com.br"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white outline-hidden focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Texto de Exibição (Opcional):</label>
              <input
                type="text"
                value={linkText}
                onChange={e => setLinkText(e.target.value)}
                placeholder="Ex: Clique aqui para ver"
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-white outline-hidden focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInsertLink}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold"
              >
                Inserir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Insert Modal */}
      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-6 shadow-2xl text-zinc-100 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                Inserir Imagem no Artigo
              </h4>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <PhotoUploader
              aspectRatio="16:9"
              storageFolder="culture_inline"
              label="Carregar Foto para o Texto"
              helperText="Selecione ou arraste a imagem que deseja inserir dentro do artigo."
              onPhotoSelected={handleInsertImage}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
