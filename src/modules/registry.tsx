/**
 * Registro das telas do portal (lazy loading por módulo). O menu é montado daqui,
 * filtrado pelas permissões do papel e pelos módulos ligados na sociedade.
 * Para adicionar uma tela: crie o arquivo e acrescente a entrada abaixo.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Crown,
  FileSignature,
  FileText,
  Gift,
  Handshake,
  Home,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Trophy,
  Network,
  Music,
  Package,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  Ticket,
  User,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Action, ModuleId } from '../shared/modules.ts';

export interface PageDef {
  path: string;
  label: string;
  icon: LucideIcon;
  area: 'socio' | 'diretoria';
  module?: ModuleId; // módulo que precisa estar ligado
  perm?: [ModuleId, Action]; // permissão exigida (diretoria)
  needsMember?: boolean; // exige cadastro de sócio vinculado
  element: LazyExoticComponent<ComponentType>;
}

const L = (f: () => Promise<{ default: ComponentType }>) => lazy(f);

export const PAGES: PageDef[] = [
  // ----- Área do sócio -----
  { path: 'inicio', label: 'Início', icon: Home, area: 'socio', element: L(() => import('./member-area/MemberHome.tsx')) },
  { path: 'carteirinha', label: 'Carteirinha', icon: BadgeCheck, area: 'socio', needsMember: true, element: L(() => import('./card/CardPage.tsx')) },
  { path: 'meu-financeiro', label: 'Financeiro', icon: Wallet, area: 'socio', module: 'financeiro', needsMember: true, element: L(() => import('./finance/MyFinancePage.tsx')) },
  { path: 'avisos', label: 'Avisos', icon: Megaphone, area: 'socio', module: 'avisos', element: L(() => import('./notices/NoticesPage.tsx')) },
  { path: 'agenda', label: 'Agenda', icon: CalendarDays, area: 'socio', module: 'agenda', element: L(() => import('./calendar/CalendarPage.tsx')) },
  { path: 'eventos', label: 'Eventos', icon: Ticket, area: 'socio', module: 'eventos', element: L(() => import('./events/MemberEventsPage.tsx')) },
  { path: 'votacoes', label: 'Votações', icon: Vote, area: 'socio', module: 'votacoes', needsMember: true, element: L(() => import('./governance/MemberVotesPage.tsx')) },
  { path: 'noticias', label: 'Notícias', icon: Newspaper, area: 'socio', module: 'noticias', element: L(() => import('./news/NewsPage.tsx')) },
  { path: 'ranking', label: 'Competições e ranking', icon: Trophy, area: 'socio', module: 'competicoes', element: L(() => import('./competitions/RankingPage.tsx')) },
  { path: 'organograma', label: 'Organograma', icon: Network, area: 'socio', module: 'organograma', element: L(() => import('./orgchart/OrgChartPage.tsx')) },
  { path: 'documentos', label: 'Documentos', icon: FileText, area: 'socio', module: 'documentos', element: L(() => import('./culture/LibraryPage.tsx')) },
  { path: 'beneficios', label: 'Benefícios', icon: Gift, area: 'socio', module: 'patrocinios', element: L(() => import('./culture/BenefitsPage.tsx')) },
  { path: 'dependentes', label: 'Dependentes', icon: Users, area: 'socio', needsMember: true, element: L(() => import('./member-area/DependentsPage.tsx')) },
  { path: 'perfil', label: 'Meu perfil e privacidade', icon: User, area: 'socio', element: L(() => import('./member-area/ProfilePage.tsx')) },

  // ----- Área da diretoria -----
  { path: 'gestao', label: 'Painel da gestão', icon: LayoutDashboard, area: 'diretoria', perm: ['socios', 'ver'], element: L(() => import('./board/BoardDashboard.tsx')) },
  { path: 'socios', label: 'Sócios', icon: Users, area: 'diretoria', perm: ['socios', 'ver'], element: L(() => import('./members/MembersPage.tsx')) },
  { path: 'portaria', label: 'Portaria', icon: ScanLine, area: 'diretoria', perm: ['portaria', 'ver'], element: L(() => import('./portaria/PortariaPage.tsx')) },
  { path: 'financeiro', label: 'Financeiro', icon: Landmark, area: 'diretoria', module: 'financeiro', perm: ['financeiro', 'ver'], element: L(() => import('./finance/FinancePage.tsx')) },
  { path: 'gestao-eventos', label: 'Eventos e projetos', icon: Ticket, area: 'diretoria', module: 'eventos', perm: ['eventos', 'ver'], element: L(() => import('./events/EventsPage.tsx')) },
  { path: 'plano-de-acao', label: 'Plano de ação', icon: ClipboardList, area: 'diretoria', module: 'tarefas', perm: ['tarefas', 'ver'], element: L(() => import('./tasks/TasksPage.tsx')) },
  { path: 'atas', label: 'Atas e assembleias', icon: ScrollText, area: 'diretoria', module: 'atas', perm: ['atas', 'ver'], element: L(() => import('./governance/MinutesPage.tsx')) },
  { path: 'gestao-votacoes', label: 'Votações e eleições', icon: Vote, area: 'diretoria', module: 'votacoes', perm: ['votacoes', 'ver'], element: L(() => import('./governance/ElectionsPage.tsx')) },
  { path: 'gestao-avisos', label: 'Comunicação', icon: Megaphone, area: 'diretoria', module: 'avisos', perm: ['avisos', 'criar'], element: L(() => import('./notices/NoticesAdminPage.tsx')) },
  { path: 'oficinas', label: 'Grupos e oficinas', icon: Music, area: 'diretoria', module: 'oficinas', perm: ['oficinas', 'ver'], element: L(() => import('./culture/WorkshopsPage.tsx')) },
  { path: 'reservas', label: 'Reserva de espaços', icon: Building2, area: 'diretoria', module: 'reservas', perm: ['reservas', 'ver'], element: L(() => import('./culture/BookingsPage.tsx')) },
  { path: 'patrimonio', label: 'Patrimônio e acervo', icon: Package, area: 'diretoria', module: 'patrimonio', perm: ['patrimonio', 'ver'], element: L(() => import('./culture/AssetsPage.tsx')) },
  { path: 'editais', label: 'Incentivos e editais', icon: FileSignature, area: 'diretoria', module: 'editais', perm: ['editais', 'ver'], element: L(() => import('./culture/GrantsPage.tsx')) },
  { path: 'patrocinios', label: 'Patrocínios e benefícios', icon: Handshake, area: 'diretoria', module: 'patrocinios', perm: ['patrocinios', 'ver'], element: L(() => import('./culture/SponsorsPage.tsx')) },
  { path: 'gestao-documentos', label: 'Biblioteca de documentos', icon: BookOpen, area: 'diretoria', module: 'documentos', perm: ['documentos', 'editar'], element: L(() => import('./culture/LibraryAdminPage.tsx')) },
  { path: 'mandatos', label: 'Gestões e mandatos', icon: Crown, area: 'diretoria', module: 'mandatos', perm: ['mandatos', 'ver'], element: L(() => import('./culture/TermsPage.tsx')) },
  { path: 'engajamento', label: 'Engajamento', icon: Award, area: 'diretoria', module: 'engajamento', perm: ['engajamento', 'ver'], element: L(() => import('./culture/EngagementPage.tsx')) },
  { path: 'modelo-carteirinha', label: 'Modelo da carteirinha', icon: BadgeCheck, area: 'diretoria', perm: ['carteirinha', 'editar'], element: L(() => import('./card/CardDesignPage.tsx')) },
  { path: 'privacidade', label: 'Pedidos de privacidade', icon: ShieldCheck, area: 'diretoria', perm: ['pii', 'ver'], element: L(() => import('./privacy/PrivacyAdminPage.tsx')) },
  { path: 'configuracoes', label: 'Configurações', icon: Settings, area: 'diretoria', perm: ['sociedade', 'ver'], element: L(() => import('./settings/SettingsPage.tsx')) },
  { path: 'auditoria', label: 'Auditoria', icon: ShieldCheck, area: 'diretoria', perm: ['auditoria', 'ver'], element: L(() => import('./settings/AuditPage.tsx')) },
];
