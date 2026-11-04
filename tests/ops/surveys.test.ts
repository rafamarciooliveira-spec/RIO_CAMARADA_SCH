/** Enquetes do portal: criação pela diretoria, voto que pode mudar e lista de presença com nomes. */
import { describe, expect, it } from 'vitest';
import { makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import type { SurveyDoc } from '../../src/shared/types.ts';

const denied = (p: Promise<unknown>, code?: string) => expect(p).rejects.toMatchObject(code ? { code } : { name: 'OpError' });

describe('enquetes', () => {
  it('diretoria cria e avisa; sócio vota, muda o voto e vê quem foi em cada opção', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    await denied(h.call('surveys.create', { tenantId: h.tenantId, question: 'Quem vai ao desfile?', options: ['Vou', 'Não vou'] }, who), 'permission-denied');
    const { id, notified } = await h.call<{ id: string; notified: number }>('surveys.create', { tenantId: h.tenantId, question: 'Quem vai ao desfile?', options: ['Vou', 'Não vou'], showNames: true }, h.actors.presidente);
    expect(notified).toBe(1);
    await h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 0 }, who);
    await h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 1 }, who);
    const s = (await h.store.get<SurveyDoc>(`${P.surveys(h.tenantId)}/${id}`))!;
    expect(s.counts).toEqual([0, 1]);
    const r = await h.call<{ byOption: string[][] }>('surveys.responses', { tenantId: h.tenantId, surveyId: id }, who);
    expect(r.byOption[1]).toHaveLength(1);
    await h.call('surveys.close', { tenantId: h.tenantId, surveyId: id }, h.actors.presidente);
    await denied(h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 0 }, who), 'failed-precondition');
  });

  it('enquete sem lista de presença não mostra nomes; sem troca, o voto é único', async () => {
    const h = await makeTestTenant();
    const { who } = await makeMember(h);
    const { id } = await h.call<{ id: string }>('surveys.create', { tenantId: h.tenantId, question: 'Qual cardápio?', options: ['Churrasco', 'Galinhada'], allowChange: false, notify: false }, h.actors.presidente);
    await h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 0 }, who);
    await denied(h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 1 }, who), 'already-exists');
    await denied(h.call('surveys.responses', { tenantId: h.tenantId, surveyId: id }, who), 'permission-denied');
  });
});
