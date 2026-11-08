// Panel lateral de resultados con pestañas: Resultado / Detecciones / Máscaras / Patrones.
import { useState } from "react";
import { Boxes, Layers, Save, Sparkles } from "lucide-react";
import { saveObservation } from "@/core/application/operations";
import type { Alert, Analysis, VisionClass } from "@/core/domain/entities";
import { MODE_LABEL } from "@/core/domain/entities";
import { splitByThreshold } from "@/core/domain/logic";
import { can } from "@/core/domain/permissions";
import { repository } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { AlertStatusBadge, Button, ClassDot, ConfidenceBar, cx, EmptyState, ExpandableThumbnail, findAlertRelatedDetections, isNonCompliantDetection, type LightboxItem, Notice, Select, SeverityBadge, SnapshotLightbox, StatusBadge } from "@/shared/ui";
import { AlertActions } from "@/modules/alerts/components/AlertActions";

type Tab = "summary" | "detections" | "masks" | "patterns";
const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Resultado" },
  { id: "detections", label: "Detecciones" },
  { id: "masks", label: "Máscaras" },
  { id: "patterns", label: "Patrones" },
];

interface Props {
  analysis: Analysis;
  alerts: Alert[];
  classes: VisionClass[];
  threshold: number;
  highlightId: string | null;
  onHover: (id: string | null) => void;
  focusId?: string | null;
  onSelectFocus?: (id: string | null) => void;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <p className="text-[11px] text-[var(--ink-3)]">{label}</p>
      <p className={cx("tabular text-lg font-semibold", tone === "warn" && "text-[var(--warning-ink)]")}>{value}</p>
    </div>
  );
}

