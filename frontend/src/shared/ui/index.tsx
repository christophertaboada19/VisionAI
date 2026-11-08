// Componentes de interfaz reutilizables (botones, tarjetas, insignias, estados vacíos, etc.).
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type InputHTMLAttributes } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDot, Focus, Info, Inbox, Loader2, Maximize2, RotateCcw, X, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import type { AlertStatus, AnalysisStatus, BoundingBox, Detection, Severity } from "@/core/domain/entities";
import { ALERT_STATUS_LABEL, SEVERITY_LABEL, STATUS_LABEL } from "@/core/domain/entities";
import { MultiSelect, PickerSelect } from "./PickerSelect";
export { MultiSelect };

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm",
  secondary: "bg-white text-[var(--ink)] border border-[var(--border)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
  danger: "bg-white text-[var(--critical)] border border-[var(--border)] hover:bg-[var(--critical-soft)]",
};

export function Button({
  variant = "secondary", size = "md", icon: Icon, loading, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: LucideIcon; loading?: boolean }) {
  const sz = size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-11 px-5 text-sm" : "h-9 px-4 text-sm";
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", sz, VARIANT[variant], className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children, delay }: { className?: string; children: ReactNode; delay?: number }) {
  return (
    <section className={cx("anim-fade-in min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgb(15_29_46/0.04)]", className)} style={delay ? { animationDelay: `${delay}ms` } : undefined}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, actions, icon: Icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[var(--accent)]" aria-hidden />}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-[var(--ink-2)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const SEV_STYLE: Record<Severity, { cls: string; icon: LucideIcon }> = {
  low: { cls: "bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--border)]", icon: Info },
  medium: { cls: "bg-[var(--warning-soft)] text-[var(--warning-ink)] border-[#f5d48a]", icon: AlertTriangle },
  high: { cls: "bg-[var(--serious-soft)] text-[var(--serious-ink)] border-[#f3c1ab]", icon: AlertTriangle },
  critical: { cls: "bg-[var(--critical-soft)] text-[var(--critical)] border-[#efb9b9]", icon: AlertOctagon },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV_STYLE[severity];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", s.cls)}>
      <s.icon className="h-3 w-3" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const map = {
    new: "bg-[var(--critical-soft)] text-[var(--critical)] border-[#efb9b9]",
    reviewed: "bg-[var(--accent-soft)] text-[var(--accent-ink)] border-[#b5e3ee]",
    closed: "bg-[var(--good-soft)] text-[var(--good-ink)] border-[#b9e2b9]",
  } as const;
  const Icon = status === "new" ? CircleDot : status === "reviewed" ? Info : CheckCircle2;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", map[status])}>
      <Icon className="h-3 w-3" aria-hidden />
      {ALERT_STATUS_LABEL[status]}
    </span>
  );
}

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const map = {
    queued: "bg-[var(--surface-2)] text-[var(--ink-2)] border-[var(--border)]",
    processing: "bg-[var(--accent-soft)] text-[var(--accent-ink)] border-[#b5e3ee]",
    completed: "bg-[var(--good-soft)] text-[var(--good-ink)] border-[#b9e2b9]",
    failed: "bg-[var(--critical-soft)] text-[var(--critical)] border-[#efb9b9]",
  } as const;
  const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? AlertOctagon : status === "processing" ? Loader2 : CircleDot;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", map[status])}>
      <Icon className={cx("h-3 w-3", status === "processing" && "animate-spin")} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md border border-[#f6d58b] bg-[var(--demo-soft)] px-2 py-0.5 text-[11px] font-bold tracking-wide text-[var(--demo)]", className)} title="Modo DEMO: resultados simulados, no es inferencia real">
      MODO DEMO
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-[var(--surface-2)] p-3 text-[var(--ink-3)]">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-medium text-[var(--ink)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-[var(--ink-3)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone, title, children, icon }: { tone: "info" | "warning" | "error" | "success"; title?: string; children?: ReactNode; icon?: LucideIcon }) {
  const map = {
    info: ["bg-[var(--accent-soft)] border-[#b5e3ee] text-[var(--accent-ink)]", Info],
    warning: ["bg-[var(--warning-soft)] border-[#f5d48a] text-[var(--warning-ink)]", AlertTriangle],
    error: ["bg-[var(--critical-soft)] border-[#efb9b9] text-[var(--critical)]", AlertOctagon],
    success: ["bg-[var(--good-soft)] border-[#b9e2b9] text-[var(--good-ink)]", CheckCircle2],
  } as const;
  const [cls, DefIcon] = map[tone];
  const Icon = icon ?? DefIcon;
  return (
    <div className={cx("flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm", cls)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[var(--ink)]/80 mt-0.5 [&_p]:mt-1">{children}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}

const inputCls = "h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)] disabled:bg-[var(--surface-2)]";
/** Selector con ventana para elegir (ver PickerSelect). Misma API que <select>. */
export const Select = PickerSelect;
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(inputCls, className)} {...p} />;

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-[var(--accent)]" : "bg-[#c5cfdb]")}
    >
      <span className={cx("inline-block h-4 w-4 rounded-full bg-[#fff] shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold?: number }) {
  const low = threshold !== undefined && value < threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: low ? "var(--warning)" : "var(--accent)" }} />
      </div>
      <span className={cx("tabular text-xs font-medium", low ? "text-[var(--warning-ink)]" : "text-[var(--ink)]")}>{(value * 100).toFixed(0)} %</span>
    </div>
  );
}

export function ClassDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />;
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtRelative = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
};

