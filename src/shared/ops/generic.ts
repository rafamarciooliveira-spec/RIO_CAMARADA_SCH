/**
 * CRUD genérico das coleções de cadastro simples (oficinas, espaços, patrimônio, editais,
 * patrocinadores, benefícios, documentos, mandatos, homenagens, enquetes, centros de custo,
 * plano de contas, contas, agenda, tarefas, eventos e modelos de carteirinha).
 * Cada coleção tem schema Zod próprio: só os campos listados são gravados.
 * Campos calculados pelo servidor (saldo, contadores, votos) nunca vêm do cliente.
 */
import { z, type ZodTypeAny } from 'zod';
import { defineOp, fail, zCents, zColor, zDateKey, zId, zIso, zTenant, zText } from '../core/ops.ts';
import { GENERIC_COLLECTIONS, P, type GenericCollection } from '../paths.ts';
import { bookingCalendarEntry, bookingsClash } from '../bookings.ts';
import type { BookingDoc } from '../types.ts';
import type { ModuleId } from '../modules.ts';
import { tid } from './helpers.ts';

const s = zText;

export const GENERIC_SCHEMAS: Record<GenericCollection, z.ZodObject<Record<string, ZodTypeAny>>> = {
  workshops: z.object({
    name: s(120).min(2),
    kind: z.enum(['coral', 'danca', 'banda', 'teatro', 'ginastica', 'tiro', 'outro']),
    teacher: s(120),
    schedule: s(200),
    capacity: z.number().int().min(0).max(10000),
    enrolled: z.array(z.object({ memberId: zId, name: s(150) })).max(2000),
    sessions: z.array(z.object({ date: zDateKey, present: z.array(zId).max(2000) })).max(500),
    active: z.boolean(),
  }),
  spaces: z.object({
    name: s(120).min(2),
    capacity: z.number().int().min(0),
    priceMemberCents: zCents,
    priceNonMemberCents: zCents,
    rules: s(3000),
    prepDaysBefore: z.number().int().min(0).max(15).optional(),
    prepDaysAfter: z.number().int().min(0).max(15).optional(),
  }),
  bookings: z.object({
    spaceId: zId,
    spaceName: s(120),
    start: zIso,
    end: zIso,
    requesterName: s(150).min(2),
    memberId: zId.optional(),
    isMember: z.boolean(),
    priceCents: zCents,
    status: z.enum(['solicitada', 'confirmada', 'cancelada']),
    contractText: s(8000),
    eventName: s(150).optional(),
    organizer: z.enum(['sociedade', 'terceiro']).optional(),
    access: z.enum(['aberto', 'fechado']).optional(),
    prepDaysBefore: z.number().int().min(0).max(15).optional(),
    prepDaysAfter: z.number().int().min(0).max(15).optional(),
  }),
  assets: z.object({
    code: s(40),
    name: s(150).min(2),
    kind: z.enum(['traje', 'instrumento', 'trofeu', 'livro', 'equipamento', 'acervo', 'outro']),
    location: s(150),
    condition: z.enum(['otimo', 'bom', 'regular', 'ruim']),
    valueCents: zCents,
    loan: z.object({ to: s(150), memberId: zId.optional(), since: zDateKey, due: zDateKey }).nullable().optional(),
    maintenance: z.array(z.object({ date: zDateKey, note: s(300) })).max(200),
    historical: z.boolean(),
  }),
  grants: z.object({
    name: s(200).min(2),
    sphere: z.enum(['municipal', 'estadual', 'federal', 'privado']),
    program: s(200),
    deadline: zDateKey,
    budgetCents: zCents,
    approvedCents: zCents,
    status: z.enum(['em_preparacao', 'inscrito', 'aprovado', 'em_execucao', 'prestacao_de_contas', 'concluido', 'reprovado']),
    costCenterId: zId.optional(),
    notes: s(4000),
  }),
  sponsors: z.object({
    name: s(150).min(2),
    tier: s(60),
    amountCents: zCents,
    contractStart: zDateKey,
    contractEnd: zDateKey,
    counterparts: s(2000),
    eventId: zId.optional(),
  }),
  benefits: z.object({ partner: s(150).min(2), description: s(1000), discount: s(60), validUntil: zDateKey.optional(), active: z.boolean() }),
  library: z.object({
    name: s(200).min(2),
    folder: s(80),
    visibility: z.enum(['publico', 'socios', 'diretoria']),
    version: z.number().int().min(1),
    filePath: z.string().max(300).optional(),
    expiresAt: zDateKey.optional(),
    kind: z.enum(['estatuto', 'regimento', 'ata', 'certidao', 'alvara', 'seguro', 'contrato', 'outro']),
  }),
  terms: z.object({
    name: s(120).min(2),
    start: zDateKey,
    end: zDateKey,
    current: z.boolean(),
    board: z.array(z.object({ memberId: zId.optional(), name: s(150), roleId: zId, roleName: s(60) })).max(60),
  }),
  honors: z.object({ title: s(150).min(2), memberId: zId.optional(), memberName: s(150), date: zDateKey, description: s(2000) }),
  surveys: z.object({ title: s(150).min(2), question: s(500), options: z.array(s(150)).min(2).max(10), open: z.boolean() }),
  costCenters: z.object({ name: s(120).min(2), kind: z.enum(['geral', 'evento', 'projeto', 'edital']), refId: zId.optional(), active: z.boolean() }),
  chartAccounts: z.object({ code: s(20).min(1), name: s(120).min(2), kind: z.enum(['receita', 'despesa']) }),
  finAccounts: z.object({ name: s(80).min(2), type: z.enum(['caixa', 'banco', 'poupanca', 'aplicacao', 'pix', 'outro']), institution: s(60).optional(), openingBalanceCents: z.number().int(), active: z.boolean() }),
  calendar: z.object({
    title: s(150).min(2),
    description: s(2000).optional(),
    location: s(200).optional(),
    start: zIso,
    end: zIso,
    allDay: z.boolean(),
    category: s(40),
    color: zColor,
    recurrence: z.object({ freq: z.enum(['nenhuma', 'semanal', 'mensal', 'anual']), until: zDateKey.optional() }),
    visibility: z.enum(['publico', 'socios', 'diretoria']),
  }),
  tasks: z.object({
    title: s(150).min(2),
    what: s(1000),
    why: s(1000),
    where: s(300),
    when: zDateKey,
    who: s(150),
    whoUid: zId.optional(),
    how: s(2000),
    howMuchCents: zCents,
    priority: z.enum(['baixa', 'media', 'alta']),
    status: z.enum(['a_fazer', 'fazendo', 'bloqueada', 'concluida']),
    ref: z.object({ type: z.enum(['evento', 'projeto', 'ata', 'edital']), id: zId, label: s(150) }).optional(),
    attachments: z.array(z.string().max(300)).max(20),
    reminderAt: zIso.optional(),
  }),
  events: z.object({
    name: s(150).min(2),
    kind: z.enum(['evento', 'projeto']),
    description: s(4000),
    start: zIso,
    end: zIso,
    location: s(200),
    status: z.enum(['planejamento', 'confirmado', 'realizado', 'cancelado']),
    publicListing: z.boolean(),
    rsvpEnabled: z.boolean(),
    costCenterId: zId.optional(),
    budget: z.object({
      items: z.array(z.object({ id: zId, label: s(120), kind: z.enum(['receita', 'despesa']), plannedCents: zCents })).max(200),
    }),
    ticketing: z.object({
      enabled: z.boolean(),
      lots: z.array(z.object({ id: zId, name: s(60), priceCents: zCents, quantity: z.number().int().min(0) })).max(20),
    }),
    team: z.array(z.object({ name: s(150), role: s(80), volunteer: z.boolean() })).max(300),
    report: s(8000).optional(),
  }),
  cardTemplates: z.object({
    name: s(100).min(1),
    associationName: s(200).min(1),
    associationSubtitle: s(200),
    logoUrl: z.string().max(600),
    logoSize: z.number().int().min(28).max(160).optional(),
    logoPosition: z.enum(['left', 'center']).optional(),
    logoBgTransparent: z.boolean().optional(),
    infoAlignment: z.enum(['center', 'left', 'right', 'justify']).optional(),
    nameFontSize: z.enum(['sm', 'base', 'lg', 'xl', '2xl']).optional(),
    detailsFontSize: z.enum(['xs', 'sm', 'base']).optional(),
    primaryColor: zColor,
    secondaryColor: zColor,
    accentColor: zColor,
    textColor: zColor,
    orientation: z.enum(['horizontal', 'vertical']),
    backgroundPattern: z.enum(['guilloche', 'waves', 'mesh', 'geometric', 'clean']),
    showQrCode: z.boolean(),
    showPhoto: z.boolean(),
    showCpf: z.literal(false), // CPF nunca aparece na carteirinha (mínimo necessário)
    showBirthDate: z.boolean(),
    showCategory: z.boolean(),
    showSecurityStamp: z.boolean(),
    customFields: z.array(z.object({ id: zId, label: s(40), value: s(80), visible: z.boolean().optional() })).max(6),
    signatureLabel: s(80),
    roleThemes: z
      .array(
        z.object({
          id: zId,
          match: z.enum(['grupo', 'cargo']),
          value: s(120).min(1),
          primaryColor: zColor,
          secondaryColor: zColor,
          accentColor: zColor,
          textColor: zColor,
          applyColors: z.boolean().optional(),
          // Adesivo só na pasta pública de adesivos da própria sociedade
          stickerPath: z.string().max(300).regex(/^tenants\/[A-Za-z0-9_-]+\/public\/stickers\/[A-Za-z0-9._-]+$/).optional(),
        })
      )
      .max(12)
      .optional(),
    showHonors: z.boolean().optional(),
    isDefault: z.boolean(),
  }),
};

