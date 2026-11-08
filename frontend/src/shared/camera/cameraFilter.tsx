// Filtro de cámara GLOBAL y compartido por todos los módulos (Dashboard, Alertas, Historial,
// Detecciones/Segmentación/Patrones, Actividad, Exportaciones y Notificaciones).
// Se pueden elegir VARIAS cámaras a la vez (p. ej. Cámara 1 + Cámara 3). [] = todas.
// Lo que el usuario elige en un módulo se mantiene al navegar a los demás y se recuerda al recargar.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Camera, Check, ImageIcon } from "lucide-react";
import { useAlerts, useAnalyses, useCameras } from "@/shared/hooks/useRepository";
import { cx } from "@/shared/ui";

import { buildCameraResolver, NO_CAMERA, type CameraResolver } from "./cameraResolver";
export { ALL_CAMERAS, NO_CAMERA, buildCameraResolver, cameraMatches, type CameraResolver } from "./cameraResolver";

/** Cámaras elegidas. Lista vacía = todas las cámaras. */
export type CameraSelection = readonly string[];

const STORAGE_KEY = "visionai:camera-filter";
const EMPTY: CameraSelection = Object.freeze([]) as CameraSelection;
const listeners = new Set<() => void>();

function readStored(): CameraSelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? (arr.filter((x) => typeof x === "string" && x) as string[]) : EMPTY;
    }
    return [raw]; // formato antiguo: una sola cámara
  } catch {
    return EMPTY;
  }
}

let current: CameraSelection = typeof window === "undefined" ? EMPTY : readStored();

export function setCameraFilter(value: CameraSelection) {
  const next = [...new Set(value)];
  if (next.length === current.length && next.every((v, i) => v === current[i])) return;
  current = next.length ? next : EMPTY;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* modo privado: solo en memoria */
  }
  listeners.forEach((l) => l());
}

/** Marca o desmarca una cámara dentro de la selección múltiple. */
export function toggleCameraInFilter(id: string) {
  setCameraFilter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Devuelve [cámarasElegidas, setter]. Las cámaras que ya no existen se descartan solas. */
export function useCameraFilter(): [CameraSelection, (v: CameraSelection) => void] {
  const value = useSyncExternalStore(subscribe, () => current, () => EMPTY);
  const cameras = useCameras();
  // Se descartan cámaras eliminadas y se ordena como en el sistema (Cámara 1, 2, 3… e Imágenes al final).
  const ordered = useMemo(() => {
    const idx = (v: string) => (v === NO_CAMERA ? Number.MAX_SAFE_INTEGER : cameras.findIndex((c) => c.id === v));
    return value.filter((v) => v === NO_CAMERA || cameras.some((c) => c.id === v)).sort((a, b) => idx(a) - idx(b));
  }, [value, cameras]);
  const changed = ordered.length !== value.length;
  useEffect(() => {
    if (changed) setCameraFilter(ordered);
  }, [changed, ordered]);
  return [ordered, setCameraFilter];
}

export function useCameraResolver(): CameraResolver {
  const analyses = useAnalyses();
  const alerts = useAlerts();
  const cameras = useCameras();
  return useMemo(() => buildCameraResolver(analyses, alerts, cameras), [analyses, alerts, cameras]);
}

/** Texto legible de la selección: "Todas las cámaras", "Cámara 1" o "Cámara 1, Cámara 3". */
export function selectionLabel(sel: CameraSelection, resolver: CameraResolver) {
  if (!sel.length) return "todas las cámaras";
  return sel.map((id) => resolver.name(id)).join(", ");
}

/**
 * Barra de selección de cámaras: "Todas", cada cámara registrada e "Imágenes subidas".
 * Se pueden marcar varias a la vez. `count` (opcional) muestra los registros de cada opción.
 */
export function CameraFilterBar({
  count,
  label = "Ver información de",
  className,
  showImages = true,
}: {
  count?: (camId: string) => number;
  label?: string;
  className?: string;
  showImages?: boolean;
}) {
  const [value] = useCameraFilter();
  const cameras = useCameras();
  const all = value.length === 0;
  const chip = (active: boolean) =>
    cx(
      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
      active
        ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
        : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
    );
  const badge = (n: number | undefined, active: boolean) =>
    n === undefined ? null : (
      <span className={cx("tabular rounded px-1 text-[10px]", active ? "bg-white/25" : "bg-[var(--surface-2)] text-[var(--ink-3)]")}>{n}</span>
    );
  const tick = (on: boolean) => (on ? <Check className="h-3 w-3" aria-hidden /> : null);

  return (
    <div className={cx("min-w-0 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xs", className)} role="group" aria-label="Filtro por cámara">
      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        <Camera className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
        {label}
        <span className="normal-case tracking-normal font-normal text-[var(--ink-3)]">· puede elegir una o varias</span>
        {!all && (
          <button type="button" onClick={() => setCameraFilter([])} className="ml-auto normal-case tracking-normal text-[var(--accent-ink)] hover:underline">
            Ver todas las cámaras ({value.length} elegida{value.length === 1 ? "" : "s"})
          </button>
        )}
      </p>
      {/* En celular: una sola fila deslizable con el dedo; en PC: varias filas. */}
      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>button]:shrink-0 [&>button]:snap-start">
        <button type="button" aria-pressed={all} className={chip(all)} onClick={() => setCameraFilter([])}>
          {tick(all)} Todas las cámaras {badge(count?.(""), all)}
        </button>
        {cameras.map((c) => {
          const active = value.includes(c.id);
          return (
            <button key={c.id} type="button" aria-pressed={active} className={chip(active)} onClick={() => toggleCameraInFilter(c.id)} title={c.name}>
              {active ? tick(true) : <span className={cx("h-2 w-2 shrink-0 rounded-full", c.enabled ? "bg-emerald-500" : "bg-slate-400")} aria-hidden />}
              <span className="max-w-[220px] truncate">{c.name}</span>
              {badge(count?.(c.id), active)}
            </button>
          );
        })}
        {showImages && (
          <button type="button" aria-pressed={value.includes(NO_CAMERA)} className={chip(value.includes(NO_CAMERA))} onClick={() => toggleCameraInFilter(NO_CAMERA)}>
            {value.includes(NO_CAMERA) ? tick(true) : <ImageIcon className="h-3.5 w-3.5" aria-hidden />} Imágenes subidas {badge(count?.(NO_CAMERA), value.includes(NO_CAMERA))}
          </button>
        )}
      </div>
    </div>
  );
}
