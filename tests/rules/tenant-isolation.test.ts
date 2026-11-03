/**
 * Isolamento entre sociedades e matriz de LEITURA das regras do Firestore (modelo multi-tenant).
 * Para CADA coleção: quem é da sociedade A não lê dado da B; anônimo só lê o público;
 * e-mail não verificado não lê; acesso de suporte expirado não lê; nenhuma escrita do cliente passa.
 * Rodar: npm run test:rules (sobe o emulador; precisa de Java).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ACTIONS, MODULE_IDS } from '../../src/shared/modules.ts';

let env: RulesTestEnvironment;

const ALL_PERMS = Object.fromEntries(MODULE_IDS.map(m => [m, [...ACTIONS]]));
const NOW = Date.now();

type Kind = 'public' | 'verified' | 'member' | 'board' | 'none' | { perm: string };

/** Documentos com a mesma forma nas sociedades A e B (caminho relativo a tenants/{t}) */
const MATRIX: { path: string; data: Record<string, unknown>; kind: Kind }[] = [
  { path: 'config/settings', data: { categories: [] }, kind: 'verified' },
  { path: 'config/counters', data: { ledgerNumber: 1 }, kind: 'none' },
  { path: 'stats/dashboard', data: { members: { total: 3 } }, kind: 'board' },
  { path: 'idempotency/d1', data: { result: 1 }, kind: 'none' },
  { path: 'cpfIndex/d1', data: { memberId: 'm1' }, kind: 'none' },
  { path: 'cardTokens/d1', data: { memberId: 'm1' }, kind: 'none' },
  { path: 'outbox/d1', data: { status: 'simulado' }, kind: 'none' },
  { path: 'icsTokens/d1', data: { uid: 'x' }, kind: 'none' },
  { path: 'paymentEvents/d1', data: { type: 'paid' }, kind: 'none' },
  { path: 'roles/presidente', data: { name: 'Presidente' }, kind: 'member' },
  { path: 'invites/d1', data: { emailLower: 'a@b.c' }, kind: { perm: 'papeis' } },
  { path: 'members/m9', data: { fullName: 'Fulano', uid: 'ninguem' }, kind: { perm: 'socios' } },
  { path: 'members/m9/private/pii', data: { cpfMasked: '***' }, kind: { perm: 'pii' } },
  { path: 'members/m9/history/h1', data: { to: 'ativo' }, kind: { perm: 'socios' } },
  { path: 'members/m9/changes/c1', data: { status: 'pendente', cpfMasked: '***' }, kind: { perm: 'socios' } },
  { path: 'cardTemplates/padrao', data: { name: 'Padrão' }, kind: 'member' },
  { path: 'mandates/m1', data: { title: 'Presidente', personName: 'Fulano' }, kind: 'member' },
  { path: 'checkins/d1', data: { result: 'valido' }, kind: { perm: 'portaria' } },
  { path: 'notices/todos', data: { title: 'Aviso', status: 'publicado', audience: { boardOnly: false } }, kind: 'member' },
  { path: 'notices/agendado', data: { title: 'Futuro', status: 'agendado', audience: { boardOnly: false } }, kind: 'board' },
  { path: 'notices/diretoria', data: { title: 'Interno', status: 'publicado', audience: { boardOnly: true } }, kind: 'board' },
  { path: 'notices/todos/reads/ninguem', data: { at: 'x' }, kind: 'none' }, // get: só o próprio; list: avisos ver
  { path: 'notifications/d1', data: { uid: 'ninguem', title: 'x' }, kind: 'none' },
  { path: 'calendar/pub', data: { title: 'Festa', visibility: 'publico' }, kind: 'public' },
  { path: 'calendar/soc', data: { title: 'Ensaio', visibility: 'socios' }, kind: 'member' },
  { path: 'calendar/dir', data: { title: 'Reunião', visibility: 'diretoria' }, kind: 'board' },
  { path: 'finAccounts/caixa', data: { balanceCents: 100 }, kind: { perm: 'financeiro' } },
  { path: 'chartAccounts/c1', data: { code: '1.01' }, kind: { perm: 'financeiro' } },
  { path: 'costCenters/geral', data: { name: 'Geral' }, kind: { perm: 'financeiro' } },
  { path: 'ledger/l1', data: { amountCents: 100 }, kind: { perm: 'financeiro' } },
  { path: 'periods/2026-11', data: { closed: false }, kind: { perm: 'financeiro' } },
  { path: 'statementLines/s1', data: { amountCents: 100 }, kind: { perm: 'financeiro' } },
  { path: 'charges/c9', data: { memberUid: 'ninguem', amountCents: 3000 }, kind: { perm: 'financeiro' } },
  { path: 'events/pub', data: { name: 'Baile', publicListing: true }, kind: 'public' },
  { path: 'events/priv', data: { name: 'Interno', publicListing: false }, kind: 'member' },
  { path: 'events/priv/guests/g9', data: { name: 'Convidado', uid: 'ninguem' }, kind: { perm: 'eventos' } },
  { path: 'tasks/t1', data: { title: 'Tarefa' }, kind: { perm: 'tarefas' } },
  { path: 'assemblies/a1', data: { title: 'AGO' }, kind: 'member' },
  { path: 'assemblies/a1/attendance/p1', data: { memberId: 'm9' }, kind: { perm: 'atas' } },
  { path: 'minutes/pub', data: { title: 'Ata 1', published: true }, kind: 'member' },
  { path: 'minutes/draft', data: { title: 'Ata 2', published: false }, kind: { perm: 'atas' } },
  { path: 'minutes/draft/versions/v1', data: { body: 'x' }, kind: { perm: 'atas' } },
  { path: 'elections/e1', data: { title: 'Eleição' }, kind: 'member' },
  { path: 'elections/e1/voters/m9', data: { votedAt: 'x' }, kind: { perm: 'votacoes' } },
  { path: 'elections/e1/ballots/b1', data: { optionId: 'o1' }, kind: 'none' },
  { path: 'workshops/w1', data: { name: 'Coral' }, kind: 'member' },
  { path: 'spaces/s1', data: { name: 'Salão' }, kind: 'member' },
  { path: 'terms/g1', data: { name: 'Gestão antiga', current: false }, kind: 'member' },
  { path: 'terms/atual', data: { name: 'Gestão atual', current: true }, kind: 'public' },
  { path: 'honors/h1', data: { title: 'Homenagem' }, kind: 'member' },
  { path: 'benefits/b1', data: { partner: 'Loja' }, kind: 'member' },
  { path: 'surveys/q1', data: { title: 'Enquete' }, kind: 'member' },
  { path: 'surveys/q1/voters/ninguem', data: { at: 'x' }, kind: 'none' },
  { path: 'bookings/r1', data: { spaceId: 's1' }, kind: { perm: 'reservas' } },
  { path: 'assets/p1', data: { name: 'Traje' }, kind: { perm: 'patrimonio' } },
  { path: 'grants/g1', data: { name: 'Edital' }, kind: { perm: 'editais' } },
  { path: 'sponsors/s1', data: { name: 'Patrocinador' }, kind: { perm: 'patrocinios' } },
  { path: 'library/pub', data: { name: 'Estatuto', visibility: 'publico' }, kind: 'public' },
  { path: 'library/soc', data: { name: 'Regimento', visibility: 'socios' }, kind: 'member' },
  { path: 'library/dir', data: { name: 'Alvará', visibility: 'diretoria' }, kind: 'board' },
  // Competições: sócio lê tudo; visitante só a competição com ranking público (e os resultados/jogos dela)
  { path: 'competitions/pub', data: { name: 'Liga', publicRanking: true }, kind: 'public' },
  { path: 'competitions/priv', data: { name: 'Interno', publicRanking: false }, kind: 'member' },
  { path: 'competitions/pub/results/r1', data: { participantName: 'Atleta', value: 98 }, kind: 'public' },
  { path: 'competitions/priv/results/r1', data: { participantName: 'Atleta', value: 98 }, kind: 'member' },
  { path: 'competitions/pub/matches/j1', data: { homeTeamId: 'a', awayTeamId: 'b' }, kind: 'public' },
  { path: 'competitions/priv/matches/j1', data: { homeTeamId: 'a', awayTeamId: 'b' }, kind: 'member' },
  { path: 'orgchart/current', data: { style: 'corte', title: 'Diretoria', positions: [], showOnPublicPage: false }, kind: 'member' },
  { path: 'orgchart/publico', data: { style: 'corte', title: 'Diretoria', positions: [], showOnPublicPage: true }, kind: 'public' },
  { path: 'privacyRequests/p9', data: { uid: 'ninguem', kind: 'acesso' }, kind: { perm: 'pii' } },
  { path: 'config/news', data: { enabled: true, keywords: ['tiro esportivo'] }, kind: { perm: 'noticias' } },
  { path: 'news/pub', data: { kind: 'interna', title: 'Baile', hidden: false, visibility: 'publico', publishedAt: '2026-11-01T00:00:00.000Z' }, kind: 'public' },
  { path: 'news/soc', data: { kind: 'externa', title: 'Manchete', hidden: false, visibility: 'socios', publishedAt: '2026-11-02T00:00:00.000Z' }, kind: 'member' },
  { path: 'news/esc', data: { kind: 'externa', title: 'Escondida', hidden: true, visibility: 'publico', publishedAt: '2026-11-03T00:00:00.000Z' }, kind: { perm: 'noticias' } },
  { path: 'audit/a1', data: { action: 'x' }, kind: { perm: 'auditoria' } },
];

