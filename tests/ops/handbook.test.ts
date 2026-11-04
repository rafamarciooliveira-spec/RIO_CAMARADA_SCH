/** Manual do sócio: rascunho, publicação com aviso, ciência por versão e acompanhamento da diretoria. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { HandbookDoc, NotificationDoc } from '../../src/shared/types.ts';

const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });
const sections = [{ id: 's1', title: 'Direitos do sócio', body: 'Votar nas assembleias.' }];

describe('manual do sócio', () => {
  it('sócio não edita; diretoria publica, todos são avisados e a ciência vale por versão', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const t = h.tenantId;
    await denied(h.call('handbook.save', { tenantId: t, title: 'Manual', sections, publish: true }, who), 'permission-denied');
    await h.call('handbook.save', { tenantId: t, title: 'Manual', sections }, h.actors.secretario);
    expect((await h.store.get<HandbookDoc>(P.handbook(t)))!.version).toBe(0); // rascunho
    const r = await h.call<{ version: number; notified: number }>('handbook.save', { tenantId: t, title: 'Manual', sections, publish: true }, h.actors.secretario);
    expect(r).toEqual({ version: 1, notified: 1 });
    const notes = await h.store.query<NotificationDoc>(P.notifications(t), { where: [['uid', '==', who.uid]] });
    expect(notes.some(n => n.data.title.includes('Manual do sócio'))).toBe(true);
    await h.call('handbook.ack', { tenantId: t, version: 1 }, who);
    let acks = await h.call<{ read: number; total: number }>('handbook.acks', { tenantId: t }, h.actors.presidente);
    expect(acks).toMatchObject({ read: 1, total: 1 });
    // Versão nova: a ciência anterior não conta e a antiga não pode ser confirmada
    await h.call('handbook.save', { tenantId: t, title: 'Manual', sections, publish: true, changeNote: 'Nova regra do salão' }, h.actors.presidente);
    await denied(h.call('handbook.ack', { tenantId: t, version: 1 }, who), 'failed-precondition');
    acks = await h.call<{ read: number; total: number }>('handbook.acks', { tenantId: t }, h.actors.presidente);
    expect(acks.read).toBe(0);
    await denied(h.call('handbook.acks', { tenantId: t }, who), 'permission-denied');
  });

  it('PDF só na pasta do manual da própria sociedade', async () => {
    const h = await makeTestTenant();
    await denied(h.call('handbook.save', { tenantId: h.tenantId, title: 'Manual', sections: [], pdfPath: 'tenants/outra/handbook/x.pdf' }, h.actors.presidente), 'invalid-argument');
  });
});
