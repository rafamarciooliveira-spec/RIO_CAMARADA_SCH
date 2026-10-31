import React, { useState, useEffect } from 'react';
import {
  Member,
  CardTemplate,
  InfoAlignment,
  FontSizeOption,
} from '../types/index.ts';
import { AssociationLogo } from './AssociationLogos.tsx';
import { QRCodeDisplay } from './QRCodeDisplay.tsx';
import { maskCPF } from '../utils/cpf.ts';
import { checkViewTokenStatus, checkOfficialCardStatus, DEFAULT_OFFICIAL_EXPIRY } from '../utils/security.ts';
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates.ts';
import {
  CheckCircle2,
  Clock,
  Calendar,
  RotateCw,
  Sparkles,
  ShieldCheck,
  Award,
  Printer,
  ExternalLink,
  Crown,
  User,
  Wifi,
  WifiOff,
  AlertCircle,
  Maximize2,
} from 'lucide-react';
import { formatDateBR } from '../utils/date.ts';

interface DigitalCardProps {
  member: Member;
  template: CardTemplate;
  onVerify?: () => void;
  onOpenFullscreen?: () => void;
  allowFlip?: boolean;
  compact?: boolean;
  forceOffline?: boolean;
}

export const DigitalCard: React.FC<DigitalCardProps> = ({
  member,
  template,
  onVerify,
  onOpenFullscreen,
  allowFlip = true,
  compact = false,
  forceOffline = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (forceOffline) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  const safeTemplate = template || DEFAULT_TEMPLATES[0];
  const safeMember = member || ({} as Member);

  // Track live browser online/offline status
  useEffect(() => {
    if (forceOffline) {
      setIsOnline(false);
      return;
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [forceOffline]);

  // Token & validity status calculations
  const tokenStatus = checkViewTokenStatus(safeMember.lastGeneratedAt);
  const officialStatus = checkOfficialCardStatus(safeMember.validUntil);

  // Background pattern CSS generator
  const getPatternStyle = () => {
    switch (safeTemplate.backgroundPattern) {
      case 'guilloche':
        return {
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.08) 1px, transparent 1px), radial-gradient(circle at 0% 100%, rgba(255,255,255,0.05) 1px, transparent 1px)`,
          backgroundSize: '16px 16px, 24px 24px',
        };
      case 'waves':
        return {
          backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 2px, transparent 2px, transparent 8px)`,
        };
      case 'mesh':
        return {
          backgroundImage: `radial-gradient(at 0% 0%, rgba(255,255,255,0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(0,0,0,0.3) 0px, transparent 50%)`,
        };
      case 'geometric':
        return {
          backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(225deg, rgba(255,255,255,0.05) 25%, transparent 25%)`,
          backgroundSize: '20px 20px',
        };
      default:
        return {};
    }
  };

  const memberId = safeMember.id || 'live';
  const memberToken = safeMember.lastViewToken || 'live';
  const verificationUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}?action=validar&id=${memberId}&token=${memberToken}`;

  const isVertical = safeTemplate.orientation !== 'horizontal';
  const logoPx = safeTemplate.logoSize || 76;
  const logoBgTransparent = safeTemplate.logoBgTransparent !== false; // Transparent by default as requested

  // Typography font size mapping for member name
  const getNameFontClass = (size?: FontSizeOption) => {
    switch (size) {
      case 'sm':
        return 'text-sm font-bold';
      case 'base':
        return 'text-base font-bold';
      case 'xl':
        return 'text-xl font-extrabold';
      case '2xl':
        return 'text-2xl font-black';
      case 'lg':
      default:
        return 'text-lg font-extrabold';
    }
  };

  // Typography font size mapping for details
  const getDetailsFontClass = (size?: 'xs' | 'sm' | 'base') => {
    switch (size) {
      case 'sm':
        return 'text-sm';
      case 'base':
        return 'text-base';
      case 'xs':
      default:
        return 'text-xs';
    }
  };

  // Alignment classes mapping
  const getAlignmentClass = (align?: InfoAlignment) => {
    switch (align) {
      case 'left':
        return 'text-left items-start';
      case 'right':
        return 'text-right items-end';
      case 'justify':
        return 'text-justify items-stretch';
      case 'center':
      default:
        return 'text-center items-center';
    }
  };

  const rawCategory = String(safeMember.category || 'SÓCIO').trim().toUpperCase();
  const isDiretoria = rawCategory === 'MEMBRO DA DIRETORIA';
  const isSocio = rawCategory === 'SÓCIO' || rawCategory === 'SOCIO';

  return (
    <div className="flex flex-col items-center select-none w-full max-w-sm sm:max-w-md mx-auto">
      {/* Dynamic Online / Offline 24h Validity Status Strip */}
      {safeTemplate.showSecurityStamp && !compact && (
        <div
          className={`w-full mb-3 px-3.5 py-2.5 rounded-2xl border flex items-center justify-between text-xs shadow-md backdrop-blur-md transition-colors ${
            isOnline
              ? 'bg-emerald-950/85 border-emerald-500/50 text-emerald-100'
              : tokenStatus.isValid
              ? 'bg-amber-950/85 border-amber-500/50 text-amber-100'
              : 'bg-red-950/85 border-red-500/50 text-red-100'
          }`}
        >
          {isOnline ? (
            /* ONLINE: Real-Time Valid */
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <div className="flex items-center gap-1.5 font-bold tracking-tight text-white text-[11px] sm:text-xs">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ON-LINE • VÁLIDA EM TEMPO REAL</span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Certificada Agora
              </span>
            </div>
          ) : (
            /* OFFLINE: 24-Hour countdown counting down from last online view */
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    tokenStatus.isValid ? 'bg-amber-400 animate-pulse' : 'bg-red-400'
                  }`}
                />
                <div className="flex items-center gap-1.5 font-bold tracking-tight text-[11px] sm:text-xs">
                  <WifiOff className="w-3.5 h-3.5 text-amber-300" />
                  <span>{tokenStatus.isValid ? 'OFF-LINE • VALIDADE 24H' : 'OFF-LINE • EXPIRADA'}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 font-mono text-[10px]">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>{tokenStatus.isValid ? tokenStatus.formattedRemaining : 'Conecte-se à web'}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* The Physical Card Container - Scaled for Mobile Phones */}
      <div
        className={`card-container relative transition-all duration-300 rounded-3xl p-4 sm:p-5 shadow-2xl border overflow-hidden ${
          isVertical
            ? 'w-full max-w-[340px] sm:max-w-[360px] min-h-[530px]'
            : 'w-full max-w-[340px] sm:max-w-[500px] min-h-[310px]'
        }`}
        style={{
          background: `linear-gradient(145deg, ${safeTemplate.primaryColor || '#064e3b'} 0%, ${safeTemplate.secondaryColor || '#022c22'} 100%)`,
          borderColor: `${safeTemplate.accentColor || '#fbbf24'}60`,
          color: safeTemplate.textColor || '#ffffff',
          ...getPatternStyle(),
        }}
      >
        {/* Holographic Security Shimmer Foil */}
        <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
          <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/40 to-transparent rotate-45 animate-shimmer" />
        </div>

        {/* Lanyard Clip Simulation for Badges */}
        {isVertical && (
          <div className="w-12 h-2.5 bg-black/50 border border-white/20 rounded-full mx-auto mb-2.5 shadow-inner" />
        )}

        {!isFlipped ? (
          /* FRONT SIDE - Exact Requested Order:
             1. Logo on top (transparent background)
             2. Association name right below logo
             3. Member photo
             4. Member name
             5. Validity and remaining info
          */
          <div className="relative z-10 flex flex-col justify-between h-full space-y-3">
            {/* 1. LOGO NA PARTE SUPERIOR */}
            <div className="flex flex-col items-center text-center">
              <div
                className={`flex items-center justify-center transition-all hover:scale-105 ${
                  logoBgTransparent
                    ? 'bg-transparent border-0 shadow-none p-0'
                    : 'rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 p-2 shadow-md'
                }`}
                style={{
                  width: `${logoPx}px`,
                  height: `${logoPx}px`,
                  color: safeTemplate.accentColor || '#fbbf24',
                }}
              >
                <AssociationLogo
                  logoKeyOrUrl={safeTemplate.logoUrl}
                  className="w-full h-full object-contain drop-shadow-lg"
                />
              </div>

              {/* 2. NOME DA ASSOCIAÇÃO LOGO ABAIXO */}
              <div className="mt-2 px-1">
                <h3 className="font-black text-sm sm:text-base tracking-wide leading-tight line-clamp-2 drop-shadow-md">
                  {safeTemplate.associationName || 'Associação Oficial'}
                </h3>
                {safeTemplate.associationSubtitle && (
                  <p className="text-[10px] opacity-80 leading-tight line-clamp-2 mt-0.5 font-sans">
                    {safeTemplate.associationSubtitle}
                  </p>
                )}
              </div>

              {/* Badge de Credencial Homologada */}
              <div
                className="mt-1.5 px-3 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest border shadow-xs inline-flex items-center gap-1"
                style={{
                  backgroundColor: `${safeTemplate.accentColor || '#fbbf24'}25`,
                  borderColor: safeTemplate.accentColor || '#fbbf24',
                  color: safeTemplate.accentColor || '#fbbf24',
                }}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Credencial Oficial Registrada</span>
              </div>
            </div>

            {/* Divisória sutil */}
            <div className="w-full border-t border-white/15 my-1" />

            {/* 3. FOTO DO SÓCIO */}
            {safeTemplate.showPhoto && (
              <div className="flex justify-center my-0.5">
                <div className="relative">
                  <div
                    className="w-24 h-32 sm:w-26 sm:h-34 rounded-2xl overflow-hidden border-2 shadow-xl bg-black/40 flex items-center justify-center"
                    style={{ borderColor: safeTemplate.accentColor || '#fbbf24' }}
                  >
                    {safeMember.photoUrl ? (
                      <img
                        src={safeMember.photoUrl}
                        alt={safeMember.fullName || 'Sócio'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/50 text-xs">
                        <Award className="w-8 h-8 opacity-40 mb-1" />
                        <span className="font-mono text-[10px]">FOTO 3x4</span>
                      </div>
                    )}
                  </div>

                  {safeTemplate.showSecurityStamp && (
                    <div
                      className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-md border border-white/40"
                      title="Sócio Certificado no Sistema"
                    >
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. NOME DO SÓCIO & 5. VALIDADE E DEMAIS INFORMAÇÕES */}
            <div className={`w-full flex flex-col ${getAlignmentClass(safeTemplate.infoAlignment)} px-1 space-y-2`}>
              {/* Nome do Sócio */}
              <div className="w-full">
                <span className="text-[9px] uppercase tracking-wider opacity-70 block font-mono">
                  Associado(a) Titular
                </span>
                <h4 className={`${getNameFontClass(safeTemplate.nameFontSize)} text-white leading-tight tracking-tight`}>
                  {safeMember.fullName || 'Associado Oficial'}
                </h4>

                {/* Categoria: SÓCIO ou MEMBRO DA DIRETORIA */}
                {safeTemplate.showCategory && (
                  <div className={`mt-1 flex ${safeTemplate.infoAlignment === 'left' ? 'justify-start' : safeTemplate.infoAlignment === 'right' ? 'justify-end' : 'justify-center'}`}>
                    {isDiretoria ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] rounded-lg font-black uppercase tracking-wider bg-amber-400 text-zinc-950 shadow-md border border-amber-300">
                        <Crown className="w-3 h-3 text-zinc-950" />
                        <span>MEMBRO DA DIRETORIA</span>
                      </span>
                    ) : isSocio ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 text-[10px] rounded-lg font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-500/60 shadow-sm">
                        <User className="w-3 h-3 text-emerald-400" />
                        <span>SÓCIO</span>
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 text-[10px] rounded-lg font-bold uppercase tracking-wider bg-white/15 border border-white/20"
                        style={{ color: safeTemplate.accentColor }}
                      >
                        <Award className="w-3 h-3" />
                        <span>{safeMember.category || 'SÓCIO'}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Informações detalhadas com Tamanho e Alinhamento configurados */}
              <div className="w-full bg-black/30 backdrop-blur-xs p-2.5 rounded-2xl border border-white/10 space-y-1.5">
                {/* Validade Oficial (Outubro de 2027) */}
                <div className={`flex flex-col ${safeTemplate.infoAlignment === 'left' ? 'items-start text-left' : safeTemplate.infoAlignment === 'right' ? 'items-end text-right' : 'items-center text-center'}`}>
                  <span className="text-[9px] uppercase tracking-wider opacity-70 font-mono">
                    Validade Estatutária Oficial
                  </span>
                  <div className="flex items-center gap-1 font-bold font-mono" style={{ color: safeTemplate.accentColor || '#fbbf24' }}>
                    <Calendar className="w-3 h-3" />
                    <span className={getDetailsFontClass(safeTemplate.detailsFontSize)}>
                      {officialStatus.formattedDate}
                    </span>
                  </div>
                </div>

                {/* CPF e Nascimento */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10 text-left">
                  {safeTemplate.showCpf && (
                    <div>
                      <span className="text-[8px] uppercase tracking-wider opacity-70 block font-mono">
                        CPF
                      </span>
                      <span className={`font-mono font-medium text-white ${getDetailsFontClass(safeTemplate.detailsFontSize)}`}>
                        {maskCPF(safeMember.cpf)}
                      </span>
                    </div>
                  )}

                  {safeTemplate.showBirthDate && (
                    <div>
                      <span className="text-[8px] uppercase tracking-wider opacity-70 block font-mono">
                        Nascimento
                      </span>
                      <span className={`font-mono text-white ${getDetailsFontClass(safeTemplate.detailsFontSize)}`}>
                        {formatDateBR(safeMember.birthDate)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Campos customizados da associação */}
                {Array.isArray(safeTemplate.customFields) && safeTemplate.customFields.length > 0 && (
                  <div className="pt-1 border-t border-white/10 space-y-1">
                    {safeTemplate.customFields.map(field => (
                      <div key={field.id} className="text-left">
                        <span className="text-[8px] uppercase tracking-wider opacity-70 block font-mono">
                          {field.label}
                        </span>
                        <span className={`font-medium text-white ${getDetailsFontClass(safeTemplate.detailsFontSize)}`}>
                          {field.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé da Carteirinha: Carimbo 24h & QR Code */}
            <div className="border-t border-white/15 pt-2 flex items-center justify-between gap-2">
              <div className="flex flex-col text-[9px] opacity-90 leading-tight">
                {/* Carimbo de 24h a partir da última visualização online */}
                <div className="flex items-center gap-1 font-mono text-white/90">
                  <Clock className="w-2.5 h-2.5 text-emerald-400" />
                  <span>
                    {isOnline ? 'Online agora: ' : 'Último online: '}
                    {tokenStatus.generatedDateStr}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[8px] text-white/70 mt-0.5">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Token 24h: {safeMember.lastViewToken ? safeMember.lastViewToken.slice(0, 14) + '...' : 'AUTH-24H'}</span>
                </div>
              </div>

              {/* QR Code Interativo */}
              {safeTemplate.showQrCode && (
                <div
                  onClick={onVerify}
                  className="bg-white p-1 rounded-xl shadow-md cursor-pointer hover:scale-105 transition-transform shrink-0"
                  title="Clique para validar autenticidade da credencial"
                >
                  <QRCodeDisplay
                    value={verificationUrl}
                    size={46}
                    darkColor="#0f172a"
                    lightColor="#ffffff"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* BACK SIDE - Disposições Estatutárias & LGPD */
          <div className="relative z-10 flex flex-col justify-between h-full text-xs">
            <div>
              <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: safeTemplate.accentColor || '#fbbf24' }}>
                  Regulamento & Disposições Gerais
                </span>
                <span className="text-[9px] opacity-70 font-mono">Verso Oficial</span>
              </div>

              <div className="space-y-2 text-[10px] opacity-90 leading-relaxed text-justify bg-black/25 p-2.5 rounded-xl border border-white/10">
                <p>
                  1. <strong>Identificação Pessoal:</strong> Esta credencial social é individual e intransferível, válida mediante apresentação de documento oficial de identidade com foto.
                </p>
                <p>
                  2. <strong>Validade Estatutária:</strong> A presente credencial possui validade garantida até <strong>{officialStatus.formattedDate}</strong> (Outubro de 2027). Após esta data, a renovação dependerá de nova aprovação da administração para prorrogação por mais 1 (um) ano.
                </p>
                <p>
                  3. <strong>Validade Dinâmica de Visualização (24 Horas):</strong> Quando conectada à internet, a credencial permanece válida em tempo real. Em modo off-line, sua validade é assegurada por até 24 horas a partir da última conexão registrada, prevenindo capturas de tela desatualizadas.
                </p>
                <p>
                  4. <strong>Conformidade Integral LGPD:</strong> Os dados deste associado são protegidos e tratados exclusivamente para os fins estatutários da associação nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
                </p>
              </div>
            </div>

            {/* Assinatura Digital do Gestor / Presidência */}
            <div className="pt-2 border-t border-white/15 flex flex-col items-center">
              <div className="w-32 border-b border-dashed border-white/40 mb-1" />
              <span className="text-[9px] uppercase font-bold tracking-wider text-white">
                {safeTemplate.signatureLabel || 'Diretoria Executiva'}
              </span>
              <span className="text-[8px] opacity-60 font-mono">Assinatura Digital Certificada ICP-Brasil</span>
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação para Celular e Desktop */}
      {!compact && (
        <div className="w-full max-w-[340px] sm:max-w-[360px] mt-3.5 flex items-center justify-between gap-2 px-1">
          {allowFlip && (
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{isFlipped ? 'Ver Frente' : 'Girar para o Verso'}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            {onOpenFullscreen && (
              <button
                onClick={onOpenFullscreen}
                className="px-3 py-2 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-emerald-500/30 shadow-xs cursor-pointer"
                title="Visualizar a carteira no tamanho total da tela do celular"
              >
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Tela Cheia</span>
              </button>
            )}

            {onVerify && (
              <button
                onClick={onVerify}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                title="Consultar autenticidade do QR Code"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Validar</span>
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1 transition-colors shadow-sm cursor-pointer"
              title="Imprimir ou Salvar PDF"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
