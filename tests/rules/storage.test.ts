/**
 * Regras do Cloud Storage no emulador (com consulta ao Firestore do emulador).
 * Rodar: npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { ACTIONS, MODULE_IDS } from '../../src/shared/modules.ts';

let env: RulesTestEnvironment;
const ALL = Object.fromEntries(MODULE_IDS.map(m => [m, [...ACTIONS]]));
const MB = 1024 * 1024;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const bytes = (n: number) => new Uint8Array(n);

type Who = 'presA' | 'presB' | 'socioA' | 'socio2A' | 'tesA' | 'anon' | 'naoVerificado' | 'suporteExpirado';

function st(who: Who): FirebaseStorage {
  if (who === 'anon') return env.unauthenticatedContext().storage();
  if (who === 'naoVerificado') return env.authenticatedContext('presA', { email: 'p@teste.local', email_verified: false }).storage();
  return env.authenticatedContext(who, { email: `${who}@teste.local`, email_verified: true }).storage();
}

const up = (who: Who, path: string, data: Uint8Array, contentType: string) => uploadBytes(ref(st(who), path), data, { contentType });
const read = (who: Who, path: string) => getBytes(ref(st(who), path));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sodalis',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const m = (p: string, d: Record<string, unknown>) => setDoc(doc(f, p), { active: true, board: false, perms: {}, ...d });
    await m('tenants/A/memberships/presA', { board: true, perms: ALL });
    await m('tenants/B/memberships/presB', { board: true, perms: ALL });
    await m('tenants/A/memberships/socioA', { memberId: 'mA1' });
    await m('tenants/A/memberships/socio2A', { memberId: 'mA3' });
    await m('tenants/A/memberships/tesA', { board: true, perms: { financeiro: ['ver', 'editar'] } });
    await m('tenants/A/memberships/suporteExpirado', { board: true, perms: ALL, expiresAtMs: Date.now() - 60_000 });
    await setDoc(doc(f, 'tenants/A/members/mA1'), { uid: 'socioA' });
    await setDoc(doc(f, 'tenants/A/members/mA2'), { dependentOf: 'mA1' });
    await setDoc(doc(f, 'tenants/A/members/mA3'), { uid: 'socio2A' });
    const s = ctx.storage();
    for (const t of ['A', 'B']) {
      await uploadBytes(ref(s, `tenants/${t}/public/logo.png`), PNG, { contentType: 'image/png' });
      await uploadBytes(ref(s, `tenants/${t}/members/m${t}1/photo/foto.png`), PNG, { contentType: 'image/png' });
      await uploadBytes(ref(s, `tenants/${t}/attachments/financeiro/nota.pdf`), PNG, { contentType: 'application/pdf' });
      await uploadBytes(ref(s, `tenants/${t}/library/estatuto.pdf`), PNG, { contentType: 'application/pdf' });
      await uploadBytes(ref(s, `tenants/${t}/outra/coisa.png`), PNG, { contentType: 'image/png' });
    }
    await uploadBytes(ref(s, 'tenants/A/members/mA3/photo/foto.png'), PNG, { contentType: 'image/png' });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('logos e imagens públicas', () => {
  it('leitura pública; escrita só por quem edita a sociedade, imagem até 2 MB', async () => {
    await assertSucceeds(read('anon', 'tenants/A/public/logo.png'));
    await assertSucceeds(up('presA', 'tenants/A/public/capa.png', PNG, 'image/png'));
    await assertFails(up('presA', 'tenants/A/public/capa.png', bytes(2 * MB + 1), 'image/png'));
    await assertFails(up('presA', 'tenants/A/public/x.html', PNG, 'text/html'));
    await assertFails(up('presA', 'tenants/A/public/x.svg', PNG, 'image/svg+xml'));
    await assertFails(up('socioA', 'tenants/A/public/capa.png', PNG, 'image/png'));
    await assertFails(up('anon', 'tenants/A/public/capa.png', PNG, 'image/png'));
    await assertFails(up('presA', 'tenants/B/public/capa.png', PNG, 'image/png'));
    await assertFails(up('naoVerificado', 'tenants/A/public/capa.png', PNG, 'image/png'));
  });
});

describe('foto do sócio', () => {
  it('o dono (e o titular do dependente) envia e lê; outro sócio não', async () => {
    await assertSucceeds(up('socioA', 'tenants/A/members/mA1/photo/nova.png', PNG, 'image/png'));
    await assertSucceeds(up('socioA', 'tenants/A/members/mA2/photo/nova.png', PNG, 'image/png'));
    await assertSucceeds(read('socioA', 'tenants/A/members/mA1/photo/foto.png'));
    await assertFails(up('socioA', 'tenants/A/members/mA3/photo/nova.png', PNG, 'image/png'));
    await assertFails(read('socioA', 'tenants/A/members/mA3/photo/foto.png'));
    await assertFails(read('socio2A', 'tenants/A/members/mA1/photo/foto.png'));
  });

  it('só imagem até 2 MB e nome de arquivo simples', async () => {
    await assertFails(up('socioA', 'tenants/A/members/mA1/photo/doc.pdf', PNG, 'application/pdf'));
    await assertFails(up('socioA', 'tenants/A/members/mA1/photo/grande.png', bytes(2 * MB + 1), 'image/png'));
    await assertFails(up('socioA', 'tenants/A/members/mA1/photo/nome com espaço.png', PNG, 'image/png'));
  });

  it('quem vê sócios lê; quem edita sócios envia; o sócio não apaga', async () => {
    await assertSucceeds(read('presA', 'tenants/A/members/mA3/photo/foto.png'));
    await assertSucceeds(up('presA', 'tenants/A/members/mA3/photo/nova.png', PNG, 'image/png'));
    await assertFails(read('tesA', 'tenants/A/members/mA3/photo/foto.png'));
    await assertFails(deleteObject(ref(st('socioA'), 'tenants/A/members/mA1/photo/foto.png')));
  });

  it('isolamento: ninguém de A lê ou grava foto de B; anônimo e não verificado não leem', async () => {
    await assertFails(read('presA', 'tenants/B/members/mB1/photo/foto.png'));
    await assertFails(up('presA', 'tenants/B/members/mB1/photo/nova.png', PNG, 'image/png'));
    await assertFails(read('presB', 'tenants/A/members/mA1/photo/foto.png'));
    await assertFails(read('anon', 'tenants/A/members/mA1/photo/foto.png'));
    await assertFails(read('naoVerificado', 'tenants/A/members/mA1/photo/foto.png'));
    await assertFails(read('suporteExpirado', 'tenants/A/members/mA1/photo/foto.png'));
  });
});

describe('anexos por módulo', () => {
  it('permissão do próprio módulo, pdf ou imagem até 10 MB', async () => {
    await assertSucceeds(read('tesA', 'tenants/A/attachments/financeiro/nota.pdf'));
    await assertSucceeds(up('tesA', 'tenants/A/attachments/financeiro/recibo.pdf', PNG, 'application/pdf'));
    await assertFails(up('tesA', 'tenants/A/attachments/financeiro/grande.pdf', bytes(10 * MB + 1), 'application/pdf'));
    await assertFails(up('tesA', 'tenants/A/attachments/financeiro/planilha.xlsx', PNG, 'application/vnd.ms-excel'));
    await assertFails(up('tesA', 'tenants/A/attachments/atas/ata.pdf', PNG, 'application/pdf'));
    await assertFails(read('socioA', 'tenants/A/attachments/financeiro/nota.pdf'));
    await assertFails(read('presA', 'tenants/B/attachments/financeiro/nota.pdf'));
    await assertFails(read('anon', 'tenants/A/attachments/financeiro/nota.pdf'));
    await assertFails(read('suporteExpirado', 'tenants/A/attachments/financeiro/nota.pdf'));
  });

  it('anexos de avisos: quem edita avisos envia imagem ou pdf; sócio não', async () => {
    await assertSucceeds(up('presA', 'tenants/A/attachments/avisos/cartaz.jpg', PNG, 'image/jpeg'));
    await assertSucceeds(read('presA', 'tenants/A/attachments/avisos/cartaz.jpg'));
    await assertFails(up('socioA', 'tenants/A/attachments/avisos/cartaz2.jpg', PNG, 'image/jpeg'));
    await assertFails(up('tesA', 'tenants/A/attachments/avisos/cartaz3.jpg', PNG, 'image/jpeg'));
  });
});

describe('biblioteca', () => {
  it('membro lê; só quem edita documentos envia, até 15 MB', async () => {
    await assertSucceeds(read('socioA', 'tenants/A/library/estatuto.pdf'));
    await assertSucceeds(up('presA', 'tenants/A/library/regimento.pdf', PNG, 'application/pdf'));
    await assertFails(up('presA', 'tenants/A/library/grande.pdf', bytes(15 * MB + 1), 'application/pdf'));
    await assertFails(up('socioA', 'tenants/A/library/meu.pdf', PNG, 'application/pdf'));
    await assertFails(read('presB', 'tenants/A/library/estatuto.pdf'));
    await assertFails(read('anon', 'tenants/A/library/estatuto.pdf'));
    await assertFails(read('naoVerificado', 'tenants/A/library/estatuto.pdf'));
  });
});

describe('negar por padrão', () => {
  it('qualquer outra pasta: ninguém lê nem grava pelo cliente', async () => {
    await assertFails(read('presA', 'tenants/A/outra/coisa.png'));
    await assertFails(up('presA', 'tenants/A/outra/nova.png', PNG, 'image/png'));
    await assertFails(up('presA', 'raiz.png', PNG, 'image/png'));
    await assertFails(up('presA', 'tenants/A/members/mA1/private/x.png', PNG, 'image/png'));
  });
});
