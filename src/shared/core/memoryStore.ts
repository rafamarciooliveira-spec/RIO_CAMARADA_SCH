/**
 * Store em memória (demonstração "Ver sistema", testes e geração de dados simulados).
 * Também oferece assinaturas (watch) para a camada de dados da demo.
 */
import type { DocData, DocSnap, QuerySpec, Store, StoreTx } from './store.ts';
import { isDeleteField, isIncrement } from './store.ts';

type Listener = () => void;

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function getField(obj: DocData, field: string): unknown {
  if (field === '__name__' || field === 'id') return (obj as { __id?: string }).__id ?? obj.id;
  return field.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as DocData)[k] : undefined), obj);
}

function setField(obj: DocData, field: string, value: unknown): void {
  const keys = field.split('.');
  let cur: DocData = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]] as DocData;
  }
  const last = keys[keys.length - 1];
  if (isDeleteField(value)) delete cur[last];
  else if (isIncrement(value)) cur[last] = (Number(cur[last]) || 0) + value.by;
  else cur[last] = value;
}

function applyWrite(base: DocData | undefined, data: DocData, merge: boolean): DocData {
  const out: DocData = merge && base ? clone(base) : {};
  for (const [k, v] of Object.entries(data)) {
    if (merge && v && typeof v === 'object' && !Array.isArray(v) && !isIncrement(v) && !isDeleteField(v)) {
      const prev = (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? out[k] : {}) as DocData;
      out[k] = applyWrite(prev, v as DocData, true);
    } else if (k.includes('.')) {
      setField(out, k, v);
    } else {
      setField(out, k, isIncrement(v) ? v : clone(v));
    }
  }
  return out;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return a < b ? -1 : 1;
}

function matches(data: DocData, q?: QuerySpec): boolean {
  for (const [field, op, value] of q?.where || []) {
    const v = getField(data, field);
    switch (op) {
      case '==': if (v !== value) return false; break;
      case '!=': if (v === value) return false; break;
      case '<': if (!(compare(v, value) < 0) || v == null) return false; break;
      case '<=': if (!(compare(v, value) <= 0) || v == null) return false; break;
      case '>': if (!(compare(v, value) > 0)) return false; break;
      case '>=': if (!(compare(v, value) >= 0)) return false; break;
      case 'in': if (!Array.isArray(value) || !value.includes(v)) return false; break;
      case 'array-contains': if (!Array.isArray(v) || !v.includes(value)) return false; break;
    }
  }
  return true;
}

export class MemoryStore implements Store {
  private docs = new Map<string, DocData>();
  private listeners = new Set<Listener>();
  private seq = 0;

  newId(): string {
    this.seq++;
    const rand = Math.floor(Math.random() * 1e8).toString(36);
    return `${Date.now().toString(36)}${this.seq.toString(36)}${rand}`.slice(0, 20);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async get<T = DocData>(path: string): Promise<T | null> {
    const d = this.docs.get(path);
    return d ? (clone(d) as T) : null;
  }

  getSync<T = DocData>(path: string): T | null {
    const d = this.docs.get(path);
    return d ? (clone(d) as T) : null;
  }

  async set(path: string, data: DocData, opts?: { merge?: boolean }): Promise<void> {
    this.docs.set(path, applyWrite(this.docs.get(path), data, !!opts?.merge));
    this.emit();
  }

  async update(path: string, data: DocData): Promise<void> {
    const base = this.docs.get(path);
    if (!base) throw new Error(`Documento não existe: ${path}`);
    const out = clone(base);
    for (const [k, v] of Object.entries(data)) setField(out, k, isIncrement(v) || isDeleteField(v) ? v : clone(v));
    this.docs.set(path, out);
    this.emit();
  }

  async delete(path: string): Promise<void> {
    this.docs.delete(path);
    this.emit();
  }

  async add(collectionPath: string, data: DocData): Promise<string> {
    const id = this.newId();
    await this.set(`${collectionPath}/${id}`, data);
    return id;
  }

  querySync<T = DocData>(collectionPath: string, q?: QuerySpec): DocSnap<T>[] {
    const depth = collectionPath.split('/').length + 1;
    const prefix = `${collectionPath}/`;
    let rows: DocSnap<DocData>[] = [];
    for (const [path, data] of this.docs) {
      if (path.startsWith(prefix) && path.split('/').length === depth) {
        const id = path.slice(prefix.length);
        const withId = { ...data, __id: id };
        if (matches(withId, q)) rows.push({ id, path, data: clone(data) });
      }
    }
    const order = q?.orderBy || [];
    rows.sort((a, b) => {
      for (const [f, dir] of order) {
        const c = compare(getField({ ...a.data, __id: a.id }, f), getField({ ...b.data, __id: b.id }, f));
        if (c !== 0) return dir === 'desc' ? -c : c;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    if (q?.startAfterId) {
      const i = rows.findIndex(r => r.id === q.startAfterId);
      if (i >= 0) rows = rows.slice(i + 1);
    }
    if (q?.limit) rows = rows.slice(0, q.limit);
    return rows as DocSnap<T>[];
  }

  async query<T = DocData>(collectionPath: string, q?: QuerySpec): Promise<DocSnap<T>[]> {
    return this.querySync<T>(collectionPath, q);
  }

  async count(collectionPath: string, q?: QuerySpec): Promise<number> {
    return this.querySync(collectionPath, { ...q, limit: undefined }).length;
  }

  async runTransaction<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R> {
    const writes: (() => void)[] = [];
    const tx: StoreTx = {
      get: p => this.get(p),
      set: (p, d, o) => writes.push(() => this.docs.set(p, applyWrite(this.docs.get(p), d, !!o?.merge))),
      create: (p, d) => {
        if (this.docs.has(p)) throw new Error('already-exists');
        writes.push(() => {
          if (this.docs.has(p)) throw new Error('already-exists');
          this.docs.set(p, applyWrite(undefined, d, false));
        });
      },
      update: (p, d) =>
        writes.push(() => {
          const base = this.docs.get(p);
          if (!base) throw new Error(`Documento não existe: ${p}`);
          const out = clone(base);
          for (const [k, v] of Object.entries(d)) setField(out, k, isIncrement(v) || isDeleteField(v) ? v : clone(v));
          this.docs.set(p, out);
        }),
      delete: p => writes.push(() => this.docs.delete(p)),
    };
    const result = await fn(tx);
    for (const w of writes) w();
    this.emit();
    return result;
  }

  /** Exporta tudo (para o seed gravar no emulador) */
  dump(): [string, DocData][] {
    return [...this.docs.entries()].map(([p, d]) => [p, clone(d)]);
  }
}
