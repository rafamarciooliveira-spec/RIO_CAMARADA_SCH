/** Contas de login em memória (testes e demonstração): o mesmo contrato do Firebase Admin, sem rede. */
import type { AuthAdminPort } from './ports.ts';

export function memoryAuthAdmin(): AuthAdminPort & { users: Map<string, { uid: string; email: string; password: string }> } {
  const users = new Map<string, { uid: string; email: string; password: string }>();
  let seq = 0;
  return {
    users,
    async setPassword({ uid, email, password }) {
      const cur = (uid && users.get(uid)) || [...users.values()].find(u => u.email === email);
      if (cur) {
        cur.password = password;
        return { uid: cur.uid, email: cur.email };
      }
      const id = uid || `senha-${++seq}`;
      users.set(id, { uid: id, email, password });
      return { uid: id, email };
    },
  };
}
