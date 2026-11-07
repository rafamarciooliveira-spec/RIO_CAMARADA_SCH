/**
 * Kit de interface do Sodalis. Mobile-first, acessível (rótulos, foco, contraste) e em pt-BR.
 * Use estes componentes em todas as telas para manter o visual consistente.
 */
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X, XCircle } from 'lucide-react';
import { formatBRL, parseBRL } from '../shared/money.ts';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

// ---------- Botões ----------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-brand text-on-brand hover:brightness-110 border border-white/10',
  accent: 'bg-accent text-black hover:brightness-110',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-muted',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-bad text-white hover:brightness-110',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: React.ReactNode }) {
  const sz = size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-6 py-3.5 text-base' : 'px-4 py-2.5 text-sm';
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer', BTN[variant], sz, className)}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// ---------- Superfícies ----------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('bg-surface border border-line rounded-2xl p-4 sm:p-5', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone, onClick }: { label: string; value: React.ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad' | 'info'; onClick?: () => void }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'info' ? 'text-info' : 'text-fg';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('text-left bg-surface border border-line rounded-2xl p-4 w-full', onClick && 'hover:border-muted transition cursor-pointer')}>
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('text-2xl font-bold mt-1 tabular-nums', color)}>{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </Tag>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'brand'; children: React.ReactNode }) {
  const t = {
    neutral: 'bg-surface-2 text-muted border-line',
    ok: 'bg-ok/15 text-ok border-ok/30',
    warn: 'bg-warn/15 text-warn border-warn/30',
    bad: 'bg-bad/15 text-bad border-bad/30',
    info: 'bg-info/15 text-info border-info/30',
    brand: 'bg-accent/15 text-accent border-accent/30',
  }[tone];
  return <span className={cx('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap', t)}>{children}</span>;
}

export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4 border border-dashed border-line rounded-2xl">
      {icon && <div className="mx-auto mb-3 w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {text && <p className="text-sm text-muted mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 p-4 rounded-2xl border border-bad/40 bg-bad/10 text-sm">
      <XCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'bad'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : tone === 'bad' ? XCircle : Info;
  const c = { info: 'border-info/40 bg-info/10', warn: 'border-warn/40 bg-warn/10', ok: 'border-ok/40 bg-ok/10', bad: 'border-bad/40 bg-bad/10' }[tone];
  const ic = { info: 'text-info', warn: 'text-warn', ok: 'text-ok', bad: 'text-bad' }[tone];
  return (
    <div className={cx('flex items-start gap-2 p-3 rounded-xl border text-sm', c)}>
      <Icon className={cx('w-4 h-4 shrink-0 mt-0.5', ic)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------- Formulário ----------
export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string | null; children: (id: string) => React.ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-muted">
        {label}
        {required && <span className="text-bad"> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[11px] text-muted">{hint}</p>}
      {error && <p className="text-[11px] text-bad">{error}</p>}
    </div>
  );
}

// 16 px no celular: com menos, o iPhone dá zoom sozinho ao tocar no campo e a janela sai do lugar
const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-bg border border-line text-base sm:text-sm text-fg outline-none focus:border-accent placeholder:text-muted/60 disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, 'min-h-24', className)} />;
}

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(inputCls, className)}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cx('flex items-center gap-3 text-sm cursor-pointer select-none', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative w-10 h-6 rounded-full transition shrink-0', checked ? 'bg-accent' : 'bg-surface-2 border border-line')}
      >
        <span className={cx('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition', checked ? 'left-4.5' : 'left-0.5')} />
      </button>
      <span>{label}</span>
    </label>
  );
}

/** Campo de dinheiro em pt-BR: aceita vírgula; guarda centavos inteiros */
export function MoneyInput({ value, onChange, ...p }: { value: number; onChange: (cents: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(() => (value ? (value / 100).toFixed(2).replace('.', ',') : ''));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value ? (value / 100).toFixed(2).replace('.', ',') : '');
      last.current = value;
    }
  }, [value]);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <input
        {...p}
        inputMode="decimal"
        value={text}
        onChange={e => {
          const t = e.target.value.replace(/[^0-9,.]/g, '');
          setText(t);
          const c = parseBRL(t) ?? 0;
          last.current = c;
          onChange(c);
        }}
        className={cx(inputCls, 'pl-9 tabular-nums')}
      />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Buscar...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
      <input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls, 'pl-9')} />
    </div>
  );
}

