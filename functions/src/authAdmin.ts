/** Contas de login com senha (entrada por CPF) pelo Firebase Admin: só o servidor cria ou troca a senha. */
import { getAuth } from 'firebase-admin/auth';
import type { App } from 'firebase-admin/app';
import type { AuthAdminPort } from '../../src/shared/core/ports.ts';

export function firebaseAuthAdmin(app: App): AuthAdminPort {
  const auth = getAuth(app);
  return {
    async setPassword({ uid, email, password, displayName }) {
      if (uid) {
        const u = await auth.getUser(uid).catch(() => null);
        if (u) {
          // Conta que já existe (ex.: entrava com o Google): ganha a senha e continua com o mesmo e-mail
          const upd = await auth.updateUser(uid, { password, ...(u.email ? {} : { email }), emailVerified: true });
          return { uid, email: upd.email || email };
        }
      }
      const byEmail = await auth.getUserByEmail(email).catch(() => null);
      if (byEmail) {
        await auth.updateUser(byEmail.uid, { password, emailVerified: true });
        return { uid: byEmail.uid, email };
      }
      // O e-mail interno nunca recebe mensagens: só identifica a conta de quem entra por CPF
      const created = await auth.createUser({ email, password, emailVerified: true, displayName: displayName.slice(0, 120) });
      return { uid: created.uid, email };
    },
  };
}
