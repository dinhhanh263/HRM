'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'loading' | 'warning' | 'default';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration: number;
}

type ToastOptions = {
  description?: string;
  duration?: number;
};

// ─── Global event bus ─────────────────────────────────────────────────────────

type AddListener = (item: ToastItem) => void;
type RemoveListener = (id: string) => void;

const addListeners = new Set<AddListener>();
const removeListeners = new Set<RemoveListener>();

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function emit(type: ToastType, message: string, opts?: ToastOptions): string {
  const id = uid();
  const duration = opts?.duration ?? (type === 'loading' ? Infinity : 4000);
  addListeners.forEach((fn) =>
    fn({ id, type, message, description: opts?.description, duration })
  );
  return id;
}

function dismiss(id: string) {
  removeListeners.forEach((fn) => fn(id));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const toast = {
  success: (msg: string, opts?: ToastOptions) => emit('success', msg, opts),
  error: (msg: string, opts?: ToastOptions) => emit('error', msg, opts),
  warning: (msg: string, opts?: ToastOptions) => emit('warning', msg, opts),
  loading: (msg: string, opts?: ToastOptions) =>
    emit('loading', msg, { ...opts, duration: Infinity }),
  message: (msg: string, opts?: ToastOptions) => emit('default', msg, opts),
  dismiss,
  promise: <T,>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ): Promise<T> => {
    const id = emit('loading', msgs.loading, { duration: Infinity });
    promise
      .then((data) => {
        dismiss(id);
        const msg = typeof msgs.success === 'function' ? msgs.success(data) : msgs.success;
        emit('success', msg);
      })
      .catch((err) => {
        dismiss(id);
        const msg = typeof msgs.error === 'function' ? msgs.error(err) : msgs.error;
        emit('error', msg);
      });
    return promise;
  },
};

// ─── Visual config ────────────────────────────────────────────────────────────

const CONFIG = {
  success: {
    Icon: CheckCircle2,
    iconCls: 'text-green-600 dark:text-green-400',
    iconBg: 'bg-green-50 dark:bg-green-950/60',
    border: 'border-green-200 dark:border-green-800',
  },
  error: {
    Icon: AlertCircle,
    iconCls: 'text-red-600 dark:text-red-400',
    iconBg: 'bg-red-50 dark:bg-red-950/60',
    border: 'border-red-200 dark:border-red-800',
  },
  warning: {
    Icon: AlertTriangle,
    iconCls: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-950/60',
    border: 'border-amber-200 dark:border-amber-800',
  },
  loading: {
    Icon: Loader2,
    iconCls: 'text-primary animate-spin',
    iconBg: 'bg-primary-light dark:bg-primary/10',
    border: 'border-border',
  },
  default: {
    Icon: null,
    iconCls: '',
    iconBg: '',
    border: 'border-border',
  },
} as const;

// ─── Single toast item ────────────────────────────────────────────────────────

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const { Icon, iconCls, iconBg, border } = CONFIG[item.type];

  // animate-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 16);
    return () => clearTimeout(t);
  }, []);

  // auto-dismiss
  useEffect(() => {
    if (item.duration === Infinity) return;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(item.id), 180);
    }, item.duration);
    return () => clearTimeout(t);
  }, [item.duration, item.id, onDismiss]);

  function handleClose() {
    setVisible(false);
    setTimeout(() => onDismiss(item.id), 180);
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 w-[360px] max-w-[calc(100vw-48px)]',
        'px-4 py-3.5 rounded-xl border bg-surface shadow-lg',
        'transition-all duration-200 ease-out',
        border,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      )}
    >
      {Icon && (
        <div
          className={cn(
            'shrink-0 size-8 rounded-lg flex items-center justify-center mt-0.5',
            iconBg
          )}
        >
          <Icon className={cn('size-4', iconCls)} strokeWidth={1.5} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary leading-snug">{item.message}</p>
        {item.description && (
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{item.description}</p>
        )}
      </div>
      <button
        onClick={handleClose}
        aria-label="Đóng thông báo"
        className={cn(
          'shrink-0 size-6 flex items-center justify-center rounded',
          'text-text-muted hover:text-text-primary hover:bg-surface-alt',
          'transition-colors duration-100 mt-0.5'
        )}
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─── Toaster (mount once in App) ──────────────────────────────────────────────

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const add: AddListener = (item) => setItems((prev) => [...prev, item]);
    addListeners.add(add);
    removeListeners.add(remove);
    return () => {
      addListeners.delete(add);
      removeListeners.delete(remove);
    };
  }, [remove]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-label="Thông báo"
      className="fixed bottom-6 right-6 z-[200] flex flex-col-reverse gap-2 items-end pointer-events-none"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastCard item={item} onDismiss={remove} />
        </div>
      ))}
    </div>,
    document.body
  );
}
