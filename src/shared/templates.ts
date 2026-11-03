/** Modelos de texto com variáveis {nome}, {sociedade} etc. (e-mails, avisos, documentos). */

export function replaceVars(text: string, vars: Record<string, string>): string {
  return String(text || '').replace(/\{([a-zA-Z_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export const EMAIL_TEMPLATES: Record<string, { label: string; subject: string; body: string; vars: string[] }> = {
  convite: {
    label: 'Convite de acesso',
    subject: 'Convite para acessar {sociedade}',
    body: 'Olá!\n\nVocê foi convidado(a) para acessar o portal da {sociedade} como {papel}.\nAbra o link para aceitar (vale até {validade}):\n{link}\n\nSe você não esperava este convite, ignore esta mensagem.',
    vars: ['sociedade', 'papel', 'link', 'validade'],
  },
  aprovacao: {
    label: 'Cadastro aprovado',
    subject: 'Seu cadastro na {sociedade} foi aprovado',
    body: 'Olá, {nome}!\n\nSeu cadastro foi aprovado. Sua carteirinha já está disponível no portal:\n{link}\n\nDiretoria da {sociedade}',
    vars: ['nome', 'sociedade', 'link'],
  },
  ajuste: {
    label: 'Ajuste no cadastro',
    subject: 'Ajuste necessário no seu cadastro na {sociedade}',
    body: 'Olá, {nome}.\n\nPrecisamos de um ajuste no seu cadastro:\n{motivo}\n\nAcesse o portal para corrigir: {link}\n\nDiretoria da {sociedade}',
    vars: ['nome', 'sociedade', 'motivo', 'link'],
  },
  cobranca: {
    label: 'Cobrança disponível',
    subject: '{descricao} da {sociedade}',
    body: 'Olá, {nome}.\n\nSua cobrança "{descricao}" de {valor} vence em {vencimento}.\nPague pelo portal com Pix copia e cola: {link}\n\nDiretoria da {sociedade}',
    vars: ['nome', 'sociedade', 'descricao', 'valor', 'vencimento', 'link'],
  },
  lembrete: {
    label: 'Lembrete de vencimento',
    subject: 'Lembrete: {descricao} vence em {vencimento}',
    body: 'Olá, {nome}.\n\nLembramos que "{descricao}" ({valor}) vence em {vencimento}.\n{link}\n\nDiretoria da {sociedade}',
    vars: ['nome', 'sociedade', 'descricao', 'valor', 'vencimento', 'link'],
  },
  aviso: {
    label: 'Novo aviso',
    subject: '{titulo}',
    body: '{texto}\n\nVeja no portal: {link}\n\n{sociedade}',
    vars: ['titulo', 'texto', 'link', 'sociedade'],
  },
  recibo: {
    label: 'Recibo de pagamento',
    subject: 'Recibo nº {numero} da {sociedade}',
    body: 'Olá, {nome}.\n\nRecebemos {valor} referente a "{descricao}" em {data}.\nO recibo está disponível no portal: {link}\n\n{sociedade}',
    vars: ['nome', 'sociedade', 'numero', 'valor', 'descricao', 'data', 'link'],
  },
};
