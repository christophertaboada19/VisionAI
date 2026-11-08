import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastKind = "success" | "warning" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
let seq = 0;

const ICON = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };
const TONE = {
  success: "border-l-[var(--good)] text-[var(--good-ink)]",
  warning: "border-l-[var(--warning)] text-[var(--warning-ink)]",
  error: "border-l-[var(--critical)] text-[var(--critical)]",
  info: "border-l-[var(--accent)] text-[var(--accent-ink)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.kind === "error" ? 8000 : 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className={`anim-slide-up flex items-start gap-3 rounded-lg border border-l-4 border-[var(--border)] bg-white p-3 shadow-lg ${TONE[t.kind]}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ink)]">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-[var(--ink-2)]">{t.description}</p>}
              </div>
              <button className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)]" onClick={() => dismiss(t.id)} aria-label="Cerrar notificación">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
