/** Governança: votação secreta, atas com hash e assinatura, assembleias, eventos, tarefas e enquetes. */
import { describe, expect, it } from 'vitest';
import { actor, makeMember, makeTestTenant } from '../helpers/env.ts';
import { P } from '../../src/shared/paths.ts';
import { runDailyJobs } from '../../src/shared/core/ops.ts';
import type { ElectionDoc, EventDoc, MinuteDoc, TaskDoc, SurveyDoc, AssemblyDoc, LedgerEntryDoc } from '../../src/shared/types.ts';

type H = Awaited<ReturnType<typeof makeTestTenant>>;

async function extraMember(h: H, uid: string, name: string) {
  const who = actor(uid);
  const { memberId } = await h.call<{ memberId: string }>(
    'members.apply',
    { tenantId: h.tenantId, data: { fullName: name, categoryId: 'efetivo' }, consents: { cadastro: true, imagem: false, comunicacao: true, marketing: false } },
    who
  );
  await h.call('members.approve', { tenantId: h.tenantId, memberId }, h.actors.presidente);
  return { memberId, who };
}

async function newElection(h: H, eligibility = { requireUpToDate: true, categoryIds: [] as string[], minMonths: 0 }) {
  const { id } = await h.call<{ id: string }>(
    'elections.save',
    {
      tenantId: h.tenantId,
      title: 'Eleição da diretoria',
      description: 'Gestão 2027-2028',
      kind: 'eleicao',
      options: [{ label: 'Chapa 1' }, { label: 'Chapa 2' }],
      opensAt: '2026-11-01T00:00:00.000Z',
      closesAt: '2026-11-30T23:00:00.000Z',
      eligibility,
    },
    h.actors.secretario
  );
  return id;
}

describe('votação', () => {
  it('um voto por sócio, cédula sem vínculo, apuração ao encerrar', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const b = await extraMember(h, 'socio2', 'Segunda Pessoa Lima');
    const c = await extraMember(h, 'socio3', 'Terceira Pessoa Rosa');
    const id = await newElection(h);
    await expect(h.call('elections.open', { tenantId: h.tenantId, electionId: id }, h.actors.secretario)).rejects.toThrow(/papel/);
    await h.call('elections.open', { tenantId: h.tenantId, electionId: id }, h.actors.presidente);
    const e = (await h.store.get<ElectionDoc>(P.election(h.tenantId, id)))!;
    const [o1, o2] = e.options.map(o => o.id);
    const receipt = await h.call<{ votedAt: string }>('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: o1 }, a.who);
    expect(receipt.votedAt).toBeTruthy();
    await expect(h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: o2 }, a.who)).rejects.toThrow(/já votou/);
    await h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: o1 }, b.who);
    await h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: null }, c.who);
    await expect(h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: o1 }, h.actors.tesoureiro)).rejects.toThrow(/vinculado/);

    const ballots = await h.store.query(P.ballots(h.tenantId, id));
    expect(ballots).toHaveLength(3);
    for (const bl of ballots) expect(Object.keys(bl.data)).toEqual(['optionId']);
    const voters = await h.store.query(`${P.election(h.tenantId, id)}/voters`);
    expect(voters.map(v => v.id).sort()).toEqual([a.memberId, b.memberId, c.memberId].sort());
    for (const v of voters) expect(Object.keys(v.data)).toEqual(['votedAt']);
    // Nenhum documento liga o sócio ao conteúdo do voto
    const dump = JSON.stringify(h.store.dump().filter(([p]) => p.includes('/ballots/')));
    for (const m of [a.memberId, b.memberId, c.memberId, 'socio1', 'socio2']) expect(dump).not.toContain(m);

    const r = await h.call<{ results: Record<string, number>; blankCount: number }>('elections.close', { tenantId: h.tenantId, electionId: id }, h.actors.presidente);
    expect(r.results).toEqual({ [o1]: 2, [o2]: 0 });
    expect(r.blankCount).toBe(1);
    const closed = (await h.store.get<ElectionDoc>(P.election(h.tenantId, id)))!;
    expect(closed).toMatchObject({ status: 'encerrada', votersCount: 3, blankCount: 1 });
    await expect(h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: o1 }, actor('socio9'))).rejects.toThrow();
  });

  it('elegibilidade: inadimplente, categoria e tempo mínimo', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    await h.call('charges.create', { tenantId: h.tenantId, memberId: a.memberId, description: 'Atrasada', amountCents: 1000, dueDate: '2026-10-01' }, h.actors.tesoureiro);
    const id = await newElection(h);
    await h.call('elections.open', { tenantId: h.tenantId, electionId: id }, h.actors.presidente);
    const el = await h.call<{ eligible: boolean; reasons: string[] }>('elections.eligibility', { tenantId: h.tenantId, electionId: id }, a.who);
    expect(el.eligible).toBe(false);
    expect(el.reasons[0]).toMatch(/em dia/);
    await expect(h.call('elections.vote', { tenantId: h.tenantId, electionId: id, optionId: null }, a.who)).rejects.toThrow(/em dia/);

    const id2 = await newElection(h, { requireUpToDate: false, categoryIds: ['contribuinte'], minMonths: 6 });
    await h.call('elections.open', { tenantId: h.tenantId, electionId: id2 }, h.actors.presidente);
    const el2 = await h.call<{ reasons: string[] }>('elections.eligibility', { tenantId: h.tenantId, electionId: id2 }, a.who);
    expect(el2.reasons).toHaveLength(2);
    await expect(h.call('elections.save', { tenantId: h.tenantId, id, title: 'Mudou', description: '', kind: 'eleicao', options: [{ label: 'X' }], opensAt: '2026-11-01T00:00:00Z', closesAt: '2026-11-30T00:00:00Z', eligibility: { requireUpToDate: false, categoryIds: [], minMonths: 0 } }, h.actors.secretario)).rejects.toThrow(/não se edita/);
  });
});

