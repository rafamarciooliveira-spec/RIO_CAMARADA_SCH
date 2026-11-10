/**
 * Gerador de dados SIMULADOS (todos fictícios) para a demonstração "Ver sistema" e para o
 * emulador local. Usa as próprias operações do sistema, então os dados ficam coerentes
 * (saldos, cobranças, situação dos sócios, votos secretos, atas assinadas).
 * Nunca rodar contra a produção. Nomes, CPFs, e-mails e valores são inventados; e-mails usam
 * o domínio reservado .invalid; CPFs são gerados só para passar na validação.
 */
import { executeOp, runDailyJobs, type Actor, type Env, type OpContext } from '../core/ops.ts';
import { P } from '../paths.ts';
import { MODULE_IDS } from '../modules.ts';
import { createTenantCore } from '../ops/platform.ts';
import { upsertMembership } from '../ops/access.ts';
import { addDaysKey, addMonthsKey, localDateKey } from '../dates.ts';
import type { MemberDoc, TenantDoc } from '../types.ts';

export const DEMO_SLUG = 'sociedade-exemplo';

export interface DemoSeedResult {
  tenantId: string;
  slug: string;
  personas: { master: Actor; diretoria: Actor; tesouraria: Actor; portaria: Actor; socio: Actor };
  warnings: string[];
}

export function demoActor(uid: string, name: string, extra: Partial<Actor> = {}): Actor {
  return { uid, email: `${uid}@exemplo.invalid`, emailVerified: true, displayName: name, master: false, mfa: false, ...extra };
}

/** Gerador pseudoaleatório com semente (dados iguais a cada carga) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** CPF fictício que passa na validação dos dígitos */
function fakeCpf(r: () => number): string {
  const d = Array.from({ length: 9 }, () => Math.floor(r() * 10));
  if (d.every(x => x === d[0])) d[8] = (d[0] + 1) % 10;
  const dv = (arr: number[]) => {
    const sum = arr.reduce((a, n, i) => a + n * (arr.length + 1 - i), 0);
    const v = 11 - (sum % 11);
    return v >= 10 ? 0 : v;
  };
  d.push(dv(d));
  d.push(dv(d));
  const s = d.join('');
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

/** Retrato desenhado (SVG com iniciais): nenhuma foto de pessoa real */
export function avatarSvg(name: string, hue: number): string {
  const ini = name.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},45%,22%)"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="150" r="70" fill="rgba(255,255,255,0.22)"/><rect x="60" y="240" width="180" height="160" rx="90" fill="rgba(255,255,255,0.22)"/><text x="150" y="172" font-family="Georgia,serif" font-size="64" text-anchor="middle" fill="#fff">${ini}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FIRST = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Lucas', 'Marina', 'Nelson', 'Olívia', 'Paulo', 'Renata', 'Sérgio', 'Tatiane', 'Vítor', 'Helena', 'Otávio', 'Lívia', 'Rafael', 'Beatriz', 'Mateus', 'Cecília', 'Gustavo', 'Alice', 'Eduardo', 'Laura', 'Rodrigo', 'Sofia', 'Thiago', 'Valentina', 'Leonardo'];
const LAST = ['Schmitt', 'Moreira', 'Kühn', 'Ribeiro', 'Becker', 'Martins', 'Hoffmann', 'Carvalho', 'Weber', 'Almeida', 'Fischer', 'Rocha', 'Müller', 'Teixeira', 'Krause', 'Barbosa', 'Wagner', 'Dias', 'Zimmermann', 'Pereira'];