// ---------- Abas ----------
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto custom-scrollbar border-b border-line mb-4 -mx-1 px-1">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition cursor-pointer', value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-muted">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Tabela ----------
export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function Table<T extends { id: string }>({ rows, columns, onRowClick, empty }: { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty || <EmptyState title="Nada por aqui ainda" />}</>;
  return (
    <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            {columns.map(c => (
              <th key={c.key} scope="col" className={cx('text-left font-semibold px-3 py-2.5 whitespace-nowrap', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(r => (
            <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('bg-surface', onRowClick && 'hover:bg-surface-2 cursor-pointer')}>
              {columns.map(c => (
                <td key={c.key} className={cx('px-3 py-2.5 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Modal ----------
// Trava da rolagem do fundo (funciona no iPhone, onde overflow: hidden não basta). Conta quantas
// janelas estão abertas: a página só volta a rolar quando a última fechar, e volta no mesmo lugar.
let scrollLocks = 0;
let savedScroll: { y: number; prev: Partial<CSSStyleDeclaration> } | null = null;
export function lockScroll(): () => void {
  if (scrollLocks++ === 0) {
    const b = document.body.style;
    savedScroll = { y: window.scrollY, prev: { position: b.position, top: b.top, width: b.width, overflow: b.overflow } };
    Object.assign(b, { position: 'fixed', top: `-${savedScroll.y}px`, width: '100%', overflow: 'hidden' });
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--scrollLocks === 0 && savedScroll) {
      Object.assign(document.body.style, savedScroll.prev);
      window.scrollTo(0, savedScroll.y);
      savedScroll = null;
    }
  };
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('bg-surface border border-line w-full sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92dvh] min-h-0 max-w-full', w)}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h2 className="font-bold text-base">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain custom-scrollbar space-y-4 [-webkit-overflow-scrolling:touch]">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Confirmação para ações destrutivas ----------
interface ConfirmOpts {
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string; // ex.: digitar o nome para confirmar
}

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => {
    setTyped('');
    setState({ ...o, resolve });
  }), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Cancelar</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={!!state?.requireText && typed !== state.requireText} onClick={() => close(true)}>
              {state?.confirmLabel || 'Confirmar'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted whitespace-pre-line">{state?.text}</p>
        {state?.requireText && (
          <Field label={`Digite "${state.requireText}" para confirmar`}>{id => <Input id={id} value={typed} onChange={e => setTyped(e.target.value)} />}</Field>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}

// ---------- Avisos rápidos (toast) ----------
type ToastTone = 'sucesso' | 'erro' | 'info';
const ToastCtx = createContext<{ show: (text: string, tone?: ToastTone) => void }>({ show: () => undefined });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string; tone: ToastTone }[]>([]);
  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems(i => [...i.slice(-3), { id, text, tone }]);
    setTimeout(() => setItems(i => i.filter(x => x.id !== id)), tone === 'erro' ? 7000 : 4000);
  }, []);
  const value = React.useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* No celular os avisos ficam no alto: embaixo cobriam o botão Salvar das janelas. Tocar fecha. */}
      <div aria-live="polite" className="fixed top-[max(0.75rem,env(safe-area-inset-top))] sm:top-auto sm:bottom-4 inset-x-3 sm:inset-x-auto sm:right-4 z-[60] flex flex-col gap-2 sm:w-96 pointer-events-none">
        {items.map(t => (
          <div key={t.id} role="status" onClick={() => setItems(i => i.filter(x => x.id !== t.id))} className={cx('pointer-events-auto cursor-pointer p-3 rounded-xl border shadow-xl text-sm flex gap-2 bg-surface', t.tone === 'erro' ? 'border-bad/50' : t.tone === 'sucesso' ? 'border-ok/50' : 'border-line')}>
            {t.tone === 'erro' ? <XCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" /> : t.tone === 'sucesso' ? <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx('tabular-nums', className)}>{formatBRL(cents)}</span>;
}

/** Carregar mais (paginação por cursor nas listas grandes) */
export function LoadMore({ onClick, loading, done }: { onClick: () => void; loading?: boolean; done?: boolean }) {
  if (done) return null;
  return (
    <div className="flex justify-center pt-3">
      <Button variant="secondary" size="sm" loading={loading} onClick={onClick}>
        Carregar mais
      </Button>
    </div>
  );
}
