import { RejectionEmailTemplate } from '../types/index.ts';

export const DEFAULT_REJECTION_SUBJECT =
  'Associação {NOME_ASSOCIACAO} - Ajuste necessário no cadastro de associado';

export const DEFAULT_REJECTION_BODY = `Prezado(a) {NOME_ASSOCIADO},

Agradecemos sinceramente pelo seu interesse em fazer parte da {NOME_ASSOCIACAO}.

Nossa equipe administrativa concluiu a análise do seu formulário de filiação submetido em {DATA_SOLICITACAO}. No entanto, identificamos a seguinte pendência que impede a homologação imediata da sua carteirinha de sócio:

MOTIVO APONTADO PELA ADMINISTRAÇÃO:
"{MOTIVO_REJEICAO}"

Para regularizar sua solicitação:
1. Acesse o portal oficial da associação com seu e-mail ({EMAIL_ASSOCIADO});
2. Clique no botão "Corrigir e Reenviar Cadastro";
3. Atualize as informações ou anexe uma nova foto conforme as orientações;
4. Reenvie o formulário para aprovação prioritária da diretoria.

Caso tenha dúvidas ou precise de auxílio adicional, procure a secretaria administrativa da nossa entidade.

Atenciosamente,
Diretoria Administrativa
{NOME_ASSOCIACAO}`;

export interface TemplateVariableInfo {
  tag: string;
  label: string;
  description: string;
}

export const AVAILABLE_TEMPLATE_TAGS: TemplateVariableInfo[] = [
  { tag: '{NOME_ASSOCIADO}', label: 'Nome do Associado', description: 'Nome completo registrado' },
  { tag: '{MOTIVO_REJEICAO}', label: 'Motivo da Rejeição', description: 'Justificativa digitada pelo administrador' },
  { tag: '{NOME_ASSOCIACAO}', label: 'Nome da Associação', description: 'Nome oficial configurado na carteirinha' },
  { tag: '{DATA_SOLICITACAO}', label: 'Data da Solicitação', description: 'Data em que o sócio se cadastrou' },
  { tag: '{CPF_ASSOCIADO}', label: 'CPF do Associado', description: 'CPF mascarado ou completo' },
  { tag: '{EMAIL_ASSOCIADO}', label: 'E-mail do Associado', description: 'E-mail de contato cadastrado' },
];

export function replaceTemplateVariables(
  text?: string | null,
  vars: {
    nomeAssociado?: string;
    motivoRejeicao?: string;
    nomeAssociacao?: string;
    dataSolicitacao?: string;
    cpfAssociado?: string;
    emailAssociado?: string;
  } = {}
): string {
  if (!text || typeof text !== 'string') return '';
  const safeVars = vars || {};
  let defaultDate = 'hoje';
  try {
    defaultDate = new Date().toLocaleDateString('pt-BR');
  } catch (e) {}

  return text
    .replace(/\{NOME_ASSOCIADO\}/g, safeVars.nomeAssociado || 'Associado(a)')
    .replace(/\{MOTIVO_REJEICAO\}/g, safeVars.motivoRejeicao || 'Ajuste cadastral solicitado')
    .replace(/\{NOME_ASSOCIACAO\}/g, safeVars.nomeAssociacao || 'Associação')
    .replace(/\{DATA_SOLICITACAO\}/g, safeVars.dataSolicitacao || defaultDate)
    .replace(/\{CPF_ASSOCIADO\}/g, safeVars.cpfAssociado || '***.***.***-**')
    .replace(/\{EMAIL_ASSOCIADO\}/g, safeVars.emailAssociado || 'contato@socio.com');
}

export const INITIAL_REJECTION_TEMPLATE: RejectionEmailTemplate = {
  id: 'rejection_email',
  subject: DEFAULT_REJECTION_SUBJECT,
  body: DEFAULT_REJECTION_BODY,
  updatedAt: new Date().toISOString(),
  updatedBy: 'Sistema',
};
