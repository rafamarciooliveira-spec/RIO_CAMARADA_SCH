import { useFileUrl } from '../../app/DataContext.tsx';
import { isStoragePath } from './cardTemplate.ts';

/** Resolve a logo (chave de ícone, URL ou caminho público do Storage) para algo exibível */
export function useLogoSrc(value: string | undefined): string {
  const storage = isStoragePath(value);
  const url = useFileUrl(storage ? value : null, true);
  if (storage) return url || 'shield';
  return value || 'shield';
}
