/**
 * Modelo de dados do Sodalis (contrato único entre front, servidor, regras, seed e demo).
 *
 * Convenções:
 * - Todo dado de sociedade fica em tenants/{tenantId}/...; caminhos em `paths` abaixo.
 * - Datas-hora em ISO 8601 UTC gravadas pelo servidor (ctx.now). Datas puras em "AAAA-MM-DD".
 * - Dinheiro em centavos inteiros (campos terminados em Cents).
 * - Cliente nunca escreve direto no Firestore: toda escrita passa por uma operação (src/shared/ops).
 *   As regras só liberam leitura, por papel e por dono do dado.
 */
import type { Action, ModuleId, Perms } from './modules.ts';

export type ISODateTime = string;
export type DateKey = string; // AAAA-MM-DD

// ---------- Plataforma ----------
export interface PlanDoc {
  id: string;
  name: string;
  maxMembers: number;
  modules: ModuleId[];
  priceCents: number; // legado (valor fixo); a cobrança atual é por sócio
  pricePerMemberCents?: number; // por sócio titular ativo, por mês
  minMonthlyCents?: number; // valor mínimo do mês
  description?: string;
  highlights?: string[]; // o que o plano inclui, para a tela da sociedade
  stripePriceMonthly?: string; // id do preço no Stripe (por sócio, mensal)
  stripePriceAnnual?: string; // id do preço no Stripe (por sócio, anual com desconto)
  active: boolean;
}

/** planRequests/{id}: pedido de troca de plano feito pela diretoria, decidido pela plataforma */
export interface PlanRequestDoc {
  id: string;
  tenantId: string;
  tenantName: string;
  fromPlanId: string;
  toPlanId: string;
  period: 'mensal' | 'anual';
  note?: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  byUid: string;
  at: ISODateTime;
  decidedBy?: string;
  decidedAt?: ISODateTime;
  reason?: string;
}

/** tenants/{t}/billing/current: assinatura (gravada só pelo servidor e pelo aviso do Stripe) */
export interface BillingDoc {
  provider: 'manual' | 'stripe';
  status: 'sem_assinatura' | 'ativa' | 'atrasada' | 'cancelada';
  period: 'mensal' | 'anual';
  customerId?: string;
  subscriptionId?: string;
  quantity?: number;
  currentPeriodEnd?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SlugDoc {
  tenantId: string;
  redirectTo?: string; // slug novo quando este foi trocado (o antigo fica bloqueado)
  reservedAt: ISODateTime;
}

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  tenants: Record<string, { name: string; slug: string }>;
  updatedAt: ISODateTime;
}

export interface SupportAccessDoc {
  tenantId: string;
  masterUid: string;
  reason: string;
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
}

// ---------- Sociedade (documento público: sem dado pessoal) ----------
export type TenantStatus = 'ativa' | 'suspensa';

export interface Branding {
  logoUrl: string; // URL pública (Storage tenants/{t}/public/...) ou chave de ícone padrão
  faviconUrl?: string;
  coverUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: 'Inter' | 'Merriweather' | 'Playfair Display' | 'Montserrat' | 'Lora';
  theme: 'escuro' | 'claro';
}

export interface Labels {
  member: string; // sócio | associado | membro
  members: string;
  fee: string; // mensalidade | anuidade | contribuição
  board: string; // diretoria | conselho
  card: string; // carteirinha | credencial
}

export const DEFAULT_LABELS: Labels = {
  member: 'Sócio',
  members: 'Sócios',
  fee: 'Mensalidade',
  board: 'Diretoria',
  card: 'Carteirinha',
};

