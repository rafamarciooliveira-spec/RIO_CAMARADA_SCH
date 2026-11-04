/** Cores da carteirinha por cargo ou grupo do organograma: a primeira regra que combinar vale. */
import { describe, expect, it } from 'vitest';
import { fallbackTemplate, stickersFor, themeFor } from '../src/modules/card/cardTemplate.ts';

describe('cores por cargo', () => {
  const base = {
    ...fallbackTemplate('Sociedade'),
    roleThemes: [
      { id: 'a', match: 'grupo' as const, value: 'Majestades', primaryColor: '#5b4300', secondaryColor: '#2b1f00', accentColor: '#f2c14e', textColor: '#ffffff' },
      { id: 'b', match: 'cargo' as const, value: 'Presidente', primaryColor: '#0b2a5b', secondaryColor: '#061633', accentColor: '#7fb0ff', textColor: '#ffffff' },
    ],
  };
  it('sem cargo fica com as cores do modelo', () => {
    expect(themeFor(base, []).primaryColor).toBe(base.primaryColor);
  });
  it('grupo e cargo combinam sem diferenciar maiúsculas; vale a primeira regra', () => {
    expect(themeFor(base, [{ title: 'Capitão', group: 'majestades' }]).primaryColor).toBe('#5b4300');
    expect(themeFor(base, [{ title: 'Presidente', group: 'Diretoria' }]).primaryColor).toBe('#0b2a5b');
    expect(themeFor(base, [{ title: 'Presidente', group: 'Diretoria' }, { title: 'Rei', group: 'Majestades' }]).primaryColor).toBe('#5b4300');
  });
});

describe('adesivos por cargo', () => {
  const sticker = (id: string, match: 'grupo' | 'cargo', value: string, extra = {}) => ({ id, match, value, primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333', textColor: '#ffffff', stickerPath: `tenants/t1/public/stickers/${id}.png`, ...extra });
  const base = { ...fallbackTemplate('Clube'), roleThemes: [sticker('goleiro', 'cargo', 'Goleiro', { applyColors: false }), sticker('capitao', 'cargo', 'Capitão'), sticker('time', 'grupo', 'Time principal', { applyColors: false })] };
  it('soma os adesivos de todas as regras que combinam, até 3', () => {
    const pos = [{ title: 'Goleiro', group: 'Time principal' }, { title: 'Capitão', group: 'Time principal' }];
    expect(stickersFor(base, pos)).toEqual(['tenants/t1/public/stickers/goleiro.png', 'tenants/t1/public/stickers/capitao.png', 'tenants/t1/public/stickers/time.png']);
  });
  it('regra só de adesivo não muda as cores', () => {
    const t = themeFor(base, [{ title: 'Goleiro', group: 'Reservas' }]);
    expect(t.primaryColor).toBe(base.primaryColor);
    expect(stickersFor(base, [{ title: 'Goleiro', group: 'Reservas' }])).toHaveLength(1);
  });
});