describe('atas', () => {
  it('versões, hash, assinatura, publicação numerada e bloqueio de edição', async () => {
    const h = await makeTestTenant();
    const s = await h.call<{ id: string }>('minutes.save', { tenantId: h.tenantId, title: 'Ata da AGO', body: 'Texto inicial', deliberations: [{ text: 'Comprar novos trajes' }] }, h.actors.secretario);
    const v2 = await h.call<{ version: number }>('minutes.save', { tenantId: h.tenantId, id: s.id, title: 'Ata da AGO', body: 'Texto revisado', deliberations: [{ text: 'Comprar novos trajes' }] }, h.actors.secretario);
    expect(v2.version).toBe(2);
    const versions = await h.store.query<{ body: string }>(P.minuteVersions(h.tenantId, s.id));
    expect(versions.map(v => v.data.body)).toEqual(['Texto inicial']);
    const path = `${P.minutes(h.tenantId)}/${s.id}`;
    let m = (await h.store.get<MinuteDoc>(path))!;
    // Deliberação vira tarefa
    const t = await h.call<{ taskId: string }>('tasks.fromDeliberation', { tenantId: h.tenantId, minuteId: s.id, deliberationId: m.deliberations[0].id, when: '2026-12-01', who: 'Tesoureiro', whoUid: 'tesoureiro' }, h.actors.secretario);
    m = (await h.store.get<MinuteDoc>(path))!;
    expect(m.deliberations[0].taskId).toBe(t.taskId);
    const task = (await h.store.get<TaskDoc>(`${P.tasks(h.tenantId)}/${t.taskId}`))!;
    expect(task.ref).toMatchObject({ type: 'ata', id: s.id });
    // Salvar de novo preserva o vínculo da tarefa
    await h.call('minutes.save', { tenantId: h.tenantId, id: s.id, title: 'Ata da AGO', body: 'Texto final', deliberations: [{ id: m.deliberations[0].id, text: 'Comprar novos trajes' }] }, h.actors.secretario);
    expect((await h.store.get<MinuteDoc>(path))!.deliberations[0].taskId).toBe(t.taskId);

    await h.call('minutes.submit', { tenantId: h.tenantId, minuteId: s.id, signers: [{ uid: 'presidente', name: 'Presidente', role: 'Presidente' }, { uid: 'secretario', name: 'Secretária', role: 'Secretária' }] }, h.actors.secretario);
    await expect(h.call('minutes.sign', { tenantId: h.tenantId, minuteId: s.id }, h.actors.tesoureiro)).rejects.toThrow(/signatários/);
    await h.call('minutes.sign', { tenantId: h.tenantId, minuteId: s.id }, h.actors.presidente);
    await expect(h.call('minutes.publish', { tenantId: h.tenantId, minuteId: s.id }, h.actors.presidente)).rejects.toThrow(/aprovada/);
    // Adulteração direta no banco é detectada pelo hash
    await h.store.update(path, { body: 'Texto adulterado' });
    await expect(h.call('minutes.sign', { tenantId: h.tenantId, minuteId: s.id }, h.actors.secretario)).rejects.toThrow(/mudou/);
    await h.store.update(path, { body: 'Texto final' });
    const sig = await h.call<{ complete: boolean }>('minutes.sign', { tenantId: h.tenantId, minuteId: s.id }, h.actors.secretario);
    expect(sig.complete).toBe(true);
    await expect(h.call('minutes.publish', { tenantId: h.tenantId, minuteId: s.id }, h.actors.tesoureiro)).rejects.toThrow(/papel/);
    const pub = await h.call<{ number: string }>('minutes.publish', { tenantId: h.tenantId, minuteId: s.id }, h.actors.presidente);
    expect(pub.number).toBe('001/2026');
    m = (await h.store.get<MinuteDoc>(path))!;
    expect(m).toMatchObject({ status: 'publicada', published: true, number: '001/2026' });
    expect(m.signatures.every(x => x.contentHash === m.contentHash)).toBe(true);
    await expect(h.call('minutes.save', { tenantId: h.tenantId, id: s.id, title: 'Ata da AGO', body: 'Outra coisa', deliberations: [] }, h.actors.secretario)).rejects.toThrow(/não se edita/);
  });

  it('editar durante a coleta derruba as assinaturas', async () => {
    const h = await makeTestTenant();
    const s = await h.call<{ id: string }>('minutes.save', { tenantId: h.tenantId, title: 'Reunião', body: 'Texto', deliberations: [] }, h.actors.secretario);
    await h.call('minutes.submit', { tenantId: h.tenantId, minuteId: s.id, signers: [{ uid: 'presidente', name: 'Presidente', role: 'Presidente' }, { uid: 'secretario', name: 'Secretária', role: 'Secretária' }] }, h.actors.secretario);
    await h.call('minutes.sign', { tenantId: h.tenantId, minuteId: s.id }, h.actors.presidente);
    await h.call('minutes.save', { tenantId: h.tenantId, id: s.id, title: 'Reunião', body: 'Texto corrigido', deliberations: [] }, h.actors.secretario);
    const m = (await h.store.get<MinuteDoc>(`${P.minutes(h.tenantId)}/${s.id}`))!;
    expect(m).toMatchObject({ status: 'rascunho', signatures: [] });
  });
});

