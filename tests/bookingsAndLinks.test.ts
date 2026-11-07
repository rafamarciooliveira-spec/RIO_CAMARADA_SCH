/** Regras puras: dias de preparação das reservas, o que a agenda mostra, prévia de link e texto da escala. */
import { describe, expect, it } from 'vitest';
import { bookingCalendarEntry, bookingDays, bookingsClash } from '../src/shared/bookings.ts';
import { parseLinkPreview, titleFromUrl } from '../src/shared/linkPreview.ts';
import { rosterWhatsappText } from '../src/modules/events/rosterShared.tsx';
import type { BookingDoc } from '../src/shared/types.ts';

const tz = 'America/Sao_Paulo';
const b = (start: string, end: string, before = 2, after = 2): BookingDoc =>
  ({ id: 'x', spaceId: 's', spaceName: 'Salão Principal', start, end, requesterName: 'Fulano', isMember: false, priceCents: 0, status: 'confirmada', contractText: '', prepDaysBefore: before, prepDaysAfter: after, createdAt: '' }) as BookingDoc;

describe('reserva com dias de preparação', () => {
  it('pinta o período inteiro e dois dias antes e depois', () => {
    // 12 a 22 de novembro (Schützenfest): todos os dias do evento e 10, 11, 23 e 24 de preparação
    const days = bookingDays(b('2026-11-12T20:00:00.000Z', '2026-11-23T02:00:00.000Z'), tz);
    expect(days.get('2026-11-12')).toBe('evento');
    expect(days.get('2026-11-17')).toBe('evento');
    expect(days.get('2026-11-22')).toBe('evento');
    expect(days.get('2026-11-10')).toBe('preparacao');
    expect(days.get('2026-11-11')).toBe('preparacao');
    expect(days.get('2026-11-23')).toBe('preparacao');
    expect(days.get('2026-11-24')).toBe('preparacao');
    expect(days.has('2026-11-25')).toBe(false);
  });
  it('outro evento não cai na preparação, mas preparação com preparação pode', () => {
    const sabado = b('2026-11-07T21:00:00.000Z', '2026-11-08T03:00:00.000Z');
    // Na segunda (dia 9) o salão ainda está sendo desmontado
    expect(bookingsClash(sabado, b('2026-11-09T21:00:00.000Z', '2026-11-10T01:00:00.000Z', 0, 0))).toBe(true);
    // Sábado seguinte: a montagem (12 e 13) encosta na desmontagem só de longe
    expect(bookingsClash(sabado, b('2026-11-14T21:00:00.000Z', '2026-11-15T03:00:00.000Z'))).toBe(false);
    // Sem preparação, só o horário conta
    expect(bookingsClash(b('2026-11-07T21:00:00.000Z', '2026-11-08T03:00:00.000Z', 0, 0), b('2026-11-08T10:00:00.000Z', '2026-11-08T12:00:00.000Z', 0, 0))).toBe(false);
  });
  it('agenda: terceiro fechado vira "ocupado"; sociedade ou aberto aparece com o nome', () => {
    const fechado = bookingCalendarEntry('1', { ...b('2026-11-07T21:00:00.000Z', '2026-11-08T03:00:00.000Z'), eventName: 'Casamento', organizer: 'terceiro', access: 'fechado', requesterName: 'Rubens' }, '');
    expect(fechado.title).toBe('Salão Principal: ocupado');
    expect(JSON.stringify(fechado)).not.toContain('Rubens');
    expect(fechado.visibility).toBe('socios');
    const festa = bookingCalendarEntry('2', { ...b('2026-11-12T20:00:00.000Z', '2026-11-23T02:00:00.000Z'), eventName: 'Schützenfest', organizer: 'sociedade', access: 'aberto' }, '');
    expect(festa.title).toBe('Schützenfest');
    expect(festa.visibility).toBe('publico');
    const interno = bookingCalendarEntry('3', { ...b('2026-11-12T20:00:00.000Z', '2026-11-13T02:00:00.000Z'), eventName: 'Baile dos sócios', organizer: 'sociedade', access: 'fechado' }, '');
    expect(interno.visibility).toBe('socios');
    // Reserva antiga sem os campos novos: tratada como particular
    expect(bookingCalendarEntry('4', b('2026-11-07T21:00:00.000Z', '2026-11-08T03:00:00.000Z'), '').title).toContain('ocupado');
  });
});

