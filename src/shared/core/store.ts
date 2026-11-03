/**
 * Interface mínima de armazenamento usada pelas operações.
 * Implementações: Firestore Admin (functions/src/adminStore.ts) e memória (memoryStore.ts:
 * demonstração, testes e seed). As operações nunca importam o SDK do Firebase.
 */

export type DocData = Record<string, unknown>;

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';

export interface QuerySpec {
  where?: [string, WhereOp, unknown][];
  orderBy?: [string, 'asc' | 'desc'][];
  limit?: number;
  startAfterId?: string; // cursor por id do último documento da página anterior
}

export interface DocSnap<T = DocData> {
  id: string;
  path: string;
  data: T;
}

/** Valor especial: incrementa um campo numérico de forma atômica */
export interface IncrementOp {
  __op: 'increment';
  by: number;
}
export function inc(by: number): IncrementOp {
  return { __op: 'increment', by };
}
export function isIncrement(v: unknown): v is IncrementOp {
  return !!v && typeof v === 'object' && (v as IncrementOp).__op === 'increment';
}

/** Valor especial: remove o campo */
export interface DeleteFieldOp {
  __op: 'deleteField';
}
export const deleteField = (): DeleteFieldOp => ({ __op: 'deleteField' });
export function isDeleteField(v: unknown): v is DeleteFieldOp {
  return !!v && typeof v === 'object' && (v as DeleteFieldOp).__op === 'deleteField';
}

export interface StoreTx {
  get<T = DocData>(path: string): Promise<T | null>;
  set(path: string, data: DocData, opts?: { merge?: boolean }): void;
  create(path: string, data: DocData): void; // falha se já existir
  update(path: string, data: DocData): void;
  delete(path: string): void;
}

export interface Store {
  get<T = DocData>(path: string): Promise<T | null>;
  set(path: string, data: DocData, opts?: { merge?: boolean }): Promise<void>;
  update(path: string, data: DocData): Promise<void>;
  delete(path: string): Promise<void>;
  add(collectionPath: string, data: DocData): Promise<string>;
  query<T = DocData>(collectionPath: string, q?: QuerySpec): Promise<DocSnap<T>[]>;
  count(collectionPath: string, q?: QuerySpec): Promise<number>;
  /** Transação: leituras antes das escritas; escritas são aplicadas juntas */
  runTransaction<R>(fn: (tx: StoreTx) => Promise<R>): Promise<R>;
  newId(): string;
}

export function lastSegment(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}