describe('assembleia', () => {
  it('presença e quórum em tempo real', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const b = await extraMember(h, 'socio2', 'Segunda Pessoa Lima');
    // Ativa os dois (aprovados viram ativos após o primeiro pagamento; aqui direto)
    for (const m of [a, b]) await h.call('members.setStatus', { tenantId: h.tenantId, memberId: m.memberId, status: 'ativo' }, h.actors.presidente);
    const { id } = await h.call<{ id: string }>(
      'assemblies.save',
      { tenantId: h.tenantId, title: 'AGO 2026', kind: 'ordinaria', date: '2026-11-20T22:00:00.000Z', location: 'Sede', noticeText: 'Edital', agenda: ['Contas', 'Eleição'], quorumPercent: 50 },
      h.actors.secretario
    );
    const asm = (await h.store.get<AssemblyDoc>(`${P.assemblies(h.tenantId)}/${id}`))!;
    expect(asm.eligibleCount).toBe(2);
    const cal = await h.store.get(`${P.calendar(h.tenantId)}/asm_${id}`);
    expect(cal).toMatchObject({ source: 'assembleia', visibility: 'socios' });
    const r1 = await h.call<{ quorumReached: boolean; needed: number }>('assemblies.attendance', { tenantId: h.tenantId, assemblyId: id, memberId: a.memberId, present: true }, h.actors.secretario);
    expect(r1).toMatchObject({ quorumReached: true, needed: 1 });
    await h.call('assemblies.attendance', { tenantId: h.tenantId, assemblyId: id, memberId: a.memberId, present: true }, h.actors.secretario);
    const r2 = await h.call<{ attendanceCount: number }>('assemblies.attendance', { tenantId: h.tenantId, assemblyId: id, memberId: a.memberId, present: false }, h.actors.secretario);
    expect(r2.attendanceCount).toBe(0);
  });
});

