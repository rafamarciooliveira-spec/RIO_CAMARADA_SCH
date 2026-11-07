/**
 * Módulos, ações e papéis padrão. Fonte única da matriz de permissões:
 * usada pelo servidor (ops), pelas regras (via perms denormalizadas na membership) e pela interface.
 */

export const ACTIONS = ['ver', 'criar', 'editar', 'aprovar', 'exportar'] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULES = [
  { id: 'sociedade', label: 'Sociedade e identidade', core: true },
  { id: 'papeis', label: 'Papéis e convites', core: true },
  { id: 'socios', label: 'Sócios', core: true },
  { id: 'pii', label: 'Dados pessoais (CPF)', core: true },
  { id: 'carteirinha', label: 'Carteirinha', core: true },
  { id: 'portaria', label: 'Portaria', core: true },
  { id: 'avisos', label: 'Avisos', core: false },
  { id: 'agenda', label: 'Agenda', core: false },
  { id: 'financeiro', label: 'Financeiro', core: false },
  { id: 'eventos', label: 'Eventos e projetos', core: false },
  { id: 'escalas', label: 'Escalas de trabalho', core: false },
  { id: 'tarefas', label: 'Plano de ação', core: false },
  { id: 'atas', label: 'Atas e assembleias', core: false },
  { id: 'votacoes', label: 'Votações e eleições', core: false },
  { id: 'oficinas', label: 'Grupos e oficinas', core: false },
  { id: 'reservas', label: 'Reserva de espaços', core: false },
  { id: 'patrimonio', label: 'Patrimônio e acervo', core: false },
  { id: 'editais', label: 'Incentivos e editais', core: false },
  { id: 'patrocinios', label: 'Patrocinadores e benefícios', core: false },
  { id: 'documentos', label: 'Biblioteca de documentos', core: false },
  { id: 'mandatos', label: 'Gestões e mandatos', core: false },
  { id: 'engajamento', label: 'Engajamento', core: false },
  { id: 'noticias', label: 'Notícias', core: false },
  { id: 'competicoes', label: 'Competições e ranking', core: false },
  { id: 'organograma', label: 'Organograma', core: false },
  { id: 'auditoria', label: 'Auditoria', core: true },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];
export const MODULE_IDS = MODULES.map(m => m.id) as ModuleId[];

/** perms[modulo] = ações permitidas */
export type Perms = Partial<Record<ModuleId, Action[]>>;

const ALL: Action[] = [...ACTIONS];
const VIEW: Action[] = ['ver'];

function every(actions: Action[], except: ModuleId[] = []): Perms {
  const p: Perms = {};
  for (const m of MODULE_IDS) if (!except.includes(m)) p[m] = [...actions];
  return p;
}

export interface RoleTemplate {
  id: string;
  name: string;
  perms: Perms;
  board: boolean; // faz parte da diretoria (aparece na área da diretoria)
}

export const DEFAULT_ROLES: RoleTemplate[] = [
  { id: 'presidente', name: 'Presidente', board: true, perms: every(ALL) },
  { id: 'vice', name: 'Vice-presidente', board: true, perms: every(ALL) },
  {
    id: 'tesoureiro',
    name: 'Tesoureiro(a)',
    board: true,
    perms: {
      ...every(VIEW, ['pii', 'auditoria', 'papeis']),
      financeiro: ALL,
      socios: ['ver', 'exportar'],
      eventos: ['ver', 'editar'],
      escalas: ['ver', 'editar'],
      patrocinios: ALL,
      editais: ['ver', 'editar'],
      reservas: ['ver', 'editar', 'aprovar'],
    },
  },
  {
    id: 'secretario',
    name: 'Secretário(a)',
    board: true,
    perms: {
      ...every(VIEW, ['auditoria']),
      socios: ALL,
      pii: ['ver'],
      carteirinha: ALL,
      papeis: ['ver', 'criar'],
      avisos: ALL,
      agenda: ALL,
      atas: ALL,
      votacoes: ['ver', 'criar', 'editar'],
      documentos: ALL,
      mandatos: ALL,
      engajamento: ALL,
      noticias: ALL,
      organograma: ALL,
      tarefas: ALL,
      eventos: ['ver', 'editar'],
      escalas: ALL,
      oficinas: ALL,
    },
  },
  {
    id: 'conselho_fiscal',
    name: 'Conselho fiscal',
    board: true,
    perms: {
      ...every(VIEW, ['pii', 'papeis']),
      financeiro: ['ver', 'exportar'],
      socios: ['ver'],
      auditoria: ['ver'],
    },
  },
  {
    id: 'diretor_eventos',
    name: 'Diretor(a) de eventos e cultura',
    board: true,
    perms: {
      ...every(VIEW, ['pii', 'auditoria', 'papeis', 'financeiro']),
      eventos: ALL,
      escalas: ALL,
      tarefas: ALL,
      agenda: ALL,
      competicoes: ALL,
      noticias: ['ver', 'criar', 'editar'],
      avisos: ['ver', 'criar', 'editar'],
      oficinas: ALL,
      reservas: ALL,
      patrimonio: ALL,
      editais: ALL,
      patrocinios: ['ver', 'criar', 'editar'],
      portaria: ['ver', 'criar'],
      financeiro: ['ver'],
    },
  },
  { id: 'portaria', name: 'Portaria', board: false, perms: { portaria: ['ver', 'criar'], eventos: ['ver'], escalas: ['ver'] } },
  { id: 'socio', name: 'Sócio(a)', board: false, perms: {} },
];

export function mergePerms(list: Perms[]): Perms {
  const out: Perms = {};
  for (const p of list) {
    for (const [m, acts] of Object.entries(p) as [ModuleId, Action[]][]) {
      const set = new Set([...(out[m] || []), ...acts]);
      out[m] = ACTIONS.filter(a => set.has(a));
    }
  }
  return out;
}

export function can(perms: Perms | undefined | null, module: ModuleId, action: Action = 'ver'): boolean {
  // Papéis criados antes das escalas existirem: valem as permissões de Eventos
  if (module === 'escalas' && perms && !perms.escalas) return !!perms.eventos?.includes(action);
  return !!perms?.[module]?.includes(action);
}

export function isBoard(perms: Perms | undefined | null): boolean {
  if (!perms) return false;
  return Object.entries(perms).some(([m, a]) => m !== 'portaria' && (a?.length || 0) > 0);
}

/** Módulos que dependem de outro (desligar um não pode quebrar o outro) */
export const DEFAULT_ENABLED_MODULES: ModuleId[] = MODULE_IDS;
