/** Conferência de uploads no servidor: tipo real pelos bytes e tamanho por pasta. */
import { describe, expect, it } from 'vitest';
import { judgeUpload, policyFor, sniff } from '../../functions/src/uploadCheck.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0))));
const PDF = new Uint8Array([...'%PDF-1.7'].map(c => c.charCodeAt(0)));
const HTML = new Uint8Array([...'<html><script>'].map(c => c.charCodeAt(0)));
const MB = 1024 * 1024;

describe('uploadGuard', () => {
  it('reconhece os tipos pelos bytes mágicos', () => {
    expect(sniff(JPEG)).toBe('image/jpeg');
    expect(sniff(PNG)).toBe('image/png');
    expect(sniff(WEBP)).toBe('image/webp');
    expect(sniff(PDF)).toBe('application/pdf');
    expect(sniff(HTML)).toBeNull();
  });

  it('foto: só imagem até 2 MB e com o tipo declarado verdadeiro', () => {
    const p = 'tenants/t1/members/m1/photo/foto.jpg';
    expect(judgeUpload(p, 1000, 'image/jpeg', JPEG)).toEqual({ ok: true });
    expect(judgeUpload(p, 2 * MB + 1, 'image/jpeg', JPEG)).toEqual({ ok: false, reason: 'tamanho' });
    expect(judgeUpload(p, 1000, 'image/jpeg', HTML)).toEqual({ ok: false, reason: 'tipo' });
    expect(judgeUpload(p, 1000, 'image/jpeg', PDF)).toEqual({ ok: false, reason: 'tipo' });
    expect(judgeUpload(p, 1000, 'image/png', JPEG)).toEqual({ ok: false, reason: 'tipo_declarado' });
  });

  it('anexos e biblioteca aceitam PDF com limites próprios', () => {
    expect(judgeUpload('tenants/t1/attachments/financeiro/nota.pdf', 9 * MB, 'application/pdf', PDF)).toEqual({ ok: true });
    expect(judgeUpload('tenants/t1/attachments/financeiro/nota.pdf', 11 * MB, 'application/pdf', PDF)).toEqual({ ok: false, reason: 'tamanho' });
    expect(judgeUpload('tenants/t1/library/estatuto.pdf', 14 * MB, 'application/pdf', PDF)).toEqual({ ok: true });
    expect(judgeUpload('tenants/t1/public/logo.png', 1000, 'application/pdf', PDF)).toEqual({ ok: false, reason: 'tipo' });
  });

  it('pastas do servidor não são tocadas e caminhos estranhos são removidos', () => {
    expect(policyFor('tenants/t1/exports/relatorio.pdf')).toBeNull();
    expect(judgeUpload('tenants/t1/exports/relatorio.pdf', 1, 'application/pdf', PDF)).toBeNull();
    expect(judgeUpload('tenants/t1/library/../x.pdf', 1, 'application/pdf', PDF)).toEqual({ ok: false, reason: 'caminho' });
  });
});
