/**
 * Carteirinha (frente e verso). Puramente visual: recebe o modelo, os dados mínimos do sócio
 * e a imagem do QR já gerada. Nunca mostra CPF. Nada de selo decorativo que pareça validação:
 * a validade real só é provada pelo QR.
 */
import React, { forwardRef } from 'react';
import { motion } from 'motion/react';
import { QrCode, User } from 'lucide-react';
import { AssociationLogo } from '../../../components/AssociationLogos.tsx';
import { formatDate } from '../../../shared/dates.ts';
import { MEMBER_STATUS_LABEL, type MemberStatus } from '../../../shared/types.ts';
import { patternStyle, type CardTemplateDoc } from '../cardTemplate.ts';
import { cx } from '../../../ui/index.tsx';

export interface CardMemberData {
  fullName: string;
  displayName?: string;
  categoryName?: string;
  membershipNumber?: string;
  validUntil?: string;
  status: MemberStatus;
  birthDate?: string;
  joinedAt?: string;
}

interface Props {
  template: CardTemplateDoc;
  member: CardMemberData;
  logoSrc: string;
  photoUrl?: string | null;
  qrDataUrl?: string | null;
  qrCaption?: string;
  /** Faixa em destaque (arquivo baixado): "Válida até ..." */
  banner?: string;
  side?: 'frente' | 'verso';
  /** Mostra os dois lados lado a lado (exportação) em vez de virar */
  both?: boolean;
  onFlip?: () => void;
  labelCard: string;
  width?: number;
}