type Who = 'presA' | 'presB' | 'socioA' | 'tesA' | 'anon' | 'naoVerificado' | 'suporteExpirado' | 'suporteValido';

function allowedFor(who: Who, kind: Kind, sameTenant: boolean): boolean {
  if (kind === 'none') return false;
  if (kind === 'public') return true;
  if (who === 'anon' || who === 'naoVerificado') return false;
  if (kind === 'verified') return true; // logado com e-mail verificado (formulário de proposta)
  if (!sameTenant || who === 'suporteExpirado') return false;
  if (who === 'presA' || who === 'suporteValido') return true;
  if (kind === 'member') return true;
  if (who === 'socioA') return false;
  // tesA: diretoria, só financeiro
  if (kind === 'board') return true;
  return kind.perm === 'financeiro';
}

function db(who: Who) {
  switch (who) {
    case 'anon':
      return env.unauthenticatedContext().firestore();
    case 'naoVerificado':
      return env.authenticatedContext('presA', { email: 'pres.a@teste.local', email_verified: false }).firestore();
    default:
      return env.authenticatedContext(who, { email: `${who}@teste.local`, email_verified: true }).firestore();
  }
}

async function expectRead(who: Who, path: string, allowed: boolean) {
  try {
    if (allowed) await assertSucceeds(getDoc(doc(db(who), path)));
    else await assertFails(getDoc(doc(db(who), path)));
  } catch (e) {
    throw new Error(`${who} lendo ${path}: esperado ${allowed ? 'PERMITIDO' : 'NEGADO'} (${(e as Error).message.slice(0, 120)})`);
  }
}