/** Valores iniciais de campos calculados pelo servidor */
const SERVER_DEFAULTS: Partial<Record<GenericCollection, (data: Record<string, unknown>) => Record<string, unknown>>> = {
  finAccounts: d => ({ balanceCents: d.openingBalanceCents || 0 }),
  events: d => ({ rsvpCount: 0, checkinCount: 0, ...(d.ticketing ? { ticketing: withSold(d.ticketing, new Map()) } : {}) }),
  surveys: d => ({ counts: (d.options as string[]).map(() => 0) }),
  tasks: () => ({ comments: [] }),
};

function withSold(ticketing: unknown, sold: Map<string, number>) {
  const tk = ticketing as { enabled: boolean; lots: { id: string }[] };
  return { ...tk, lots: (tk.lots || []).map(l => ({ ...l, sold: sold.get(l.id) || 0 })) };
}

const zCollection = z.enum(Object.keys(GENERIC_COLLECTIONS) as [GenericCollection, ...GenericCollection[]]);

export const genericSave = defineOp({
  name: 'generic.save',
  input: zTenant.extend({ collection: zCollection, id: zId.optional(), data: z.record(z.string(), z.unknown()) }),
  auth: 'user',
  tenant: { perm: null },
  idempotent: true,
  async run(ctx, input) {
    const t = tid(ctx);
    const cfg = GENERIC_COLLECTIONS[input.collection];
    const module = cfg.module as ModuleId;
    if (ctx.tenant!.modules?.[module] === false) fail('failed-precondition', 'Este módulo está desligado nesta sociedade.');
    ctx.require(module, input.id ? 'editar' : 'criar');
    const schema = GENERIC_SCHEMAS[input.collection];
    const parsed = (input.id ? schema.partial() : schema).safeParse(input.data);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      fail('invalid-argument', `Campo ${i.path.join('.')}: ${i.message}`);
    }
    const data = parsed.data as Record<string, unknown>;
    let bookingBefore: BookingDoc | null = null;
    if (input.collection === 'bookings') {
      if (input.id) {
        bookingBefore = await ctx.store.get<BookingDoc>(`${cfg.path(t)}/${input.id}`);
        if (bookingBefore?.status === 'cancelada') fail('failed-precondition', 'Reserva cancelada não se edita. Crie uma nova.');
        // A situação só muda pela confirmação ou cancelamento (bookings.decide)
        delete data.status;
      } else {
        // Toda reserva nasce solicitada; confirmar é com quem aprova
        data.status = 'solicitada';
      }
      const merged = { ...(bookingBefore || {}), ...data } as BookingDoc;
      if (merged.start && merged.end) {
        if (String(merged.end) <= String(merged.start)) fail('invalid-argument', 'O fim precisa ser depois do início.');
        // Bloqueio de conflito no mesmo espaço, contando os dias de preparação (montagem e desmontagem)
        const same = await ctx.store.query<BookingDoc>(cfg.path(t), { where: [['spaceId', '==', merged.spaceId]] });
        const clash = same.find(b => b.id !== input.id && b.data.status !== 'cancelada' && bookingsClash(b.data, merged));
        if (clash) fail('already-exists', `Já existe reserva neste espaço nesse período (${clash.data.eventName || clash.data.requesterName}), contando os dias de preparação.`);
      }
    }
    if (input.collection === 'terms' && data.current === true) {
      const others = await ctx.store.query(cfg.path(t), { where: [['current', '==', true]] });
      for (const o of others) if (o.id !== input.id) await ctx.store.update(o.path, { current: false });
    }
    if (input.id) {
      const path = `${cfg.path(t)}/${input.id}`;
      // Ingressos vendidos (sold) são do servidor: editar os lotes nunca zera a contagem
      if (input.collection === 'events' && data.ticketing) {
        const cur = await ctx.store.get<{ ticketing?: { lots?: { id: string; sold?: number }[] } }>(path);
        data.ticketing = withSold(data.ticketing, new Map((cur?.ticketing?.lots || []).map(l => [l.id, l.sold || 0])));
      }
      if (!(await ctx.store.get(path))) fail('not-found', 'Registro não encontrado.');
      await ctx.store.update(path, { ...data, updatedAt: ctx.nowIso });
      // Reserva confirmada editada: a agenda acompanha
      if (bookingBefore?.status === 'confirmada') {
        await ctx.store.set(`${P.calendar(t)}/bkg_${input.id}`, { ...bookingCalendarEntry(input.id, { ...bookingBefore, ...data } as BookingDoc, ctx.nowIso) });
      }
      await ctx.audit(`${input.collection}.updated`, input.id);
      return { id: input.id };
    }
    const id = ctx.store.newId();
    const extra = SERVER_DEFAULTS[input.collection]?.(data) || {};
    await ctx.store.set(`${cfg.path(t)}/${id}`, { ...data, ...extra, id, createdAt: ctx.nowIso, updatedAt: ctx.nowIso, createdBy: ctx.actor!.uid });
    await ctx.audit(`${input.collection}.created`, id);
    return { id };
  },
});

/** Coleções cujo apagamento é proibido ou controlado por outra regra */
const NO_DELETE: GenericCollection[] = ['finAccounts', 'chartAccounts'];

export const genericDelete = defineOp({
  name: 'generic.delete',
  input: zTenant.extend({ collection: zCollection, id: zId }),
  auth: 'user',
  tenant: { perm: null },
  async run(ctx, input) {
    const t = tid(ctx);
    const cfg = GENERIC_COLLECTIONS[input.collection];
    ctx.require(cfg.module as ModuleId, 'editar');
    if (NO_DELETE.includes(input.collection)) fail('failed-precondition', 'Contas e plano de contas não são apagados; desative em vez disso.');
    if (input.collection === 'cardTemplates' && input.id === 'padrao') fail('failed-precondition', 'O modelo padrão não pode ser apagado.');
    await ctx.store.delete(`${cfg.path(t)}/${input.id}`);
    await ctx.audit(`${input.collection}.deleted`, input.id);
    return { ok: true };
  },
});

export const genericOps = [genericSave, genericDelete];
