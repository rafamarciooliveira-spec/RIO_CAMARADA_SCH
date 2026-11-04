/** "Lembrar de mim neste aparelho": ligado, o login continua depois de fechar o navegador. */
import { useState } from 'react';

const KEY = 'sodalis_lembrar';

export function rememberMe(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function RememberMe() {
  const [on, setOn] = useState(rememberMe);
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        className="mt-1"
        checked={on}
        onChange={e => {
          setOn(e.target.checked);
          try {
            localStorage.setItem(KEY, e.target.checked ? '1' : '0');
          } catch {
            /* modo privado: vale o padrão */
          }
        }}
      />
      <span>
        Lembrar de mim neste aparelho
        <span className="block text-xs text-muted">Desmarque em computador compartilhado: o login acaba quando o navegador fechar.</span>
      </span>
    </label>
  );
}
