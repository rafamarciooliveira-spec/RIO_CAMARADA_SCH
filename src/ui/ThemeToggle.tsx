/**
 * Tema claro ou escuro escolhido pela própria pessoa, guardado só neste aparelho.
 * Sem escolha, vale o tema padrão da sociedade (Configurações > Identidade).
 */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'claro' | 'escuro';
const KEY = 'sodalis_tema';
const listeners = new Set<() => void>();

export function userTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'claro' || v === 'escuro' ? v : null;
  } catch {
    return null; // modo privado: segue o padrão da sociedade
  }
}

export function setUserTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* modo privado: vale só até recarregar */
  }
  document.documentElement.setAttribute('data-theme', t);
  listeners.forEach(f => f());
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const read = () => (document.documentElement.getAttribute('data-theme') === 'claro' ? 'claro' : 'escuro');
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const f = () => setTheme(read());
    listeners.add(f);
    // O tema da sociedade pode ser aplicado depois que o botão aparece
    const obs = new MutationObserver(f);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      listeners.delete(f);
      obs.disconnect();
    };
  }, []);
  const next: Theme = theme === 'claro' ? 'escuro' : 'claro';
  return (
    <button
      type="button"
      onClick={() => setUserTheme(next)}
      className={`p-2 rounded-xl hover:bg-surface-2 cursor-pointer ${className}`}
      aria-label={next === 'claro' ? 'Usar tema claro' : 'Usar tema escuro'}
      title={next === 'claro' ? 'Tema claro' : 'Tema escuro'}
    >
      {theme === 'claro' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
