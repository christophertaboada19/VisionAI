import { useEffect, useState } from "react";
import { CameraFilterBar, cameraMatches, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { Link } from "react-router-dom";
import { Bell, Layers, UserCheck } from "lucide-react";
import { manageAlerts } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { ALERT_STATUS_LABEL, SEVERITY_LABEL } from "@/core/domain/entities";
import { bySeverity } from "@/core/domain/logic";
import { can } from "@/core/domain/permissions";
import { useAlerts, useAnalyses, useCameras } from "@/shared/hooks/useRepository";
import { listUsers } from "@/infrastructure/supabase/userAdmin";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { AlertStatusBadge, Card, cx, EmptyState, ExpandableThumbnail, findAlertRelatedDetections, fmtDateTime, isNonCompliantDetection, type LightboxItem, MultiSelect, PageHeader, Select, SeverityBadge, SnapshotLightbox } from "@/shared/ui";
import { AlertActions } from "../components/AlertActions";

export function AlertsPage() {
  const user = useUser();
  const toast = useToast();
  const alerts = useAlerts();
  const analyses = useAnalyses();
  const cameras = useCameras();
  // Todos los filtros admiten VARIAS opciones a la vez ([] = todas).
  const [statuses, setStatuses] = useState<string[]>(["new", "reviewed"]);
  const [severities, setSeverities] = useState<string[]>([]);
  const [scenarios, setScenarios] = useState<string[]>([]);
  // Filtro de cámara global: se comparte con Dashboard, Historial, Exportaciones, etc.
  const [cameraFilter, setCameraFilter] = useCameraFilter();
  const camR = useCameraResolver();
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);

  const resolveAlertCamera = (a: (typeof alerts)[number]) => {
    const id = camR.ofAlert(a);
    return { id, name: id === "__manual__" ? "Análisis de imagen / Manual" : camR.name(id) };
  };

  const list = alerts
    .filter((a) => !statuses.length || statuses.includes(a.status))
    .filter((a) => !severities.length || severities.includes(a.severity))
    .filter((a) => !scenarios.length || scenarios.includes(a.scenarioId))
    .filter((a) => cameraMatches(cameraFilter, camR.ofAlert(a)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .sort(bySeverity);

  const counts = {
    new: alerts.filter((a) => a.status === "new").length,
    reviewed: alerts.filter((a) => a.status === "reviewed").length,
    closed: alerts.filter((a) => a.status === "closed").length,
  };
  const scen = (id: string) => ALL_SCENARIOS.find((s) => s.id === id)?.name ?? id;
  // Responsables posibles: usuarios reales del sistema (los auditores solo leen).
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  useEffect(() => {
    listUsers()
      .then((u) => setPeople(u))
      .catch(() => setPeople([]));
  }, []);
  const assignees = people.filter((u) => u.role !== "auditor");

  return (
    <>
      <PageHeader
        title="Alertas por Cámara y Escenario"
        description="Cada alerta registra la cámara de origen, el escenario, la regla disparada, el sujeto identificado con zoom y su estado de revisión."
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(["new", "reviewed", "closed"] as const).map((s, i) => (
          <button key={s} onClick={() => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} aria-pressed={statuses.includes(s)} title="Pulse para sumar o quitar este estado del filtro" className={cx("anim-fade-in rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md", statuses.includes(s) ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15" : "border-[var(--border)]")} style={{ animationDelay: `${i * 40}ms` }}>
            <AlertStatusBadge status={s} />
            <p className="tabular mt-2 text-2xl font-semibold">{counts[s]}</p>
          </button>
        ))}
      </div>

      {/* Desglose rápido por Cámara y por Escenario */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <CameraFilterBar
          label="Filtrar alertas por cámara"
          showImages
          count={(id) => (id === "" ? alerts.length : alerts.filter((a) => camR.ofAlert(a) === id).length)}
        />

        <Card className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <Layers className="h-3.5 w-3.5 text-[var(--accent)]" /> Filtrar alertas por Tipo de Escenario
            </span>
            {scenarios.length > 0 && (
              <button type="button" onClick={() => setScenarios([])} className="text-xs font-medium text-[var(--accent-ink)] hover:underline">
                Ver todos los escenarios
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setScenarios([])}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                scenarios.length === 0
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-white",
              )}
            >
              Todos ({alerts.length})
            </button>
            {SCENARIOS.map((s) => {
              const cnt = alerts.filter((a) => a.scenarioId === s.id).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenarios((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                  aria-pressed={scenarios.includes(s.id)}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    scenarios.includes(s.id)
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                      : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span>{s.name}</span>
                  <span className="tabular rounded bg-[var(--surface-2)] px-1.5 py-0.2 text-[10px] font-bold">{cnt}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <MultiSelect values={statuses} onChange={setStatuses} aria-label="Estado de la alerta" allLabel="Todos los estados" className="w-52">
            {(["new", "reviewed", "closed"] as const).map((st) => <option key={st} value={st}>{ALERT_STATUS_LABEL[st]}</option>)}
          </MultiSelect>
          <MultiSelect values={severities} onChange={setSeverities} aria-label="Severidad" allLabel="Toda severidad" className="w-48">
            {(["critical", "high", "medium", "low"] as const).map((sv) => <option key={sv} value={sv}>{SEVERITY_LABEL[sv]}</option>)}
          </MultiSelect>
          <MultiSelect values={cameraFilter} onChange={setCameraFilter} aria-label="Cámara" allLabel="Todas las cámaras" className="w-60">
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {!c.enabled ? "(Desactivada)" : ""}
              </option>
            ))}
            <option value="__manual__">Análisis de imagen / Manual</option>
          </MultiSelect>
          <MultiSelect values={scenarios} onChange={setScenarios} aria-label="Escenario" allLabel="Todos los escenarios" className="w-60">
            {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </MultiSelect>
          <span className="ml-auto text-xs text-[var(--ink-3)]">{list.length} alertas</span>
        </div>
        {list.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {list.slice(0, 100).map((a, i) => {
              const parentAnalysis = analyses.find((an) => an.id === a.analysisId);
              const dets = parentAnalysis?.detections ?? [];
              const relatedDets = findAlertRelatedDetections(a, parentAnalysis);
              const targetDet = relatedDets[0] ?? dets.find(isNonCompliantDetection) ?? dets[0];
              const snap = a.snapshotUrl ?? parentAnalysis?.snapshotUrl;
              const camInfo = resolveAlertCamera(a);
              return (
              <li key={a.id} className="anim-fade-in grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <div className="min-w-0 flex gap-3.5">
                  {snap && (
                      <ExpandableThumbnail
                        src={snap}
                        alt={`Captura de evidencia ${a.id}`}
                        className="h-24 w-32"
                        onExpand={() =>
                          setLightbox({
                            src: snap,
                            title: a.message,
                            subtitle: `Cámara: ${camInfo.name} · Escenario: ${scen(a.scenarioId)} · Regla: ${a.ruleName} · ${fmtDateTime(a.createdAt)}`,
                            evidence: a.evidence,
                            badge: a.id,
                            focusBox: targetDet?.box,
                            focusLabel: targetDet?.label,
                            targetIds: relatedDets.map((d) => d.id),
                            detections: dets,
                          })
                        }
                      />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("h-2 w-2 rounded-full", a.status === "new" ? "anim-pulse bg-[var(--critical)]" : a.status === "reviewed" ? "bg-[var(--accent)]" : "bg-[var(--good)]")} aria-hidden />
                      <SeverityBadge severity={a.severity} />
                      <AlertStatusBadge status={a.status} />
                      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink)]">
                        📹 {camInfo.name}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-ink)]">
                        {scen(a.scenarioId)}
                      </span>
                      <span className="tabular text-xs text-[var(--ink-3)]">{a.id}</span>
                    </div>
                    <p className="mt-2 font-semibold text-[var(--ink)]">{a.message}</p>
                    <p className="mt-1 text-sm text-[var(--ink-2)]"><span className="font-semibold">Sujeto y evidencia:</span> {a.evidence}</p>
                    {snap && relatedDets.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-[var(--ink-3)]">Enfocar con zoom:</span>
                        {relatedDets.slice(0, 5).map((d) => {
                          const bad = isNonCompliantDetection(d);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() =>
                                setLightbox({
                                  src: snap,
                                  title: `${a.message} · Enfoque: ${d.label}`,
                                  subtitle: `Regla: ${a.ruleName} · ${scen(a.scenarioId)} · ${fmtDateTime(a.createdAt)}`,
                                  evidence: a.evidence,
                                  badge: a.id,
                                  focusBox: d.box,
                                  focusLabel: d.label,
                                  targetIds: relatedDets.map((x) => x.id),
                                  detections: dets,
                                })
                              }
                              className={cx(
                                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-transform hover:scale-105",
                                bad
                                  ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
                                  : "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100",
                              )}
                            >
                              🎯 {d.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-1.5 text-xs text-[var(--ink-3)]">
                      Regla: {a.ruleName} · {scen(a.scenarioId)} · {fmtDateTime(a.createdAt)} · <Link to={`/analisis/${a.analysisId}${a.frameT !== undefined ? `?t=${a.frameT}` : ""}`} className="text-[var(--accent-ink)] hover:underline">ver evidencia visual ({a.analysisId}{a.frameT !== undefined ? ` · t = ${a.frameT.toFixed(1)} s` : ""})</Link>
                    </p>
                    {(a.reviewedBy || a.assignee) && (
                      <p className="mt-1 text-xs text-[var(--ink-3)]">
                        {a.assignee && <>Responsable: <span className="font-medium text-[var(--ink-2)]">{a.assignee}</span> · </>}
                        {a.reviewedBy && <>Último cambio: {a.reviewedBy} {a.reviewedAt && `(${fmtDateTime(a.reviewedAt)})`}</>}
                        {a.note && <> · “{a.note}”</>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <AlertActions alert={a} />
                  {can(user.role, "alert.close") && a.status !== "closed" && (
                    <label className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                      <UserCheck className="h-3.5 w-3.5" aria-hidden /> Responsable
                      <Select className="h-8 flex-1 text-xs" value={a.assignee ?? ""} onChange={(e) => { manageAlerts.assign(a.id, e.target.value, user); toast({ kind: "info", title: "Responsable asignado", description: `${a.id} → ${e.target.value}` }); }}>
                        <option value="" disabled>Sin asignar</option>
                        {assignees.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </Select>
                    </label>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Bell} title="No hay alertas con estos filtros" description="Las alertas se generan cuando una regla se activa en un análisis de Patrones o Combinado." />
        )}
      </Card>
      <SnapshotLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