export interface LightboxItem {
  src: string;
  title: string;
  subtitle?: string;
  evidence?: string;
  badge?: string;
  /** Caja del objeto infractor/defectuoso para acercar el zoom automáticamente al abrir. */
  focusBox?: BoundingBox;
  /** Etiqueta del objeto enfocado. */
  focusLabel?: string;
  /** IDs de las detecciones involucradas en la alerta o patrón. */
  targetIds?: string[];
  /** Lista de detecciones de la escena para permitir enfocar cada objeto con un clic. */
  detections?: Detection[];
}

export function computeBoxZoomTransform(box: BoundingBox | null, customScale?: number) {
  if (!box) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const autoScale = Math.min(3.2, Math.max(1.85, 0.52 / Math.max(box.width, box.height, 0.14)));
  const scale = customScale ?? autoScale;
  if (scale <= 1.01) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  const tx = Math.min(0, Math.max(1 - scale, 0.5 - cx * scale));
  const ty = Math.min(0, Math.max(1 - scale, 0.5 - cy * scale));
  return { scale: +scale.toFixed(2), tx: +(tx * 100).toFixed(2), ty: +(ty * 100).toFixed(2) };
}

export function isNonCompliantDetection(d: Detection): boolean {
  return (
    d.label.includes("SIN ") ||
    d.label.includes("MALOGRADA") ||
    d.label.includes("RESTRINGIDO") ||
    d.label.includes("DESVÍO") ||
    d.label.includes("FUERA DE RUTA") ||
    d.label.includes("DISTANCIA CRÍTICA") ||
    d.label.includes("TRANSPORTE PESADO") ||
    d.label.includes("PEATÓN EN VÍA") ||
    d.label.includes("MOTO EN CORREDOR") ||
    d.label.includes("INVASIÓN") ||
    d.label.includes("EXCEDIDO") ||
    d.classId === "defect"
  );
}

export function isPrimarySubjectDetection(d: Detection): boolean {
  return ["person", "product", "car", "bus", "truck", "motorcycle", "defect"].includes(d.classId);
}

export function findAlertRelatedDetections(
  alert: { message: string; evidence: string },
  analysis?: {
    detections: Detection[];
    patterns: { label: string; evidence: string; relatedDetectionIds?: string[] }[];
  },
): Detection[] {
  if (!analysis || !analysis.detections.length) return [];
  const dets = analysis.detections;
  const relPat = analysis.patterns.find(
    (p) =>
      p.evidence === alert.evidence ||
      alert.evidence.includes(p.evidence) ||
      alert.message.includes(p.label),
  );
  if (relPat?.relatedDetectionIds?.length) {
    const matched = relPat.relatedDetectionIds
      .map((id) => dets.find((d) => d.id === id))
      .filter((d): d is Detection => !!d);
    if (matched.length) return matched;
  }
  const byTextOrWarn = dets.filter(
    (d) =>
      isNonCompliantDetection(d) ||
      alert.message.includes(d.label) ||
      alert.evidence.includes(d.label) ||
      (d.trackId ? alert.message.includes(d.trackId) || alert.evidence.includes(d.trackId) : false),
  );
  if (byTextOrWarn.length) return byTextOrWarn;
  const primaries = dets.filter(isPrimarySubjectDetection);
  return primaries.length ? primaries : dets.slice(0, 3);
}