describe('prévia de link', () => {
  it('lê og:title, og:site_name e a chamada, sem o texto da matéria', () => {
    const html = `<html><head><title>Ignorado</title>
      <meta content="O brilho da tradição: baile à luz de lampião" property="og:title">
      <meta property="og:site_name" content="Repórter Gabriel Júnior" />
      <meta name="description" content="Sociedade Rio Camarada promove o tradicional baile &amp; convida a comunidade.">
      </head><body><p>Texto da matéria que não pode ser copiado.</p></body></html>`;
    const p = parseLinkPreview(html, 'https://www.reportergabrieljunior.com.br/noticias/17847-o-brilho');
    expect(p.title).toBe('O brilho da tradição: baile à luz de lampião');
    expect(p.siteName).toBe('Repórter Gabriel Júnior');
    expect(p.description).toBe('Sociedade Rio Camarada promove o tradicional baile & convida a comunidade.');
    expect(JSON.stringify(p)).not.toContain('não pode ser copiado');
  });
  it('sem nada na página, o título vem do endereço e a fonte é o domínio', () => {
    const url = 'https://www.reportergabrieljunior.com.br/noticias/17747-sociedade-rio-camarada-completa-71-anos-preservando-tradicao-em-schroeder';
    expect(titleFromUrl(url)).toBe('Sociedade rio camarada completa 71 anos preservando tradicao em schroeder');
    expect(parseLinkPreview('<html></html>', url).siteName).toBe('reportergabrieljunior.com.br');
  });
});

describe('texto da escala para o WhatsApp', () => {
  it('segue o formato do grupo: dia, função, horário e nomes com confirmação', () => {
    const txt = rosterWhatsappText({
      title: 'Escala Schützenfest',
      slots: [
        { id: 'a', date: '2026-11-11', start: '18:30', end: '00:00', role: 'Arma', needed: 1, people: [{ key: 'k', name: 'Donisete', confirmed: true, addedBy: 'organizacao', at: '' }] },
        { id: 'b', date: '2026-11-14', label: 'Tarde', start: '11:30', end: '18:00', role: 'Serviços', needed: 2, people: [{ key: 'j', name: 'Ariele', confirmed: false, addedBy: 'proprio', at: '' }] },
      ],
    });
    expect(txt).toContain('● 11/11 *Quarta-feira* ✅');
    expect(txt).toContain('1 pessoa para Arma ✅');
    expect(txt).toContain('18:30 às 00:00');
    expect(txt).toContain('Donisete ✅');
    expect(txt).toContain('● 14/11 *Sábado (Tarde)*');
    expect(txt).toContain('2 pessoas para Serviços');
    expect(txt).toContain('(falta 1)');
  });
});

describe('modelo da carteirinha por público', () => {
  it('cargo vence aba, aba vence o geral, e a regra aceita vários cargos', async () => {
    const { pickTemplate, stickersFor } = await import('../src/modules/card/cardTemplate.ts');
    const base = { associationName: '', associationSubtitle: '', logoUrl: '', primaryColor: '', secondaryColor: '', accentColor: '', textColor: '', orientation: 'vertical', backgroundPattern: 'clean', showQrCode: true, showPhoto: true, showCpf: false, showBirthDate: false, showCategory: true, showSecurityStamp: true, customFields: [], signatureLabel: '', isDefault: false } as unknown as Omit<import('../src/modules/card/cardTemplate.ts').CardTemplateDoc, 'id' | 'name'>;
    const geral = { ...base, id: 'padrao', name: 'Geral' };
    const diretoria = { ...base, id: 'dir', name: 'Diretoria', appliesTo: [{ match: 'grupo' as const, value: 'Diretoria' }] };
    const passaro = { ...base, id: 'pas', name: 'Pássaro', appliesTo: [{ match: 'cargo' as const, value: 'Rei do pássaro' }, { match: 'cargo' as const, value: 'Rainha do pássaro' }], roleThemes: [{ id: 'r', match: 'cargo' as const, value: '1ª Princesa', values: ['1ª Princesa', '2ª Princesa'], primaryColor: '', secondaryColor: '', accentColor: '', textColor: '', applyColors: false, stickerPath: 'tenants/x/public/stickers/prata.png' }] };
    const list = [geral, diretoria, passaro];
    expect(pickTemplate(list, 'padrao', [])!.id).toBe('padrao');
    expect(pickTemplate(list, 'padrao', [{ title: 'Tesoureiro', group: 'Diretoria' }])!.id).toBe('dir');
    expect(pickTemplate(list, 'padrao', [{ title: 'Tesoureiro', group: 'Diretoria' }, { title: 'Rainha do pássaro', group: 'Pássaro' }])!.id).toBe('pas');
    expect(stickersFor(passaro, [{ title: '2ª Princesa', group: 'Beleza' }])).toEqual(['tenants/x/public/stickers/prata.png']);
  });
});
