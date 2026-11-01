import React, { useEffect, useState } from 'react';
import { Member, CardTemplate } from '../types/index.ts';
import { DigitalCard } from './DigitalCard.tsx';
import { AssociationLogo } from './AssociationLogos.tsx';
import { checkViewTokenStatus, checkOfficialCardStatus } from '../utils/security.ts';
import { formatDateBR } from '../utils/date.ts';
import {
  X,
  Maximize2,
  Minimize2,
  Sun,
  ShieldCheck,
  Clock,
  Sparkles,
  Smartphone,
  RotateCw,
} from 'lucide-react';

interface FullScreenCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member;
  template: CardTemplate;
  onVerify?: () => void;
}

export const FullScreenCardModal: React.FC<FullScreenCardModalProps> = ({
  isOpen,
  onClose,
  member,
  template,
  onVerify,
}) => {
  const [isFullscreenApiActive, setIsFullscreenApiActive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Prevent background scrolling
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Attempt Native Fullscreen if supported
    const tryEnterFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          setIsFullscreenApiActive(true);
        }
      } catch {
        // User gesture or iframe constraints, CSS fullscreen overlay handles it perfectly
      }
    };
    tryEnterFullscreen();

    const handleFullscreenChange = () => {
      setIsFullscreenApiActive(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.body.style.overflow = originalOverflow;

      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isOpen, onClose]);

  const toggleNativeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreenApiActive(true);
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreenApiActive(false);
      }
    } catch {
      // Graceful fallback
    }
  };

  if (!isOpen) return null;

  const tokenStatus = checkViewTokenStatus(member.lastGeneratedAt);
  const officialStatus = checkOfficialCardStatus(member.validUntil);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between items-center p-2 sm:p-4 text-white select-none overflow-y-auto animate-fade-in cursor-pointer"
    >
      {/* Top Bar for Gatekeeper / Portaria Presentation */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg flex items-center justify-between gap-3 pt-1 pb-2 border-b border-zinc-800 cursor-default"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center p-1">
            <AssociationLogo logoKeyOrUrl={template?.logoUrl} className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white line-clamp-1">
                {template?.associationName || 'Portal do Associado'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                100% Tela
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Modo Apresentação Portaria / Catraca (LGPD)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Native Fullscreen Toggle */}
          <button
            onClick={toggleNativeFullscreen}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors cursor-pointer"
            title={isFullscreenApiActive ? 'Minimizar' : 'Tela Cheia do Navegador'}
          >
            {isFullscreenApiActive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-red-950/80 hover:text-red-300 hover:border-red-500/40 border border-zinc-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Fechar modo tela cheia"
          >
            <X className="w-4 h-4" />
            <span>Fechar</span>
          </button>
        </div>
      </div>

      {/* Screen Brightness Tip Banner */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg my-1.5 py-1 px-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-[10px] sm:text-xs flex items-center justify-between gap-2 shadow-xs cursor-default"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          Dica: Aumente o brilho do celular para leitura ágil do QR Code na portaria.
        </span>
        <span className="font-mono text-[9px] text-amber-300/80 bg-amber-900/60 px-1.5 py-0.5 rounded">
          {tokenStatus.isValid ? '24h Ativo' : 'Off-line'}
        </span>
      </div>

      {/* Center Stage: The Maximized Carteirinha */}
      <div className="flex-1 w-full flex items-center justify-center py-2">
        <div
          onClick={e => e.stopPropagation()}
          className="w-full max-w-[360px] sm:max-w-[420px] transform-gpu scale-100 transition-transform cursor-default"
        >
          <DigitalCard
            member={member}
            template={template}
            onVerify={onVerify}
          />
        </div>
      </div>

      {/* Bottom Bar: Instructions, 24h Countdown & Quick Close */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg pt-2 pb-1 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-center text-xs text-zinc-400 cursor-default"
      >
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white">
            Validade Oficial: <strong>{officialStatus.formattedDate}</strong>
          </span>
          <span className="text-zinc-600">•</span>
          <span className="text-emerald-400">
            Selo 24h: {tokenStatus.formattedRemaining}
          </span>
        </div>

        <button
          onClick={onClose}
          className="w-full sm:w-auto px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer"
        >
          Voltar ao Painel
        </button>
      </div>
    </div>
  );
};
