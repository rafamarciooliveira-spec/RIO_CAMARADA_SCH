/**
 * Tipos de sociedade e o que cada um já traz pronto ao ser criado pelo master:
 * rótulos, cargos do organograma, palavras das notícias e o formato padrão das competições.
 * Tudo continua editável pela diretoria depois.
 */
import type { CompetitionFormat, OrgChartStyle, OrgPosition } from './types.ts';

export interface SocietyTypePreset {
  id: string;
  label: string;
  icon: string; // chave de ícone (AssociationLogos ou lucide)
  newsKeywords: string[];
  memberLabel: string;
  orgStyle: OrgChartStyle;
  positions: Omit<OrgPosition, 'id' | 'memberId' | 'personName'>[];
  competition: { format: CompetitionFormat; unit: string; higherIsBetter: boolean; label: string };
}

const DIRECAO: SocietyTypePreset['positions'] = [
  { title: 'Presidente', group: 'Diretoria', order: 1, highlight: false },
  { title: 'Vice-presidente', group: 'Diretoria', order: 2, highlight: false },
  { title: 'Tesoureiro(a)', group: 'Diretoria', order: 3, highlight: false },
  { title: 'Secretário(a)', group: 'Diretoria', order: 4, highlight: false },
  { title: 'Conselho fiscal', group: 'Conselho fiscal', order: 10, highlight: false },
];

export const SOCIETY_TYPES: SocietyTypePreset[] = [
  {
    id: 'tiro_esportivo',
    label: 'Tiro esportivo',
    icon: 'target',
    newsKeywords: ['tiro esportivo', 'clube de tiro', 'festa do tiro', 'campeonato de tiro'],
    memberLabel: 'Sócio',
    orgStyle: 'corte',
    positions: [
      ...DIRECAO,
      { title: 'Diretor(a) de tiro', group: 'Diretoria', order: 5, highlight: false },
      { title: 'Rei do tiro', group: 'Majestades', order: 20, highlight: true },
      { title: 'Rainha do tiro', group: 'Majestades', order: 21, highlight: true },
      { title: 'Cavaleiro', group: 'Majestades', order: 22, highlight: false },
      { title: 'Dama', group: 'Majestades', order: 23, highlight: false },
    ],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Ranking de tiro' },
  },
  {
    id: 'bolao',
    label: 'Bolão',
    icon: 'award',
    newsKeywords: ['bolão 23', 'bolão 16', 'campeonato de bolão', 'cancha de bolão'],
    memberLabel: 'Sócio',
    orgStyle: 'corte',
    positions: [
      ...DIRECAO,
      { title: 'Diretor(a) de bolão', group: 'Diretoria', order: 5, highlight: false },
      { title: 'Capitão do time', group: 'Equipes', order: 30, highlight: false },
      { title: 'Rei do bolão', group: 'Majestades', order: 20, highlight: true },
      { title: 'Rainha do bolão', group: 'Majestades', order: 21, highlight: true },
    ],
    competition: { format: 'individual', unit: 'pinos', higherIsBetter: true, label: 'Ranking de bolão' },
  },
  {
    id: 'futebol',
    label: 'Futebol',
    icon: 'users',
    newsKeywords: ['futebol amador', 'campeonato varzeano', 'liga de futebol amador', 'futebol regional'],
    memberLabel: 'Sócio',
    orgStyle: 'arvore',
    positions: [
      ...DIRECAO,
      { title: 'Diretor(a) de futebol', group: 'Diretoria', order: 5, highlight: false },
      { title: 'Técnico(a)', group: 'Comissão técnica', order: 30, highlight: true },
      { title: 'Auxiliar técnico', group: 'Comissão técnica', order: 31, highlight: false },
      { title: 'Capitão', group: 'Elenco', order: 40, highlight: true },
    ],
    competition: { format: 'times', unit: 'gols', higherIsBetter: true, label: 'Campeonato' },
  },
  {
    id: 'folclore',
    label: 'Folclore e danças',
    icon: 'sparkles',
    newsKeywords: ['grupo folclórico', 'danças folclóricas', 'festival de folclore', 'festa típica'],
    memberLabel: 'Dançarino(a)',
    orgStyle: 'cartoes',
    positions: [
      ...DIRECAO,
      { title: 'Coreógrafo(a)', group: 'Direção artística', order: 30, highlight: true },
      { title: 'Ensaiador(a)', group: 'Direção artística', order: 31, highlight: false },
      { title: 'Rei', group: 'Majestades', order: 20, highlight: true },
      { title: 'Rainha', group: 'Majestades', order: 21, highlight: true },
    ],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Festivais' },
  },
  {
    id: 'canto',
    label: 'Canto e coral',
    icon: 'heart',
    newsKeywords: ['coral', 'canto coral', 'encontro de corais', 'festival de corais'],
    memberLabel: 'Coralista',
    orgStyle: 'cartoes',
    positions: [...DIRECAO, { title: 'Regente', group: 'Direção artística', order: 30, highlight: true }],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Festivais' },
  },
  {
    id: 'ginastica',
    label: 'Ginástica',
    icon: 'flame',
    newsKeywords: ['ginástica', 'sociedade de ginástica', 'campeonato de ginástica'],
    memberLabel: 'Sócio',
    orgStyle: 'arvore',
    positions: [...DIRECAO, { title: 'Técnico(a)', group: 'Comissão técnica', order: 30, highlight: true }],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Ranking' },
  },
  {
    id: 'musica',
    label: 'Música e banda',
    icon: 'crown',
    newsKeywords: ['banda municipal', 'sociedade musical', 'festival de bandas'],
    memberLabel: 'Músico',
    orgStyle: 'cartoes',
    positions: [...DIRECAO, { title: 'Maestro(a)', group: 'Direção artística', order: 30, highlight: true }],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Festivais' },
  },
  {
    id: 'clube_social',
    label: 'Clube social e cultural',
    icon: 'building',
    newsKeywords: ['clube social', 'sociedade cultural', 'festa comunitária'],
    memberLabel: 'Sócio',
    orgStyle: 'arvore',
    positions: [...DIRECAO],
    competition: { format: 'individual', unit: 'pontos', higherIsBetter: true, label: 'Torneios' },
  },
];

export function societyType(id: string | undefined): SocietyTypePreset {
  return SOCIETY_TYPES.find(t => t.id === id) || SOCIETY_TYPES[SOCIETY_TYPES.length - 1];
}

export const BR_STATES = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export const STATE_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso', PA: 'Pará', PB: 'Paraíba',
  PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RO: 'Rondônia', RR: 'Roraima',
  RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};
