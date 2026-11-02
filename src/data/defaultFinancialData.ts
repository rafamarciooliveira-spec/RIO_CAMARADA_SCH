import { FinancialAccount, FinancialCategory } from '../types/index.ts';

export const DEFAULT_FINANCIAL_ACCOUNTS: Omit<FinancialAccount, 'id' | 'currentBalance' | 'updatedAt'>[] = [
  {
    name: 'Conta Corrente Bancária (Principal)',
    type: 'banco',
    initialBalance: 0,
    bankName: 'Banco do Brasil',
    accountNumber: 'Ag. 1234-5 / CC 98765-4',
    pixKey: 'financeiro@riocamarada.com.br',
    active: true,
  },
  {
    name: 'Caixa Físico da Secretaria',
    type: 'caixa',
    initialBalance: 0,
    active: true,
  },
];

export const DEFAULT_FINANCIAL_CATEGORIES: Omit<FinancialCategory, 'id' | 'updatedAt'>[] = [
  // Receitas
  { name: 'Mensalidades de Sócios', type: 'receita', active: true },
  { name: 'Taxa de Filiação / Inscrição', type: 'receita', active: true },
  { name: 'Inscrições em Torneios e Campeonatos', type: 'receita', active: true },
  { name: 'Locação do Estande / Estande de Tiro', type: 'receita', active: true },
  { name: 'Festas e Eventos Tradicionais', type: 'receita', active: true },
  { name: 'Doações e Patrocínios', type: 'receita', active: true },
  { name: 'Rendimento de Aplicações', type: 'receita', active: true },

  // Despesas
  { name: 'Manutenção do Estande de Tiro e Alvos', type: 'despesa', active: true },
  { name: 'Energia Elétrica e Água', type: 'despesa', active: true },
  { name: 'Segurança, Licenças e Taxas Exército/PF', type: 'despesa', active: true },
  { name: 'Troféus, Medalhas e Premiações', type: 'despesa', active: true },
  { name: 'Material de Limpeza e Conservação', type: 'despesa', active: true },
  { name: 'Serviços Contábeis e Jurídicos', type: 'despesa', active: true },
  { name: 'Sistemas e Hospedagem na Web', type: 'despesa', active: true },
  { name: 'Alimentação e Eventos da Diretoria', type: 'despesa', active: true },
];