const membership = (extra: Record<string, unknown>) => ({ active: true, board: false, perms: {}, roleIds: [], ...extra });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-sodalis',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    const put = (p: string, d: Record<string, unknown>) => setDoc(doc(f, p), d);
    for (const t of ['A', 'B']) {
      await put(`tenants/${t}`, { name: `Sociedade ${t}`, slug: t.toLowerCase(), status: 'ativa', publicPage: { enabled: true } });
      for (const row of MATRIX) await put(`tenants/${t}/${row.path}`, row.data);
    }
    await put('tenants/A/memberships/presA', membership({ board: true, perms: ALL_PERMS }));
    await put('tenants/B/memberships/presB', membership({ board: true, perms: ALL_PERMS }));
    await put('tenants/A/memberships/socioA', membership({ memberId: 'mA1', roleIds: ['socio'] }));
    await put('tenants/A/memberships/socio2A', membership({ memberId: 'mA3', roleIds: ['socio'] }));
    await put('tenants/A/memberships/tesA', membership({ board: true, perms: { financeiro: ['ver'] } }));
    await put('tenants/A/memberships/suporteExpirado', membership({ board: true, perms: ALL_PERMS, expiresAtMs: NOW - 60_000, support: { reason: 'x', masterUid: 'm' } }));
    await put('tenants/A/memberships/suporteValido', membership({ board: true, perms: ALL_PERMS, expiresAtMs: NOW + 3600_000, support: { reason: 'x', masterUid: 'm' } }));
    await put('tenants/A/memberships/inativo', membership({ active: false, board: true, perms: ALL_PERMS }));
    // Sócios de A: titular (mA1), dependente (mA2) e outro sócio (mA3); sócio de B (mB1)
    await put('tenants/A/members/mA1', { fullName: 'Titular A', uid: 'socioA' });
    await put('tenants/A/members/mA2', { fullName: 'Dependente A', dependentOf: 'mA1' });
    await put('tenants/A/members/mA3', { fullName: 'Outro A', uid: 'socio2A' });
    await put('tenants/B/members/mB1', { fullName: 'Sócio B', uid: 'socioB' });
    for (const [t, m] of [['A', 'mA1'], ['A', 'mA2'], ['A', 'mA3'], ['B', 'mB1']]) {
      await put(`tenants/${t}/members/${m}/private/pii`, { cpfMasked: '***.111.222-**', email: `${m}@teste.local` });
      await put(`tenants/${t}/members/${m}/history/h1`, { to: 'ativo' });
      await put(`tenants/${t}/members/${m}/changes/c1`, { status: 'pendente', cpfMasked: '***' });
    }
    await put('tenants/A/notifications/nSocio', { uid: 'socioA', title: 'Para o sócio' });
    await put('tenants/A/charges/cSocio', { memberUid: 'socioA', amountCents: 3000 });
    await put('tenants/A/events/priv/guests/gSocio', { uid: 'socioA', name: 'Sócio' });
    await put('tenants/A/privacyRequests/pSocio', { uid: 'socioA', kind: 'acesso' });
    await put('tenants/A/elections/e1/voters/mA1', { votedAt: 'x' });
    await put('tenants/A/surveys/q1/voters/socioA', { at: 'x' });
    await put('tenants/A/notices/todos/reads/socioA', { at: 'x' });
    // Sociedade C: página pública desligada (a gestão atual não aparece para anônimo)
    await put('tenants/C', { name: 'Sociedade C', slug: 'c', status: 'ativa', publicPage: { enabled: false } });
    await put('tenants/C/terms/atual', { name: 'Gestão atual', current: true });
    await put('tenants/C/news/pub', { kind: 'interna', title: 'Baile', hidden: false, visibility: 'publico' });
    // Plataforma
    await put('slugs/a', { tenantId: 'A' });
    await put('plans/completo', { name: 'Completo' });
    await put('platform/config', { flags: {} });
    await put('platformAudit/x1', { action: 'x' });
    await put('supportAccess/x1', { tenantId: 'A', reason: 'x' });
    await put('users/socioA', { uid: 'socioA', tenants: {} });
    await put('users/socioA/pushTokens/k1', { token: 'x' });
    await put('rateLimits/k1', { count: 1 });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('matriz de leitura por coleção', () => {
  const WHO: Who[] = ['presA', 'socioA', 'tesA', 'anon', 'naoVerificado', 'suporteExpirado', 'suporteValido'];
  for (const row of MATRIX) {
    it(`tenants/{t}/${row.path}`, async () => {
      for (const who of WHO) {
        await expectRead(who, `tenants/A/${row.path}`, allowedFor(who, row.kind, true));
        // Isolamento: ninguém de A lê o dado da sociedade B (exceto o que é público por natureza)
        await expectRead(who, `tenants/B/${row.path}`, allowedFor(who, row.kind, false));
      }
      // Simetria: quem é de B não lê o de A
      await expectRead('presB', `tenants/A/${row.path}`, allowedFor('presB', row.kind, false));
    });
  }

  it('vínculo inativo não lê nada da sociedade', async () => {
    const inativo = env.authenticatedContext('inativo', { email: 'i@teste.local', email_verified: true }).firestore();
    await assertFails(getDoc(doc(inativo, 'tenants/A/roles/presidente')));
    await assertFails(getDoc(doc(inativo, 'tenants/A/members/m9')));
  });
});