const NAME = { sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' } as const;
const DETAIL = { xs: 'text-[11px]', sm: 'text-xs', base: 'text-sm' } as const;

function statusTone(s: MemberStatus): string {
  if (s === 'ativo' || s === 'aprovado') return 'bg-emerald-500/90 text-white';
  if (s === 'em_atraso') return 'bg-amber-400 text-black';
  return 'bg-red-600 text-white';
}

function Face({ children, t, w, h }: { children: React.ReactNode; t: CardTemplateDoc; w: number; h: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] shadow-2xl"
      style={{
        width: w,
        height: h,
        color: t.textColor,
        backgroundColor: t.primaryColor,
        backgroundImage: `linear-gradient(145deg, ${t.primaryColor} 0%, ${t.secondaryColor} 100%)`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={patternStyle(t.backgroundPattern)} aria-hidden />
      <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full opacity-20 pointer-events-none" style={{ background: t.accentColor }} aria-hidden />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

export const CardView = forwardRef<HTMLDivElement, Props>(function CardView(
  { template: t, member: m, logoSrc, photoUrl, qrDataUrl, qrCaption, banner, side = 'frente', both, onFlip, labelCard, width },
  ref
) {
  const vertical = t.orientation !== 'horizontal';
  const w = width || (vertical ? 300 : 440);
  const h = Math.round(vertical ? w * 1.586 : w / 1.586);
  const align = t.infoAlignment === 'left' ? 'text-left items-start' : t.infoAlignment === 'right' ? 'text-right items-end' : 'text-center items-center';
  // O controle vai de 28 a 160 px num cartão de 300 px; acompanha a largura real e não passa de 42% (em pé) ou 26% (deitado)
  const logoPx = Math.round(Math.min((t.logoSize || 64) * (w / 300), w * (vertical ? 0.42 : 0.26)));
  const detail = DETAIL[t.detailsFontSize || 'xs'];
  const visibleCustom = (t.customFields || []).filter(f => f.visible !== false && f.label);

  const header = (
    <div className={cx('flex gap-3', t.logoPosition === 'left' || !vertical ? 'items-center text-left' : 'flex-col items-center text-center')}>
      <div className={cx('shrink-0 flex items-center justify-center rounded-xl', !t.logoBgTransparent && 'bg-white/90 p-1.5')} style={{ width: logoPx, height: logoPx }}>
        <AssociationLogo logoKeyOrUrl={logoSrc} className="w-full h-full" color={t.logoBgTransparent ? t.accentColor : t.primaryColor} />
      </div>
      <div className="min-w-0">
        <div className="font-bold leading-tight text-sm" style={{ fontFamily: 'var(--sd-font)' }}>
          {t.associationName}
        </div>
        {t.associationSubtitle && <div className="text-[10px] opacity-80 leading-tight mt-0.5">{t.associationSubtitle}</div>}
        <div className="text-[9px] uppercase tracking-[0.2em] mt-1" style={{ color: t.accentColor }}>
          {labelCard}
        </div>
      </div>
    </div>
  );

  const photo = t.showPhoto ? (
    <div className="shrink-0 rounded-xl overflow-hidden border-2 bg-black/20 flex items-center justify-center" style={{ borderColor: t.accentColor, width: vertical ? 92 : 84, height: vertical ? 112 : 104 }}>
      {photoUrl ? <img src={photoUrl} alt={`Foto de ${m.fullName}`} className="w-full h-full object-cover" /> : <User className="w-10 h-10 opacity-50" aria-hidden />}
    </div>
  ) : null;

  const rows: [string, string][] = [];
  if (m.membershipNumber) rows.push(['Matrícula', m.membershipNumber]);
  if (t.showCategory && m.categoryName) rows.push(['Categoria', m.categoryName]);
  rows.push(['Validade', m.validUntil ? formatDate(m.validUntil) : 'Sem prazo']);
  if (t.showBirthDate && m.birthDate) rows.push(['Nascimento', formatDate(m.birthDate)]);

  // QR na FRENTE: é ele que autentica. Quem escanear vê a situação e a validade gravadas no sistema,
  // então uma data alterada no arquivo ou no papel não engana a conferência.
  const qrBox = (size: number) =>
    t.showQrCode ? (
      <div className="shrink-0 flex flex-col items-center gap-1">
        <div className="bg-white p-1.5 rounded-xl shadow-md" style={{ width: size, height: size }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR de autenticação da carteirinha" className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <QrCode className="w-6 h-6" aria-hidden />
            </div>
          )}
        </div>
        {qrCaption && <div className="text-[9px] font-semibold leading-tight text-center max-w-[7rem]">{qrCaption}</div>}
      </div>
    ) : null;

  const front = (
    <Face t={t} w={w} h={h}>
      <div className={cx('h-full flex p-5 gap-3', vertical ? 'flex-col' : 'flex-col')}>
        {header}
        <div className={cx('flex-1 flex gap-4 min-h-0', vertical ? 'flex-col items-center justify-center' : 'items-center')}>
          {photo}
          <div className={cx('flex flex-col min-w-0 gap-1', vertical ? align : 'text-left items-start')}>
            <div className={cx('font-extrabold leading-tight break-words', NAME[t.nameFontSize || 'lg'])} style={{ fontFamily: 'var(--sd-font)' }}>
              {m.fullName}
            </div>
            <dl className={cx('grid gap-x-3 gap-y-0.5', detail, vertical ? 'grid-cols-1' : 'grid-cols-2')}>
              {rows.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="opacity-70 text-[9px] uppercase tracking-wider">{k}</dt>
                  <dd className="font-semibold truncate">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <span className={cx('self-start px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider', statusTone(m.status))}>{MEMBER_STATUS_LABEL[m.status]}</span>
            {t.showSecurityStamp && <span className="text-[9px] opacity-80 leading-tight">Autenticação pelo QR: escaneie para conferir</span>}
          </div>
          {qrBox(vertical ? 92 : 84)}
        </div>
      </div>
    </Face>
  );

  const back = (
    <Face t={t} w={w} h={h}>
      <div className="h-full flex flex-col items-center justify-between p-5 text-center gap-3">
        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: t.accentColor }}>
          {t.associationName}
        </div>
        <div className="text-left w-full space-y-2 text-[10px] leading-snug opacity-90">
          <p><strong>Documento pessoal e intransferível.</strong> Apresente junto com um documento oficial com foto quando for pedido.</p>
          <p><strong>Autenticação:</strong> a validade e a situação verdadeiras são as que aparecem ao escanear o QR da frente. Se a data impressa for diferente da mostrada na conferência, o documento foi alterado.</p>
          <p><strong>Arquivo baixado:</strong> o QR do arquivo vale por 24 horas. Para uso contínuo, mostre a carteirinha aberta no portal, onde o QR se renova sozinho.</p>
          <p><strong>Perda ou suspensão:</strong> a diretoria pode suspender a carteirinha a qualquer momento, e o QR deixa de validar na hora.</p>
        </div>
        {visibleCustom.length > 0 && (
          <dl className="text-[10px] space-y-0.5">
            {visibleCustom.map(f => (
              <div key={f.id}>
                <dt className="inline opacity-70">{f.label}: </dt>
                <dd className="inline font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="w-full">
          <div className="text-[10px] opacity-80 leading-snug">Achou esta carteirinha? Entregue na secretaria da sociedade.</div>
          {t.signatureLabel && (
            <div className="mt-3 pt-1 border-t border-current/30 text-[10px] opacity-80 mx-auto w-2/3">{t.signatureLabel}</div>
          )}
        </div>
      </div>
    </Face>
  );

  if (both) {
    return (
      <div ref={ref} className="inline-flex flex-col items-center gap-4 p-6 bg-white" style={{ fontFamily: 'var(--sd-font), Inter, sans-serif' }}>
        {banner && (
          <div className="w-full rounded-xl px-4 py-3 text-center font-bold text-base" style={{ background: '#111111', color: '#ffffff' }}>
            {banner}
          </div>
        )}
        <div className={cx('flex gap-4', vertical ? 'flex-row' : 'flex-col')}>
          {front}
          {back}
        </div>
        {banner && (
          <div className="text-[11px] text-center max-w-md" style={{ color: '#333333' }}>
            Este arquivo não se apaga sozinho, mas o QR deixa de validar no horário acima ou na hora, se a carteirinha for suspensa.
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="[perspective:1400px]" style={{ width: w, height: h }}>
      <motion.div
        className="relative w-full h-full [transform-style:preserve-3d]"
        animate={{ rotateY: side === 'verso' ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      >
        <button
          type="button"
          onClick={onFlip}
          aria-label="Ver o verso da carteirinha"
          className="absolute inset-0 [backface-visibility:hidden] cursor-pointer text-left"
          tabIndex={side === 'frente' ? 0 : -1}
          aria-hidden={side !== 'frente'}
        >
          {front}
        </button>
        <button
          type="button"
          onClick={onFlip}
          aria-label="Ver a frente da carteirinha"
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] cursor-pointer"
          tabIndex={side === 'verso' ? 0 : -1}
          aria-hidden={side !== 'verso'}
        >
          {back}
        </button>
      </motion.div>
    </div>
  );
});