export function ResultsPanel({ analysis: a, alerts, classes, threshold, highlightId, onHover, focusId, onSelectFocus }: Props) {
  const user = useUser();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("summary");
  const [classFilter, setClassFilter] = useState("");
  const [obs, setObs] = useState(a.observations ?? "");
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  const color = (id: string) => classes.find((c) => c.id === id)?.color ?? "#8a8f98";
  const { visible, low } = splitByThreshold(a.detections, threshold);
  const dets = a.detections.filter((d) => !classFilter || d.classId === classFilter).sort((x, y) => y.confidence - x.confidence);
  const counts: Record<Tab, number | null> = { summary: null, detections: a.detections.length, masks: a.masks.length, patterns: a.patterns.length };

  const saveObs = () => {
    try {
      saveObservation(repository, a.id, obs, user);
      toast({ kind: "success", title: "Observación registrada", description: "Queda asociada al análisis en el historial." });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo guardar", description: (e as Error).message });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-[var(--border)]" role="tablist" aria-label="Resultados">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx("flex flex-1 items-center justify-center gap-1 border-b-2 px-1 py-2.5 text-xs font-medium transition-colors sm:text-[13px]", tab === t.id ? "border-[var(--accent)] text-[var(--accent-ink)]" : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]")}
          >
            {t.label}
            {counts[t.id] !== null && <span className="tabular rounded-full bg-[var(--surface-2)] px-1.5 text-[11px] text-[var(--ink-2)]">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4" role="tabpanel">
        {tab === "summary" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-3)]">
              <StatusBadge status={a.status} />
              <span>{MODE_LABEL[a.mode]}</span>·<span className="tabular">{a.id}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Objetos ≥ umbral" value={String(visible.length)} />
              <Metric label="Baja confianza" value={String(low.length)} tone={low.length ? "warn" : undefined} />
              <Metric label="Confianza media" value={`${(a.averageConfidence * 100).toFixed(1)} %`} />
              <Metric label="Máscaras" value={String(a.masks.length)} />
              <Metric label="Patrones" value={String(a.patterns.length)} />
              <Metric label="Duración" value={`${(a.durationMs / 1000).toFixed(2)} s`} />
            </div>
            {a.warnings.map((w) => <Notice key={w} tone="warning">{w}</Notice>)}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Alertas asociadas ({alerts.length})</h3>
              {alerts.length ? (
                <ul className="space-y-2.5">
                  {alerts.map((al) => {
                    const relatedDets = findAlertRelatedDetections(al, a);
                    const targetDet = relatedDets[0] ?? a.detections[0];
                    const targetDetId = targetDet?.id ?? null;
                    const isFocused = !!focusId && relatedDets.some((d) => d.id === focusId);
                    return (
                      <li
                        key={al.id}
                        onMouseEnter={() => onHover(targetDetId)}
                        onMouseLeave={() => onHover(null)}
                        className={cx(
                          "rounded-lg border p-3 transition-colors",
                          isFocused
                            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20 bg-[var(--accent-soft)]/30"
                            : al.status === "new"
                              ? "border-[#efb9b9] bg-[var(--critical-soft)]/40"
                              : "border-[var(--border)]",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={al.severity} />
                          <AlertStatusBadge status={al.status} />
                          <span className="tabular ml-auto text-[11px] text-[var(--ink-3)]">{al.id}</span>
                        </div>
                        {relatedDets.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                              Enfocar sujeto:
                            </span>
                            {relatedDets.slice(0, 5).map((d) => {
                              const active = focusId === d.id;
                              const bad = isNonCompliantDetection(d);
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => onSelectFocus?.(active ? null : d.id)}
                                  className={cx(
                                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                                    active
                                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                      : bad
                                        ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                                        : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                                  )}
                                >
                                  {active ? "🔍 Zoom activo (1x)" : `🎯 ${d.label}`}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="mt-2 flex gap-2.5">
                          {al.snapshotUrl && (
                            <ExpandableThumbnail
                              src={al.snapshotUrl}
                              alt="Captura de alerta"
                              className="h-16 w-24"
                              onExpand={() =>
                                setLightbox({
                                  src: al.snapshotUrl!,
                                  title: al.message,
                                  subtitle: `Regla: ${al.ruleName} · Análisis ${a.id}`,
                                  evidence: al.evidence,
                                  badge: al.id,
                                  focusBox: targetDet?.box,
                                  focusLabel: targetDet?.label,
                                  targetIds: relatedDets.map((d) => d.id),
                                  detections: a.detections,
                                })
                              }
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[var(--ink)]">{al.message}</p>
                            <p className="mt-1 text-xs text-[var(--ink-2)]"><span className="font-semibold">Detalle del sujeto / Evidencia:</span> {al.evidence}</p>
                          </div>
                        </div>
                        {al.reviewedBy && <p className="mt-1 text-[11px] text-[var(--ink-3)]">Último cambio: {al.reviewedBy}{al.note ? ` · “${al.note}”` : ""}</p>}
                        <div className="mt-2.5"><AlertActions alert={al} compact /></div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[var(--ink-3)]">{a.mode === "detection" || a.mode === "segmentation" ? "Las reglas se evalúan en los perfiles Patrones y Combinado." : "Ninguna regla se activó."}</p>
              )}
            </div>

            <div>
              <label htmlFor="obs" className="mb-1.5 block text-sm font-semibold">Observaciones del revisor</label>
              <textarea
                id="obs"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                disabled={!can(user.role, "analysis.observe")}
                rows={3}
                maxLength={600}
                placeholder="Confirme lo observado. Una predicción no prueba por sí sola un incumplimiento."
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:bg-[var(--surface-2)]"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-[11px] text-[var(--ink-3)]">{a.observationsBy ? `Registrada por ${a.observationsBy}` : "Sin observaciones registradas"}</p>
                {can(user.role, "analysis.observe") && <Button size="sm" icon={Save} onClick={saveObs} disabled={obs === (a.observations ?? "")}>Guardar</Button>}
              </div>
            </div>
          </div>
        )}

        {tab === "detections" && (
          a.detections.length ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filtrar por clase" className="h-8 flex-1 text-xs">
                  <option value="">Todas las clases</option>
                  {[...new Set(a.detections.map((d) => d.classId))].map((id) => <option key={id} value={id}>{classes.find((c) => c.id === id)?.name ?? id}</option>)}
                </Select>
              </div>
              <ul className="space-y-1.5">
                {dets.map((d, i) => {
                  const lowConf = d.confidence < threshold;
                  return (
                    <li
                      key={d.id}
                      onClick={() => onSelectFocus?.(focusId === d.id ? null : d.id)}
                      onMouseEnter={() => onHover(d.id)}
                      onMouseLeave={() => onHover(null)}
                      onFocus={() => onHover(d.id)}
                      onBlur={() => onHover(null)}
                      tabIndex={0}
                      title="Clic para acercar el zoom hacia este objeto en el visor"
                      className={cx(
                        "anim-fade-in cursor-pointer rounded-lg border px-3 py-2 outline-none transition-colors",
                        focusId === d.id
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[var(--accent)]/20"
                          : highlightId === d.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                      )}
                      style={{ animationDelay: `${i * 35}ms` }}
                    >
                      <div className="flex items-center gap-2">
                        <ClassDot color={color(d.classId)} />
                        <span className="text-sm font-medium">{d.label}</span>
                        {d.trackId && <span className="text-[11px] text-[var(--ink-3)]">{d.trackId}</span>}
                        {lowConf && <span className="rounded bg-[var(--warning-soft)] px-1.5 text-[10px] font-semibold text-[var(--warning-ink)]">BAJA CONFIANZA</span>}
                        <span className="ml-auto"><ConfidenceBar value={d.confidence} threshold={threshold} /></span>
                      </div>
                      <p className="tabular mt-1 text-[11px] text-[var(--ink-3)]">x {d.box.x.toFixed(3)} · y {d.box.y.toFixed(3)} · an {d.box.width.toFixed(3)} · al {d.box.height.toFixed(3)}</p>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : <EmptyState icon={Boxes} title="Sin detecciones" description="El perfil Segmentación no genera cajas. Use Detección, Patrones o Combinado." />
        )}

        {tab === "masks" && (
          a.masks.length ? (
            <ul className="space-y-1.5">
              {a.masks.map((m) => (
                <li key={m.id} onMouseEnter={() => onHover(m.id)} onMouseLeave={() => onHover(null)} className={cx("rounded-lg border px-3 py-2", highlightId === m.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]")}>
                  <div className="flex items-center gap-2">
                    <ClassDot color={color(m.classId)} />
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="rounded bg-[var(--surface-2)] px-1.5 text-[10px] font-semibold text-[var(--ink-2)]">{m.kind === "instance" ? "INSTANCIA" : "SEMÁNTICA"}</span>
                    <span className="ml-auto"><ConfidenceBar value={m.confidence} /></span>
                  </div>
                  <p className="tabular mt-1 text-[11px] text-[var(--ink-3)]">Área: {(m.areaRatio * 100).toFixed(1)} % de la imagen · {m.polygon.length} vértices</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={Layers} title="Sin máscaras" description="Las máscaras se generan con los perfiles Segmentación o Combinado." />
        )}

        {tab === "patterns" && (
          a.patterns.length ? (
            <ul className="space-y-2">
              {a.patterns.map((p) => {
                const relDets = (p.relatedDetectionIds ?? [])
                  .map((id) => a.detections.find((d) => d.id === id))
                  .filter((d): d is NonNullable<typeof d> => !!d);
                return (
                  <li
                    key={p.id}
                    className="rounded-lg border border-[var(--border)] p-3"
                    onMouseEnter={() => onHover(p.relatedDetectionIds?.[0] ?? null)}
                    onMouseLeave={() => onHover(null)}
                  >
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                      <p className="flex-1 text-sm font-medium">{p.label}</p>
                      <span className={cx("rounded px-1.5 text-[10px] font-semibold", p.source === "model" ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "bg-[var(--surface-2)] text-[var(--ink-2)]")}>{p.source === "model" ? "MOTOR" : "REGLA"}</span>
                    </div>
                    <div className="mt-2"><ConfidenceBar value={p.confidence} /></div>
                    <p className="mt-2 text-xs text-[var(--ink-2)]"><span className="font-medium">Evidencia:</span> {p.evidence}</p>
                    {relDets.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {relDets.map((d) => {
                          const active = focusId === d.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => onSelectFocus?.(active ? null : d.id)}
                              className={cx(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                                active
                                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-slate-200",
                              )}
                            >
                              {active ? "🔍 Zoom activo (1x)" : `🎯 Acercar a ${d.label}`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
              <li><Notice tone="info">La confianza es una estimación, no una garantía. Las decisiones críticas requieren validación humana.</Notice></li>
            </ul>
          ) : <EmptyState icon={Sparkles} title="Sin patrones" description="Los patrones se reconocen con los perfiles Patrones o Combinado." />
        )}
      </div>
      <SnapshotLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