describe('eventos', () => {
  async function newEvent(h: H) {
    const { id } = await h.call<{ id: string }>(
      'generic.save',
      {
        tenantId: h.tenantId,
        collection: 'events',
        data: {
          name: 'Baile de Kerb',
          kind: 'evento',
          description: 'Festa tradicional',
          start: '2026-11-28T23:00:00.000Z',
          end: '2026-11-29T04:00:00.000Z',
          location: 'Salão',
          status: 'confirmado',
          publicListing: true,
          rsvpEnabled: true,
          budget: { items: [] },
          ticketing: { enabled: true, lots: [{ id: 'lote1', name: '1º lote', priceCents: 4000, quantity: 2 }] },
          team: [],
        },
      },
      h.actors.diretor_eventos
    );
    return id;
  }

  it('ingresso: respeita o lote, guarda só o hash e o check-in vale uma vez', async () => {
    const h = await makeTestTenant();
    const id = await newEvent(h);
    const sale = await h.call<{ codes: string[]; entryId: string }>(
      'events.sellTicket',
      { tenantId: h.tenantId, eventId: id, lotId: 'lote1', buyerName: 'Visitante', quantity: 2, ledger: { accountId: 'caixa' } },
      h.actors.tesoureiro
    );
    expect(sale.codes).toHaveLength(2);
    expect(sale.codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    await expect(h.call('events.sellTicket', { tenantId: h.tenantId, eventId: id, lotId: 'lote1', buyerName: 'Outro' }, h.actors.tesoureiro)).rejects.toThrow(/Restam 0/);
    // diretor de eventos vende, mas não lança no caixa sem permissão do financeiro
    await expect(h.call('events.sellTicket', { tenantId: h.tenantId, eventId: id, lotId: 'lote1', buyerName: 'Fulano', ledger: { accountId: 'caixa' } }, h.actors.diretor_eventos)).rejects.toThrow(/papel/);
    const dump = JSON.stringify(h.store.dump());
    expect(dump).not.toContain(sale.codes[0]);
    const entry = (await h.store.get<LedgerEntryDoc>(`${P.ledger(h.tenantId)}/${sale.entryId}`))!;
    expect(entry).toMatchObject({ eventId: id, amountCents: 8000, chartAccountId: 'c1_02' });
    // Editar o evento não zera os vendidos
    await h.call('generic.save', { tenantId: h.tenantId, collection: 'events', id, data: { ticketing: { enabled: true, lots: [{ id: 'lote1', name: '1º lote', priceCents: 4000, quantity: 3 }] } } }, h.actors.diretor_eventos);
    expect((await h.store.get<EventDoc>(P.event(h.tenantId, id)))!.ticketing.lots[0].sold).toBe(2);

    const c1 = await h.call<{ status: string }>('events.checkinGuest', { tenantId: h.tenantId, eventId: id, code: sale.codes[0].toLowerCase().replace('-', '') }, h.actors.portaria);
    expect(c1.status).toBe('ok');
    const c2 = await h.call<{ status: string }>('events.checkinGuest', { tenantId: h.tenantId, eventId: id, code: sale.codes[0] }, h.actors.portaria);
    expect(c2.status).toBe('ja_utilizado');
    const c3 = await h.call<{ status: string }>('events.checkinGuest', { tenantId: h.tenantId, eventId: id, code: 'AAAAA-BBBBB' }, h.actors.portaria);
    expect(c3.status).toBe('invalido');
    expect((await h.store.get<EventDoc>(P.event(h.tenantId, id)))!.checkinCount).toBe(1);
  });

  it('confirmação de presença conta uma vez e a agenda é sincronizada', async () => {
    const h = await makeTestTenant();
    const id = await newEvent(h);
    const a = await makeMember(h);
    await h.call('events.rsvp', { tenantId: h.tenantId, eventId: id, going: true }, a.who);
    await h.call('events.rsvp', { tenantId: h.tenantId, eventId: id, going: true }, a.who);
    expect((await h.store.get<EventDoc>(P.event(h.tenantId, id)))!.rsvpCount).toBe(1);
    await h.call('events.rsvp', { tenantId: h.tenantId, eventId: id, going: false }, a.who);
    expect((await h.store.get<EventDoc>(P.event(h.tenantId, id)))!.rsvpCount).toBe(0);
    await h.call('events.syncCalendar', { tenantId: h.tenantId, eventId: id }, h.actors.diretor_eventos);
    expect(await h.store.get(`${P.calendar(h.tenantId)}/evt_${id}`)).toMatchObject({ source: 'evento', sourceId: id, visibility: 'publico' });
  });
});

describe('tarefas e enquetes', () => {
  it('responsável muda status e comenta; outros sócios não', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const { id } = await h.call<{ id: string }>(
      'generic.save',
      {
        tenantId: h.tenantId,
        collection: 'tasks',
        data: { title: 'Alugar som', what: 'Som para o baile', why: '', where: 'Salão', when: '2026-11-20', who: 'Pessoa', whoUid: 'socio1', how: '', howMuchCents: 50000, priority: 'alta', status: 'a_fazer', attachments: [] },
      },
      h.actors.secretario
    );
    await h.call('tasks.setStatus', { tenantId: h.tenantId, taskId: id, status: 'fazendo' }, a.who);
    await h.call('tasks.comment', { tenantId: h.tenantId, taskId: id, text: 'Orçamento pedido' }, a.who);
    const t = (await h.store.get<TaskDoc>(`${P.tasks(h.tenantId)}/${id}`))!;
    expect(t.status).toBe('fazendo');
    expect(t.comments).toHaveLength(1);
    const b = await extraMember(h, 'socio2', 'Segunda Pessoa Lima');
    await expect(h.call('tasks.setStatus', { tenantId: h.tenantId, taskId: id, status: 'concluida' }, b.who)).rejects.toThrow(/papel/);
  });

  it('enquete: uma resposta por pessoa', async () => {
    const h = await makeTestTenant();
    const a = await makeMember(h);
    const { id } = await h.call<{ id: string }>('generic.save', { tenantId: h.tenantId, collection: 'surveys', data: { title: 'Cardápio', question: 'Qual prato?', options: ['Marreco', 'Eisbein'], open: true } }, h.actors.secretario);
    await h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 1 }, a.who);
    await expect(h.call('surveys.vote', { tenantId: h.tenantId, surveyId: id, optionIndex: 0 }, a.who)).rejects.toThrow(/já respondeu/);
    expect((await h.store.get<SurveyDoc>(`${P.surveys(h.tenantId)}/${id}`))!.counts).toEqual([0, 1]);
    await runDailyJobs(h.env, h.tenantId);
  });
});
