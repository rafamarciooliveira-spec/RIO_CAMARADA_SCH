/**
 * Telefone como chave do primeiro acesso. A pessoa pode digitar com ou sem DDD, com ou sem o 9 da frente,
 * com +55 ou com zero: a chave usa só os 8 últimos números (o resto varia de um jeito para outro).
 * O código de 6 números é que garante quem é; o telefone só encontra o cadastro.
 */
export function phoneDigits(raw: string | undefined): string {
  let d = String(raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d;
}

/** Os 8 últimos números (vazio quando não dá para usar) */
export function phoneTail(raw: string | undefined): string {
  const d = phoneDigits(raw);
  return d.length >= 8 ? d.slice(-8) : '';
}

/** Número para o link do WhatsApp (55 + DDD + número), ou vazio se não tiver DDD */
export function whatsappNumber(raw: string | undefined): string {
  const d = phoneDigits(raw);
  return d.length === 10 || d.length === 11 ? `55${d}` : '';
}
