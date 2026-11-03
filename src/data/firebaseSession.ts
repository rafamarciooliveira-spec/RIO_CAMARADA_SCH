/** Sessão real: Google (padrão) ou link mágico por e-mail. Sem login por senha. */
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onIdTokenChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { firebaseApp, USE_EMULATORS } from './firebaseClient.ts';
import type { SessionUser } from './client.ts';

const LINK_EMAIL_KEY = 'sodalis_link_email';
let auth: Auth;

function getAuthInstance(): Auth {
  if (auth) return auth;
  auth = getAuth(firebaseApp());
  auth.languageCode = 'pt';
  if (USE_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}

async function toSessionUser(u: User): Promise<SessionUser> {
  const token = await u.getIdTokenResult();
  const firebaseClaim = (token.claims.firebase || {}) as { sign_in_second_factor?: string };
  return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || u.email?.split('@')[0] || '',
    emailVerified: u.emailVerified,
    photoURL: u.photoURL || undefined,
    master: token.claims.master === true,
    mfa: !!firebaseClaim.sign_in_second_factor,
  };
}

export function watchSession(cb: (u: SessionUser | null) => void): () => void {
  return onIdTokenChanged(getAuthInstance(), async u => cb(u ? await toSessionUser(u) : null));
}

export async function signInGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(getAuthInstance(), provider);
}

export async function sendMagicLink(email: string, returnPath: string): Promise<void> {
  await sendSignInLinkToEmail(getAuthInstance(), email, { url: `${window.location.origin}${returnPath}`, handleCodeInApp: true });
  try {
    localStorage.setItem(LINK_EMAIL_KEY, email);
  } catch {
    /* modo privado */
  }
}

/** Conclui o login quando a pessoa volta pelo link do e-mail */
export async function completeMagicLink(): Promise<'ok' | 'none' | 'erro'> {
  const a = getAuthInstance();
  const href = window.location.href;
  if (!isSignInWithEmailLink(a, href)) return 'none';
  let email: string | null = null;
  try {
    email = localStorage.getItem(LINK_EMAIL_KEY);
  } catch {
    /* modo privado */
  }
  if (!email) email = window.prompt('Confirme o e-mail para o qual o link foi enviado:');
  if (!email) return 'erro';
  try {
    await signInWithEmailLink(a, email.trim().toLowerCase(), href);
    return 'ok';
  } catch {
    return 'erro';
  } finally {
    try {
      localStorage.removeItem(LINK_EMAIL_KEY);
    } catch {
      /* ignora */
    }
    window.history.replaceState(null, '', window.location.pathname);
  }
}

export async function doSignOut(): Promise<void> {
  await signOut(getAuthInstance());
}

export async function refreshClaims(): Promise<void> {
  await getAuthInstance().currentUser?.getIdToken(true);
}
