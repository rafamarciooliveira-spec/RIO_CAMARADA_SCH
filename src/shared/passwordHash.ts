/**
 * Senha da entrada por CPF: além da conta de login (Firebase), o servidor guarda um hash próprio
 * (PBKDF2-SHA256, sal aleatório) para conferir a senha antes de devolver o e-mail interno da conta.
 * WebCrypto: funciona no Node e no navegador (demonstração), sem rede.
 */
const ITER = 120_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iter, salt, hash] = (stored || '').split('$');
  if (kind !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = await derive(password, unb64(salt), Number(iter));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Senha fácil demais (que qualquer um adivinha): recusa com o motivo */
export function weakPassword(password: string, cpfDigits: string): string | null {
  const p = password;
  if (p.trim().length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (p.length > 64) return 'A senha pode ter no máximo 64 caracteres.';
  if (/^(.)\1+$/.test(p)) return 'Não use o mesmo número ou letra repetido (como 111111).';
  if ('01234567890123456789'.includes(p) || '98765432109876543210'.includes(p)) return 'Não use números em sequência (como 123456).';
  if (cpfDigits && (cpfDigits.includes(p) || p.includes(cpfDigits.slice(0, 6)))) return 'Não use números do seu CPF na senha.';
  return null;
}