export interface TenantDoc {
  id: string;
  name: string;
  slug: string;
  shortName?: string;
  status: TenantStatus;
  planId: string;
  modules: Partial<Record<ModuleId, boolean>>;
  branding: Branding;
  labels: Labels;
  publicPage: {
    enabled: boolean;
    about: string;
    history: string;
    city: string;
    foundedYear?: number;
    socials: { instagram?: string; facebook?: string; site?: string; whatsapp?: string };
    contactEmail?: string;
  };
  loginMethods: { google: boolean; emailLink: boolean };
  timezone: string;
  societyType?: string; // id de SOCIETY_TYPES (tiro_esportivo, bolao, futebol, folclore...)
  federationId?: string; // filial de uma federação
  region?: TenantRegion;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MemberCategory {
  id: string;
  name: string;
  feeCents: number;
  period: 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'isento';
  allowsDependents: boolean;
}

export interface CustomFieldDef {
  id: string;
  label: string;
  type: 'texto' | 'numero' | 'data' | 'opcao';
  options?: string[];
  required: boolean;
  sensitive: boolean; // marcado quando o admin cria campo de saúde, religião, política etc.
}

/** tenants/{t}/config/settings: lido pela diretoria */
export interface TenantSettings {
  categories: MemberCategory[];
  customFields: CustomFieldDef[];
  membershipPrefix: string;
  nextMembershipNumber: number;
  validityMonths: number;
  approvalRequired: boolean;
  gracePeriodDays: number; // dias após vencimento até "em atraso"
  suspendAfterDays: number; // dias em atraso até suspender a carteirinha
  lateFeeBps: number;
  interestBpsMonth: number;
  dueDay: number; // dia de vencimento padrão das mensalidades
  pixKey?: string; // chave Pix da sociedade (pública por natureza, exibida ao sócio)
  doubleApprovalAboveCents: number; // 0 = desligado
  showPhotoOnValidation: boolean;
  cardDownloadValidity?: '24h' | 'mes' | 'ano'; // até quando vale o QR da carteirinha baixada ou impressa
  cardRequiresPhoto?: boolean; // sem foto, a carteirinha não é emitida (padrão: sim)
  showMembershipNumber?: boolean; // mostrar o número do sócio para os sócios (padrão: não, para evitar disputa por número baixo)
  memberMenuHidden?: string[]; // páginas da área do sócio escondidas pela diretoria
  dependentRules?: import('./dependents.ts').DependentRules; // dependente na mensalidade e limites de idade
  modalities?: string[]; // modalidades da sociedade (tiro, dado, futebol society...); vazio = sugestão do tipo
  competitionKinds?: string[]; // tipos de competição (torneio, campeonato, copa...)
  retentionYears: { financeiro: number; atas: number; inativos: number };
  emailTemplates: Record<string, { subject: string; body: string }>;
  activeCardTemplateId: string;
  updatedAt: ISODateTime;
}

// ---------- Papéis e acesso ----------
export interface RoleDoc {
  id: string;
  name: string;
  perms: Perms;
  board: boolean;
  system: boolean;
  updatedAt: ISODateTime;
}

/** tenants/{t}/memberships/{uid}: consultado pelas regras (revogação imediata) */
export interface MembershipDoc {
  uid: string;
  email: string;
  displayName: string;
  roleIds: string[];
  perms: Perms; // união das permissões dos papéis, recalculada pelo servidor
  board: boolean;
  memberId?: string; // vínculo com o cadastro de sócio, quando houver
  active: boolean;
  support?: { reason: string; masterUid: string }; // acesso temporário de suporte da plataforma
  expiresAtMs?: number; // acesso de suporte expira sozinho (as regras conferem)
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface InviteDoc {
  id: string;
  emailLower: string;
  roleIds: string[];
  memberId?: string;
  tokenHash: string;
  expiresAt: ISODateTime;
  createdBy: string;
  createdAt: ISODateTime;
  usedAt?: ISODateTime;
  usedBy?: string;
  revokedAt?: ISODateTime;
}

// ---------- Sócios ----------
export const MEMBER_STATUSES = ['pendente', 'aprovado', 'ativo', 'em_atraso', 'suspenso', 'desligado', 'rejeitado'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  ativo: 'Ativo',
  em_atraso: 'Em atraso',
  suspenso: 'Suspenso',
  desligado: 'Desligado',
  rejeitado: 'Ajuste solicitado',
};

/** tenants/{t}/members/{id}: perfil básico (sem CPF, contato ou endereço) */
export interface MemberDoc {
  id: string;
  uid?: string; // conta vinculada
  fullName: string;
  displayName: string; // nome reduzido para a validação
  categoryId: string;
  categoryName: string;
  status: MemberStatus;
  statusReason?: string; // nunca motivo financeiro em texto exposto à portaria
  membershipNumber?: string;
  joinedAt?: DateKey;
  validUntil?: DateKey;
  photoPath?: string; // Storage privado
  birthMonthDay?: string; // "MM-DD" para aniversariantes
  isMinor: boolean;
  guardianMemberId?: string;
  dependentOf?: string;
  changePending?: boolean; // há pedido de alteração esperando a diretoria
  birthYear?: number; // ano de nascimento (com birthMonthDay dá a idade, sem abrir os dados pessoais)
  ageAlerts?: string[]; // avisos de idade já enviados (ex.: "paga_2027", "limite_2030")
  memberSinceYear?: number; // ano em que entrou na sociedade (informado; vale mais que a data de aprovação no sistema)
  groups: string[];
  custom: Record<string, string>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** tenants/{t}/members/{id}/changes/{c}: alteração pedida pelo sócio depois de aprovado; só vale quando a diretoria aprova */
export interface MemberChangeDoc {
  kind: 'dados' | 'remover';
  fullName?: string;
  birthDate?: DateKey;
  cpfEnc?: string; // CPF novo cifrado; a tela só vê o mascarado
  cpfMasked?: string;
  before: { fullName: string; birthDate?: DateKey; cpfMasked?: string };
  note?: string;
  status: 'pendente' | 'aprovado' | 'recusado';
  byUid: string;
  at: ISODateTime;
  decidedBy?: string;
  decidedAt?: ISODateTime;
  reason?: string;
}

/** tenants/{t}/members/{id}/private/pii: acesso restrito (módulo pii) e ao próprio sócio */
export interface MemberPiiDoc {
  cpfEnc?: string; // AES-256-GCM (base64 iv+cipher)
  cpfHmac?: string; // índice cego por sociedade (deduplicação)
  cpfMasked?: string; // ***.456.789-**
  birthDate?: DateKey;
  email?: string;
  phone?: string;
  socials?: { instagram?: string; facebook?: string }; // redes sociais do sócio (opcional)
  address?: { street?: string; number?: string; district?: string; city?: string; state?: string; zip?: string };
  guardian?: { name: string; email?: string; phone?: string; cpfMasked?: string; consentAt?: ISODateTime };
  consents: ConsentRecord[];
  updatedAt: ISODateTime;
}

export interface ConsentRecord {
  purpose: 'cadastro' | 'imagem' | 'comunicacao' | 'marketing';
  legalBasis: 'execucao_contrato' | 'consentimento' | 'obrigacao_legal' | 'legitimo_interesse';
  granted: boolean;
  termsVersion: string;
  at: ISODateTime;
}

export interface MemberHistoryDoc {
  from: MemberStatus | null;
  to: MemberStatus;
  reason?: string;
  byUid: string;
  at: ISODateTime;
}

// ---------- Carteirinha ----------
export type CardTokenKind = 'rotativo' | 'download';

/** tenants/{t}/cardTokens/{sha256(token)}: só o servidor lê e escreve */
export interface CardTokenDoc {
  memberId: string;
  kind: CardTokenKind;
  expiresAt: ISODateTime;
  createdAt: ISODateTime;
  revoked?: boolean;
}

export type VerifyStatus = 'valido' | 'invalido' | 'expirado' | 'suspenso';

/** Resposta pública da validação: o mínimo, nada além */
export interface VerifyResult {
  status: VerifyStatus;
  tenantName: string;
  displayName?: string;
  categoryName?: string;
  validUntil?: DateKey;
  photoUrl?: string; // URL assinada de curta duração, só se a sociedade permitir
  checkedAt: ISODateTime;
}

export interface CheckinDoc {
  id: string;
  memberId?: string;
  displayName?: string;
  result: VerifyStatus;
  eventId?: string;
  byUid: string;
  at: ISODateTime;
}

// ---------- Comunicação ----------
export interface NoticeDoc {
  id: string;
  title: string;
  body: string;
  audience: { all: boolean; categoryIds: string[]; groups: string[]; boardOnly: boolean };
  pinned: boolean;
  publishAt: ISODateTime;
  expiresAt?: ISODateTime;
  channels: ('app' | 'push' | 'email')[];
  requireReadConfirmation: boolean;
  readCount: number;
  createdBy: string;
  createdAt: ISODateTime;
  /** agendado = publishAt no futuro; a rotina diária publica e notifica */
  status?: 'agendado' | 'publicado';
  attachments?: { path: string; name: string }[];
  deliveredAt?: ISODateTime;
  updatedAt?: ISODateTime;
}

/** notices/{id}/reads/{uid}: confirmação de leitura (uma por pessoa) */
export interface NoticeReadDoc {
  uid: string;
  memberId?: string;
  displayName: string;
  at: ISODateTime;
}

/** icsTokens/{sha256(token)}: feed de agenda pessoal, revogável (só o servidor lê) */
export interface IcsTokenDoc {
  uid: string;
  createdAt: ISODateTime;
}

export interface NotificationDoc {
  id: string;
  uid: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: ISODateTime;
}

export type CalendarVisibility = 'publico' | 'socios' | 'diretoria';

export interface CalendarEntryDoc {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: ISODateTime;
  end: ISODateTime;
  allDay: boolean;
  category: string;
  color: string;
  recurrence: { freq: 'nenhuma' | 'semanal' | 'mensal' | 'anual'; until?: DateKey };
  visibility: CalendarVisibility;
  source: 'manual' | 'evento' | 'cobranca' | 'assembleia' | 'reserva' | 'oficina';
  sourceId?: string;
  createdAt: ISODateTime;
}

// ---------- Financeiro ----------
export interface FinAccountDoc {
  id: string;
  name: string;
  type: 'caixa' | 'banco' | 'pix';
  openingBalanceCents: number;
  balanceCents: number; // mantido pelo servidor
  active: boolean;
}

export interface ChartAccountDoc {
  id: string;
  code: string;
  name: string;
  kind: 'receita' | 'despesa';
}

export interface CostCenterDoc {
  id: string;
  name: string;
  kind: 'geral' | 'evento' | 'projeto' | 'edital';
  refId?: string;
  active: boolean;
}

/** tenants/{t}/ledger/{id}: imutável. Correção só por estorno (novo lançamento com reversalOf). */
export interface LedgerEntryDoc {
  id: string;
  number: number; // sequencial por sociedade
  date: DateKey;
  periodKey: string; // AAAA-MM
  accountId: string;
  direction: 'entrada' | 'saida';
  amountCents: number; // sempre positivo
  chartAccountId: string;
  costCenterId?: string;
  description: string;
  counterparty?: string;
  attachments: string[];
  chargeId?: string;
  eventId?: string;
  transferId?: string;
  reversalOf?: string;
  reversedBy?: string;
  status: 'lancado' | 'aguardando_aprovacao' | 'recusado';
  rejectedReason?: string; // motivo da recusa na dupla aprovação
  approvals: { uid: string; at: ISODateTime }[];
  createdBy: string;
  createdAt: ISODateTime;
}

export interface PeriodDoc {
  id: string; // AAAA-MM
  closed: boolean;
  closedAt?: ISODateTime;
  closedBy?: string;
  totals?: { inCents: number; outCents: number };
  history?: { action: 'fechado' | 'reaberto'; uid: string; at: ISODateTime; reason?: string }[];
}

export type ChargeStatus = 'aberta' | 'paga' | 'vencida' | 'cancelada';

export interface ChargeDoc {
  id: string;
  memberId: string;
  memberUid?: string;
  memberName: string;
  description: string;
  competence?: string; // AAAA-MM
  kind: 'recorrente' | 'avulsa';
  amountCents: number;
  discountCents: number;
  dueDate: DateKey;
  status: ChargeStatus;
  paidAt?: ISODateTime;
  paidAmountCents?: number;
  lateFeeCents?: number;
  interestCents?: number;
  method?: 'pix' | 'boleto' | 'dinheiro' | 'transferencia' | 'cartao';
  provider?: { name: string; externalId: string; pixCopyPaste?: string; boletoUrl?: string; boletoLine?: string };
  ledgerEntryId?: string;
  receiptNumber?: number;
  items?: { label: string; amountCents: number }[]; // composição: titular e cada dependente
  reminders: { at: ISODateTime; kind: string }[];
  cancelReason?: string;
  canceledAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface StatementLineDoc {
  id: string;
  accountId: string;
  date: DateKey;
  amountCents: number; // positivo entrada, negativo saída
  memo: string;
  fitId: string;
  matchedEntryId?: string;
  importedAt: ISODateTime;
}

// ---------- Eventos, tarefas, atas ----------
export interface EventDoc {
  id: string;
  name: string;
  kind: 'evento' | 'projeto';
  description: string;
  start: ISODateTime;
  end: ISODateTime;
  location: string;
  status: 'planejamento' | 'confirmado' | 'realizado' | 'cancelado';
  publicListing: boolean;
  rsvpEnabled: boolean;
  costCenterId?: string;
  budget: { items: { id: string; label: string; kind: 'receita' | 'despesa'; plannedCents: number }[] };
  ticketing: { enabled: boolean; lots: { id: string; name: string; priceCents: number; quantity: number; sold: number }[] };
  team: { name: string; role: string; volunteer: boolean }[];
  rsvpCount: number;
  checkinCount: number;
  report?: string;
  createdAt: ISODateTime;
}

export interface EventGuestDoc {
  id: string;
  name: string;
  kind: 'socio' | 'convidado' | 'ingresso';
  memberId?: string;
  uid?: string;
  lotId?: string;
  ticketCode?: string; // hash do código do ingresso
  checkedInAt?: ISODateTime;
  createdAt: ISODateTime;
}

export type TaskStatus = 'a_fazer' | 'fazendo' | 'bloqueada' | 'concluida';

export interface TaskDoc {
  id: string;
  title: string;
  what: string;
  why: string;
  where: string;
  when: DateKey; // prazo
  who: string; // nome do responsável
  whoUid?: string;
  how: string;
  howMuchCents: number;
  priority: 'baixa' | 'media' | 'alta';
  status: TaskStatus;
  ref?: { type: 'evento' | 'projeto' | 'ata' | 'edital'; id: string; label: string };
  comments: { uid: string; name: string; text: string; at: ISODateTime }[];
  attachments: string[];
  reminderAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AssemblyDoc {
  id: string;
  title: string;
  kind: 'ordinaria' | 'extraordinaria' | 'reuniao_diretoria';
  date: ISODateTime;
  location: string;
  noticeText: string; // edital de convocação
  agenda: string[];
  quorumPercent: number;
  status: 'convocada' | 'realizada' | 'cancelada';
  attendanceCount: number;
  eligibleCount: number;
  minuteId?: string;
  createdAt: ISODateTime;
}

export interface MinuteDoc {
  id: string;
  number: string; // ex.: 012/2026
  title: string;
  assemblyId?: string;
  body: string;
  version: number;
  status: 'rascunho' | 'em_assinatura' | 'aprovada' | 'publicada';
  deliberations: { id: string; text: string; taskId?: string }[];
  signers: { uid: string; name: string; role: string }[];
  signatures: { uid: string; name: string; role: string; at: ISODateTime; contentHash: string }[];
  contentHash?: string; // SHA-256 do texto aprovado
  published: boolean;
  createdBy: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------- Votações ----------
export interface ElectionDoc {
  id: string;
  title: string;
  description: string;
  kind: 'eleicao' | 'votacao';
  options: { id: string; label: string; detail?: string }[];
  opensAt: ISODateTime;
  closesAt: ISODateTime;
  eligibility: { requireUpToDate: boolean; categoryIds: string[]; minMonths: number };
  status: 'rascunho' | 'aberta' | 'encerrada';
  votersCount: number;
  results?: Record<string, number>;
  blankCount?: number;
  createdAt: ISODateTime;
}

/** elections/{id}/voters/{memberId}: registra QUE votou; o conteúdo do voto fica em ballots sem vínculo */
export interface VoterDoc {
  votedAt: ISODateTime;
}

export interface BallotDoc {
  optionId: string | null; // null = branco
}

// ---------- Módulos culturais (genéricos) ----------
export interface WorkshopDoc {
  id: string;
  name: string;
  kind: 'coral' | 'danca' | 'banda' | 'teatro' | 'ginastica' | 'tiro' | 'outro';
  teacher: string;
  schedule: string;
  capacity: number;
  enrolled: { memberId: string; name: string }[];
  sessions: { date: DateKey; present: string[] }[];
  active: boolean;
  createdAt: ISODateTime;
}

export interface SpaceDoc {
  id: string;
  name: string;
  capacity: number;
  priceMemberCents: number;
  priceNonMemberCents: number;
  rules: string;
}

export interface BookingDoc {
  id: string;
  spaceId: string;
  spaceName: string;
  start: ISODateTime;
  end: ISODateTime;
  requesterName: string;
  memberId?: string;
  isMember: boolean;
  priceCents: number;
  status: 'solicitada' | 'confirmada' | 'cancelada';
  contractText: string;
  createdAt: ISODateTime;
}

export interface AssetDoc {
  id: string;
  code: string;
  name: string;
  kind: 'traje' | 'instrumento' | 'trofeu' | 'livro' | 'equipamento' | 'acervo' | 'outro';
  location: string;
  condition: 'otimo' | 'bom' | 'regular' | 'ruim';
  valueCents: number;
  loan?: { to: string; memberId?: string; since: DateKey; due: DateKey; alertedAt?: ISODateTime };
  maintenance: { date: DateKey; note: string }[];
  loanHistory?: { to: string; memberId?: string; since: DateKey; due: DateKey; returnedAt: DateKey; note?: string }[];
  historical: boolean;
  createdAt: ISODateTime;
}

export interface GrantDoc {
  id: string;
  name: string;
  sphere: 'municipal' | 'estadual' | 'federal' | 'privado';
  program: string;
  deadline: DateKey;
  budgetCents: number;
  approvedCents: number;
  status: 'em_preparacao' | 'inscrito' | 'aprovado' | 'em_execucao' | 'prestacao_de_contas' | 'concluido' | 'reprovado';
  costCenterId?: string;
  notes: string;
  createdAt: ISODateTime;
}

export interface SponsorDoc {
  id: string;
  name: string;
  tier: string;
  amountCents: number;
  contractStart: DateKey;
  contractEnd: DateKey;
  counterparts: string;
  eventId?: string;
  createdAt: ISODateTime;
}

export interface BenefitDoc {
  id: string;
  partner: string;
  description: string;
  discount: string;
  validUntil?: DateKey;
  active: boolean;
}

export interface LibraryDocDoc {
  id: string;
  name: string;
  folder: string;
  visibility: 'publico' | 'socios' | 'diretoria';
  version: number;
  filePath?: string;
  expiresAt?: DateKey; // certidões, alvarás, seguros
  kind: 'estatuto' | 'regimento' | 'ata' | 'certidao' | 'alvara' | 'seguro' | 'contrato' | 'outro';
  expiryAlertFor?: DateKey; // marcação da rotina: alerta de vencimento já enviado para esta data
  updatedAt: ISODateTime;
}

export interface TermDoc {
  id: string;
  name: string; // ex.: Gestão 2025-2027
  start: DateKey;
  end: DateKey;
  current: boolean;
  board: { memberId?: string; name: string; roleId: string; roleName: string }[];
}

export interface HonorDoc {
  id: string;
  title: string;
  memberId?: string;
  memberName: string;
  date: DateKey;
  description: string;
}

export interface SurveyDoc {
  id: string;
  title: string;
  question: string;
  options: string[];
  counts: number[];
  open: boolean;
  showNames?: boolean; // lista de presença: todos veem quem escolheu cada opção
  allowChange?: boolean; // a pessoa pode mudar a resposta
  closesAt?: ISODateTime;
  createdBy?: string;
  createdAt: ISODateTime;
}

// ---------- Privacidade, auditoria, agregados ----------
export interface PrivacyRequestDoc {
  id: string;
  memberId: string;
  uid: string;
  kind: 'acesso' | 'correcao' | 'portabilidade' | 'eliminacao' | 'revogacao';
  details: string;
  status: 'aberta' | 'em_analise' | 'concluida' | 'negada';
  response?: string;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime;
}

/** tenants/{t}/audit/{id}: append-only, sem PII em texto aberto (só ids) */
export interface AuditDoc {
  id: string;
  action: string;
  actorUid: string;
  targetId?: string;
  details?: Record<string, string | number | boolean>;
  at: ISODateTime;
}

export interface DashboardStats {
  members: Partial<Record<MemberStatus, number>> & { total: number };
  newThisMonth: number;
  finance: { balanceCents: number; monthInCents: number; monthOutCents: number; overdueCents: number; overdueCount: number };
  updatedAt: ISODateTime;
}

export type { Action, ModuleId, Perms };

// ---------- Tipo da sociedade, notícias, competições e organograma ----------

/** Região usada nas notícias (cidade e UF) */
export interface TenantRegion {
  city: string;
  state: string; // UF
}

/** tenants/{t}/config/news: o que buscar nas notícias externas */
export interface NewsConfig {
  enabled: boolean;
  keywords: string[]; // começam pelas do tipo da sociedade
  includeRegion: boolean; // acrescenta cidade/estado à busca
  blockedSources: string[]; // fontes que a diretoria não quer mostrar
  updatedAt: ISODateTime;
}

/** tenants/{t}/news/{id}: notícia da própria sociedade (interna) ou manchete externa (só título, fonte e link) */
export interface NewsItemDoc {
  id: string;
  kind: 'interna' | 'externa';
  title: string;
  summary?: string; // interna: texto curto; externa: vazio (não reproduzimos conteúdo de terceiros)
  body?: string; // só interna
  url?: string; // só externa
  source?: string; // nome do veículo (externa)
  imagePath?: string; // interna: imagem no Storage público da sociedade
  publishedAt: ISODateTime;
  pinned: boolean;
  hidden: boolean; // diretoria esconde manchete externa indesejada
  visibility: 'publico' | 'socios';
  query?: string; // busca que trouxe a manchete
  createdAt: ISODateTime;
}

export type CompetitionFormat = 'individual' | 'times';

/** tenants/{t}/competitions/{id} */
export interface CompetitionDoc {
  id: string;
  name: string;
  scope: 'interno' | 'externo'; // torneio da casa ou etapas de liga/federação
  organizer: string; // ex.: a própria sociedade, a liga regional, a federação estadual
  season: string; // ex.: 2026
  format: CompetitionFormat;
  unit: string; // pontos, pinos, gols, tempo...
  higherIsBetter: boolean;
  aggregate: 'soma' | 'media' | 'melhores'; // como somar as etapas no ranking geral
  bestN?: number; // quando aggregate = melhores
  pointsWin: number; // formato times
  pointsDraw: number;
  pointsLoss: number;
  categories: string[]; // ex.: Masculino, Feminino, Sênior (vazio = categoria única)
  stages: { id: string; name: string; date?: DateKey; location?: string }[];
  teams: { id: string; name: string }[]; // formato times
  status: 'planejada' | 'em_andamento' | 'encerrada';
  publicRanking: boolean;
  federationChampionshipId?: string; // vale para o campeonato da federação
  modality?: string; // ex.: Tiro, Dado, Futebol society
  kind?: string; // ex.: Torneio, Campeonato, Copa, Festa do Rei
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** tenants/{t}/competitions/{id}/results/{id}: resultado de um participante numa etapa (formato individual) */
export interface CompetitionResultDoc {
  id: string;
  stageId: string;
  participantName: string;
  memberId?: string;
  category?: string;
  value: number; // na unidade da competição (tempo em segundos)
  notes?: string;
  createdAt: ISODateTime;
}

/** tenants/{t}/competitions/{id}/matches/{id}: jogo (formato times) */
export interface CompetitionMatchDoc {
  id: string;
  stageId?: string; // rodada
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  date?: DateKey;
  location?: string;
  createdAt: ISODateTime;
}

export type OrgChartStyle = 'arvore' | 'cartoes' | 'corte';

export interface OrgPosition {
  id: string;
  title: string; // Presidente, Rei do tiro, Técnico...
  group: string; // Diretoria, Majestades, Comissão técnica...
  order: number;
  highlight: boolean; // destaque visual (coroa, cartão maior)
  memberId?: string;
  personName?: string; // nome exibido (pode ser alguém sem cadastro)
  parentId?: string; // estilo árvore
  since?: DateKey;
  roleId?: string; // papel de acesso que vai junto com o cargo
}

/** tenants/{t}/mandates/{id}: mandato encerrado (galeria de ex-ocupantes) */
export interface MandateDoc {
  positionId: string;
  title: string;
  memberId: string | null;
  personName: string;
  from: DateKey | null;
  to: DateKey;
  note?: string;
  at: ISODateTime;
}

/** tenants/{t}/orgchart/current */
export interface OrgChartDoc {
  style: OrgChartStyle;
  title: string; // ex.: Diretoria e Majestades 2026
  positions: OrgPosition[];
  showOnPublicPage: boolean;
  updatedAt: ISODateTime;
}

// ---------- Federação (várias sociedades como filiais) ----------

/** federations/{f}: só o servidor lê e grava; a diretoria da federação vê tudo por operações */
export interface FederationDoc {
  id: string;
  name: string;
  slug: string;
  tenantIds: string[];
  adminEmails: string[]; // diretoria da federação (e-mail verificado da conta Google)
  networkCard: boolean; // carteirinha de uma filial aceita na portaria das outras
  pricePerMemberCents: number; // cobrança por sócio titular ativo somando as filiais
  primaryColor: string;
  status: 'ativa' | 'suspensa';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** federations/{f}/championships/{id}: campeonato que soma as etapas disputadas nas filiais */
export interface FedChampionshipDoc {
  id: string;
  name: string;
  season: string;
  unit: string;
  higherIsBetter: boolean;
  aggregate: 'soma' | 'media' | 'melhores';
  bestN?: number;
  status: 'planejada' | 'em_andamento' | 'encerrada';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** federations/{f}/transfers/{id}: sócio que muda de filial (pedido pela origem, aprovado pelo destino) */
export interface FedTransferDoc {
  id: string;
  fromTenantId: string;
  fromTenantName: string;
  toTenantId: string;
  toTenantName: string;
  memberId: string;
  memberName: string; // nome reduzido
  dependents: number;
  note?: string;
  status: 'pendente' | 'concluida' | 'recusada';
  requestedBy: string;
  requestedAt: ISODateTime;
  decidedBy?: string;
  decidedAt?: ISODateTime;
  reason?: string;
  newMemberId?: string;
}

/** tenants/{t}/handbook/current: manual do sócio (direitos, deveres, regras) */
export interface HandbookDoc {
  title: string;
  intro?: string;
  sections: { id: string; title: string; body: string }[];
  pdfPath?: string; // PDF opcional (só sócios leem)
  requireAck: boolean; // pede "Li e estou ciente"
  version: number; // 0 = rascunho nunca publicado
  publishedAt?: ISODateTime;
  versions: { version: number; at: ISODateTime; note?: string }[];
  updatedAt: ISODateTime;
  updatedBy: string;
}