export function SnapshotLightbox({ item, onClose }: { item: LightboxItem | null; onClose: () => void }) {
  const [activeBox, setActiveBox] = useState<BoundingBox | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [scaleOverride, setScaleOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!item) {
      setActiveBox(null);
      setActiveLabel("");
      setScaleOverride(null);
      return;
    }
    if (item.focusBox) {
      setActiveBox(item.focusBox);
      setActiveLabel(item.focusLabel ?? "Sujeto / objeto seleccionado");
      setScaleOverride(null);
      return;
    }
    const targetSet = new Set(item.targetIds ?? []);
    const offender =
      item.detections?.find((d) => targetSet.has(d.id) && isNonCompliantDetection(d)) ??
      item.detections?.find((d) => targetSet.has(d.id)) ??
      item.detections?.find(isNonCompliantDetection) ??
      item.detections?.find(isPrimarySubjectDetection) ??
      item.detections?.[0];
    if (offender) {
      setActiveBox(offender.box);
      setActiveLabel(offender.label);
      setScaleOverride(null);
    } else {
      setActiveBox(null);
      setActiveLabel("");
      setScaleOverride(1);
    }
  }, [item]);

  if (!item) return null;

  const { scale, tx, ty } = computeBoxZoomTransform(
    activeBox ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    scaleOverride ?? undefined,
  );
  const dets = item.detections ?? [];
  const targetSet = new Set(item.targetIds ?? []);

  const focusOnDetection = (d: Detection) => {
    setActiveBox(d.box);
    setActiveLabel(d.label);
    setScaleOverride(null);
  };

  const resetView = () => {
    setActiveBox(null);
    setActiveLabel("Vista completa");
    setScaleOverride(1);
  };

  const adjustZoom = (delta: number) => {
    const next = Math.min(4.0, Math.max(1.0, +(scale + delta).toFixed(2)));
    if (next <= 1.05) {
      resetView();
    } else {
      if (!activeBox) setActiveBox(item.focusBox ?? { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
      setScaleOverride(next);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={onClose}
    >
      <div
        className="anim-pop-in relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {item.badge && (
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-300 border border-red-500/40">
                  {item.badge}
                </span>
              )}
              <h3 className="truncate text-sm font-semibold sm:text-base">{item.title}</h3>
            </div>
            {item.subtitle && <p className="mt-0.5 text-xs text-slate-400">{item.subtitle}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => adjustZoom(-0.4)}
              disabled={scale <= 1.05}
              className="rounded-lg bg-slate-800 p-2 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
              title="Alejar zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="tabular min-w-[48px] text-center text-xs font-semibold text-sky-300">
              {scale.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(0.4)}
              disabled={scale >= 3.9}
              className="rounded-lg bg-slate-800 p-2 text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
              title="Acercar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
              title="Restablecer a vista completa (1x)"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 1x
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-lg bg-slate-800 p-2 text-slate-300 transition-colors hover:bg-red-600 hover:text-white"
              aria-label="Cerrar vista ampliada"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Selector de objetos para auto-zoom con un clic en los 4 escenarios */}
        {(dets.length > 0 || item.focusBox) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 bg-slate-950/70 px-5 py-2 text-xs">
            <span className="mr-1 flex items-center gap-1 font-semibold text-slate-300">
              <Focus className="h-3.5 w-3.5 text-sky-400" /> Enfocar sujeto / objeto:
            </span>
            {item.focusBox && dets.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveBox(item.focusBox!);
                  setActiveLabel(item.focusLabel ?? "Sujeto de la alerta");
                  setScaleOverride(null);
                }}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition-all",
                  activeBox === item.focusBox && scale > 1.05
                    ? "border-red-400 bg-red-500/25 text-white shadow-sm"
                    : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800",
                )}
              >
                🎯 {item.focusLabel ?? "Sujeto que activó la alerta"}
              </button>
            )}
            {dets.map((d) => {
              const bad = isNonCompliantDetection(d) || targetSet.has(d.id);
              const isSelected = activeBox === d.box && scale > 1.05;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => focusOnDetection(d)}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium transition-all",
                    isSelected
                      ? bad
                        ? "border-red-400 bg-red-500/30 text-white ring-2 ring-red-400/40"
                        : "border-sky-400 bg-sky-500/30 text-white ring-2 ring-sky-400/40"
                      : bad
                        ? "border-red-500/40 bg-red-950/50 text-red-200 hover:bg-red-900/60"
                        : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800",
                  )}
                >
                  {bad ? "🎯" : "🔍"} {d.label} ({Math.round(d.confidence * 100)}%)
                </button>
              );
            })}
            <button
              type="button"
              onClick={resetView}
              className={cx(
                "ml-auto rounded-full border px-2.5 py-1 font-medium transition-colors",
                scale <= 1.05
                  ? "border-sky-400 bg-sky-500/20 text-sky-200"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700",
              )}
            >
              🖼️ Vista completa
            </button>
          </div>
        )}

        {/* Lienzo con Zoom y Pan automático suave hacia el objeto seleccionado */}
        <div className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-slate-950 p-2">
          <div className="relative inline-block max-h-[60vh] overflow-hidden rounded-lg border border-slate-800">
            <div
              style={{
                transform: `translate(${tx}%, ${ty}%) scale(${scale})`,
                transformOrigin: "0 0",
                transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
              className="relative"
            >
              <img
                src={item.src}
                alt={item.title}
                className="block max-h-[60vh] w-auto max-w-full select-none object-contain"
                draggable={false}
              />
              {/* Cajas interactivas en el lightbox para hacer clic directo sobre cualquier sujeto */}
              {dets.map((d) => {
                const isSelected = activeBox === d.box && scale > 1.05;
                if (isSelected) return null;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => focusOnDetection(d)}
                    title={`Acercar zoom a ${d.label}`}
                    className="absolute rounded border border-white/30 bg-transparent transition-colors hover:border-sky-300 hover:bg-sky-400/15"
                    style={{
                      left: `${d.box.x * 100}%`,
                      top: `${d.box.y * 100}%`,
                      width: `${d.box.width * 100}%`,
                      height: `${d.box.height * 100}%`,
                    }}
                  />
                );
              })}
              {/* Indicador luminoso sobre el objeto enfocado */}
              {activeBox && scale > 1.05 && (
                <div
                  className="pointer-events-none absolute rounded border-2 border-amber-300 shadow-[0_0_0_2px_rgba(239,68,68,0.85),0_0_24px_rgba(239,68,68,0.75)]"
                  style={{
                    left: `${activeBox.x * 100}%`,
                    top: `${activeBox.y * 100}%`,
                    width: `${activeBox.width * 100}%`,
                    height: `${activeBox.height * 100}%`,
                  }}
                />
              )}
            </div>
          </div>

          {activeLabel && scale > 1.05 && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm">
              <Focus className="h-3.5 w-3.5 text-amber-400" />
              <span>Enfocando: <strong>{activeLabel}</strong> ({scale.toFixed(1)}x)</span>
            </div>
          )}
        </div>

        {item.evidence && (
          <div className="border-t border-slate-800 bg-slate-900/95 px-5 py-3 text-xs text-slate-200 sm:text-sm">
            <span className="font-semibold text-sky-300">Identificación del sujeto / Evidencia: </span>
            {item.evidence}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpandableThumbnail({
  src,
  alt,
  className = "h-20 w-28",
  onExpand,
}: {
  src: string;
  alt: string;
  className?: string;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      title="Clic para ampliar captura e identificar sujeto"
      className={cx(
        "group relative shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
        className,
      )}
    >
      <img src={src} alt={alt} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
      <span className=" inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition-all group-hover:bg-slate-950/45 group-hover:opacity-100 absolute">
        <span className="inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold">
          <Maximize2 className="h-3 w-3" /> Ampliar
        </span>
      </span>
    </button>
  );
}
