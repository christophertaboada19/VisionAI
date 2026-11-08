// Visor visual: imagen + overlays (cajas, máscaras, zonas) en coordenadas normalizadas 0..1,
// por lo que se adaptan a cualquier tamaño del panel.
import { useEffect, useState, type ReactNode } from "react";
import { Focus, RotateCcw } from "lucide-react";
import type { Detection, SegmentationResult, VisionClass, Zone } from "@/core/domain/entities";
import { ClassDot, computeBoxZoomTransform, cx, isNonCompliantDetection, isPrimarySubjectDetection } from "@/shared/ui";
import { PREPROCESS_LABEL, renderPreprocessed, type PreprocessView } from "../services/imageProcessing";

export interface Layers {
  boxes: boolean;
  masks: boolean;
  labels: boolean;
  zones: boolean;
  lowConfidence: boolean;
}

export const DEFAULT_LAYERS: Layers = { boxes: true, masks: true, labels: true, zones: true, lowConfidence: true };

interface Props {
  /** Imagen (URL o data URL). */
  src?: string;
  /** Alternativa para video en vivo: fondo renderizado (p. ej. la vista 3D) en lugar de una imagen. */
  background?: ReactNode;
  /** Modo transmisión: sin animación de aparición; las cajas se desplazan suavemente. */
  live?: boolean;
  alt: string;
  detections: Detection[];
  masks: SegmentationResult[];
  zones: Zone[];
  classes: VisionClass[];
  threshold: number;
  layers: Layers;
  highlightId?: string | null;
  onHover?: (id: string | null) => void;
  /** ID de detección seleccionada para acercar zoom automático hacia el objeto. */
  focusId?: string | null;
  onSelectFocus?: (id: string | null) => void;
  processing?: boolean;
  /** Mostrar overlays (falso para una imagen propia que no corresponde a los resultados). */
  overlays?: boolean;
  preprocess?: PreprocessView;
  binaryThreshold?: number;
}

