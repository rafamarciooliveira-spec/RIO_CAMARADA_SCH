/**
 * Implementação da interface Store (src/shared/core/store.ts) com o firebase-admin.
 * As operações nunca importam o SDK: só este arquivo conversa com o Firestore do servidor.
 *
 * Semântica igual à do MemoryStore (que roda nos testes e na demonstração):
 * - chaves com ponto ("a.b") viram caminho de campo em set e update;
 * - inc(n) vira FieldValue.increment(n) e deleteField() vira FieldValue.delete();
 * - '__name__' em where/orderBy é o id do documento.
 */
import { FieldPath, FieldValue, getFirestore, type DocumentData, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import type { App } from 'firebase-admin/app';
import type { DocData, DocSnap, QuerySpec, Store, StoreTx } from '../../src/shared/core/store.ts';
import { isDeleteField, isIncrement } from '../../src/shared/core/store.ts';

/** Converte os marcadores especiais (inc, deleteField) em FieldValue, em qualquer profundidade */
function toFirestoreValue(v: unknown): unknown {
  if (isIncrement(v)) return FieldValue.increment(v.by);
  if (isDeleteField(v)) return FieldValue.delete();
  if (Array.isArray(v)) return v.map(toFirestoreValue);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) out[k] = toFirestoreValue(x);
    return out;
  }
  return v;
}

/**
 * Em set() o Firestore trata "a.b" como nome literal de campo; o MemoryStore trata como caminho.
 * Aqui expandimos para objeto aninhado, o que dá o mesmo resultado nos dois modos (com e sem merge).
 */
function expandDotted(data: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (!k.includes('.')) {
      out[k] = v;
      continue;
    }
    const keys = k.split('.');
    let cur = out;
    for (let i = 0; i < keys.length - 1; i++) {
      const next = cur[keys[i]];
      if (!next || typeof next !== 'object' || Array.isArray(next) || isIncrement(next) || isDeleteField(next)) cur[keys[i]] = {};
      cur = cur[keys[i]] as DocData;
    }
    cur[keys[keys.length - 1]] = v;
  }
  return out;
}

function forSet(data: DocData): DocumentData {
  return toFirestoreValue(expandDotted(data)) as DocumentData;
}

/** update() já entende "a.b" como caminho de campo; só converte os valores */
function forUpdate(data: DocData): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = toFirestoreValue(v);
  return out;
}

function fieldOf(f: string): string | FieldPath {
  return f === '__name__' ? FieldPath.documentId() : f;
}

export class AdminStore implements Store {
  readonly db: Firestore;

  constructor(app: App, databaseId: string) {
    this.db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
    try {
      this.db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() só pode ser chamado uma vez por instância; reaproveitamento em testes
    }
  }

  async get<T = DocData>(path: string): Promise<T | null> {
    const s = await this.db.doc(path).get();
    return s.exists ? (s.data() as T) : null;
  }

  async set(path: string, data: DocData, opts?: { merge?: boolean }): Promise<void> {
    await this.db.doc(path).set(forSet(data), { merge: !!opts?.merge });
  }

  async update(path: string, data: DocData): Promise<void> {
    await this.db.doc(path).update(forUpdate(data));
  }

  async delete(path: string): Promise<void> {
    await this.db.doc(path).delete();
  }

  async add(collectionPath: string, data: DocData): Promise<string> {
    const ref = this.db.collection(collectionPath).doc();
    await ref.set(forSet(data));
    return ref.id;
  }

  private async build(collectionPath: string, q?: QuerySpec, forCount = false): Promise<Query> {
    let query: Query = this.db.collection(collectionPath);
    for (const [f, op, v] of q?.where || []) query = query.where(fieldOf(f), op, v);
    if (!forCount) {
      for (const [f, dir] of q?.orderBy || []) query = query.orderBy(fieldOf(f), dir);
      if (q?.startAfterId) {
        const cursor = await this.db.collection(collectionPath).doc(q.startAfterId).get();
        if (cursor.exists) query = query.startAfter(cursor);
      }
      if (q?.limit) query = query.limit(q.limit);
    }
    return query;
  }

  async query<T = DocData>(collectionPath: string, q?: QuerySpec): Promise<DocSnap<T>[]> {
    const snap = await (await this.build(collectionPath, q)).get();
    return snap.docs.map(d => ({ id: d.id, path: d.ref.path, data: d.data() as T }));
  }

  async count(collectionPath: string, q?: QuerySpec): Promise<number> {
    const agg = await (await this.build(collectionPath, q, true)).count().get();
    return agg.data().count;
  }

  async runTransaction<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (t: Transaction) => {
      const tx: StoreTx = {
        get: async <T = DocData>(path: string) => {
          const s = await t.get(this.db.doc(path));
          return s.exists ? (s.data() as T) : null;
        },
        set: (path, data, opts) => {
          t.set(this.db.doc(path), forSet(data), { merge: !!opts?.merge });
        },
        create: (path, data) => {
          t.create(this.db.doc(path), forSet(data));
        },
        update: (path, data) => {
          t.update(this.db.doc(path), forUpdate(data));
        },
        delete: path => {
          t.delete(this.db.doc(path));
        },
      };
      return fn(tx);
    });
  }

  newId(): string {
    return this.db.collection('_ids').doc().id;
  }
}
