/**
 * Contrato da camada de dados do app. Os módulos de tela só falam com esta interface
 * (via useData), nunca com o SDK do Firebase. Duas implementações:
 * - firebaseClient.ts: Firestore (leitura, sob as regras) + Cloud Function `api` (escritas)
 * - memoryClient.ts: demonstração "Ver sistema", 100% no navegador, sem rede
 */
import type { QuerySpec } from '../shared/core/store.ts';

export type WithId<T> = T & { id: string };

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  photoURL?: string;
  master: boolean;
  mfa: boolean;
}

export interface DataClient {
  mode: 'firebase' | 'demo';
  call<T = unknown>(op: string, input: object): Promise<T>;
  get<T>(path: string): Promise<WithId<T> | null>;
  list<T>(collectionPath: string, q?: QuerySpec): Promise<WithId<T>[]>;
  watchDoc<T>(path: string, cb: (doc: WithId<T> | null) => void, onError?: (e: Error) => void): () => void;
  watchList<T>(collectionPath: string, q: QuerySpec | undefined, cb: (rows: WithId<T>[]) => void, onError?: (e: Error) => void): () => void;
  /** Sobe arquivo para o Storage (regras validam tipo e tamanho) */
  upload(path: string, blob: Blob, contentType: string): Promise<void>;
  /** URL local (object URL) de um arquivo privado, respeitando as regras */
  fileUrl(path: string): Promise<string | null>;
  /** URL pública (logos e capas em tenants/{t}/public/...) */
  publicUrl(path: string): Promise<string | null>;
  /** Notificação no celular: pede permissão, registra o aparelho e devolve a situação */
  enablePush(): Promise<PushState>;
  disablePush(): Promise<void>;
  pushState(): Promise<PushState>;
}

export type PushState = 'ativo' | 'desligado' | 'negado' | 'indisponivel' | 'demo';

export interface SessionApi {
  user: SessionUser | null;
  loading: boolean;
  signInGoogle(): Promise<void>;
  sendMagicLink(email: string, returnPath: string): Promise<void>;
  /** Entrada por CPF e senha: o servidor confere a senha e devolve o e-mail interno da conta */
  signInPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshClaims(): Promise<void>;
}

export class ClientError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Erros que indicam que o servidor (Cloud Functions) ainda não foi publicado */
export function isBackendMissing(e: unknown): boolean {
  const code = (e as { code?: string })?.code || '';
  const msg = (e as Error)?.message || '';
  // not-found com mensagem própria (ex.: "Registro não encontrado.") é erro da ação, não falta de servidor
  if (code === 'functions/not-found') return /^(not[ _-]?found|NOT_FOUND)$/i.test(msg.replace(/^FirebaseError:\s*/, '').trim());
  return code === 'functions/unavailable' || code === 'backend-missing';
}

/** A tela é mais nova que o servidor: a ação existe aqui, mas o servidor publicado ainda não a conhece */
export function isServerOutdated(e: unknown): boolean {
  const code = (e as { code?: string })?.code || '';
  const msg = (e as Error)?.message || '';
  return code === 'functions/unimplemented' || (code === 'functions/not-found' && /Operação desconhecida/.test(msg));
}

export function errorMessage(e: unknown): string {
  if (isServerOutdated(e)) return 'Esta ação é nova e o servidor da plataforma ainda não recebeu a atualização. Avise o suporte para publicar o servidor; depois é só tentar de novo.';
  if (isBackendMissing(e)) return 'O servidor da plataforma ainda não foi publicado. Esta ação fica disponível depois da configuração (veja docs/firebase-setup.md).';
  const code = (e as { code?: string })?.code || '';
  if (code.includes('permission-denied')) return (e as Error).message?.replace(/^.*?:\s*/, '') || 'Seu papel não permite esta ação.';
  const msg = (e as Error)?.message || '';
  if (msg && !/internal|INTERNAL/.test(msg)) return msg.replace(/^FirebaseError:\s*/, '');
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
