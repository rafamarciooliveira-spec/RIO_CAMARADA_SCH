/** Cargo e papel com o mesmo nome (Secretário(a), Secretária, secretario...): o cargo sugere o acesso do papel */
const norm = (x: string) =>
  x
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\((a|o|as|os)\)/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // feminino e masculino contam igual: tira a última vogal a/o de cada palavra (secretária = secretário, diretora = diretor)
    .replace(/([a-z]{3,})[ao]\b/g, '$1');

export function sameRoleName(title: string, roleName: string): boolean {
  return !!title && !!roleName && norm(title) === norm(roleName);
}

export function roleForTitle<R extends { id: string; name: string }>(title: string, roles: R[]): R | undefined {
  return roles.find(r => r.id !== 'socio' && sameRoleName(title, r.name));
}