export function Viewer(p: Props) {
  const colorOf = (id: string) => p.classes.find((c) => c.id === id)?.color ?? "#8a8f98";
  const [shown, setShown] = useState(p.src ?? "");
  const [procError, setProcError] = useState(false);
  const view = p.preprocess ?? "original";

  useEffect(() => {
    if (!p.src) return;
    let alive = true;
    setProcError(false);
    renderPreprocessed(p.src, view, p.binaryThreshold)
      .then((u) => alive && setShown(u))
      .catch(() => {
        if (alive) {
          setShown(p.src ?? "");
          setProcError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [p.src, view, p.binaryThreshold]);

  const show = p.overlays !== false;
  const dets = p.detections.filter((d) => p.layers.lowConfidence || d.confidence >= p.threshold);
  const [internalFocusId, setInternalFocusId] = useState<string | null>(null);
  const effectiveFocusId = p.focusId !== undefined ? p.focusId : internalFocusId;
  const setFocus = (id: string | null) => {
    setInternalFocusId(id);
    p.onSelectFocus?.(id);
  };

  useEffect(() => {
    setInternalFocusId(null);
  }, [p.src]);

  const focusedDet = effectiveFocusId ? p.detections.find((d) => d.id === effectiveFocusId) ?? null : null;
  const { scale, tx, ty } = computeBoxZoomTransform(focusedDet ? focusedDet.box : null);
  const focusableDets = dets
    .filter((d) => isNonCompliantDetection(d) || isPrimarySubjectDetection(d))
    .sort((a, b) => Number(isNonCompliantDetection(b)) - Number(isNonCompliantDetection(a)));

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#0b1726] select-none">
      {/* Barra flotante de auto-zoom rápido hacia sujetos y objetos en los 4 escenarios */}
      {show && (focusableDets.length > 0 || focusedDet) && (
        <div className="absolute left-2.5 top-2.5 z-20 flex max-w-[calc(100%-1.25rem)] flex-wrap items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur-sm">
          <Focus className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="font-semibold text-slate-300">Zoom IA:</span>
          {focusableDets.slice(0, 6).map((d, di) => {
            const active = focusedDet?.id === d.id;
            const bad = isNonCompliantDetection(d);
            return (
              <button
                key={`${d.id}-${di}`}
                type="button"
                onClick={() => setFocus(active ? null : d.id)}
                className={cx(
                  "rounded-full border px-2 py-0.5 font-semibold transition-all",
                  active
                    ? bad
                      ? "border-red-400 bg-red-500/35 text-white ring-1 ring-red-400"
                      : "border-sky-400 bg-sky-500/35 text-white ring-1 ring-sky-400"
                    : bad
                      ? "border-red-500/40 bg-red-950/60 text-red-200 hover:bg-red-900/70"
                      : "border-slate-600/80 bg-slate-800/80 text-slate-200 hover:bg-slate-700",
                )}
              >
                {bad ? "🎯" : "🔍"} {d.label}
              </button>
            );
          })}
          {focusedDet && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 font-medium text-sky-200 hover:bg-slate-700"
            >
              <RotateCcw className="h-3 w-3" /> Vista 1x ({scale.toFixed(1)}x)
            </button>
          )}
        </div>
      )}

      <div
        style={{
          transform: scale > 1.01 ? `translate(${tx}%, ${ty}%) scale(${scale})` : undefined,
          transformOrigin: "0 0",
          transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="relative w-full"
      >
      {p.background !== undefined ? (
        p.background
      ) : (
        <img src={shown} alt={p.alt} className="block h-auto w-full" draggable={false} />
      )}

      {show && p.layers.zones && p.zones.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {p.zones.map((z) => (
            <polygon key={z.id} points={z.polygon.map((q) => q.join(",")).join(" ")} fill="rgb(208 59 59 / 0.10)" stroke="#d03b3b" strokeWidth={2} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}

      {show && p.layers.masks && p.masks.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" role="img" aria-label={`${p.masks.length} máscaras de segmentación`}>
          {p.masks.map((m, i) => {
            const c = colorOf(m.classId);
            const hl = p.highlightId === m.id;
            return (
              <polygon
                key={`${m.id}-${i}`}
                className={cx("pointer-events-auto cursor-pointer", !p.live && "anim-draw-in")}
                style={{ animationDelay: `${i * 70}ms` }}
                points={m.polygon.map((q) => q.join(",")).join(" ")}
                fill={c}
                fillOpacity={hl ? 0.32 : m.kind === "semantic" ? 0.10 : 0.14}
                stroke={c}
                strokeWidth={hl ? 2.2 : 1.2}
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => p.onHover?.(m.id)}
                onMouseLeave={() => p.onHover?.(null)}
              >
                <title>{`${m.label} · ${(m.confidence * 100).toFixed(0)} % · área ${(m.areaRatio * 100).toFixed(1)} %`}</title>
              </polygon>
            );
          })}
        </svg>
      )}

      {show && p.layers.boxes && dets.map((d, i) => {
        const c = colorOf(d.classId);
        const low = d.confidence < p.threshold;
        const hl = p.highlightId === d.id;
        // Cajas grandes (p. ej. personas) llevan la etiqueta abajo por dentro y un borde más sutil
        // para no recargar la pantalla ni chocar con las etiquetas de objetos contenidos (casco, chaleco, botella).
        const isLargePerson = d.classId === "person" && d.box.height > 0.35;
        const inside = d.box.height > 0.35;
        const labelBelow = !inside && d.box.y < 0.06;
        const alignRight = d.box.x + d.box.width > 0.9;
        return (
          <div
            key={`${d.id}-${i}`}
            onClick={() => setFocus(focusedDet?.id === d.id ? null : d.id)}
            title="Clic para acercar/restablecer zoom sobre este objeto"
            className={cx("absolute rounded-[4px] cursor-zoom-in", !p.live && "anim-pop-in", (hl || focusedDet?.id === d.id) && "z-10")}
            style={{
              left: `${d.box.x * 100}%`, top: `${d.box.y * 100}%`, width: `${d.box.width * 100}%`, height: `${d.box.height * 100}%`,
              border: `${hl || focusedDet?.id === d.id ? 2.5 : isLargePerson ? 1.5 : 2}px ${low || isLargePerson ? "dashed" : "solid"} ${c}`,
              boxShadow: hl || focusedDet?.id === d.id ? `0 0 0 1.5px #fff, 0 0 14px ${c}` : "0 0 0 1px rgb(0 0 0 / 0.25)",
              animationDelay: p.live ? undefined : `${120 + i * 80}ms`,
              transition: p.live ? "left 90ms linear, top 90ms linear, width 90ms linear, height 90ms linear" : undefined,
              opacity: low && !hl ? 0.72 : isLargePerson && !hl ? 0.88 : 1,
            }}
            onMouseEnter={() => p.onHover?.(d.id)}
            onMouseLeave={() => p.onHover?.(null)}
            role="img"
            aria-label={`${d.label} ${(d.confidence * 100).toFixed(0)} %${low ? ", baja confianza" : ""}`}
          >
            {p.layers.labels && (
              <span
                className={cx(
                  "absolute whitespace-nowrap rounded-[3px] px-1.5 py-px text-[10px] font-semibold leading-4 text-white shadow-sm",
                  alignRight ? "right-0" : "left-0",
                  inside ? "bottom-0.5 left-0.5" : labelBelow ? "top-full mt-0.5" : "bottom-full mb-0.5",
                )}
                style={{ background: c }}
              >
                {d.trackId && !d.label.includes(d.trackId) ? `${d.label} [${d.trackId}]` : d.label} {(d.confidence * 100).toFixed(0)}%{low ? " · baja" : ""}
              </span>
            )}
          </div>
        );
      })}
      </div>

      {p.processing && (
        <div className="absolute inset-0 bg-[#0b2a4a]/35" aria-hidden>
          <div className="scanline" />
        </div>
      )}
      {view !== "original" && p.background === undefined && (
        <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
          {PREPROCESS_LABEL[view]} · procesamiento clásico real
        </span>
      )}
      {procError && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">No se pudo procesar la imagen; se muestra la original.</span>}
    </div>
  );
}

export function Legend({ classes, detections, masks }: { classes: VisionClass[]; detections: Detection[]; masks: SegmentationResult[] }) {
  const ids = [...new Set([...detections.map((d) => d.classId), ...masks.map((m) => m.classId)])];
  if (!ids.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--ink-2)]" aria-label="Leyenda de clases">
      {ids.map((id) => {
        const c = classes.find((x) => x.id === id);
        const n = detections.filter((d) => d.classId === id).length;
        const m = masks.filter((x) => x.classId === id).length;
        return (
          <li key={id} className="flex items-center gap-1.5">
            <ClassDot color={c?.color ?? "#8a8f98"} />
            {c?.name ?? id}
            <span className="tabular text-[var(--ink-3)]">{n ? `${n} caja${n > 1 ? "s" : ""}` : ""}{n && m ? " · " : ""}{m ? `${m} máscara${m > 1 ? "s" : ""}` : ""}</span>
          </li>
        );
      })}
      <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 border-2 border-dashed border-[var(--ink-3)]" aria-hidden />Baja confianza</li>
    </ul>
  );
}
