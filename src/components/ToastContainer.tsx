import React from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2.5rem)] pointer-events-none"
    >
      {toasts.map((toast) => {
        const style =
          toast.type === 'success'
            ? {
                icon: CheckCircle2,
                cls: 'bg-white/95 text-slate-900 border-emerald-200 ring-1 ring-emerald-500/10',
                iconWrap: 'bg-emerald-50 text-emerald-600',
              }
            : toast.type === 'warning'
              ? {
                  icon: AlertTriangle,
                  cls: 'bg-white/95 text-slate-900 border-amber-200 ring-1 ring-amber-500/15',
                  iconWrap: 'bg-amber-50 text-amber-600',
                }
              : toast.type === 'error'
                ? {
                    icon: XCircle,
                    cls: 'bg-white/95 text-slate-900 border-rose-200 ring-1 ring-rose-500/15',
                    iconWrap: 'bg-rose-50 text-rose-600',
                  }
                : {
                    icon: Info,
                    cls: 'bg-white/95 text-slate-900 border-indigo-200 ring-1 ring-indigo-500/10',
                    iconWrap: 'bg-indigo-50 text-indigo-600',
                  };

        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            className={`toast-enter pointer-events-auto flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-xs font-semibold shadow-lg shadow-slate-900/10 backdrop-blur-md ${style.cls}`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${style.iconWrap}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
