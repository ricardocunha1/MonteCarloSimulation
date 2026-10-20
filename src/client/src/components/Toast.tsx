import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../api";

const AUTO_DISMISS_MS = 8000;
const INFO_AUTO_DISMISS_MS = 2200;

interface ErrorToast {
  kind: "error";
  id: number;
  title: string;
  messages: string[];
}

interface InfoToast {
  kind: "info";
  id: number;
  message: string;
}

type Toast = ErrorToast | InfoToast;

/** Toast API returned by {@link useToast}. */
interface ToastState {
  /** Red error toast (`role="alert"`) listing `messages`; auto-dismisses after 8s unless hovered. */
  showError: (messages: string[], title?: string) => void;
  /** Short neutral (navy) notice with `role="status"` that auto-dismisses after ~2.2s. */
  showInfo: (message: string) => void;
}

const ToastContext = createContext<ToastState | null>(null);

/** Holds the toast stack above the routes, so a toast survives navigation. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showError = useCallback((messages: string[], title = "Something went wrong") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { kind: "error", id, title, messages }]);
  }, []);

  const showInfo = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { kind: "info", id, message }]);
  }, []);

  const value = useMemo(() => ({ showError, showInfo }), [showError, showInfo]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          toast.kind === "error" ? (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ) : (
            <InfoToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          )
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function InfoToastItem({ toast, onDismiss }: { toast: InfoToast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), INFO_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-slate-600 p-3 text-sm text-slate-100 shadow-lg"
      style={{ backgroundColor: "var(--cm-dark-blue)" }}
    >
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ErrorToast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return;
    }
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-700 bg-red-950/95 p-4 shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-red-300">{toast.title}</p>
        {toast.messages.length === 1 ? (
          <p className="mt-1 text-sm text-red-200 break-words">{toast.messages[0]}</p>
        ) : (
          <ul className="mt-1 list-disc list-inside space-y-1 text-sm text-red-200 break-words">
            {toast.messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded text-red-300 hover:text-red-100"
      >
        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastState {
  const state = useContext(ToastContext);
  if (!state) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return state;
}

/** The user-facing messages for a caught exception: the server's own
 * messages for an `ApiError`, otherwise the exception text. */
export function errorMessages(exc: unknown): string[] {
  if (exc instanceof ApiError) {
    return exc.errors;
  }
  return [exc instanceof Error ? exc.message : String(exc)];
}
