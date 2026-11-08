/**
 * Carteirinha (frente e verso). Puramente visual: recebe o modelo, os dados mínimos do sócio
 * e a imagem do QR já gerada. Nunca mostra CPF. Nada de selo decorativo que pareça validação:
 * a validade real só é provada pelo QR.
 *
 * Medidas internas FIXAS: a carteirinha é sempre desenhada no mesmo tamanho (CARD_BASE) e depois
 * ampliada ou reduzida por inteiro, como uma imagem. Fica igual em qualquer tela e no arquivo baixado.
 * Cada parte tem a sua faixa com altura própria (cabeçalho, nome, foto e dados, rodapé com o QR);
 * a logo cresce só até o limite da faixa e textos longos quebram em 2 linhas ou terminam em "...".
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
  /** Ano de entrada na sociedade ("Sócio desde") */
  memberSince?: string;
  /** Cargos no organograma (Presidente, Rei do tiro...) */
  roles?: string[];
  /** Histórico de cargos e honrarias para o verso (ex.: "Rei do tiro: 2019 a 2020") */
  honors?: string[];
}

interface Props {
  template: CardTemplateDoc;
  member: CardMemberData;
  logoSrc: string;
  /** Logo da entidade de filiação (já resolvida), quando o modelo tiver filiação */
  affiliationSrc?: string;
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
  /** Largura em que a carteirinha aparece na tela; o desenho interno não muda */
  width?: number;
  /** Adesivos do cargo (endereços das imagens), no canto da foto */
  stickers?: string[];
}

export const CARD_BASE = { vertical: { w: 320, h: 508 }, horizontal: { w: 508, h: 320 } } as const;
/** Maior logo que cabe na faixa do cabeçalho */
export const LOGO_MAX = { vertical: 88, horizontal: 64 } as const;

const NAME_PX = { sm: 15, base: 17, lg: 19, xl: 22, '2xl': 25 } as const;
const DETAIL_PX = { xs: 11, sm: 12, base: 13 } as const;

