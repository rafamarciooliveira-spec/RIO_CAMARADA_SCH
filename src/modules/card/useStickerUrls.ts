/** Endereços públicos das imagens dos adesivos (guardadas na pasta pública da sociedade) */
import { useEffect, useState } from 'react';
import { useData } from '../../app/DataContext.tsx';

export function useStickerUrls(paths: string[]): string[] {
  const { client } = useData();
  const key = paths.join('|');
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    if (!paths.length) {
      setUrls([]);
      return;
    }
    Promise.all(paths.map(p => client.publicUrl(p).catch(() => null))).then(list => alive && setUrls(list.filter(Boolean) as string[]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  return urls;
}
