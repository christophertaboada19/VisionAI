import { useMemo, useState } from "react";
import { CameraFilterBar, cameraMatches, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { Link } from "react-router-dom";
import { Download, FilterX, History, Layers, Search } from "lucide-react";
import { repository } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { searchHistory, type HistoryFilters } from "@/core/application/operations";
import { MODE_LABEL, STATUS_LABEL, type AnalysisMode, type AnalysisStatus } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { detectionsCsv, downloadText } from "@/infrastructure/export/csv";
import { useAlerts, useAnalyses, useCameras, useClasses } from "@/shared/hooks/useRepository";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Button, Card, ConfidenceBar, cx, EmptyState, ExpandableThumbnail, Field, fmtDateTime, Input, type LightboxItem, MultiSelect, PageHeader, SnapshotLightbox, StatusBadge } from "@/shared/ui";

const EMPTY: HistoryFilters = { text: "", scenarioId: "", cameraId: "", mode: "", status: "", classId: "", minConfidence: 0, from: "", to: "", withAlerts: false };
const PAGE = 15;

export function HistoryPage() {
  const user = useUser();
  const toast = useToast();
  const analyses = useAnalyses();
  const alerts = useAlerts();
  const classes = useClasses();
  const cameras = useCameras();
  const [f, setF] = useState<HistoryFilters>(EMPTY);
  // Filtros de selección MÚLTIPLE ([] = todos).
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [modes, setModes] = useState<string[]>([]);
  const multi = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  // Filtro de cámara global compartido con los demás módulos.
  const [camF, setCamF] = useCameraFilter();
  const camR = useCameraResolver();
  const list = useMemo(
    () =>
      searchHistory(analyses, alerts, { ...f, cameraId: "", scenarioId: "", classId: "", status: "", mode: "" }).filter(
        (a) =>
          cameraMatches(camF, camR.ofAnalysis(a)) &&
          (!scenarios.length || scenarios.includes(a.scenarioId)) &&
          (!statuses.length || statuses.includes(a.status)) &&
          (!modes.length || modes.includes(a.mode)) &&
          (!classIds.length || a.detections.some((d) => classIds.includes(d.classId) && d.confidence >= a.threshold)),
      ),
    [analyses, alerts, f, camF, camR, scenarios, statuses, modes, classIds],
  );
  const shown = list.slice(0, page * PAGE);
  const set = (patch: Partial<HistoryFilters>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const scen = (id: string) => ALL_SCENARIOS.find((s) => s.id === id)?.name ?? id;
  const resolveAnalysisCameraName = (a: (typeof analyses)[number]) => {
    if (a.cameraId) {
      const c = cameras.find((x) => x.id === a.cameraId);
      if (c) return c.name;
    }
    if (a.cameraName) return a.cameraName;
    return a.sourceKind === "upload" ? `Imagen: ${a.sourceName}` : a.sourceName;
  };

  const exportCsv = () => {
    const csv = detectionsCsv(list, SCENARIOS, (a) => (a.cameraId || a.cameraName ? resolveAnalysisCameraName(a) : "Imagen subida"));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    downloadText(`vision-ai_historial_${stamp}.csv`, csv);
    repository.addEvent({ id: `EV-${Date.now()}`, at: new Date().toISOString(), user: user.name, type: "export", level: "info", message: `Historial exportado a CSV (${list.length} análisis, filtros aplicados).` });
    toast({ kind: "success", title: "CSV exportado", description: `${list.length} análisis · una fila por detección.` });
  };

  return (
    <>
      <PageHeader
        title="Historial de análisis por Cámara y Escenario"
        description="Búsqueda y filtros sobre las sesiones en vivo por cámara e imágenes analizadas, clasificadas por tipo de escenario."
        actions={can(user.role, "history.export") && <Button variant="primary" icon={Download} onClick={exportCsv} disabled={!list.length}>Exportar CSV ({list.length})</Button>}
      />

      {/* Resumen interactivo por Cámara y por Escenario */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <CameraFilterBar
          label="Historial por cámara"
          count={(id) => (id === "" ? analyses.length : analyses.filter((a) => camR.ofAnalysis(a) === id).length)}
        />

        <Card className="p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <Layers className="h-3.5 w-3.5 text-[var(--accent)]" /> Historial por Tipo de Escenario
            </span>
            {scenarios.length > 0 && (
              <button type="button" onClick={() => multi(setScenarios)([])} className="text-xs font-medium text-[var(--accent-ink)] hover:underline">
                Ver todos
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => multi(setScenarios)([])}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                !scenarios.length
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-white",
              )}
            >
              Todos ({analyses.length})
            </button>
            {SCENARIOS.map((s) => {
              const cnt = analyses.filter((a) => a.scenarioId === s.id).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => multi(setScenarios)(scenarios.includes(s.id) ? scenarios.filter((x) => x !== s.id) : [...scenarios, s.id])}
                  aria-pressed={scenarios.includes(s.id)}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                    scenarios.includes(s.id)
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                      : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span>{s.name}</span>
                  <span className="tabular rounded bg-[var(--surface-2)] px-1.5 text-[10px] font-bold">{cnt}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
          <div className="sm:col-span-2">
            <Field label="Buscar" htmlFor="q">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ink-3)]" aria-hidden />
                <Input id="q" className="w-full pl-8" placeholder="ID, cámara, fuente, usuario" value={f.text} onChange={(e) => set({ text: e.target.value })} />
              </div>
            </Field>
          </div>
          <Field label="Cámara" htmlFor="fcam">
            <MultiSelect id="fcam" values={camF} onChange={(v) => (setCamF(v), setPage(1))} allLabel="Todas las cámaras">
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__manual__">Subida manual / Escena</option>
            </MultiSelect>
          </Field>
          <Field label="Escenario" htmlFor="fs">
            <MultiSelect id="fs" values={scenarios} onChange={multi(setScenarios)} allLabel="Todos">
              {SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </MultiSelect>
          </Field>
          <Field label="Clase" htmlFor="fc">
            <MultiSelect id="fc" values={classIds} onChange={multi(setClassIds)} allLabel="Todas">
              {classes.filter((c) => !["floor", "aisle", "zone"].includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </MultiSelect>
          </Field>
          <Field label="Estado" htmlFor="fst">
            <MultiSelect id="fst" values={statuses} onChange={multi(setStatuses)} allLabel="Todos">
              {(Object.keys(STATUS_LABEL) as AnalysisStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
            </MultiSelect>
          </Field>
          <Field label="Perfil" htmlFor="fm">
            <MultiSelect id="fm" values={modes} onChange={multi(setModes)} allLabel="Todos">
              {(Object.keys(MODE_LABEL) as AnalysisMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </MultiSelect>
          </Field>
          <Field label="Desde" htmlFor="ff"><Input id="ff" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="Hasta" htmlFor="ft"><Input id="ft" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label={`Confianza media mínima · ${((f.minConfidence ?? 0) * 100).toFixed(0)} %`} htmlFor="fmc">
              <input id="fmc" type="range" min={0} max={0.95} step={0.05} value={f.minConfidence} onChange={(e) => set({ minConfidence: +e.target.value })} className="h-9 accent-[var(--accent)]" />
            </Field>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--ink-2)] sm:col-span-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={!!f.withAlerts} onChange={(e) => set({ withAlerts: e.target.checked })} /> Solo con alertas
          </label>
          <div className="flex items-end sm:col-span-2 xl:col-span-4 xl:justify-end">
            <Button variant="ghost" icon={FilterX} onClick={() => { setF(EMPTY); setCamF([]); setScenarios([]); setClassIds([]); setStatuses([]); setModes([]); setPage(1); }}>Limpiar filtros</Button>
          </div>
        </div>
      </Card>

      <Card>
        {list.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                    <th className="px-4 py-2.5">Captura / ID</th><th className="px-3">Escenario · fuente</th><th className="px-3">Sujetos / Objetos identificados</th><th className="px-3">Perfil</th><th className="px-3">Usuario</th>
                    <th className="px-3 text-right">Objetos</th><th className="px-3">Confianza</th><th className="px-3 text-right">Alertas</th><th className="px-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {shown.map((a) => {
                    const nAl = alerts.filter((x) => x.analysisId === a.id);
                    const visDets = a.detections.filter((d) => d.confidence >= a.threshold);
                    const snap = a.snapshotUrl ?? nAl.find((x) => x.snapshotUrl)?.snapshotUrl ?? ALL_SCENARIOS.find((s) => s.id === a.scenarioId)?.asset;
                    return (
                      <tr key={a.id} className="hover:bg-[var(--surface-2)]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {snap && (
                              <ExpandableThumbnail
                                src={snap}
                                alt={`Captura ${a.id}`}
                                className="h-12 w-16"
                                onExpand={() =>
                                  setLightbox({
                                    src: snap,
                                    title: `${scen(a.scenarioId)} · ${a.sourceName}`,
                                    subtitle: `${fmtDateTime(a.createdAt)} · Ejecutado por ${a.createdBy}`,
                                    evidence: visDets.length
                                      ? `Sujetos/objetos detectados (${visDets.length}): ${visDets.map((d) => `${d.label} (${Math.round(d.confidence * 100)}%)`).join(" · ")}`
                                      : "Sin detecciones por encima del umbral configurado.",
                                    badge: a.id,
                                    detections: visDets,
                                  })
                                }
                              />
                            )}
                            <div>
                              <Link to={`/analisis/${a.id}`} className="tabular font-medium text-[var(--accent-ink)] hover:underline">{a.id}</Link>
                              <p className="text-xs text-[var(--ink-3)]">{fmtDateTime(a.createdAt)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[230px] px-3">
                          <p className="truncate font-semibold text-[var(--ink)]">{scen(a.scenarioId)}</p>
                          <p className="mt-0.5 truncate text-xs font-medium text-[var(--accent-ink)]">
                            {a.cameraId || a.cameraName ? `📹 ${resolveAnalysisCameraName(a)}` : a.sourceKind === "upload" ? `🖼️ Imagen: ${a.sourceName}` : "Escena de referencia"}
                          </p>
                          {a.sourceKind === "live" && (
                            <p className="truncate text-[11px] text-[var(--ink-3)]">
                              {a.live?.seconds ?? 0} s · {a.live?.frames ?? 0} fotogramas
                            </p>
                          )}
                        </td>
                        <td className="max-w-[280px] px-3 py-2">
                          {visDets.length ? (
                            <div className="flex flex-wrap gap-1">
                              {visDets.slice(0, 5).map((d) => {
                                const isWarn = d.label.includes("SIN ") || d.label.includes("MALOGRADA") || d.label.includes("RESTRINGIDO") || d.classId === "defect";
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    title="Clic para abrir captura y hacer auto-zoom sobre este objeto"
                                    onClick={() =>
                                      snap &&
                                      setLightbox({
                                        src: snap,
                                        title: `${scen(a.scenarioId)} · Enfoque: ${d.label}`,
                                        subtitle: `${fmtDateTime(a.createdAt)} · Análisis ${a.id}`,
                                        evidence: `Objeto seleccionado: ${d.label} (${Math.round(d.confidence * 100)}%) en coordenadas [x=${Math.round(d.box.x * 100)}%, y=${Math.round(d.box.y * 100)}%].`,
                                        badge: a.id,
                                        focusBox: d.box,
                                        focusLabel: d.label,
                                        detections: visDets,
                                      })
                                    }
                                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium transition-transform hover:scale-105 ${
                                      isWarn
                                        ? "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100"
                                        : "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                                    }`}
                                  >
                                    {isWarn ? "🎯 " : "🔍 "}{d.label}
                                  </button>
                                );
                              })}
                              {visDets.length > 5 && <span className="text-[11px] text-[var(--ink-3)]">+{visDets.length - 5} más</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--ink-3)]">Sin objetos sobre umbral</span>
                          )}
                        </td>
                        <td className="px-3">{MODE_LABEL[a.mode]}</td>
                        <td className="px-3 text-[var(--ink-2)]">{a.createdBy}</td>
                        <td className="tabular px-3 text-right">{visDets.length}</td>
                        <td className="px-3">{a.status === "completed" ? <ConfidenceBar value={a.averageConfidence} /> : "—"}</td>
                        <td className="tabular px-3 text-right">{nAl.length ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700" title={`${nAl.filter((x) => x.status !== "closed").length} abiertas`}>{nAl.length}</span> : "—"}</td>
                        <td className="px-3"><StatusBadge status={a.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--ink-3)]">
              <span>Mostrando {shown.length} de {list.length}</span>
              {shown.length < list.length && <Button size="sm" onClick={() => setPage((p) => p + 1)}>Cargar más</Button>}
            </div>
          </>
        ) : (
          <EmptyState icon={History} title="Sin resultados" description="Ningún análisis coincide con los filtros." action={<Button onClick={() => { setF(EMPTY); setCamF([]); setScenarios([]); setClassIds([]); setStatuses([]); setModes([]); }}>Limpiar filtros</Button>} />
        )}
      </Card>
      <SnapshotLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
