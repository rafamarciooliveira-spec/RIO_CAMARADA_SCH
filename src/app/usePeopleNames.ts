/**
 * Nomes de pessoas a partir dos identificadores gravados nos históricos e na auditoria.
 * Registros novos já trazem o nome; os antigos são resolvidos pelo servidor (só diretoria)
 * e guardados em memória para não perguntar duas vezes.
 */
import { useEffect, useState } from 'react';
import { useData } from './DataContext.tsx';

const cache = new Map<string, string>();

export function usePeopleNames(tenantId: string, ids: (string | undefined)[]): (id: string | undefined, fallback?: string) => string {
  const { client } = useData();
  const [, bump] = useState(0);
  const missing = [...new Set(ids.filter((x): x is string => !!x && !cache.has(`${tenantId}:${x}`)))].slice(0, 60);
  const key = missing.join('|');
  useEffect(() => {
    if (!missing.length) return;
    let alive = true;
    client
      .call<{ names: Record<string, string> }>('people.names', { tenantId, ids: missing })
      .then(r => {
        for (const id of missing) cache.set(`${tenantId}:${id}`, r?.names?.[id] || '');
        if (alive) bump(n => n + 1);
      })
      .catch(() => {
        for (const id of missing) cache.set(`${tenantId}:${id}`, '');
        if (alive) bump(n => n + 1);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, tenantId, key]);
  return (id, fallback) => {
    if (!id) return fallback || '';
    if (id === 'sistema') return 'Rotina automática';
    const name = cache.get(`${tenantId}:${id}`);
    if (name) return name;
    if (name === '') return fallback || 'Pessoa sem cadastro';
    return fallback || '...';
  };
}
