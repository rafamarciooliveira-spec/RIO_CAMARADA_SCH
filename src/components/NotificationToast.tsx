import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface ToastItem {
  id: string;
  title: string;
  body: string;
  type: 'approval' | 'rejection' | 'expiration' | 'status_change';
  timestamp: string;
}

export const NotificationToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handlePushEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        title: string;
        body: string;
        type: 'approval' | 'rejection' | 'expiration' | 'status_change';
        timestamp: string;
      }>;

      const newToast: ToastItem = {
        id: `toast_${Date.now()}`,
        ...customEvent.detail,
      };

      setToasts(prev => [newToast, ...prev].slice(0, 3)); // show up to 3 toasts

      // Auto dismiss after 7 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== newToast.id));
      }, 7000);
    };

    window.addEventListener('portal_push_notification', handlePushEvent);
    return () => window.removeEventListener('portal_push_notification', handlePushEvent);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-18 right-2 sm:right-4 z-50 flex flex-col gap-2 max-w-[calc(100vw-1rem)] sm:max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const isSuccess = toast.type === 'approval';
        const isAlert = toast.type === 'rejection' || toast.type === 'expiration';

        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            title="Clique para fechar aviso"
            className={`pointer-events-auto cursor-pointer p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 flex items-start gap-3 text-zinc-100 ${
              isSuccess
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100 hover:border-emerald-400'
                : isAlert
                ? 'bg-red-950/95 border-red-500/50 text-red-100 hover:border-red-400'
                : 'bg-zinc-900/95 border-zinc-700 text-zinc-100 hover:border-zinc-500'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : isAlert ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <Bell className="w-5 h-5 text-emerald-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider opacity-75 block">
                Notificação Push
              </span>
              <h5 className="font-bold text-xs text-white leading-tight">{toast.title}</h5>
              <p className="text-xs opacity-90 mt-1 leading-snug">{toast.body}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-zinc-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
