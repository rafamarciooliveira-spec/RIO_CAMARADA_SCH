import React, { useState, useEffect } from 'react';
import { Member, CardTemplate, OfflineSavedCard } from '../types/index.ts';
import { DigitalCard } from './DigitalCard.tsx';
import { getOfflineSavedCard, saveOfflineCard, clearOfflineSavedCard } from '../utils/security.ts';
import {
  ShieldCheck,
  Clock,
  Download,
  Printer,
  X,
  RefreshCw,
  HardDriveDownload,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  WifiOff,
  Share2,
} from 'lucide-react';

interface OfflineCardModalProps {
  member: Member;
  template: CardTemplate;
  onClose: () => void;
  onRefreshOnline?: () => void;
}

export const OfflineCardModal: React.FC<OfflineCardModalProps> = ({
  member,
  template,
  onClose,
  onRefreshOnline,
}) => {
  const [offlineState, setOfflineState] = useState(getOfflineSavedCard());
  const [justSaved, setJustSaved] = useState(false);

  // Live timer update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setOfflineState(getOfflineSavedCard());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handler to refresh/save the 24h offline snapshot
  const handleSaveOrRenew = () => {
    const res = saveOfflineCard(member, template);
    if (res.success) {
      setOfflineState(getOfflineSavedCard());
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
      if (onRefreshOnline) onRefreshOnline();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const cardData = offlineState.card?.member || member;
  const cardTemplate = offlineState.card?.template || template;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto animate-scale-in">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-inner">
              <HardDriveDownload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                Carteirinha Salva Offline (24h)
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
                  Uso Sem Conexão
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Apresente sua credencial em catracas, eventos e clubes mesmo sem sinal de internet.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Status and Countdown Banner */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md ${
              offlineState.isValid
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-3 text-center sm:text-left">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  offlineState.isValid
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider block opacity-80">
                  {offlineState.isValid ? 'Selo de Validade Offline Ativo' : 'Carimbo Offline Expirado'}
                </span>
                <span className="text-lg font-black tracking-tight block">
                  {offlineState.isValid
                    ? `${offlineState.formattedRemaining} restantes`
                    : 'Necessário gerar novo carimbo online'}
                </span>
              </div>
            </div>

            <button
              onClick={handleSaveOrRenew}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Renovar +24 Horas</span>
            </button>
          </div>

          {justSaved && (
            <div className="p-3 rounded-xl bg-emerald-900/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Credencial salva com sucesso no armazenamento seguro do dispositivo! Válida por 24h.</span>
            </div>
          )}

          {/* Render Physical Digital Card */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-3xl p-4 sm:p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            {/* Watermark Strip */}
            <div className="w-full max-w-md mb-2 px-3 py-1 bg-zinc-900/90 border border-zinc-700/60 rounded-lg flex items-center justify-between text-[11px] text-zinc-300 font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <WifiOff className="w-3 h-3" /> Modo Autônomo Offline
              </span>
              <span>{offlineState.savedDateStr ? `Emitido: ${offlineState.savedDateStr}` : 'Emissão Recente'}</span>
            </div>

            <DigitalCard
              member={cardData}
              template={cardTemplate}
              compact={false}
              allowFlip={true}
            />

            <div className="mt-3 text-center text-[11px] text-zinc-500 font-mono">
              Toque ou passe o mouse na carteirinha para virar e conferir o verso com QR Code oficial.
            </div>
          </div>

          {/* Security Summary & Technical Audit Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
            <div>
              <span className="text-zinc-500 block font-mono text-[10px] uppercase">Armazenamento Local:</span>
              <strong className="text-zinc-200">Dispositivo (LocalStorage Criptografado)</strong>
            </div>
            <div>
              <span className="text-zinc-500 block font-mono text-[10px] uppercase">Código de Autenticação 24h:</span>
              <strong className="text-emerald-400 font-mono">{offlineState.card?.offlineSecurityCode || cardData.lastViewToken || 'AUTH-OFFLINE-24H'}</strong>
            </div>
            <div>
              <span className="text-zinc-500 block font-mono text-[10px] uppercase">Horário do Carimbo:</span>
              <span className="text-zinc-300">{offlineState.savedDateStr || new Date().toLocaleString('pt-BR')}</span>
            </div>
            <div>
              <span className="text-zinc-500 block font-mono text-[10px] uppercase">Expiração do Carimbo 24h:</span>
              <span className="text-amber-400 font-semibold">{offlineState.expiryDateStr || 'Em 24 horas'}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-zinc-800">
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition-colors flex items-center justify-center gap-2 border border-zinc-700 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-md cursor-pointer"
            >
              Concluído
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
