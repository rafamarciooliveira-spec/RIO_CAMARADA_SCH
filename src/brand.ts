/**
 * Marca da plataforma num único lugar: trocar nome, domínio e textos aqui, sem refatoração.
 * Nome escolhido em 04/11/2026: Verein ("associação" em alemão), sugestão do Rafael.
 */
export const BRAND = {
  name: 'Verein',
  domain: 'verein.app', // TODO(decisão): registrar o domínio e trocar no Vercel e no Firebase
  tagline: 'Tradição que se organiza.',
  description: 'Plataforma para sociedades culturais: sócios, carteirinha digital, financeiro, eventos, atas e votações, com a identidade de cada sociedade.',
  supportEmail: 'contato@verein.app', // TODO(decisão): e-mail real de contato
  legalName: 'Verein', // TODO(JURÍDICO): razão social e CNPJ da operadora
  demoPath: '/ver-sistema',
  /**
   * Endereço próprio de uma sociedade: quem abre o domínio cai direto no portal dela (com a marca dela),
   * sem passar pela página da plataforma. A plataforma continua em /plataforma e /master.
   */
  hostTenants: { 'riocamarada.vercel.app': 'riocamarada' } as Record<string, string>,
  year: 2026,
};
