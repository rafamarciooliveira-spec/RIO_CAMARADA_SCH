import React, { useState } from 'react';
import {
  Member,
  CardTemplate,
} from '../types/index.ts';
import { AssociationLogo } from './AssociationLogos.tsx';
import { QRCodeDisplay } from './QRCodeDisplay.tsx';
import { formatCPF, maskCPF } from '../utils/cpf.ts';
import { checkViewTokenStatus, checkOfficialCardStatus } from '../utils/security.ts';
import {
  CheckCircle2,
  Clock,
  Calendar,
  RotateCw,
  Sparkles,
  ShieldCheck,
  Award,
  Download,
  Printer,
  ExternalLink,
  Crown,
  User,
} from 'lucide-react';

interface DigitalCardProps {
  member: Member;
  template: CardTemplate;
  onVerify?: () => void;
  allowFlip?: boolean;
  compact?: boolean;
}

export const DigitalCard: React.FC<DigitalCardProps> = ({
  member,
  template,
  onVerify,
  allowFlip = true,
  compact = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  // Calculate 24h generation view window
  const tokenStatus = checkViewTokenStatus(member.lastGeneratedAt);
  // Calculate official card expiration (outubro de 2027 or custom)
  const officialStatus = checkOfficialCardStatus(member.validUntil);

  // Background pattern CSS or SVG overlay
  const getPatternStyle = () => {
    switch (template.backgroundPattern) {
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

  const verificationUrl = `${window.location.origin}?action=validar&id=${member.id}&token=${member.lastViewToken || 'live'}`;

  const isVertical = template.orientation === 'vertical';
  const logoPx = template.logoSize || 76;

  const isDiretoria = member.category?.trim().toUpperCase() === 'MEMBRO DA DIRETORIA';
  const isSocio = member.category?.trim().toUpperCase() === 'SÓCIO' || member.category?.trim().toUpperCase() === 'SOCIO';

  return (
    <div className="flex flex-col items-center select-none">
      {/* 24h Live Security Verification Banner */}
      {template.showSecurityStamp && !compact && (
        <div className="w-full max-w-md mb-3 px-3 py-2 bg-emerald-950/80 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-200 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium text-emerald-100 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Selo 24h Ativo
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>Validade da visualização: {tokenStatus.formattedRemaining}</span>
          </div>
        </div>
      )}

      {/* The Physical Card Container */}
      <div
        className={`card-container relative transition-all duration-500 rounded-2xl p-5 shadow-2xl border overflow-hidden ${
          isVertical ? 'w-[320px] min-h-[520px]' : 'w-full max-w-[520px] min-h-[310px]'
        }`}
        style={{
          background: `linear-gradient(135deg, ${template.primaryColor} 0%, ${template.secondaryColor} 100%)`,
          borderColor: `${template.accentColor}50`,
          color: template.textColor,
          ...getPatternStyle(),
        }}
      >
        {/* Holographic Shimmer Effect Strip */}
        <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
          <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/30 to-transparent rotate-45 animate-shimmer" />
        </div>

        {/* Lanyard Slot Simulation for Vertical Badges */}
        {isVertical && (
          <div className="w-14 h-3 bg-black/40 border border-white/20 rounded-full mx-auto mb-3 shadow-inner" />
        )}

        {!isFlipped ? (
          /* FRONT SIDE */
          <div className="relative z-10 flex flex-col justify-between h-full">
            {/* Header: Logo & Association Name */}
            {isVertical ? (
              <div className="flex flex-col items-center text-center border-b border-white/15 pb-3 mb-2 relative">
                <div
                  className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/30 shadow-lg flex items-center justify-center p-2 mb-2 shrink-0 transition-all hover:scale-105"
                  style={{
                    width: `${logoPx}px`,
                    height: `${logoPx}px`,
                    color: template.accentColor,
                  }}
                >
                  <AssociationLogo logoKeyOrUrl={template.logoUrl} className="w-full h-full object-contain drop-shadow-md" />
                </div>
                <h3 className="font-black text-sm tracking-wide leading-tight line-clamp-2 drop-shadow-sm px-2">
                  {template.associationName}
                </h3>
                <p className="text-[10px] opacity-80 leading-tight line-clamp-1 mt-0.5 px-2">
                  {template.associationSubtitle}
                </p>
                <div
                  className="mt-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shadow-xs inline-flex items-center gap-1"
                  style={{
                    backgroundColor: `${template.accentColor}25`,
                    borderColor: template.accentColor,
                    color: template.accentColor,
                  }}
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>Credencial Oficial Ativa</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className="rounded-2xl bg-white/15 backdrop-blur-md border border-white/30 shadow-lg flex items-center justify-center p-2 shrink-0 transition-all hover:scale-105"
                    style={{
                      width: `${logoPx}px`,
                      height: `${logoPx}px`,
                      color: template.accentColor,
                    }}
                  >
                    <AssociationLogo logoKeyOrUrl={template.logoUrl} className="w-full h-full object-contain drop-shadow-md" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-base sm:text-lg tracking-wide leading-tight line-clamp-2 drop-shadow-sm">
                      {template.associationName}
                    </h3>
                    <p className="text-[11px] opacity-85 leading-tight line-clamp-1 mt-0.5">
                      {template.associationSubtitle}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-xs flex items-center gap-1 shrink-0"
                  style={{
                    backgroundColor: `${template.accentColor}25`,
                    borderColor: template.accentColor,
                    color: template.accentColor,
                  }}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Ativo</span>
                </div>
              </div>
            )}

            {/* Body */}
            <div className={`my-4 ${isVertical ? 'flex flex-col items-center text-center' : 'flex items-center gap-4'}`}>
              {/* Member Photo */}
              {template.showPhoto && (
                <div className="relative shrink-0">
                  <div
                    className={`rounded-xl overflow-hidden border-2 shadow-md bg-black/30 flex items-center justify-center ${
                      isVertical ? 'w-24 h-30 mb-2' : 'w-20 h-26'
                    }`}
                    style={{ borderColor: template.accentColor }}
                  >
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.fullName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/50 text-xs">
                        <Award className="w-8 h-8 opacity-40 mb-1" />
                        <span>3x4</span>
                      </div>
                    )}
                  </div>
                  {template.showSecurityStamp && (
                    <div
                      className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-xs"
                      title="Sócio Certificado"
                    >
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}
                </div>
              )}

              {/* Member Details */}
              <div className={`flex-1 min-w-0 ${isVertical ? 'w-full' : ''}`}>
                <div className="mb-2">
                  <span className="text-[9px] uppercase tracking-wider opacity-70 block font-mono">
                    Nome do Associado
                  </span>
                  <h4 className="text-base font-bold tracking-tight text-white leading-snug truncate">
                    {member.fullName}
                  </h4>
                  {template.showCategory && (
                    <div className="mt-1 flex items-center gap-1.5">
                      {isDiretoria ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] rounded-md font-bold uppercase tracking-wider bg-amber-400 text-zinc-950 shadow-sm border border-amber-300">
                          <Crown className="w-3 h-3 text-zinc-950" />
                          <span>MEMBRO DA DIRETORIA</span>
                        </span>
                      ) : isSocio ? (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] rounded-md font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-500/50"
                        >
                          <User className="w-3 h-3 text-emerald-400" />
                          <span>SÓCIO</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] rounded-md font-bold uppercase tracking-wider bg-white/15 border border-white/10"
                          style={{ color: template.accentColor }}
                        >
                          <Award className="w-3 h-3" />
                          <span>{member.category || 'SÓCIO'}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Grid info: CPF, Nascimento (Matrícula Removida conforme solicitado) */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-left text-xs bg-black/20 p-2.5 rounded-xl border border-white/10">
                  {template.showCpf && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-70 block font-mono">
                        CPF do Titular
                      </span>
                      <span className="font-mono font-medium text-xs text-white">
                        {maskCPF(member.cpf)}
                      </span>
                    </div>
                  )}

                  {template.showBirthDate && (
                    <div>
                      <span className="text-[9px] uppercase tracking-wider opacity-70 block font-mono">
                        Data de Nascimento
                      </span>
                      <span className="text-xs text-white font-mono">
                        {member.birthDate}
                      </span>
                    </div>
                  )}

                  {/* Custom fields configured by admin */}
                  {template.customFields?.map(field => (
                    <div key={field.id} className="col-span-2">
                      <span className="text-[9px] uppercase tracking-wider opacity-70 block font-mono">
                        {field.label}
                      </span>
                      <span className="text-xs text-white">
                        {field.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer with Generation Stamp (24h) and Expiry (Outubro 2027) */}
            <div className="border-t border-white/15 pt-2.5 flex items-center justify-between gap-2">
              <div className="flex flex-col text-[10px] opacity-90 leading-tight">
                {/* 24h Generation timestamp */}
                <div className="flex items-center gap-1 font-mono text-white/90">
                  <Clock className="w-2.5 h-2.5 text-emerald-400" />
                  <span>Gerada: {tokenStatus.generatedDateStr}</span>
                </div>
                {/* Official Expiration Date */}
                <div className="flex items-center gap-1 font-mono mt-0.5" style={{ color: template.accentColor }}>
                  <Calendar className="w-2.5 h-2.5" />
                  <span className="font-semibold">Validade Oficial: {officialStatus.formattedDate}</span>
                </div>
                <span className="text-[8px] text-white/60 font-mono mt-0.5">
                  Token 24h: {member.lastViewToken ? member.lastViewToken.slice(0, 14) + '...' : 'AUTH-VERIFIED'}
                </span>
              </div>

              {/* Dynamic QR Code */}
              {template.showQrCode && (
                <div
                  onClick={onVerify}
                  className="bg-white p-1 rounded-md shadow-xs cursor-pointer hover:scale-105 transition-transform"
                  title="Clique para validar autenticidade da carteirinha"
                >
                  <QRCodeDisplay
                    value={verificationUrl}
                    size={isVertical ? 65 : 55}
                    darkColor="#0f172a"
                    lightColor="#ffffff"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* BACK SIDE */
          <div className="relative z-10 flex flex-col justify-between h-full text-xs">
            <div>
              <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: template.accentColor }}>
                  Regulamento & Disposições Gerais
                </span>
                <span className="text-[10px] opacity-70 font-mono">Verso Oficial</span>
              </div>

              <div className="space-y-2 text-[10px] opacity-90 leading-relaxed text-justify bg-black/20 p-2.5 rounded-lg border border-white/10">
                <p>
                  1. Este documento de identificação social é pessoal e intransferível, válido mediante apresentação de documento oficial com foto.
                </p>
                <p>
                  2. <strong>Regra de Validade e Renovação:</strong> A presente credencial possui validade estatutária oficial até <strong>{officialStatus.formattedDate}</strong>. Após esta data, para manter os direitos sociais, o titular deverá passar por nova aprovação da administração para prorrogação por mais 1 (um) ano.
                </p>
                <p>
                  3. <strong>Segurança Anti-Fraude 24h:</strong> O comprovante dinâmico e o token criptográfico gerados na tela expiram em 24 horas a partir da exibição para evitar adulterações e capturas de tela desatualizadas.
                </p>
                <p>
                  4. <strong>Conformidade LGPD:</strong> Os dados deste associado são tratados estritamente para finalidade associativa nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
                </p>
              </div>
            </div>

            {/* Signature Area */}
            <div className="pt-3 border-t border-white/15 flex flex-col items-center">
              <div className="w-36 border-b border-dashed border-white/40 mb-1" />
              <span className="text-[9px] uppercase font-semibold tracking-wider text-white">
                {template.signatureLabel || 'Diretoria Executiva'}
              </span>
              <span className="text-[8px] opacity-60 font-mono">Assinatura Digital Certificada ICP-Brasil</span>
            </div>
          </div>
        )}
      </div>

      {/* Card Action Controls */}
      {!compact && (
        <div className="w-full max-w-md mt-4 flex items-center justify-between gap-2 px-1">
          {allowFlip && (
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{isFlipped ? 'Ver Frente' : 'Ver Verso'}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            {onVerify && (
              <button
                onClick={onVerify}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Validar QR Code</span>
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
              title="Imprimir ou salvar PDF da Carteirinha"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
