// Aviso de "servidor despertando": en el plan gratuito de Render el backend se duerme tras 15 min sin
// uso y tarda ~50 s en volver. Mientras tanto se muestra este aviso en vez de errores confusos.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/infrastructure/http";

type State = "checking" | "waking" | "ready" | "down";

export function BackendWakeBanner() {
  const [state, setState] = useState<State>("checking");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    const slowTimer = window.setTimeout(() => alive && setState((s) => (s === "checking" ? "waking" : s)), 2500);
    const tick = window.setInterval(() => alive && setSeconds(Math.round((Date.now() - started) / 1000)), 1000);

    const ping = async () => {
      // Hasta ~90 s de intentos (Render puede tardar en arrancar el contenedor).
      while (alive && Date.now() - started < 90_000) {
        try {
          const ctrl = new AbortController();
          const t = window.setTimeout(() => ctrl.abort(), 20_000);
          const r = await fetch(`${API_BASE_URL}/health`, { signal: ctrl.signal, cache: "no-store" });
          window.clearTimeout(t);
          if (r.ok) {
            if (alive) setState("ready");
            return;
          }
        } catch {
          /* aún dormido: reintentar */
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      if (alive) setState("down");
    };
    void ping();
    return () => {
      alive = false;
      window.clearTimeout(slowTimer);
      window.clearInterval(tick);
    };
  }, []);

  if (state === "checking" || state === "ready") return null;
  return (
    <div
      role="status"
      className={
        state === "waking"
          ? "flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2 text-xs font-medium text-[var(--accent-ink)] sm:px-6"
          : "flex items-center gap-2 border-b border-[var(--border)] bg-[var(--warning-soft)] px-4 py-2 text-xs font-medium text-[var(--warning-ink)] sm:px-6"
      }
    >
      {state === "waking" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Activando el servidor de IA… ({seconds} s). En el plan gratuito puede tardar hasta 1 minuto la primera vez.
        </>
      ) : (
        <>El servidor de IA no responde. Los análisis en vivo y de imágenes no estarán disponibles hasta que vuelva.</>
      )}
    </div>
  );
}