export async function buildDemoData(env: Env, opts: { files?: Map<string, string> } = {}): Promise<DemoSeedResult> {
  const r = rng(20261102);
  const warnings: string[] = [];
  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      warnings.push(`${label}: ${(e as Error).message}`);
    }
  };
  const call = <T = unknown>(op: string, input: object, actor: Actor) => executeOp(env, { op, input, actor, ip: '127.0.0.1' }) as Promise<T>;

  const master = demoActor('demo-master', 'Equipe da plataforma (fictícia)', { master: true, mfa: true });
  const diretoria = demoActor('demo-presidencia', 'Marta Schneider (presidente fictícia)');
  const tesouraria = demoActor('demo-tesouraria', 'Roberto Lenz (tesoureiro fictício)');
  const secretaria = demoActor('demo-secretaria', 'Clara Vieira (secretária fictícia)');
  const portaria = demoActor('demo-portaria', 'Portaria (fictícia)');
  const socio = demoActor('demo-socio', 'Ana Paula Kessler');

  await env.store.set(P.plan('essencial'), {
    id: 'essencial',
    name: 'Essencial',
    description: 'Para organizar o quadro de sócios.',
    maxMembers: 300,
    modules: ['sociedade', 'papeis', 'socios', 'pii', 'carteirinha', 'portaria', 'avisos', 'agenda', 'auditoria', 'noticias', 'organograma'],
    priceCents: 0,
    pricePerMemberCents: 190,
    minMonthlyCents: 6900,
    highlights: ['Cadastro pelo link, com dependentes e aprovação', 'Carteirinha digital com QR que se confere', 'Portaria com leitura do QR', 'Avisos, agenda e notícias da região', 'Organograma e passagem de cargo', 'Notificação no celular'],
    active: true,
  });
  await env.store.set(P.plan('completo'), {
    id: 'completo',
    name: 'Completo',
    description: 'Para a diretoria inteira.',
    maxMembers: 100000,
    modules: MODULE_IDS,
    priceCents: 0,
    pricePerMemberCents: 290,
    minMonthlyCents: 9900,
    highlights: ['Tudo do Essencial', 'Mensalidades, Pix, recibos e prestação de contas', 'Eventos com orçado e realizado', 'Atas, assembleias e votação secreta', 'Competições e ranking', 'Oficinas, reservas, patrimônio e certificados'],
    active: true,
  });

  const baseCtx = {
    ...env,
    actor: master,
    ip: '127.0.0.1',
    nowIso: env.now().toISOString(),
    async audit() {},
    requireActor: () => master,
    can: () => true,
    require: () => undefined,
  } as unknown as OpContext;
  const { tenantId, slug } = await createTenantCore(baseCtx, {
    name: 'Sociedade de Tiro e Cultura Harmonia',
    slug: DEMO_SLUG,
    planId: 'completo',
    city: 'Cidade Exemplo',
    state: 'SC',
    societyType: 'tiro_esportivo',
    adminEmails: [diretoria.email],
  });
  const t = tenantId;
  const tenant = (await env.store.get<TenantDoc>(P.tenant(t)))!;
  const mctx = { ...baseCtx, tenantId: t, tenant } as OpContext;
  const tz = tenant.timezone;
  const today = localDateKey(env.now(), tz);
  const iso = (dateKey: string, hm = '19:30') => new Date(`${dateKey}T${hm}:00-03:00`).toISOString();

  // Papéis das personas
  await upsertMembership(mctx, tenant, diretoria, ['presidente']);
  await upsertMembership(mctx, tenant, tesouraria, ['tesoureiro']);
  await upsertMembership(mctx, tenant, secretaria, ['secretario']);
  await upsertMembership(mctx, tenant, portaria, ['portaria']);

  await call('tenant.update', {
    tenantId: t,
    shortName: 'Harmonia',
    branding: { logoUrl: 'landmark', primaryColor: '#1d3a2b', secondaryColor: '#0d1d15', accentColor: '#d9b25f', textColor: '#ffffff', fontFamily: 'Inter', theme: 'escuro' },
    publicPage: {
      enabled: true,
      about: 'Sociedade de canto, dança e tradição fundada por imigrantes. Ensaios semanais do coral, grupo de danças folclóricas e bailes na sede. (Sociedade fictícia, só para demonstração.)',
      history: 'Fundada em 1931 por um grupo de famílias que se reunia para cantar aos domingos. Hoje mantém coral, grupo de danças e um acervo de trajes típicos. (História fictícia.)',
      city: 'Cidade Exemplo',
      foundedYear: 1931,
      socials: { instagram: 'perfil-ficticio' },
      contactEmail: 'contato@exemplo.invalid',
    },
    legal: { legalName: 'Sociedade Harmonia de Canto e Tradição (fictícia)', cnpj: '00.000.000/0001-00', address: 'Rua Exemplo, 100, Centro', cityState: 'Cidade Exemplo - SC', cep: '00000-000' },
  }, diretoria);
  await call('tenant.updateSettings', { tenantId: t, settings: { pixKey: 'pix@exemplo.invalid', doubleApprovalAboveCents: 500000, dueDay: 10, cardRequiresPhoto: false } }, diretoria);

  // ---------- Sócios ----------
  const cats = ['efetivo', 'efetivo', 'efetivo', 'contribuinte', 'benemerito'];
  const members: { id: string; name: string; actor?: Actor }[] = [];
  const consents = { cadastro: true, imagem: true, comunicacao: true, marketing: false };
  const files = opts.files;
  const photo = async (memberId: string, name: string, hue: number, who: Actor) => {
    const path = `tenants/${t}/members/${memberId}/photo/retrato.svg`;
    files?.set(path, avatarSvg(name, hue));
    await call('members.setPhoto', { tenantId: t, memberId, path }, who);
  };

  // Sócia persona: proposta online e aprovação
  await safe('sócia persona', async () => {
    const { memberId } = await call<{ memberId: string }>('members.apply', {
      tenantId: t,
      data: { fullName: socio.displayName, cpf: fakeCpf(r), birthDate: `1988-${today.slice(5, 7)}-${String(Math.min(28, Number(today.slice(8)) + 5)).padStart(2, '0')}`, email: socio.email, phone: '(00) 90000-0001', categoryId: 'efetivo' },
      consents,
    }, socio);
    await call('members.approve', { tenantId: t, memberId }, diretoria);
    await env.store.update(P.member(t, memberId), { joinedAt: addMonthsKey(today, -50) });
    await photo(memberId, socio.displayName, 25, socio);
    members.push({ id: memberId, name: socio.displayName, actor: socio });
    await call('members.addDependent', {
      tenantId: t,
      holderId: memberId,
      data: { fullName: 'Lucas Kessler', birthDate: addMonthsKey(today, -12 * 11), categoryId: 'dependente', guardian: { name: socio.displayName, email: socio.email, consent: true } },
      consents,
    }, socio);
  });
  const socioMemberId = members[0]?.id;
  // A dependente aparece aprovada na demonstração
  await safe('dependente', async () => {
    const deps = await env.store.query<MemberDoc>(P.members(t), { where: [['dependentOf', '==', socioMemberId]] });
    for (const d of deps) await call('members.approve', { tenantId: t, memberId: d.id }, diretoria);
  });

  // A diretoria também é sócia (para a visão da diretoria ter carteirinha)
  await safe('presidência como sócia', async () => {
    const { memberId } = await call<{ memberId: string }>('members.apply', {
      tenantId: t,
      data: { fullName: 'Marta Schneider', cpf: fakeCpf(r), birthDate: '1969-03-14', email: diretoria.email, categoryId: 'benemerito' },
      consents,
    }, diretoria);
    // A diretoria que se cadastra já entra aprovada
    await env.store.update(P.member(t, memberId), { joinedAt: '2004-05-01' });
    await photo(memberId, 'Marta Schneider', 140, diretoria);
    members.push({ id: memberId, name: 'Marta Schneider', actor: diretoria });
  });

  const statuses: string[] = [];
  for (let i = 0; i < 34; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(r() * LAST.length)]}`;
    const year = 1950 + Math.floor(r() * 55);
    const birth = `${year}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
    await safe(`sócio ${i}`, async () => {
      const approve = i >= 3; // os três primeiros ficam pendentes
      const { memberId } = await call<{ memberId: string }>('members.create', {
        tenantId: t,
        data: {
          fullName: name,
          cpf: fakeCpf(r),
          birthDate: i % 9 === 0 ? `${year}-${today.slice(5, 7)}-${String(1 + (i % 27)).padStart(2, '0')}` : birth,
          email: `socio${i + 1}@exemplo.invalid`,
          phone: `(00) 9${String(10000000 + i * 137).slice(0, 4)}-${String(1000 + i).slice(-4)}`,
          categoryId: cats[i % cats.length],
        },
        consents: { ...consents, comunicacao: i % 7 !== 0 },
        approve,
      }, secretaria);
      if (approve) await env.store.update(P.member(t, memberId), { joinedAt: addMonthsKey(today, -(3 + Math.floor(r() * 240))) });
      if (i % 3 === 0) await photo(memberId, name, Math.floor(r() * 360), secretaria);
      members.push({ id: memberId, name });
      statuses.push(approve ? 'ativo' : 'pendente');
    });
  }
  await safe('pedido de ajuste', async () => {
    const pend = members.find((m, k) => k >= 2 && statuses[k - 2] === 'pendente');
    if (pend) await call('members.requestFix', { tenantId: t, memberId: pend.id, reason: 'A foto enviada está escura. Envie uma foto de rosto com boa luz, por favor.' }, secretaria);
  });
  await safe('desligado', async () => {
    const m = members[members.length - 1];
    await call('members.setStatus', { tenantId: t, memberId: m.id, status: 'desligado', reason: 'Pedido de desligamento' }, diretoria);
  });

  // Contas para alguns sócios votarem e responderem enquete
  const voters: { id: string; actor: Actor }[] = [];
  for (const [k, m] of members.slice(6, 18).entries()) {
    const a = demoActor(`demo-socio-${k + 2}`, m.name);
    await env.store.update(P.member(t, m.id), { uid: a.uid });
    await upsertMembership(mctx, tenant, a, ['socio'], m.id);
    m.actor = a;
    voters.push({ id: m.id, actor: a });
  }
  // Vincula as personas da diretoria aos cadastros de sócio criados por elas mesmas (presidência já está)
  const memberOfSocio = socioMemberId;

  // ---------- Financeiro ----------
  const banco = 'banco';
  await safe('conta banco', async () => {
    await env.store.set(`${P.accounts(t)}/${banco}`, { name: 'Banco Exemplo (conta corrente)', type: 'banco', openingBalanceCents: 1_250_000, balanceCents: 1_250_000, active: true });
    await env.store.set(`${P.accounts(t)}/pix`, { name: 'Pix da sociedade', type: 'pix', openingBalanceCents: 0, balanceCents: 0, active: true });
    await env.store.set(`${P.accounts(t)}/poupanca`, { name: 'Poupança', type: 'poupanca', institution: 'Banco Exemplo', openingBalanceCents: 534_705, balanceCents: 534_705, active: true });
    await env.store.set(`${P.accounts(t)}/aplicacao`, { name: 'Aplicação CDI', type: 'aplicacao', institution: 'Banco Exemplo', openingBalanceCents: 1_224_496, balanceCents: 1_224_496, active: true });
    await env.store.update(P.stats(t), { 'finance.balanceCents': 1_250_000 + 534_705 + 1_224_496 });
    await env.store.set(`${P.costCenters(t)}/baile`, { name: 'Baile de Primavera', kind: 'evento', active: true });
    await env.store.set(`${P.costCenters(t)}/edital`, { name: 'Edital de cultura municipal', kind: 'edital', active: true });
  });
  const thisMonth = today.slice(0, 7);
  const months = [-3, -2, -1, 0].map(n => addMonthsKey(`${thisMonth}-01`, n).slice(0, 7));
  for (const comp of months) {
    await safe(`cobranças ${comp}`, () => call('charges.generateBatch', { tenantId: t, competence: comp }, tesouraria));
  }
  await safe('baixas', async () => {
    const charges = await env.store.query<{ status: string; dueDate: string; memberId: string; competence: string }>(P.charges(t));
    const late = new Set(members.slice(20, 23).map(m => m.id)); // alguns ficam devendo
    for (const c of charges) {
      if (c.data.competence === thisMonth) continue;
      if (late.has(c.data.memberId) && c.data.competence >= months[1]) continue;
      const paidOn = addDaysKey(c.data.dueDate, Math.floor(r() * 9) - 4);
      await call('charges.pay', { tenantId: t, chargeId: c.id, accountId: r() > 0.5 ? 'pix' : banco, method: r() > 0.3 ? 'pix' : 'dinheiro', paidOn: paidOn > today ? today : paidOn }, tesouraria);
    }
  });
  const expenses: [number, string, string, number][] = [
    [-80, 'c2_01', 'Conta de luz da sede', 48_730],
    [-75, 'c2_01', 'Conta de água', 12_960],
    [-62, 'c2_02', 'Conserto do telhado do salão', 320_000],
    [-50, 'c2_04', 'Tecido para trajes do grupo de danças', 86_500],
    [-45, 'c2_01', 'Conta de luz da sede', 51_210],
    [-30, 'c2_06', 'Afinação do piano', 45_000],
    [-15, 'c2_01', 'Conta de luz da sede', 49_880],
    [-8, 'c2_05', 'Taxa de alvará', 23_400],
  ];
  for (const [d, chart, desc, amount] of expenses) {
    await safe(`despesa ${desc}`, () => call('ledger.post', { tenantId: t, date: addDaysKey(today, d), accountId: banco, direction: 'saida', amountCents: amount, chartAccountId: chart, description: desc, counterparty: 'Fornecedor exemplo', attachments: [] }, tesouraria));
  }
  await safe('doação', () => call('ledger.post', { tenantId: t, date: addDaysKey(today, -40), accountId: banco, direction: 'entrada', amountCents: 150_000, chartAccountId: 'c1_03', description: 'Doação de sócio benemérito', attachments: [] }, tesouraria));
  await safe('despesa aguardando aprovação', () => call('ledger.post', { tenantId: t, date: addDaysKey(today, -2), accountId: banco, direction: 'saida', amountCents: 780_000, chartAccountId: 'c2_02', description: 'Reforma dos banheiros (orçamento aprovado em reunião)', attachments: [] }, tesouraria));
  await safe('fechamento', () => call('periods.close', { tenantId: t, periodKey: months[0] }, diretoria));
  await safe('Pix da persona', async () => {
    const open = await env.store.query<{ status: string }>(P.charges(t), { where: [['memberId', '==', memberOfSocio]] });
    const c = open.find(x => x.data.status !== 'paga');
    if (c) await call('charges.createPayment', { tenantId: t, chargeId: c.id, method: 'pix' }, socio);
  });

  // ---------- Eventos ----------
  const evIds: Record<string, string> = {};
  const saveEvent = async (key: string, data: Record<string, unknown>) => {
    const res = await call<{ id: string }>('generic.save', { tenantId: t, collection: 'events', data }, diretoria);
    evIds[key] = res.id;
    await call('events.syncCalendar', { tenantId: t, eventId: res.id }, diretoria).catch(() => undefined);
  };
  await safe('evento baile', () => saveEvent('baile', {
    name: 'Baile de Primavera',
    kind: 'evento',
    description: 'Baile com a banda da casa, apresentação do grupo de danças e cozinha típica.',
    start: iso(addDaysKey(today, 18), '20:00'),
    end: iso(addDaysKey(today, 19), '01:00'),
    location: 'Salão nobre da sede',
    status: 'confirmado',
    publicListing: true,
    rsvpEnabled: true,
    costCenterId: 'baile',
    budget: { items: [
      { id: 'b1', label: 'Ingressos', kind: 'receita', plannedCents: 1_200_000 },
      { id: 'b2', label: 'Cozinha', kind: 'receita', plannedCents: 450_000 },
      { id: 'b3', label: 'Banda', kind: 'despesa', plannedCents: 380_000 },
      { id: 'b4', label: 'Decoração', kind: 'despesa', plannedCents: 120_000 },
    ] },
    ticketing: { enabled: true, lots: [ { id: 'l1', name: '1º lote', priceCents: 4000, quantity: 120 }, { id: 'l2', name: '2º lote', priceCents: 5000, quantity: 100 } ] },
    team: [ { name: 'Clara Vieira', role: 'Coordenação', volunteer: true }, { name: 'Grupo de danças', role: 'Apresentação', volunteer: true } ],
  }));
  await safe('evento concerto', () => saveEvent('concerto', {
    name: 'Concerto de Natal do Coral',
    kind: 'evento',
    description: 'Concerto aberto à comunidade com o coral misto.',
    start: iso(addDaysKey(today, 40), '19:00'),
    end: iso(addDaysKey(today, 40), '21:00'),
    location: 'Igreja matriz (exemplo)',
    status: 'planejamento',
    publicListing: true,
    rsvpEnabled: true,
    budget: { items: [{ id: 'c1', label: 'Partituras', kind: 'despesa', plannedCents: 60_000 }] },
    ticketing: { enabled: false, lots: [] },
    team: [],
  }));
  await safe('evento passado', () => saveEvent('festa', {
    name: 'Festa de aniversário da sociedade',
    kind: 'evento',
    description: 'Almoço de aniversário com homenagens aos sócios mais antigos.',
    start: iso(addDaysKey(today, -35), '12:00'),
    end: iso(addDaysKey(today, -35), '17:00'),
    location: 'Sede',
    status: 'realizado',
    publicListing: false,
    rsvpEnabled: false,
    budget: { items: [{ id: 'f1', label: 'Almoço', kind: 'despesa', plannedCents: 250_000 }] },
    ticketing: { enabled: false, lots: [] },
    team: [],
    report: 'Cerca de cem pessoas, homenagem a cinco sócios com mais de 50 anos de casa. (Relato fictício.)',
  }));
  await safe('ingressos', async () => {
    for (let k = 0; k < 6; k++) {
      await call('events.sellTicket', { tenantId: t, eventId: evIds.baile, lotId: 'l1', buyerName: `${FIRST[(k * 5) % FIRST.length]} ${LAST[(k * 3) % LAST.length]}`, quantity: 1 + (k % 3), ledger: { accountId: 'pix', chartAccountId: 'c1_02', date: today } }, tesouraria);
    }
    await call('events.addGuest', { tenantId: t, eventId: evIds.baile, name: 'Representante da prefeitura (convidado)' }, diretoria);
  });
  await safe('presenças', async () => {
    await call('events.rsvp', { tenantId: t, eventId: evIds.baile, going: true }, socio);
    for (const v of voters.slice(0, 7)) await call('events.rsvp', { tenantId: t, eventId: evIds.baile, going: true }, v.actor);
  });

  // ---------- Plano de ação ----------
  const task = (title: string, status: string, when: number, who: string, priority: string, ref?: object) =>
    call('generic.save', { tenantId: t, collection: 'tasks', data: { title, what: title, why: 'Preparar o evento com antecedência', where: 'Sede', when: addDaysKey(today, when), who, how: 'Conforme combinado na reunião', howMuchCents: 0, priority, status, attachments: [], ...(ref ? { ref } : {}) } }, diretoria);
  await safe('tarefas', async () => {
    const ref = evIds.baile ? { type: 'evento', id: evIds.baile, label: 'Baile de Primavera' } : undefined;
    await task('Contratar a banda', 'concluida', -10, 'Roberto Lenz', 'alta', ref);
    await task('Decoração do salão', 'fazendo', 10, 'Clara Vieira', 'media', ref);
    await task('Divulgação nas redes', 'a_fazer', 5, 'Clara Vieira', 'media', ref);
    await task('Renovar o alvará do salão', 'bloqueada', -3, 'Marta Schneider', 'alta');
    await task('Inventário dos trajes', 'a_fazer', 25, 'Grupo de danças', 'baixa');
    const tasks = await env.store.query(P.tasks(t));
    if (tasks[1]) await call('tasks.comment', { tenantId: t, taskId: tasks[1].id, text: 'Flores confirmadas com a floricultura (exemplo).' }, diretoria);
  });

  // ---------- Assembleia, ata e votação ----------
  await safe('assembleia e ata', async () => {
    const a = await call<{ id: string }>('assemblies.save', {
      tenantId: t,
      title: 'Assembleia geral ordinária',
      kind: 'ordinaria',
      date: iso(addDaysKey(today, -20), '19:30'),
      location: 'Salão nobre da sede',
      noticeText: 'Ficam convocados os sócios para a assembleia geral ordinária, em primeira chamada às 19h30, com a seguinte pauta.',
      agenda: ['Prestação de contas do semestre', 'Calendário de eventos', 'Assuntos gerais'],
      quorumPercent: 20,
      status: 'convocada',
    }, secretaria);
    for (const m of members.slice(0, 16)) await call('assemblies.attendance', { tenantId: t, assemblyId: a.id, memberId: m.id, present: true }, secretaria).catch(() => undefined);
    const minute = await call<{ id: string }>('minutes.save', {
      tenantId: t,
      assemblyId: a.id,
      title: 'Ata da assembleia geral ordinária',
      body: 'Aos vinte dias, reuniram-se os sócios na sede para a assembleia geral ordinária. A presidente abriu os trabalhos e apresentou a pauta. A tesouraria apresentou as contas do semestre, aprovadas por unanimidade. Foi aprovado o calendário de eventos, com o Baile de Primavera e o Concerto de Natal. Nada mais havendo, foi encerrada a sessão. (Texto fictício.)',
      deliberations: [{ text: 'Aprovadas as contas do semestre.' }, { text: 'Formar comissão para o Baile de Primavera.' }],
    }, secretaria);
    await call('minutes.submit', { tenantId: t, minuteId: minute.id, signers: [ { uid: diretoria.uid, name: 'Marta Schneider', role: 'Presidente' }, { uid: secretaria.uid, name: 'Clara Vieira', role: 'Secretária' } ] }, secretaria);
    await call('minutes.sign', { tenantId: t, minuteId: minute.id }, diretoria);
    await call('minutes.sign', { tenantId: t, minuteId: minute.id }, secretaria);
    await call('minutes.publish', { tenantId: t, minuteId: minute.id }, diretoria);
    await call('assemblies.save', {
      tenantId: t,
      title: 'Assembleia geral extraordinária: reforma do estatuto',
      kind: 'extraordinaria',
      date: iso(addDaysKey(today, 25), '19:30'),
      location: 'Salão nobre da sede',
      noticeText: 'Convocação para deliberar sobre a reforma do estatuto social.',
      agenda: ['Reforma do estatuto', 'Assuntos gerais'],
      quorumPercent: 50,
      status: 'convocada',
    }, secretaria);
  });
  await safe('votação encerrada', async () => {
    const e = await call<{ id: string }>('elections.save', {
      tenantId: t,
      title: 'Escolha do tema do Baile de Primavera',
      description: 'Votação consultiva entre os sócios.',
      kind: 'votacao',
      options: [{ label: 'Noite tirolesa' }, { label: 'Anos dourados' }, { label: 'Festa das flores' }],
      opensAt: iso(addDaysKey(today, -12), '08:00'),
      closesAt: new Date(env.now().getTime() + 60_000).toISOString(),
      eligibility: { requireUpToDate: false, categoryIds: [], minMonths: 0 },
    }, diretoria);
    await call('elections.open', { tenantId: t, electionId: e.id }, diretoria);
    const doc = await env.store.get<{ options: { id: string }[] }>(P.election(t, e.id));
    for (const [k, v] of voters.entries()) await call('elections.vote', { tenantId: t, electionId: e.id, optionId: doc!.options[[1, 1, 0, 1, 2, 1, 0, 1, 1, 2, 0, 1][k % 12]].id }, v.actor).catch(() => undefined);
    await call('elections.close', { tenantId: t, electionId: e.id }, diretoria);
  });
  await safe('eleição aberta', async () => {
    const e = await call<{ id: string }>('elections.save', {
      tenantId: t,
      title: 'Eleição da diretoria, gestão 2027 a 2028',
      description: 'Voto secreto: o sistema registra que você votou, nunca em quem votou.',
      kind: 'eleicao',
      options: [{ label: 'Chapa 1: Tradição e Futuro', detail: 'Presidência: Marta Schneider (fictícia)' }, { label: 'Chapa 2: Sociedade de Portas Abertas', detail: 'Presidência: Paulo Becker (fictício)' }],
      opensAt: iso(addDaysKey(today, -1), '08:00'),
      closesAt: iso(addDaysKey(today, 10), '20:00'),
      eligibility: { requireUpToDate: true, categoryIds: [], minMonths: 6 },
    }, diretoria);
    await call('elections.open', { tenantId: t, electionId: e.id }, diretoria);
    const doc = await env.store.get<{ options: { id: string }[] }>(P.election(t, e.id));
    for (const v of voters.slice(0, 5)) await call('elections.vote', { tenantId: t, electionId: e.id, optionId: doc!.options[0].id }, v.actor).catch(() => undefined);
  });

  // ---------- Comunicação e agenda ----------
  const audienceAll = { all: true, categoryIds: [], groups: [], boardOnly: false };
  await safe('avisos', async () => {
    await call('notices.publish', { tenantId: t, title: 'Ensaios do coral em novo horário', body: 'A partir deste mês, os ensaios do coral passam para as quartas-feiras, às 19h30, no salão nobre.', audience: audienceAll, pinned: true, channels: ['app', 'email'], requireReadConfirmation: true }, secretaria);
    await call('notices.publish', { tenantId: t, title: 'Ingressos do Baile de Primavera', body: 'O primeiro lote de ingressos está à venda na secretaria e com a diretoria. Sócios em dia têm prioridade.', audience: audienceAll, pinned: false, channels: ['app'], requireReadConfirmation: false }, secretaria);
    await call('notices.publish', { tenantId: t, title: 'Reunião da diretoria', body: 'Pauta: orçamento da reforma dos banheiros e renovação do alvará.', audience: { all: false, categoryIds: [], groups: [], boardOnly: true }, pinned: false, channels: ['app'], requireReadConfirmation: false }, secretaria);
    await call('notices.publish', { tenantId: t, title: 'Lembrete: assembleia extraordinária', body: 'Sua presença é importante para a reforma do estatuto.', audience: audienceAll, pinned: false, publishAt: iso(addDaysKey(today, 15), '09:00'), channels: ['app'], requireReadConfirmation: false }, secretaria);
  });
  await safe('agenda', async () => {
    const cal = (title: string, day: number, hm: string, hours: number, category: string, color: string, visibility: string, freq = 'nenhuma') =>
      call('generic.save', { tenantId: t, collection: 'calendar', data: { title, start: iso(addDaysKey(today, day), hm), end: new Date(Date.parse(iso(addDaysKey(today, day), hm)) + hours * 3600_000).toISOString(), allDay: false, category, color, recurrence: { freq }, visibility, location: 'Sede' } }, secretaria);
    await cal('Ensaio do coral', -((new Date().getDay() + 4) % 7), '19:30', 2, 'Coral', '#d9b25f', 'socios', 'semanal');
    await cal('Ensaio do grupo de danças', -((new Date().getDay() + 1) % 7), '15:00', 2, 'Danças', '#f08a6b', 'socios', 'semanal');
    await cal('Reunião da diretoria', 3, '20:00', 2, 'Diretoria', '#5b8def', 'diretoria', 'mensal');
    await cal('Feira cultural no centro (aberta ao público)', 9, '10:00', 6, 'Comunidade', '#16a34a', 'publico');
  });

  // ---------- Módulos culturais ----------
  const gsave = (collection: string, data: Record<string, unknown>, who: Actor = diretoria) => call<{ id: string }>('generic.save', { tenantId: t, collection, data }, who);
  await safe('oficinas', async () => {
    const coral = await gsave('workshops', { name: 'Coral misto', kind: 'coral', teacher: 'Regente convidado (fictício)', schedule: 'Quartas, 19h30', capacity: 40, enrolled: [], sessions: [], active: true });
    const danca = await gsave('workshops', { name: 'Grupo de danças folclóricas', kind: 'danca', teacher: 'Professora de danças (fictícia)', schedule: 'Sábados, 15h', capacity: 24, enrolled: [], sessions: [], active: true });
    for (const m of members.slice(0, 14)) await call('workshops.enroll', { tenantId: t, workshopId: coral.id, memberId: m.id }, diretoria).catch(() => undefined);
    for (const m of members.slice(8, 20)) await call('workshops.enroll', { tenantId: t, workshopId: danca.id, memberId: m.id }, diretoria).catch(() => undefined);
    for (const w of [-14, -7]) await call('workshops.attendance', { tenantId: t, workshopId: coral.id, date: addDaysKey(today, w), present: members.slice(0, 11 + (w === -7 ? 2 : 0)).map(m => m.id) }, diretoria);
  });
  await safe('reservas', async () => {
    const salao = await gsave('spaces', { name: 'Salão nobre', capacity: 250, priceMemberCents: 60_000, priceNonMemberCents: 150_000, rules: 'Som até 23h. Limpeza por conta de quem reserva.' });
    await gsave('spaces', { name: 'Sala de ensaio', capacity: 40, priceMemberCents: 0, priceNonMemberCents: 20_000, rules: 'Uso prioritário dos grupos da sociedade.' });
    const b1 = await gsave('bookings', { spaceId: salao.id, spaceName: 'Salão nobre', eventName: 'Casamento', organizer: 'terceiro', access: 'fechado', prepDaysBefore: 2, prepDaysAfter: 2, start: iso(addDaysKey(today, 30), '18:00'), end: iso(addDaysKey(today, 30), '23:00'), requesterName: 'Família Becker (fictícia)', isMember: true, priceCents: 60_000, status: 'solicitada', contractText: 'Contrato de locação do salão (modelo).' });
    await gsave('bookings', { spaceId: salao.id, spaceName: 'Salão nobre', eventName: 'Confraternização de fim de ano', organizer: 'terceiro', access: 'fechado', prepDaysBefore: 1, prepDaysAfter: 1, start: iso(addDaysKey(today, 45), '18:00'), end: iso(addDaysKey(today, 45), '23:59'), requesterName: 'Empresa Exemplo Ltda. (fictícia)', isMember: false, priceCents: 150_000, status: 'solicitada', contractText: 'Contrato de locação do salão (modelo).' });
    // Festa da sociedade em vários dias: o período inteiro fica marcado e entra na agenda dos sócios
    const festa = await gsave('bookings', { spaceId: salao.id, spaceName: 'Salão nobre', eventName: 'Festa anual da sociedade', organizer: 'sociedade', access: 'aberto', prepDaysBefore: 2, prepDaysAfter: 2, start: iso(addDaysKey(today, 10), '17:00'), end: iso(addDaysKey(today, 14), '23:59'), requesterName: 'Diretoria social', isMember: false, priceCents: 0, status: 'solicitada', contractText: '' });
    await call('bookings.decide', { tenantId: t, bookingId: b1.id, decision: 'confirmar' }, diretoria);
    await call('bookings.decide', { tenantId: t, bookingId: festa.id, decision: 'confirmar' }, diretoria);
  });
  await safe('escala de trabalho', async () => {
    const slots = [];
    for (let d = 10; d <= 14; d++) {
      const date = addDaysKey(today, d);
      for (const [role, needed] of [['Bilheteria', 1], ['Bar', 2], ['Cozinha', 2]] as const) slots.push({ id: `s${d}${role.slice(0, 3)}`, date, start: '17:30', end: '00:00', role, needed });
    }
    const r = await call<{ id: string }>('rosters.save', { tenantId: t, title: 'Escala da festa anual', description: 'Chegar 15 minutos antes. Camiseta da sociedade.', status: 'aberta', editors: [], slots, announce: false }, diretoria);
    await call('rosters.assign', { tenantId: t, id: r.id, slotId: `s10Bil`, action: 'adicionar', name: 'Roberto Lenz (fictício)' }, diretoria);
    await call('rosters.assign', { tenantId: t, id: r.id, slotId: `s10Bar`, action: 'adicionar', name: 'Carla Weber (fictícia)' }, diretoria);
    await call('rosters.signup', { tenantId: t, id: r.id, slotId: `s11Coz` }, socio);
  });
  await safe('patrimônio', async () => {
    await gsave('assets', { code: 'TRJ-001', name: 'Traje típico feminino (conjunto)', kind: 'traje', location: 'Armário 2', condition: 'bom', valueCents: 120_000, maintenance: [], historical: false });
    const acc = await gsave('assets', { code: 'INS-004', name: 'Acordeão 80 baixos', kind: 'instrumento', location: 'Sala de música', condition: 'otimo', valueCents: 450_000, maintenance: [{ date: addDaysKey(today, -90), note: 'Revisão das palhetas' }], historical: false });
    await gsave('assets', { code: 'ACV-012', name: 'Estandarte original de fundação', kind: 'acervo', location: 'Vitrine do hall', condition: 'regular', valueCents: 0, maintenance: [], historical: true });
    await gsave('assets', { code: 'TRF-020', name: 'Troféu do festival regional de corais', kind: 'trofeu', location: 'Vitrine do hall', condition: 'otimo', valueCents: 0, maintenance: [], historical: false });
    await call('assets.loan', { tenantId: t, assetId: acc.id, to: 'Bruno Moreira (fictício)', since: addDaysKey(today, -20), due: addDaysKey(today, -2) }, diretoria);
  });
  await safe('editais, patrocínios e benefícios', async () => {
    await gsave('grants', { name: 'Edital municipal de fomento à cultura (exemplo)', sphere: 'municipal', program: 'Fundo municipal de cultura', deadline: addDaysKey(today, 21), budgetCents: 3_500_000, approvedCents: 0, status: 'em_preparacao', costCenterId: 'edital', notes: 'Projeto: oficinas de canto para crianças.' });
    await gsave('grants', { name: 'Lei estadual de incentivo (exemplo)', sphere: 'estadual', program: 'Programa de incentivo cultural', deadline: addDaysKey(today, -60), budgetCents: 8_000_000, approvedCents: 6_200_000, status: 'em_execucao', notes: 'Restauração do acervo de trajes.' });
    await gsave('sponsors', { name: 'Padaria Exemplo', tier: 'Ouro', amountCents: 300_000, contractStart: addMonthsKey(today, -2), contractEnd: addMonthsKey(today, 10), counterparts: 'Logo no telão do baile e nas redes.', ...(evIds.baile ? { eventId: evIds.baile } : {}) });
    await gsave('sponsors', { name: 'Ótica Exemplo', tier: 'Prata', amountCents: 150_000, contractStart: addMonthsKey(today, -11), contractEnd: addDaysKey(today, 20), counterparts: 'Banner no salão.' });
    await gsave('benefits', { partner: 'Livraria Exemplo', description: 'Desconto em livros e partituras para sócios em dia.', discount: '10%', active: true });
    await gsave('benefits', { partner: 'Farmácia Exemplo', description: 'Desconto em medicamentos de marca.', discount: '8%', active: true });
  });
  await safe('biblioteca, mandatos e engajamento', async () => {
    await gsave('library', { name: 'Estatuto social', folder: 'Institucional', visibility: 'publico', version: 3, kind: 'estatuto' });
    await gsave('library', { name: 'Regimento interno', folder: 'Institucional', visibility: 'socios', version: 1, kind: 'regimento' });
    await gsave('library', { name: 'Alvará de funcionamento do salão', folder: 'Certidões e alvarás', visibility: 'diretoria', version: 1, kind: 'alvara', expiresAt: addDaysKey(today, 12) });
    await gsave('library', { name: 'Seguro do prédio', folder: 'Certidões e alvarás', visibility: 'diretoria', version: 2, kind: 'seguro', expiresAt: addMonthsKey(today, 7) });
    await gsave('terms', { name: 'Gestão 2023 a 2024', start: '2023-01-01', end: '2024-12-31', current: false, board: [{ name: 'Henrique Weber', roleId: 'presidente', roleName: 'Presidente' }] });
    await gsave('honors', { title: 'Sócio de honra: 60 anos de casa', memberName: 'Nelson Hoffmann (fictício)', date: addDaysKey(today, -35), description: 'Homenagem na festa de aniversário da sociedade.' });
    const s = await gsave('surveys', { title: 'Horário dos ensaios', question: 'Qual o melhor horário para os ensaios de sábado?', options: ['Manhã', 'Tarde', 'Noite'], open: true });
    for (const [k, v] of voters.entries()) await call('surveys.vote', { tenantId: t, surveyId: s.id, optionIndex: k % 3 }, v.actor).catch(() => undefined);
  });

  // ---------- Organograma ----------
  await safe('organograma', async () => {
    const MASC = ['Bruno', 'Daniel', 'Fábio', 'Henrique', 'João', 'Lucas', 'Nelson', 'Paulo', 'Sérgio', 'Vítor', 'Otávio', 'Rafael', 'Mateus', 'Gustavo', 'Eduardo', 'Rodrigo', 'Thiago', 'Leonardo'];
    const used = new Set<string>();
    const pickBy = (masc: boolean, from = 4) => {
      const m = members.slice(from).find(x => !used.has(x.id) && MASC.includes(x.name.split(' ')[0]) === masc) || members[from];
      used.add(m.id);
      return m;
    };
    const rei = pickBy(true);
    const cavaleiro = pickBy(true);
    const dama = pickBy(false);
    const diretorTiro = pickBy(true);
    const fiscal = pickBy(false);
    const pick = (k: number) => ({ 8: diretorTiro, 10: rei, 12: cavaleiro, 13: dama, 14: fiscal } as Record<number, (typeof members)[number]>)[k] || members[k] || members[0];
    const r = await call<{ style: string; positions: { id: string; title: string; group: string; order: number; highlight: boolean }[] }>('orgchart.preset', { tenantId: t }, diretoria);
    const names: Record<string, { name: string; memberId?: string }> = {
      Presidente: { name: 'Marta Schneider', memberId: members.find(m => m.name === 'Marta Schneider')?.id },
      'Vice-presidente': { name: 'Paulo Becker (fictício)' },
      'Tesoureiro(a)': { name: 'Roberto Lenz (fictício)' },
      'Secretário(a)': { name: 'Clara Vieira (fictícia)' },
      'Diretor(a) de tiro': { name: pick(8).name, memberId: pick(8).id },
      'Rei do tiro': { name: pick(10).name, memberId: pick(10).id },
      'Rainha do tiro': { name: socio.displayName, memberId: socioMemberId },
      Cavaleiro: { name: pick(12).name, memberId: pick(12).id },
      Dama: { name: pick(13).name, memberId: pick(13).id },
      'Conselho fiscal': { name: pick(14).name, memberId: pick(14).id },
    };
    // Nome fictício sem cadastro não pode ocupar cargo que dá acesso: nesses o acesso fica desligado na demonstração
    const positions = r.positions.map(p => ({ ...p, ...(names[p.title] && !names[p.title].memberId ? { roleId: undefined } : {}), personName: names[p.title]?.name, ...(names[p.title]?.memberId ? { memberId: names[p.title]!.memberId } : {}), ...(p.title !== 'Presidente' && p.group === 'Diretoria' ? { parentId: r.positions.find(x => x.title === 'Presidente')?.id } : {}) }));
    await call('orgchart.save', { tenantId: t, style: 'corte', title: 'Diretoria e Majestades 2026', positions, showOnPublicPage: true }, diretoria);
    // A gestão atual usa os mesmos cargos e pessoas do organograma
    await gsave('terms', { name: `Gestão ${today.slice(0, 4)} a ${Number(today.slice(0, 4)) + 1}`, start: `${today.slice(0, 4)}-01-01`, end: `${Number(today.slice(0, 4)) + 1}-12-31`, current: true, board: positions.filter(p => p.group === 'Diretoria' && p.personName).map(p => ({ positionId: p.id, ...(p.memberId ? { memberId: p.memberId } : {}), name: p.personName!, roleId: (p as { roleId?: string }).roleId || p.id, roleName: p.title })) });
  });

  // ---------- Prestação de contas do mês passado (publicada no quadro) ----------
  await safe('prestação de contas', async () => {
    const last = months[2];
    await call('ledger.transfer', { tenantId: t, fromAccountId: banco, toAccountId: 'aplicacao', amountCents: 200_000, date: `${last}-20`, description: 'Aplicação da reserva da reforma' }, tesouraria);
    const lastDay = addDaysKey(`${months[3]}-01`, -1);
    await call('accountability.publish', {
      tenantId: t,
      kind: 'periodo',
      from: `${last}-01`,
      to: lastDay,
      grouping: 'historico',
      title: 'Prestação de contas do mês passado',
      notes: 'O saldo da aplicação está reservado para a reforma dos banheiros, aprovada em reunião. (Números fictícios.)',
      audience: 'socios',
      signers: [
        { name: 'Roberto Lenz (fictício)', role: 'Tesoureiro', uid: tesouraria.uid },
        { name: 'Marta Schneider', role: 'Presidente', uid: diretoria.uid },
        { name: 'Conselho fiscal', role: 'Conselho fiscal' },
      ],
      postNotice: true,
    }, tesouraria);
    const pub = await env.store.query<{ id: string }>(P.accountabilities(t), { limit: 1 });
    if (pub[0]) await call('accountability.sign', { tenantId: t, id: pub[0].id }, tesouraria);
  });

  // ---------- Notícias ----------
  await safe('notícias', async () => {
    await call('news.post', { tenantId: t, title: 'Rei e rainha do tiro 2026 coroados', summary: 'A festa do tiro reuniu sócios e famílias na sede. Parabéns às novas majestades!', body: 'A tradicional festa do tiro terminou com a coroação das majestades de 2026. Agradecemos aos voluntários da cozinha e à banda. (Texto fictício.)', visibility: 'publico', pinned: true }, secretaria);
    await call('news.post', { tenantId: t, title: 'Stand de tiro reformado', summary: 'As baias de 50 metros ganharam iluminação nova e alvos eletrônicos.', body: 'A reforma foi paga com o edital estadual e com a doação de sócios beneméritos. (Texto fictício.)', visibility: 'socios', pinned: false }, secretaria);
    if (env.news) await call('news.refresh', { tenantId: t }, diretoria);
  });

  // ---------- Competições e ranking ----------
  await safe('competições', async () => {
    const atiradores = members.slice(0, 14);
    const interno = await call<{ id: string }>('competitions.save', {
      tenantId: t,
      data: {
        name: 'Campeonato interno de carabina 2026',
        scope: 'interno',
        organizer: 'Sociedade de Tiro e Cultura Harmonia',
        season: today.slice(0, 4),
        format: 'individual',
        unit: 'pontos',
        higherIsBetter: true,
        aggregate: 'melhores',
        bestN: 3,
        pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
        categories: ['Masculino', 'Feminino'],
        stages: [
          { id: 'e1', name: '1ª etapa', date: addMonthsKey(today, -4) },
          { id: 'e2', name: '2ª etapa', date: addMonthsKey(today, -3) },
          { id: 'e3', name: '3ª etapa', date: addMonthsKey(today, -2) },
          { id: 'e4', name: '4ª etapa', date: addMonthsKey(today, -1) },
        ],
        teams: [],
        status: 'em_andamento',
        publicRanking: true,
      },
    }, diretoria);
    for (const [si, stage] of ['e1', 'e2', 'e3', 'e4'].entries()) {
      const entries = atiradores
        .filter((_, k) => (k + si) % 5 !== 0) // nem todos vão a todas as etapas
        .map((m, k) => ({ participantName: m.name, memberId: m.id, category: k % 3 === 0 ? 'Feminino' : 'Masculino', value: 70 + Math.floor(r() * 30) }));
      await call('competitions.saveResults', { tenantId: t, competitionId: interno.id, stageId: stage, entries }, diretoria);
    }
    const externo = await call<{ id: string }>('competitions.save', {
      tenantId: t,
      data: {
        name: 'Circuito regional de tiro (liga fictícia)',
        scope: 'externo',
        organizer: 'Liga Regional Exemplo (fictícia)',
        season: today.slice(0, 4),
        format: 'individual',
        unit: 'pontos',
        higherIsBetter: true,
        aggregate: 'soma',
        pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
        categories: [],
        stages: [
          { id: 'r1', name: 'Etapa 1: Cidade Vizinha A', date: addMonthsKey(today, -5) },
          { id: 'r2', name: 'Etapa 2: Cidade Vizinha B', date: addMonthsKey(today, -2) },
          { id: 'r3', name: 'Etapa 3: Cidade Exemplo', date: addMonthsKey(today, 1) },
        ],
        teams: [],
        status: 'em_andamento',
        publicRanking: false,
      },
    }, diretoria);
    for (const stage of ['r1', 'r2']) {
      const entries = atiradores.slice(0, 6).map(m => ({ participantName: m.name, memberId: m.id, value: 180 + Math.floor(r() * 60) }));
      entries.push({ participantName: 'Atirador de outro clube (fictício)', memberId: undefined as unknown as string, value: 230 });
      await call('competitions.saveResults', { tenantId: t, competitionId: externo.id, stageId: stage, entries: entries.map(e => (e.memberId ? e : { participantName: e.participantName, value: e.value })) }, diretoria);
    }
    // Bolão por times (exemplo de formato tabela)
    const bolao = await call<{ id: string }>('competitions.save', {
      tenantId: t,
      data: {
        name: 'Torneio de bolão entre sociedades',
        scope: 'externo',
        organizer: 'Liga de Bolão Exemplo (fictícia)',
        season: today.slice(0, 4),
        format: 'times',
        unit: 'pinos',
        higherIsBetter: true,
        aggregate: 'soma',
        pointsWin: 2, pointsDraw: 1, pointsLoss: 0,
        categories: [],
        stages: [{ id: 'rod1', name: '1ª rodada' }, { id: 'rod2', name: '2ª rodada' }],
        teams: [{ id: 'harmonia', name: 'Harmonia' }, { id: 'aurora', name: 'Aurora (fictício)' }, { id: 'vale', name: 'Vale Verde (fictício)' }, { id: 'uniao', name: 'União (fictício)' }],
        status: 'em_andamento',
        publicRanking: true,
      },
    }, diretoria);
    const jogos: [string, string, string, number, number][] = [
      ['rod1', 'harmonia', 'aurora', 812, 790], ['rod1', 'vale', 'uniao', 760, 775],
      ['rod2', 'harmonia', 'vale', 801, 801], ['rod2', 'aurora', 'uniao', 830, 798],
    ];
    for (const [stageId, h, a, hs, as] of jogos) {
      await call('competitions.saveMatch', { tenantId: t, competitionId: bolao.id, stageId, homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as }, diretoria);
    }
  });

  // ---------- Portaria e privacidade ----------
  await safe('portaria', async () => {
    for (const v of voters.slice(0, 6)) {
      const tok = await call<{ token: string }>('card.issue', { tenantId: t, memberId: v.id, kind: 'rotativo' }, v.actor);
      await call('portaria.checkin', { tenantId: t, token: tok.token, ...(evIds.festa ? { eventId: evIds.festa } : {}) }, portaria);
    }
    await call('portaria.checkin', { tenantId: t, token: 'codigo-invalido-de-exemplo-0000000000000000' }, portaria).catch(() => undefined);
  });
  await safe('pedido de privacidade', async () => {
    if (voters[0]) await call('privacy.request', { tenantId: t, memberId: voters[0].id, kind: 'correcao', details: 'Meu telefone mudou, por favor atualizem.' }, voters[0].actor);
  });

  // Rotinas diárias: marca vencidas, ajusta situação por adimplência, lembretes (simulados)
  await safe('rotinas', () => runDailyJobs(env, t));

  return { tenantId, slug, personas: { master, diretoria, tesouraria, portaria, socio }, warnings };
}
