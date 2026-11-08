/**
 * Aniversariantes: uma pessoa aparece uma vez só (o dependente incluído pelo pai e pela mãe enquanto a
 * diretoria não junta os cadastros) e cada linha diz se é sócio ou dependente, e de quem
 * ("Filho(a) de Rafael Oliveira"), para facilitar a mensagem de feliz aniversário.
 */
import { useDoc } from '../../app/DataContext.tsx';
import { useTenant } from '../../app/TenantContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberDoc } from '../../shared/types.ts';
import { dependentText } from '../../shared/birthdays.ts';

export { uniqueBirthdays } from '../../shared/birthdays.ts';

/** Quem é: sócio (rótulo da sociedade) ou dependente de quem */
export function WhoTag({ m, known }: { m: MemberDoc; known?: Map<string, string> }) {
  const t = useTenant();
  const hid = m.dependentOf;
  const gid = m.guardianIds?.[0];
  const holder = useDoc<MemberDoc>(hid && !known?.has(hid) ? P.member(t.tenantId, hid) : null);
  const other = useDoc<MemberDoc>(gid && !known?.has(gid) ? P.member(t.tenantId, gid) : null);
  if (!hid) return <span className="text-xs text-muted">{t.labels.member}</span>;
  const h = known?.get(hid) || holder.data?.fullName;
  const o = gid ? known?.get(gid) || other.data?.fullName : undefined;
  return <span className="text-xs text-muted">{dependentText(m, h, o)}</span>;
}