const lines = (n: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' });

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

/** Amplia ou reduz o desenho fixo para a largura pedida, sem mudar nada dentro dele */
function Scaled({ base, width, children }: { base: { w: number; h: number }; width: number; children: React.ReactNode }) {
  const s = width / base.w;
  return (
    <div style={{ width, height: Math.round(base.h * s) }}>
      <div style={{ width: base.w, height: base.h, transform: `scale(${s})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

export const CardView = forwardRef<HTMLDivElement, Props>(function CardView(
  { template: t, member: m, logoSrc, affiliationSrc, photoUrl, qrDataUrl, qrCaption, banner, side = 'frente', both, onFlip, labelCard, width, stickers = [] },
  ref
) {
  const vertical = t.orientation !== 'horizontal';
  const base = vertical ? CARD_BASE.vertical : CARD_BASE.horizontal;
  const { w, h } = base;
  const shownWidth = width || w;
  const logoLeft = t.logoPosition === 'left' || !vertical;
  // Logo ao lado do nome na carteirinha em pé: a faixa tem 84 px, então ela para em 72
  const logoPx = Math.max(28, Math.min(t.logoSize || 64, !vertical ? LOGO_MAX.horizontal : logoLeft ? 72 : LOGO_MAX.vertical));
  const namePx = NAME_PX[t.nameFontSize || 'lg'];
  const detailPx = DETAIL_PX[t.detailsFontSize || 'xs'];
  const textAlign: React.CSSProperties['textAlign'] = !vertical ? 'left' : t.infoAlignment === 'left' ? 'left' : t.infoAlignment === 'right' ? 'right' : 'center';
  const visibleCustom = (t.customFields || []).filter(f => f.visible !== false && f.label);
  const affiliation = (t.affiliationText || '').trim();

  const header = (
    <div className={cx('flex gap-3 min-h-0 overflow-hidden', logoLeft ? 'flex-row items-center text-left' : 'flex-col items-center text-center')} style={{ height: vertical ? (logoLeft ? 84 : logoPx + 64) : 70 }}>
      <div className={cx('shrink-0 flex items-center justify-center rounded-xl', !t.logoBgTransparent && 'bg-white/90 p-1.5')} style={{ width: logoPx, height: logoPx }}>
        <AssociationLogo logoKeyOrUrl={logoSrc} className="w-full h-full object-contain" color={t.logoBgTransparent ? t.accentColor : t.primaryColor} />
      </div>
      <div className="min-w-0 w-full">
        <div className="font-bold leading-tight" style={{ fontFamily: 'var(--sd-font)', fontSize: 14, ...lines(2) }}>
          {t.associationName}
        </div>
        {t.associationSubtitle && (
          <div className="opacity-80 leading-tight mt-0.5" style={{ fontSize: 10, ...lines(1) }}>
            {t.associationSubtitle}
          </div>
        )}
        <div className="uppercase mt-1" style={{ color: t.accentColor, fontSize: 9, letterSpacing: '0.2em' }}>
          {labelCard}
        </div>
      </div>
    </div>
  );

  // Adesivos do cargo: em cima do canto da foto (ou no canto da carteirinha, se ela não tiver foto)
  const stickerRow = stickers.length ? (
    <div className="flex -space-x-2" aria-label="Adesivos do cargo">
      {stickers.slice(0, 3).map(src => (
        <img key={src} src={src} alt="" className="object-contain drop-shadow-md" style={{ width: 46, height: 46 }} />
      ))}
    </div>
  ) : null;

  const photo = t.showPhoto ? (
    <div className="relative shrink-0" style={{ width: vertical ? 96 : 84, height: vertical ? 118 : 104 }}>
      <div className="w-full h-full rounded-xl overflow-hidden border-2 bg-black/20 flex items-center justify-center" style={{ borderColor: t.accentColor }}>
        {photoUrl ? <img src={photoUrl} alt={`Foto de ${m.fullName}`} className="w-full h-full object-cover" /> : <User className="w-10 h-10 opacity-50" aria-hidden />}
      </div>
      {stickerRow && <div className="absolute" style={{ top: -14, right: -18 }}>{stickerRow}</div>}
    </div>
  ) : null;

  const rows: [string, string][] = [];
  if (m.membershipNumber) rows.push(['Matrícula', m.membershipNumber]);
  if (t.showCategory && m.categoryName) rows.push(['Categoria', m.categoryName]);
  rows.push(['Validade', m.validUntil ? formatDate(m.validUntil) : 'Sem prazo']);
  if (m.memberSince) rows.push(['Sócio desde', m.memberSince]);
  if (t.showBirthDate && m.birthDate) rows.push(['Nascimento', formatDate(m.birthDate)]);

  const name = (
    <div className="min-w-0">
      <div className="font-extrabold leading-tight break-words" style={{ fontFamily: 'var(--sd-font)', fontSize: namePx, ...lines(2) }}>
        {m.fullName}
      </div>
      {m.roles?.length ? (
        <div className="font-semibold uppercase mt-0.5" style={{ color: t.accentColor, fontSize: 10, letterSpacing: '0.12em', ...lines(1) }}>
          {m.roles.join(' · ')}
        </div>
      ) : null}
    </div>
  );

  const details = (
    <dl className="grid gap-x-3 gap-y-1 min-w-0" style={{ fontSize: detailPx, gridTemplateColumns: rows.length > 2 || vertical ? '1fr 1fr' : '1fr' }}>
      {rows.slice(0, 4).map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="opacity-70 uppercase" style={{ fontSize: 9, letterSpacing: '0.08em' }}>
            {k}
          </dt>
          <dd className="font-semibold truncate">{v}</dd>
        </div>
      ))}
    </dl>
  );

  // QR na FRENTE: é ele que autentica. Quem escanear vê a situação e a validade gravadas no sistema,
  // então uma data alterada no arquivo ou no papel não engana a conferência.
  const qrBox = (size: number) =>
    t.showQrCode ? (
      <div className="shrink-0 flex flex-col items-center gap-1" style={{ width: Math.max(size, 104) }}>
        <div className="bg-white p-1.5 rounded-xl shadow-md" style={{ width: size, height: size }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR de autenticação da carteirinha" className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <QrCode className="w-6 h-6" aria-hidden />
            </div>
          )}
        </div>
        {qrCaption && (
          <div className="font-semibold leading-tight text-center" style={{ fontSize: 9, ...lines(2) }}>
            {qrCaption}
          </div>
        )}
      </div>
    ) : null;

  const statusBlock = (
    <div className="flex flex-col gap-1 min-w-0">
      <span className={cx('self-start px-2 py-0.5 rounded-md font-bold uppercase', statusTone(m.status))} style={{ fontSize: 10, letterSpacing: '0.08em' }}>
        {MEMBER_STATUS_LABEL[m.status]}
      </span>
      {t.showSecurityStamp && (
        <span className="opacity-80 leading-tight" style={{ fontSize: 9, ...lines(2) }}>
          Autenticação pelo QR: escaneie para conferir
        </span>
      )}
    </div>
  );

  const cornerStickers = !t.showPhoto && stickerRow ? <div className="absolute z-10" style={{ top: 14, right: 14 }}>{stickerRow}</div> : null;

  const front = vertical ? (
    <Face t={t} w={w} h={h}>
      {cornerStickers}
      <div className="h-full flex flex-col" style={{ padding: 18, gap: 10 }}>
        {header}
        <div className="shrink-0 min-h-0" style={{ textAlign }}>
          {name}
        </div>
        {/* Foto no centro da faixa do meio */}
        <div className="flex-1 min-h-0 flex items-center justify-center">{photo}</div>
        <div className="shrink-0 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1 flex flex-col gap-2 text-left">
            {details}
            {statusBlock}
          </div>
          {qrBox(88)}
        </div>
      </div>
    </Face>
  ) : (
    <Face t={t} w={w} h={h}>
      {cornerStickers}
      <div className="h-full flex flex-col" style={{ padding: 16, gap: 10 }}>
        {header}
        <div className="flex-1 min-h-0 flex gap-3 items-center">
          {photo}
          <div className="min-w-0 flex-1 flex flex-col gap-2 justify-center">
            {name}
            {details}
          </div>
          {qrBox(92)}
        </div>
        <div className="shrink-0">{statusBlock}</div>
      </div>
    </Face>
  );

  const back = (
    <Face t={t} w={w} h={h}>
      <div className="h-full flex flex-col items-center justify-between text-center overflow-hidden" style={{ padding: 18, gap: 10 }}>
        <div className="uppercase" style={{ color: t.accentColor, fontSize: 10, letterSpacing: '0.2em', ...lines(1) }}>
          {t.associationName}
        </div>
        {affiliation && (
          <div className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left" style={{ background: 'rgba(255,255,255,0.12)' }}>
            {affiliationSrc && (
              <span className="shrink-0 rounded-md bg-white flex items-center justify-center overflow-hidden" style={{ width: vertical ? 40 : 34, height: vertical ? 40 : 34, padding: 2 }}>
                <AssociationLogo logoKeyOrUrl={affiliationSrc} className="w-full h-full object-contain" color={t.primaryColor} />
              </span>
            )}
            <span className="leading-snug font-semibold" style={{ fontSize: vertical ? 10.5 : 9.5, ...lines(vertical ? 3 : 2) }}>
              {affiliation}
            </span>
          </div>
        )}
        <div className="text-left w-full leading-snug opacity-90 min-h-0 overflow-hidden" style={{ fontSize: vertical ? 10 : 9.5 }}>
          <p className="mb-1.5"><strong>Documento pessoal e intransferível.</strong> Apresente junto com um documento oficial com foto quando for pedido.</p>
          <p className="mb-1.5"><strong>Autenticação:</strong> a validade e a situação verdadeiras são as que aparecem ao escanear o QR da frente. Se a data impressa for diferente da mostrada na conferência, o documento foi alterado.</p>
          {!(t.showHonors && m.honors?.length) && !(affiliation && !vertical) && (
            <>
              <p className="mb-1.5"><strong>Arquivo baixado:</strong> o QR do arquivo vale até a data em destaque no próprio arquivo. Para uso contínuo, mostre a carteirinha aberta no portal, onde o QR se renova sozinho.</p>
              <p><strong>Perda ou suspensão:</strong> a diretoria pode suspender a carteirinha a qualquer momento, e o QR deixa de validar na hora.</p>
            </>
          )}
        </div>
        {t.showHonors && m.honors && m.honors.length > 0 && (
          <div className="w-full text-left rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.18)' }}>
            <div className="uppercase font-semibold mb-1" style={{ color: t.accentColor, fontSize: 9, letterSpacing: '0.15em' }}>
              Histórico na sociedade
            </div>
            <ul className="space-y-0.5" style={{ fontSize: vertical ? 10 : 9 }}>
              {m.honors.slice(0, vertical ? 6 : 3).map(h => (
                <li key={h} className="truncate">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
        {visibleCustom.length > 0 && (
          <dl className="space-y-0.5 w-full" style={{ fontSize: 10 }}>
            {visibleCustom.slice(0, 4).map(f => (
              <div key={f.id} className="truncate">
                <dt className="inline opacity-70">{f.label}: </dt>
                <dd className="inline font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="w-full">
          <div className="opacity-80 leading-snug" style={{ fontSize: 10 }}>
            Achou esta carteirinha? Entregue na secretaria da sociedade.
          </div>
          {t.signatureLabel && (
            <div className="mt-3 pt-1 border-t border-current/30 opacity-80 mx-auto w-2/3 truncate" style={{ fontSize: 10 }}>
              {t.signatureLabel}
            </div>
          )}
        </div>
      </div>
    </Face>
  );

  if (both) {
    // Exportação: desenho no tamanho fixo, frente e verso lado a lado
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
    <div ref={ref}>
      <Scaled base={base} width={shownWidth}>
        <div className="[perspective:1400px]" style={{ width: w, height: h }}>
          <motion.div className="relative w-full h-full [transform-style:preserve-3d]" animate={{ rotateY: side === 'verso' ? 180 : 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
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
      </Scaled>
    </div>
  );
});