describe('nenhuma escrita do cliente passa', () => {
  it('nem a presidência grava, altera ou apaga qualquer documento da sociedade', async () => {
    const f = db('presA');
    const paths = ['', ...MATRIX.map(r => `/${r.path}`), '/memberships/presA', '/members/mA1', '/members/novo'];
    for (const p of paths) {
      const ref = doc(f, `tenants/A${p}`);
      try {
        await assertFails(setDoc(ref, { x: 1 }));
        await assertFails(setDoc(ref, { x: 1 }, { merge: true }));
        await assertFails(updateDoc(ref, { x: 1 }));
        await assertFails(deleteDoc(ref));
      } catch (e) {
        throw new Error(`escrita em tenants/A${p} passou: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  });

  it('o sócio não se promove nem altera a própria situação', async () => {
    const f = db('socioA');
    await assertFails(updateDoc(doc(f, 'tenants/A/memberships/socioA'), { perms: ALL_PERMS, board: true }));
    await assertFails(setDoc(doc(f, 'tenants/A/memberships/socioA'), membership({ board: true, perms: ALL_PERMS })));
    await assertFails(updateDoc(doc(f, 'tenants/A/members/mA1'), { status: 'ativo', validUntil: '2099-12-31' }));
    await assertFails(setDoc(doc(f, 'tenants/A/cardTokens/qualquer'), { memberId: 'mA1', expiresAt: '2099-01-01' }));
    await assertFails(setDoc(doc(f, 'tenants/A/charges/cSocio'), { memberUid: 'socioA', status: 'paga' }));
  });

  it('plataforma, slugs e users também são só leitura', async () => {
    const f = db('presA');
    for (const p of ['slugs/novo', 'plans/novo', 'platform/config', 'platformAudit/n', 'supportAccess/n', 'users/presA', 'users/presA/pushTokens/k', 'rateLimits/k', 'tenants/novo']) {
      await assertFails(setDoc(doc(f, p), { x: 1 }));
    }
  });
});

describe('dono do dado', () => {
  it('sócio lê o próprio cadastro, PII e histórico, e os do dependente', async () => {
    for (const m of ['mA1', 'mA2']) {
      await expectRead('socioA', `tenants/A/members/${m}`, true);
      await expectRead('socioA', `tenants/A/members/${m}/private/pii`, true);
      await expectRead('socioA', `tenants/A/members/${m}/history/h1`, true);
      await expectRead('socioA', `tenants/A/members/${m}/changes/c1`, true);
    }
  });

  it('sócio não lê cadastro nem PII de outro sócio', async () => {
    await expectRead('socioA', 'tenants/A/members/mA3', false);
    await expectRead('socioA', 'tenants/A/members/mA3/private/pii', false);
    await expectRead('socioA', 'tenants/A/members/mA3/history/h1', false);
    await expectRead('socioA', 'tenants/A/members/mA3/changes/c1', false);
    await expectRead('socioA', 'tenants/B/members/mB1/private/pii', false);
    // Quem tem pii:ver lê; quem vê sócios mas não PII (tesA não vê sócios) não lê
    await expectRead('presA', 'tenants/A/members/mA3/private/pii', true);
    await expectRead('tesA', 'tenants/A/members/mA3/private/pii', false);
  });

  it('listas: sem a permissão do módulo, só com filtro pelo próprio dado', async () => {
    const f = db('socioA');
    await assertFails(getDocs(collection(f, 'tenants/A/members')));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/members'), where('uid', '==', 'socioA'))));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/members'), where('dependentOf', '==', 'mA1'))));
    await assertFails(getDocs(query(collection(f, 'tenants/A/members'), where('dependentOf', '==', 'mA3'))));
    await assertFails(getDocs(query(collection(f, 'tenants/A/members'), where('uid', '==', 'socio2A'))));
    await assertSucceeds(getDocs(collection(db('presA'), 'tenants/A/members')));
    await assertFails(getDocs(collection(db('presA'), 'tenants/B/members')));

    await assertFails(getDocs(collection(f, 'tenants/A/notifications')));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/notifications'), where('uid', '==', 'socioA'))));
    await assertFails(getDocs(query(collection(f, 'tenants/B/notifications'), where('uid', '==', 'socioB'))));

    await assertFails(getDocs(collection(f, 'tenants/A/charges')));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/charges'), where('memberUid', '==', 'socioA'))));

    await assertFails(getDocs(collection(f, 'tenants/A/privacyRequests')));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/privacyRequests'), where('uid', '==', 'socioA'))));

    await assertFails(getDocs(collection(f, 'tenants/A/notices')));
    await assertFails(getDocs(query(collection(f, 'tenants/A/notices'), where('audience.boardOnly', '==', false))));
    await assertFails(getDocs(query(collection(f, 'tenants/A/notices'), where('status', '==', 'publicado'))));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/notices'), where('audience.boardOnly', '==', false), where('status', '==', 'publicado'))));
    await assertFails(getDocs(query(collection(db('socioA'), 'tenants/B/notices'), where('audience.boardOnly', '==', false), where('status', '==', 'publicado'))));
    await assertSucceeds(getDocs(collection(db('presA'), 'tenants/A/notices')));

    await assertFails(getDocs(collection(f, 'tenants/A/calendar')));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/calendar'), where('visibility', 'in', ['publico', 'socios']))));
    await assertSucceeds(getDocs(query(collection(db('anon'), 'tenants/A/calendar'), where('visibility', '==', 'publico'))));
    await assertFails(getDocs(query(collection(db('anon'), 'tenants/A/calendar'), where('visibility', '==', 'socios'))));
    await assertSucceeds(getDocs(query(collection(db('anon'), 'tenants/A/events'), where('publicListing', '==', true))));
    await assertFails(getDocs(collection(db('anon'), 'tenants/A/events')));
    await assertSucceeds(getDocs(query(collection(db('anon'), 'tenants/A/terms'), where('current', '==', true))));
    await assertFails(getDocs(collection(db('anon'), 'tenants/A/terms')));
    await assertFails(getDocs(query(collection(db('anon'), 'tenants/C/terms'), where('current', '==', true))));
    await assertFails(getDoc(doc(db('anon'), 'tenants/C/terms/atual')));

    await assertFails(getDocs(query(collection(f, 'tenants/A/minutes'), limit(10))));
    await assertSucceeds(getDocs(query(collection(f, 'tenants/A/minutes'), where('published', '==', true))));
  });

  it('notificação, cobrança, convite de evento e pedido de privacidade do próprio sócio', async () => {
    await expectRead('socioA', 'tenants/A/notifications/nSocio', true);
    await expectRead('socioA', 'tenants/A/charges/cSocio', true);
    await expectRead('socioA', 'tenants/A/events/priv/guests/gSocio', true);
    await expectRead('socioA', 'tenants/A/privacyRequests/pSocio', true);
    await expectRead('presA', 'tenants/A/notifications/nSocio', false); // notificação é só do destinatário
    await expectRead('naoVerificado', 'tenants/A/notifications/nSocio', false);
  });

  it('vínculos, votos e leituras: cada um o seu', async () => {
    await expectRead('socioA', 'tenants/A/memberships/socioA', true);
    await expectRead('socioA', 'tenants/A/memberships/presA', false);
    await assertFails(getDocs(collection(db('socioA'), 'tenants/A/memberships')));
    await assertSucceeds(getDocs(collection(db('presA'), 'tenants/A/memberships')));
    await assertFails(getDocs(collection(db('presA'), 'tenants/B/memberships')));
    await expectRead('socioA', 'tenants/A/elections/e1/voters/mA1', true);
    await expectRead('socioA', 'tenants/A/elections/e1/voters/m9', false);
    await assertFails(getDocs(collection(db('socioA'), 'tenants/A/elections/e1/voters')));
    await assertFails(getDocs(collection(db('presA'), 'tenants/A/elections/e1/ballots')));
    await expectRead('socioA', 'tenants/A/surveys/q1/voters/socioA', true);
    await expectRead('socioA', 'tenants/A/notices/todos/reads/socioA', true);
    await expectRead('socioA', 'tenants/A/notices/todos/reads/ninguem', false);
    await assertSucceeds(getDocs(collection(db('presA'), 'tenants/A/notices/todos/reads')));
    await assertFails(getDocs(collection(db('socioA'), 'tenants/A/notices/todos/reads')));
    await assertFails(getDocs(collection(db('presA'), 'tenants/B/notices/todos/reads')));
  });
});

describe('plataforma', () => {
  const master = () =>
    env.authenticatedContext('master1', { email: 'm@teste.local', email_verified: true, master: true, firebase: { sign_in_provider: 'google.com', sign_in_second_factor: 'phone' } as never }).firestore();
  const masterSemMfa = () => env.authenticatedContext('master1', { email: 'm@teste.local', email_verified: true, master: true }).firestore();

  it('slug e sociedade: get público, sem list', async () => {
    await assertSucceeds(getDoc(doc(db('anon'), 'slugs/a')));
    await assertSucceeds(getDoc(doc(db('anon'), 'tenants/A')));
    await assertFails(getDocs(collection(db('anon'), 'slugs')));
    await assertFails(getDocs(collection(db('presA'), 'tenants')));
    await assertFails(getDocs(collection(master(), 'tenants')));
  });

  it('planos: get para logado, list só master (segundo fator opcional)', async () => {
    await assertFails(getDoc(doc(db('anon'), 'plans/completo')));
    await assertFails(getDoc(doc(db('naoVerificado'), 'plans/completo')));
    await assertSucceeds(getDoc(doc(db('socioA'), 'plans/completo')));
    await assertFails(getDocs(collection(db('presA'), 'plans')));
    await assertSucceeds(getDocs(collection(masterSemMfa(), 'plans')));
    await assertSucceeds(getDocs(collection(master(), 'plans')));
  });

  it('auditoria da plataforma e acessos de suporte: só master com segundo fator', async () => {
    for (const p of ['platformAudit', 'supportAccess']) {
      await assertFails(getDocs(collection(db('presA'), p)));
      await assertSucceeds(getDocs(collection(masterSemMfa(), p)));
      await assertSucceeds(getDocs(collection(master(), p)));
    }
    await assertSucceeds(getDoc(doc(db('socioA'), 'platform/config')));
    await assertFails(getDoc(doc(db('anon'), 'platform/config')));
  });

  it('master não lê dado da sociedade sem acesso de suporte', async () => {
    await assertFails(getDoc(doc(master(), 'tenants/A/members/mA1')));
    await assertFails(getDoc(doc(master(), 'tenants/A/members/mA1/private/pii')));
    await assertFails(getDocs(collection(master(), 'tenants/A/audit')));
  });

  it('users: só o próprio; subcoleções e rateLimits: ninguém', async () => {
    await assertSucceeds(getDoc(doc(db('socioA'), 'users/socioA')));
    await assertFails(getDoc(doc(db('presA'), 'users/socioA')));
    await assertFails(getDocs(collection(db('presA'), 'users')));
    await assertFails(getDoc(doc(db('socioA'), 'users/socioA/pushTokens/k1')));
    await assertFails(getDoc(doc(master(), 'rateLimits/k1')));
  });

  it('a matriz cobre todas as coleções declaradas em paths.ts', async () => {
    const { P } = await import('../../src/shared/paths.ts');
    const covered = new Set(MATRIX.map(r => r.path.split('/')[0]));
    for (const extra of ['memberships']) covered.add(extra);
    const missing: string[] = [];
    for (const [name, fn] of Object.entries(P)) {
      if (fn.length < 1) continue;
      const args = Array.from({ length: fn.length }, (_, i) => (i === 0 ? 'T' : `x${i}`));
      const p = (fn as (...a: string[]) => string)(...args);
      if (!p.startsWith('tenants/T/')) continue;
      const top = p.split('/')[2];
      if (!covered.has(top)) missing.push(`${name}: ${top}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('competições: listas', () => {
  it('visitante lista só com filtro de ranking público; sócio lista tudo; outra sociedade não lista', async () => {
    await assertSucceeds(getDocs(query(collection(db('anon'), 'tenants/A/competitions'), where('publicRanking', '==', true))));
    await assertFails(getDocs(collection(db('anon'), 'tenants/A/competitions')));
    await assertSucceeds(getDocs(collection(db('socioA'), 'tenants/A/competitions')));
    await assertSucceeds(getDocs(collection(db('anon'), 'tenants/A/competitions/pub/results')));
    await assertFails(getDocs(collection(db('anon'), 'tenants/A/competitions/priv/results')));
    await assertSucceeds(getDocs(collection(db('socioA'), 'tenants/A/competitions/priv/matches')));
    await assertFails(getDocs(collection(db('presB'), 'tenants/A/competitions')));
    await assertFails(getDocs(collection(db('presB'), 'tenants/A/competitions/priv/results')));
    await assertFails(setDoc(doc(db('presA'), 'tenants/A/competitions/pub/results/novo'), { value: 1 }));
  });
});

describe('notícias: listas', () => {
  const col = (who: Who, t = 'A') => collection(db(who), `tenants/${t}/news`);
  it('sócio lista só com hidden false; quem edita notícias lista tudo; outra sociedade não lista', async () => {
    await assertFails(getDocs(col('socioA')));
    await assertSucceeds(getDocs(query(col('socioA'), where('hidden', '==', false), where('kind', '==', 'externa'), orderBy('publishedAt', 'desc'), limit(20))));
    await assertSucceeds(getDocs(query(col('socioA'), where('hidden', '==', false))));
    await assertFails(getDocs(query(col('socioA'), where('hidden', '==', true))));
    await assertFails(getDocs(query(col('socioA', 'B'), where('hidden', '==', false))));
    await assertFails(getDocs(query(col('tesA'), where('hidden', '==', true))));
    await assertSucceeds(getDocs(query(col('presA'), where('kind', '==', 'externa'), orderBy('publishedAt', 'desc'), limit(20))));
    await assertFails(getDocs(col('presB')));
    await assertFails(getDocs(query(col('presB'), where('hidden', '==', false))));
  });

  it('visitante lista só as públicas e não escondidas, e só com a página pública ligada', async () => {
    await assertSucceeds(getDocs(query(col('anon'), where('hidden', '==', false), where('visibility', '==', 'publico'))));
    await assertFails(getDocs(query(col('anon'), where('hidden', '==', false))));
    await assertFails(getDocs(query(col('anon'), where('visibility', '==', 'publico'))));
    await assertFails(getDocs(query(col('anon', 'C'), where('hidden', '==', false), where('visibility', '==', 'publico'))));
    await assertFails(getDoc(doc(db('anon'), 'tenants/C/news/pub')));
  });

  it('ninguém grava notícia nem a configuração pelo cliente', async () => {
    for (const who of ['presA', 'socioA'] as Who[]) {
      await assertFails(setDoc(doc(db(who), 'tenants/A/news/nova'), { kind: 'interna', title: 'x', hidden: false, visibility: 'publico' }));
      await assertFails(updateDoc(doc(db(who), 'tenants/A/news/esc'), { hidden: false }));
      await assertFails(setDoc(doc(db(who), 'tenants/A/config/news'), { enabled: false }));
    }
  });
});
