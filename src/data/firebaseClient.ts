/**
 * Implementação Firebase da camada de dados. Só este arquivo (e firebaseSession.ts) importam o SDK.
 * Com VITE_USE_EMULATORS=true conecta no Emulator Suite local (dados simulados do seed).
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getBlob, getDownloadURL, getStorage, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { BRAND } from '../brand.ts';
import type { QuerySpec } from '../shared/core/store.ts';
import type { DataClient, PushState, WithId } from './client.ts';
import { ClientError } from './client.ts';

export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';
export const FUNCTIONS_REGION = 'southamerica-east1';

/** Aberto pelo atalho da tela inicial (app instalado), e não numa aba do navegador */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (navigator as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Login do Google pela própria origem: só no app instalado e nos endereços preparados */
export function sameOriginAuth(): boolean {
  return isStandalone() && BRAND.authProxyHosts.includes(location.host);
}

let app: FirebaseApp;
let db: Firestore;
let fns: Functions;
let storage: FirebaseStorage;

export function firebaseApp(): FirebaseApp {
  if (app) return app;
  const base = USE_EMULATORS ? { ...firebaseConfig, projectId: 'demo-sodalis' } : firebaseConfig;
  // No atalho da tela inicial o login vai por redirecionamento na própria origem (ver BRAND.authProxyHosts)
  const cfg = !USE_EMULATORS && sameOriginAuth() ? { ...base, authDomain: location.host } : base;
  app = initializeApp(cfg);
  const dbId = USE_EMULATORS ? '(default)' : firebaseConfig.firestoreDatabaseId || '(default)';
  db = initializeFirestore(app, { ignoreUndefinedProperties: true }, dbId);
  fns = getFunctions(app, FUNCTIONS_REGION);
  storage = getStorage(app);
  if (USE_EMULATORS) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  return app;
}

function constraints(q?: QuerySpec, cursor?: unknown): QueryConstraint[] {
  const out: QueryConstraint[] = [];
  for (const [f, op, v] of q?.where || []) out.push(where(f, op, v));
  for (const [f, dir] of q?.orderBy || []) out.push(orderBy(f, dir));
  if (cursor) out.push(startAfter(cursor));
  if (q?.limit) out.push(qLimit(q.limit));
  return out;
}

export function createFirebaseClient(): DataClient {
  firebaseApp();
  const api = httpsCallable(fns, 'api', { timeout: 60_000 });
  const objectUrls = new Map<string, string>();

  async function cursorFor(collectionPath: string, q?: QuerySpec) {
    if (!q?.startAfterId) return undefined;
    return getDoc(doc(db, `${collectionPath}/${q.startAfterId}`));
  }

  const PUSH_KEY = 'sodalis_push_token';
  const vapidKey = (firebaseConfig as { vapidKey?: string }).vapidKey || '';

  async function messagingReady() {
    if (!vapidKey || USE_EMULATORS || !('serviceWorker' in navigator) || !('Notification' in window)) return null;
    const m = await import('firebase/messaging');
    if (!(await m.isSupported())) return null;
    const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js'));
    return { m, messaging: m.getMessaging(app), reg };
  }

  const client: DataClient = {
    mode: 'firebase',
    async enablePush(): Promise<PushState> {
      const ready = await messagingReady();
      if (!ready) return 'indisponivel';
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return 'negado';
      const token = await ready.m.getToken(ready.messaging, { vapidKey, serviceWorkerRegistration: ready.reg });
      if (!token) return 'indisponivel';
      await client.call('push.register', { token, platform: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'celular' : 'computador' });
      try {
        localStorage.setItem(PUSH_KEY, token);
      } catch {
        /* modo privado */
      }
      return 'ativo';
    },
    async disablePush() {
      let token: string | null = null;
      try {
        token = localStorage.getItem(PUSH_KEY);
        localStorage.removeItem(PUSH_KEY);
      } catch {
        /* modo privado */
      }
      if (token) await client.call('push.unregister', { token }).catch(() => undefined);
      const ready = await messagingReady();
      if (ready) await ready.m.deleteToken(ready.messaging).catch(() => undefined);
    },
    async pushState(): Promise<PushState> {
      if (!vapidKey || USE_EMULATORS || !('Notification' in window) || !('serviceWorker' in navigator)) return 'indisponivel';
      if (Notification.permission === 'denied') return 'negado';
      let token: string | null = null;
      try {
        token = localStorage.getItem(PUSH_KEY);
      } catch {
        /* modo privado */
      }
      return Notification.permission === 'granted' && token ? 'ativo' : 'desligado';
    },
    async call<T>(op: string, input: object): Promise<T> {
      try {
        // O envio das Functions troca campo vazio (undefined) por null, que o servidor recusa como "nulo":
        // tirar os vazios antes de enviar vale para todas as telas de uma vez
        const res = await api({ op, input: JSON.parse(JSON.stringify(input)) });
        return res.data as T;
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === 'functions/not-found' || err.code === 'functions/internal' && /not found|404/i.test(err.message || '')) {
          throw new ClientError('backend-missing', 'Servidor não publicado');
        }
        throw new ClientError(err.code || 'erro', err.message || 'Erro');
      }
    },
    async get<T>(path: string) {
      const s = await getDoc(doc(db, path));
      return s.exists() ? ({ ...(s.data() as T), id: s.id } as WithId<T>) : null;
    },
    async list<T>(collectionPath: string, q?: QuerySpec) {
      const cur = await cursorFor(collectionPath, q);
      const s = await getDocs(query(collection(db, collectionPath), ...constraints(q, cur)));
      return s.docs.map(d => ({ ...(d.data() as T), id: d.id }) as WithId<T>);
    },
    watchDoc<T>(path: string, cb: (d: WithId<T> | null) => void, onError?: (e: Error) => void) {
      return onSnapshot(
        doc(db, path),
        s => cb(s.exists() ? ({ ...(s.data() as T), id: s.id } as WithId<T>) : null),
        e => onError?.(e)
      );
    },
    watchList<T>(collectionPath: string, q: QuerySpec | undefined, cb: (rows: WithId<T>[]) => void, onError?: (e: Error) => void) {
      return onSnapshot(
        query(collection(db, collectionPath), ...constraints(q)),
        s => cb(s.docs.map(d => ({ ...(d.data() as T), id: d.id }) as WithId<T>)),
        e => onError?.(e)
      );
    },
    async upload(path: string, blob: Blob, contentType: string) {
      await uploadBytes(ref(storage, path), blob, { contentType });
    },
    async fileUrl(path: string) {
      if (!path) return null;
      if (objectUrls.has(path)) return objectUrls.get(path)!;
      try {
        const blob = await getBlob(ref(storage, path));
        const url = URL.createObjectURL(blob);
        objectUrls.set(path, url);
        return url;
      } catch {
        return null;
      }
    },
    async publicUrl(path: string) {
      if (!path) return null;
      if (/^https?:|^data:/.test(path)) return path;
      try {
        return await getDownloadURL(ref(storage, path));
      } catch {
        return null;
      }
    },
  };
  return client;
}
