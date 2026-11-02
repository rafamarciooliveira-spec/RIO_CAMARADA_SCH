import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle, X } from 'lucide-react';

export type DialogVariant = 'warning' | 'danger' | 'info' | 'success';

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  confirmLabel?: string;
  cancelText?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

export interface AlertDialogOptions {
  title?: string;
  message: string;
  buttonText?: string;
  buttonLabel?: string;
  variant?: DialogVariant;
}

interface DialogContextType {
  confirm: (options: ConfirmDialogOptions | string) => Promise<boolean>;
  alert: (options: AlertDialogOptions | string) => Promise<void>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    variant: DialogVariant;
    resolve: (val: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions | string): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      const isString = typeof options === 'string';
      const title = !isString && options.title ? options.title : 'Confirmação do Sistema';
      const message = isString ? options : options.message;
      const confirmText = (!isString && (options.confirmText || options.confirmLabel)) || 'Confirmar';
      const cancelText = (!isString && (options.cancelText || options.cancelLabel)) || 'Cancelar';
      const variant = (!isString && options.variant) || 'warning';

      setDialogState({
        isOpen: true,
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        variant,
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertDialogOptions | string): Promise<void> => {
    return new Promise<void>(resolve => {
      const isString = typeof options === 'string';
      const title = !isString && options.title ? options.title : 'Aviso do Sistema';
      const message = isString ? options : options.message;
      const buttonText = (!isString && (options.buttonText || options.buttonLabel)) || 'Entendido';
      const variant = (!isString && options.variant) || 'info';

      setDialogState({
        isOpen: true,
        type: 'alert',
        title,
        message,
        confirmText: buttonText,
        variant,
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = () => {
    if (!dialogState) return;
    const res = dialogState.resolve;
    setDialogState(null);
    res(true);
  };

  const handleCancel = () => {
    if (!dialogState) return;
    const res = dialogState.resolve;
    setDialogState(null);
    res(false);
  };

  // Keyboard escape listener
  React.useEffect(() => {
    if (!dialogState?.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState]);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}

      {/* Styled in-app modal replacing browser window.alert and window.confirm */}
      {dialogState?.isOpen && (
        <div
          onClick={handleCancel}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in cursor-pointer"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-md w-full p-6 shadow-2xl text-zinc-100 flex flex-col gap-4 relative animate-scale-in cursor-default"
          >
            <button
              onClick={handleCancel}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                  dialogState.variant === 'danger'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : dialogState.variant === 'warning'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : dialogState.variant === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                }`}
              >
                {dialogState.variant === 'danger' && <XCircle className="w-5 h-5" />}
                {dialogState.variant === 'warning' && <AlertTriangle className="w-5 h-5" />}
                {dialogState.variant === 'success' && <CheckCircle2 className="w-5 h-5" />}
                {dialogState.variant === 'info' && <Info className="w-5 h-5" />}
              </div>

              <div className="flex-1 pr-4">
                <h3 className="text-base font-bold text-white leading-snug">
                  {dialogState.title}
                </h3>
                <p className="text-xs text-zinc-300 mt-1.5 whitespace-pre-line leading-relaxed">
                  {dialogState.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800 mt-2">
              {dialogState.type === 'confirm' && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer transition-colors"
                >
                  {dialogState.cancelText || 'Cancelar'}
                </button>
              )}

              <button
                type="button"
                onClick={handleConfirm}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                  dialogState.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50'
                    : dialogState.variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black shadow-amber-950/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                }`}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useAppDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useAppDialog must be used within a DialogProvider');
  }
  return context;
};
