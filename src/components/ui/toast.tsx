'use client';

import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant: 'success' | 'error' | 'warning';
}

interface ToastContextValue {
  push: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** App-wide toast host. Confirms every stock mutation ("Stock successfully updated."). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);
  const idRef = React.useRef(0);

  const push = React.useCallback((toast: Omit<ToastMessage, 'id'>) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            className={cn(
              'flex items-start gap-2.5 rounded-md border bg-card p-3 shadow-md data-[state=open]:animate-slide-up',
              'data-[swipe=end]:animate-fade-in',
            )}
            onOpenChange={(open) => {
              if (!open) setToasts((current) => current.filter((t) => t.id !== toast.id));
            }}
          >
            {toast.variant === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />}
            {toast.variant === 'warning' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />}
            {toast.variant === 'error' && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
            <div className="grid gap-0.5">
              <ToastPrimitive.Title className="text-sm font-medium">{toast.title}</ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="text-sm text-muted-foreground">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] m-4 flex w-full max-w-sm flex-col gap-2 outline-none sm:bottom-4 sm:right-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
