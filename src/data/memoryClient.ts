/**
 * Camada de dados da demonstração "Ver sistema": tudo em memória, no navegador.
 * Não importa o SDK do Firebase, não faz chamada de rede e não tem credencial.
 * As operações são as MESMAS do servidor (src/shared/ops), rodando sobre um MemoryStore.
 */
import { memoryAuthAdmin } from '../shared/core/memoryAuth.ts';
import { MemoryStore } from '../shared/core/memoryStore.ts';
import { executeOp, OpError, type Actor, type Env } from '../shared/core/ops.ts';
import { createWebCrypto, ephemeralKeys, simulatedMail } from '../shared/core/ports.ts';
import { createSandboxPayments } from '../shared/core/sandboxPayments.ts';
import { registerAllOps } from '../shared/ops/index.ts';
import { createDemoNews } from './demoNews.ts';
import type { QuerySpec } from '../shared/core/store.ts';
import type { DataClient, WithId } from './client.ts';
import { ClientError } from './client.ts';

export interface MemoryBackend {
  store: MemoryStore;
  env: Env;
  files: Map<string, string>; // caminho -> data URL
  actor: Actor | null;
  setActor(a: Actor | null): void;
}

export function createMemoryBackend(appUrl: string): MemoryBackend {
  registerAllOps();
  const store = new MemoryStore();
  const crypto = createWebCrypto(ephemeralKeys());
  const files = new Map<string, string>();
  const backend: MemoryBackend = {
    store,
    files,
    actor: null,
    setActor(a) {
      backend.actor = a;
    },
    env: {
      store,
      crypto,
      mail: simulatedMail,
      payments: createSandboxPayments(crypto, 'demo-sem-segredo'),
      files: {
        async signedUrl(path) {
          return files.get(path) || null;
        },
        async remove(path) {
          files.delete(path);
        },
      },
      news: createDemoNews(),
      authAdmin: memoryAuthAdmin(),
      now: () => new Date(),
      appUrl,
      demo: true,
    },
  };
  return backend;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function createMemoryClient(backend: MemoryBackend): DataClient {
  const { store } = backend;
  return {
    mode: 'demo',
    async call<T>(op: string, input: object): Promise<T> {
      try {
        // Pequena espera para a interface mostrar o estado de carregamento como no real
        await new Promise(r => setTimeout(r, 120));
        return (await executeOp(backend.env, { op, input, actor: backend.actor, ip: '127.0.0.1' })) as T;
      } catch (e) {
        if (e instanceof OpError) throw new ClientError(e.code, e.message);
        throw new ClientError('erro', (e as Error).message);
      }
    },
    async get<T>(path: string) {
      const d = store.getSync<T>(path);
      return d ? ({ ...d, id: path.split('/').pop()! } as WithId<T>) : null;
    },
    async list<T>(collectionPath: string, q?: QuerySpec) {
      return store.querySync<T>(collectionPath, q).map(r => ({ ...r.data, id: r.id }) as WithId<T>);
    },
    watchDoc<T>(path: string, cb: (d: WithId<T> | null) => void) {
      const emit = () => {
        const d = store.getSync<T>(path);
        cb(d ? ({ ...d, id: path.split('/').pop()! } as WithId<T>) : null);
      };
      emit();
      return store.subscribe(emit);
    },
    watchList<T>(collectionPath: string, q: QuerySpec | undefined, cb: (rows: WithId<T>[]) => void) {
      let last = '';
      const emit = () => {
        const rows = store.querySync<T>(collectionPath, q).map(r => ({ ...r.data, id: r.id }) as WithId<T>);
        const sig = JSON.stringify(rows);
        if (sig === last) return;
        last = sig;
        cb(rows);
      };
      emit();
      return store.subscribe(emit);
    },
    async upload(path: string, blob: Blob) {
      backend.files.set(path, await blobToDataUrl(blob));
    },
    async fileUrl(path: string) {
      return backend.files.get(path) || null;
    },
    async enablePush() {
      return 'demo' as const;
    },
    async disablePush() {},
    async pushState() {
      return 'demo' as const;
    },
    async publicUrl(path: string) {
      if (/^https?:|^data:/.test(path)) return path;
      return backend.files.get(path) || null;
    },
  };
}
