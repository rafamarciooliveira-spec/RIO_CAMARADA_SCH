/** Dependentes de quem está logado: os do titular e os que ele cuida como segundo responsável (pai e mãe sócios) */
import { useMemo } from 'react';
import { useList } from '../../app/DataContext.tsx';
import { P } from '../../shared/paths.ts';
import type { MemberDoc } from '../../shared/types.ts';

export function useMyDependents(tenantId: string, memberId: string | undefined) {
  const own = useList<MemberDoc>(memberId ? P.members(tenantId) : null, memberId ? { where: [['dependentOf', '==', memberId]], limit: 20 } : undefined);
  const cared = useList<MemberDoc>(memberId ? P.members(tenantId) : null, memberId ? { where: [['guardianIds', 'array-contains', memberId]], limit: 20 } : undefined);
  const data = useMemo(() => {
    const out = [...own.data];
    for (const d of cared.data) if (!out.some(x => x.id === d.id)) out.push(d);
    // O repetido que espera a diretoria juntar não aparece duas vezes para o mesmo responsável
    return out;
  }, [own.data, cared.data]);
  return { data, loading: own.loading || cared.loading, coIds: new Set(cared.data.map(d => d.id)) };
}
