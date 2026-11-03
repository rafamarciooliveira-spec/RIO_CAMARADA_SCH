/** Contexto da camada de dados + sessão, e ganchos de leitura e de operação. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { DataClient, SessionApi, WithId } from '../data/client.ts';
import { errorMessage } from '../data/client.ts';
import type { QuerySpec } from '../shared/core/store.ts';
import { useToast } from '../ui/index.tsx';
import { setPdfStorageResolver } from './pdf.ts';

export interface DemoControls {
  persona: 'diretoria' | 'socio';
  setPersona(p: 'diretoria' | 'socio'): void;
  reset(): void;
}

interface Ctx {
  client: DataClient;
  session: SessionApi;
  demo?: DemoControls;
  basePath: string; // '' no real, '/ver-sistema' na demonstração
}

const DataCtx = createContext<Ctx | null>(null);

export function DataProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  // PDFs com o logo que está no Storage
  useEffect(() => {
    setPdfStorageResolver(path => value.client.publicUrl(path));
    return () => setPdfStorageResolver(null);
  }, [value.client]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData fora do DataProvider');
  return c;
}

export function useSession(): SessionApi {
  return useData().session;
}

export interface LoadState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

export function useDoc<T>(path: string | null | undefined): LoadState<WithId<T> | null> {
  const { client } = useData();
  const [state, setState] = useState<LoadState<WithId<T> | null> & { key: string | null }>({ data: null, loading: !!path, error: null, key: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, key: null });
      return;
    }
    return client.watchDoc<T>(
      path,
      d => setState({ data: d, loading: false, error: null, key: path }),
      e => setState({ data: null, loading: false, error: e.message.includes('permission') ? 'Sem permissão para ver estes dados.' : 'Não foi possível carregar.', key: path })
    );
  }, [client, path]);
  // Enquanto o caminho novo não respondeu, é "carregando" (evita um quadro sem dado e sem aviso)
  if (path && state.key !== path) return { data: null, loading: true, error: null };
  return state;
}

export function useList<T>(collectionPath: string | null | undefined, q?: QuerySpec): LoadState<WithId<T>[]> {
  const { client } = useData();
  const key = JSON.stringify(q || {});
  const [state, setState] = useState<LoadState<WithId<T>[]> & { key: string | null }>({ data: [], loading: !!collectionPath, error: null, key: null });
  const fullKey = collectionPath ? `${collectionPath}|${key}` : null;
  useEffect(() => {
    if (!collectionPath) {
      setState({ data: [], loading: false, error: null, key: null });
      return;
    }
    const k = `${collectionPath}|${key}`;
    return client.watchList<T>(
      collectionPath,
      JSON.parse(key) as QuerySpec,
      rows => setState({ data: rows, loading: false, error: null, key: k }),
      e => setState({ data: [], loading: false, error: e.message.includes('permission') ? 'Sem permissão para ver estes dados.' : 'Não foi possível carregar.', key: k })
    );
  }, [client, collectionPath, key]);
  if (fullKey && state.key !== fullKey) return { data: state.data, loading: true, error: null };
  return state;
}

/** Executa uma operação com estado de carregamento e aviso de erro/sucesso */
export function useOp() {
  const { client } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);
  const run = useCallback(
    async <T,>(op: string, input: object, opts?: { success?: string; silent?: boolean }): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await client.call<T>(op, input);
        if (opts?.success) toast.show(opts.success, 'sucesso');
        return r;
      } catch (e) {
        if (!opts?.silent) toast.show(errorMessage(e), 'erro');
        return undefined;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [client, toast]
  );
  return useMemo(() => ({ run, busy }), [run, busy]);
}

/** URL utilizável de um arquivo privado do Storage (foto do sócio, anexos) */
export function useFileUrl(path: string | null | undefined, isPublic = false): string | null {
  const { client } = useData();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    (isPublic ? client.publicUrl(path) : client.fileUrl(path)).then(u => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [client, path, isPublic]);
  return url;
}
