import { FinancialAccount, FinancialCategory } from '../types/index.ts';

export const DEFAULT_FINANCIAL_ACCOUNTS: FinancialAccount[] = [
  {
    id: 'acc_banco_principal',
    name: 'Conta Corrente Bancária (Principal)',
    type: 'banco',
    initialBalance: 0,
    currentBalance: 0,
    bankName: 'Banco do Brasil',
    accountNumber: 'Ag. 1234-5 / CC 98765-4',
    pixKey: 'financeiro@riocamarada.com.br',
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'acc_caixa_fisico',
    name: 'Caixa Físico da Secretaria',
    type: 'caixa',
    initialBalance: 0,
    currentBalance: 0,
    active: true,
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_FINANCIAL_CATEGORIES: FinancialCategory[] = [
  // Receitas
  { id: 'cat_mensalidades', name: 'Mensalidades de Sócios', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_filiacao', name: 'Taxa de Filiação / Inscrição', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_torneios', name: 'Inscrições em Torneios e Campeonatos', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_locacao', name: 'Locação do Estande / Estande de Tiro', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_festas', name: 'Festas e Eventos Tradicionais', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_doacoes', name: 'Doações e Patrocínios', type: 'receita', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_rendimentos', name: 'Rendimento de Aplicações', type: 'receita', active: true, updatedAt: new Date().toISOString() },

  // Despesas
  { id: 'cat_manutencao', name: 'Manutenção do Estande de Tiro e Alvos', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_energia', name: 'Energia Elétrica e Água', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_seguranca', name: 'Segurança, Licenças e Taxas Exército/PF', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_trofeus', name: 'Troféus, Medalhas e Premiações', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_limpeza', name: 'Material de Limpeza e Conservação', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_contabil', name: 'Serviços Contábeis e Jurídicos', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_sistemas', name: 'Sistemas e Hospedagem na Web', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
  { id: 'cat_eventos_dir', name: 'Alimentação e Eventos da Diretoria', type: 'despesa', active: true, updatedAt: new Date().toISOString() },
];

