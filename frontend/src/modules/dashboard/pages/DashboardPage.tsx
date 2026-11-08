import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellOff, Boxes, Camera, Gauge, Grid, Power, ScanSearch, Timer, ArrowRight, BarChart3, Table2 } from "lucide-react";
import { repository } from "@/app/providers/container";
import { computeKpis, countByClass, dailySeries, bySeverity } from "@/core/domain/logic";
import { MODE_LABEL } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { useAlerts, useAnalyses, useCameras, useClasses } from "@/shared/hooks/useRepository";
import { getAlertTargetLabel } from "@/modules/scenarios/data/seedCatalog";
import { ALL_SCENARIOS } from "@/modules/scenarios/data/scenes";
import { AlertStatusBadge, Button, Card, CardHeader, cx, EmptyState, fmtRelative, PageHeader, SeverityBadge, StatusBadge } from "@/shared/ui";
import { ActivityChart, ClassDistributionChart } from "../components/Charts";
import { ALL_CAMERAS, CameraFilterBar, cameraMatches, NO_CAMERA, selectionLabel, toggleCameraInFilter, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";

const RANGES = [7, 14, 30] as const;

function Kpi({ icon: Icon, label, value, hint, delay, to }: { icon: typeof Boxes; label: string; value: string; hint: string; delay: number; to?: string }) {
  const body = (
    <Card className="h-full p-4 transition-shadow hover:shadow-md" delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--ink-2)]">{label}</p>
        <Icon className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />
      </div>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-[var(--ink-3)]">{hint}</p>
    </Card>
  );
  return to ? <Link to={to} className="block rounded-xl">{body}</Link> : body;
}

export function DashboardPage() {
  const user = useUser();
  const toast = useToast();
  const allAnalyses = useAnalyses();
  const allAlerts = useAlerts();
  const classes = useClasses();
  const cameras = useCameras();
  const [camF] = useCameraFilter();
  const cam = useCameraResolver();
  // Todo el dashboard se calcula solo con los datos de la cámara elegida (o de todas).
  const analyses = allAnalyses.filter((a) => cameraMatches(camF, cam.ofAnalysis(a)));
  const alerts = allAlerts.filter((a) => cameraMatches(camF, cam.ofAlert(a)));
  // Con UNA sola cámara elegida se muestra su ficha; con varias, el resumen conjunto de esas cámaras.
  const selectedCam = camF.length === 1 ? cameras.find((c) => c.id === camF[0]) : undefined;
  const scopeLabel = selectionLabel(camF, cam);
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [tableView, setTableView] = useState(false);
  const activeCamerasCount = cameras.filter((c) => c.enabled).length;

  const since = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (range - 1));
    return d.getTime();
  }, [range]);
  const inRange = analyses.filter((a) => new Date(a.createdAt).getTime() >= since);
  const alertsInRange = alerts.filter((a) => new Date(a.createdAt).getTime() >= since);
  const k = computeKpis(inRange, alertsInRange);
  const openAll = alerts.filter((a) => a.status !== "closed");
  const series = dailySeries(analyses, alerts, range);
  const byClass = countByClass(inRange).map((c) => {
    const cl = classes.find((x) => x.id === c.classId);
    return { name: cl?.name ?? c.classId, count: c.count, color: cl?.color ?? "#8a8f98" };
  });
  const recentAlerts = [...openAll].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).sort(bySeverity);
  const recent = analyses.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const scen = (id: string) => ALL_SCENARIOS.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name.split(" ")[0]}`}
        description={`Resumen operativo de ${scopeLabel}: análisis, detecciones y alertas en el rango elegido.`}
        actions={
          <>
            <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5" role="group" aria-label="Rango de fechas">
              {RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={cx("rounded-md px-3 py-1.5 text-xs font-medium", range === r ? "bg-[var(--nav)] text-white" : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]")}>
                  {r} días
                </button>
              ))}
            </div>
            {can(user.role, "analysis.run") && (
              <Link to="/analisis"><Button variant="primary" icon={ScanSearch}>Nuevo análisis</Button></Link>
            )}
          </>
        }
      />

      <CameraFilterBar
        className="mb-4"
        label="Ver dashboard de"
        count={(id) => (id === ALL_CAMERAS ? allAnalyses.length : allAnalyses.filter((a) => cam.ofAnalysis(a) === id).length)}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {selectedCam ? (
          <Kpi icon={Camera} label="Cámara seleccionada" value={selectedCam.enabled ? "Activa" : "Apagada"} hint={`${scen(selectedCam.scenarioId)}${selectedCam.notifyMobile === false ? " · sin avisos al celular" : ""}`} delay={0} to={`/analisis/en-vivo?camara=${selectedCam.id}`} />
        ) : camF.length === 1 && camF[0] === NO_CAMERA ? (
          <Kpi icon={Camera} label="Origen" value="Imágenes" hint="Análisis de fotos subidas" delay={0} to="/analisis" />
        ) : (
          camF.length > 1 ? (
            <Kpi icon={Camera} label="Cámaras elegidas" value={String(camF.length)} hint={`${cameras.filter((c) => camF.includes(c.id) && c.enabled).length} activas de las elegidas`} delay={0} to="/analisis/en-vivo?vista=mosaico" />
          ) : (
            <Kpi icon={Camera} label="Cámaras activas" value={`${activeCamerasCount} / ${cameras.length}`} hint={`${cameras.length - activeCamerasCount} desactivada(s)`} delay={0} to="/analisis/en-vivo?vista=mosaico" />
          )
        )}
        <Kpi icon={ScanSearch} label="Análisis ejecutados" value={String(k.analyses)} hint={`${k.completed} completados · ${k.failed} fallidos`} delay={30} to="/operaciones/historial" />
        <Kpi icon={Boxes} label="Objetos detectados" value={String(k.objects)} hint="Sobre el umbral de cada análisis" delay={60} to="/vision/detecciones" />
        <Kpi icon={Bell} label="Alertas abiertas" value={String(openAll.length)} hint={`${k.totalAlerts} generadas en el rango`} delay={90} to="/operaciones/alertas" />
        <Kpi icon={Gauge} label="Confianza media" value={`${(k.averageConfidence * 100).toFixed(1)} %`} hint="Estimación del modelo IA" delay={120} />
        <Kpi icon={Timer} label="Tiempo de procesamiento" value={`${(k.averageDurationMs / 1000).toFixed(2)} s`} hint="Promedio por análisis" delay={150} />
      </div>

      {/* Estado Estratégico de Cámaras del Sistema y Cobertura por Escenario */}
      <Card className="mt-4" delay={100}>
        <CardHeader
          title={`Centro de Cámaras Registradas (${activeCamerasCount} activas de ${cameras.length})`}
          subtitle="Monitoreo distribuido por cámara y por tipo de escenario · Puede activar/desactivar cualquier cámara o abrirla directamente en vivo"
          icon={Camera}
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/analisis/en-vivo?vista=mosaico">
                <Button size="sm" variant="primary" icon={Grid}>
                  Ver todas las cámaras en vivo
                </Button>
              </Link>
              <Link to="/admin/configuracion">
                <Button size="sm" variant="ghost">
                  Configurar cámaras
                </Button>
              </Link>
            </div>
          }
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cameras.map((c) => {
            const camAlerts = allAlerts.filter((a) => cam.ofAlert(a) === c.id && a.status !== "closed").length;
            const camAnalyses = allAnalyses.filter((a) => cam.ofAnalysis(a) === c.id).length;
            const isSel = camF.includes(c.id);
            const targetTxt = getAlertTargetLabel(c.scenarioId, c.alertTarget, true);
            return (
              <div
                key={c.id}
                className={cx(
                  "flex flex-col justify-between rounded-xl border p-3.5 transition-all",
                  isSel && "ring-2 ring-[var(--accent)]",
                  c.enabled
                    ? "border-[var(--border)] bg-white shadow-xs hover:border-[var(--accent)]"
                    : "border-dashed border-slate-300 bg-slate-50/80 opacity-80",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        c.enabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-200 text-slate-600",
                      )}
                    >
                      <span className={cx("h-1.5 w-1.5 rounded-full", c.enabled ? "bg-emerald-500" : "bg-slate-500")} />
                      {c.enabled ? "Activa" : "Desactivada"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        repository.toggleCamera(c.id);
                        toast({
                          kind: c.enabled ? "warning" : "success",
                          title: c.enabled ? `${c.name} desactivada` : `${c.name} activada`,
                        });
                      }}
                      title={c.enabled ? "Desactivar cámara" : "Activar cámara"}
                      className={cx(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                        c.enabled
                          ? "border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                          : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
                      )}
                    >
                      <Power className="h-3 w-3" />
                      {c.enabled ? "Desactivar" : "Activar"}
                    </button>
                  </div>

                  <p className="mt-2 truncate text-xs font-semibold text-[var(--ink)]" title={c.name}>
                    {c.name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--accent-ink)]">
                    {scen(c.scenarioId)}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-[var(--ink-3)]" title={targetTxt}>
                    🎯 Detecta: {targetTxt}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const next = c.notifyMobile === false;
                      repository.saveCamera({ ...c, notifyMobile: next });
                      toast({
                        kind: next ? "success" : "warning",
                        title: next ? `Avisos al celular activados: ${c.name}` : `Avisos al celular silenciados: ${c.name}`,
                        description: next
                          ? "Las alertas de esta cámara se enviarán a Telegram / ntfy."
                          : "Las alertas se siguen registrando en el sistema, pero no llegarán al celular.",
                      });
                    }}
                    className={cx(
                      "mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                      c.notifyMobile === false
                        ? "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                        : "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
                    )}
                    title="Enviar o no las alertas de esta cámara al celular"
                  >
                    {c.notifyMobile === false ? <BellOff className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
                    {c.notifyMobile === false ? "Celular: silenciado" : "Celular: avisos activos"}
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px]">
                  <span className="tabular text-[var(--ink-3)]">
                    {camAnalyses} ses. · <strong className={camAlerts > 0 ? "text-red-600" : ""}>{camAlerts} alertas</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCameraInFilter(c.id)}
                    className={cx("font-semibold hover:underline", isSel ? "text-[var(--accent)]" : "text-[var(--ink-2)]")}
                    title="Sumar o quitar esta cámara del filtro del dashboard"
                  >
                    {isSel ? "✓ Filtro" : "Ver datos"}
                  </button>
                  <Link
                    to={`/analisis/en-vivo?camara=${c.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--accent-ink)] hover:underline"
                  >
                    Abrir <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card delay={120}>
          <CardHeader
            title="Actividad"
            subtitle={`Análisis y alertas por día · últimos ${range} días`}
            icon={BarChart3}
            actions={<Button size="sm" variant="ghost" icon={tableView ? BarChart3 : Table2} onClick={() => setTableView((v) => !v)}>{tableView ? "Ver gráfico" : "Ver tabla"}</Button>}
          />
          <div className="p-5">
            {tableView ? (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-left text-xs text-[var(--ink-3)]"><tr><th className="py-1.5">Día</th><th className="text-right">Análisis</th><th className="text-right">Alertas</th></tr></thead>
                  <tbody className="tabular divide-y divide-[var(--border)]">
                    {series.map((s) => <tr key={s.date}><td className="py-1.5">{s.label}</td><td className="text-right">{s.analyses}</td><td className="text-right">{s.alerts}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ) : (
              <ActivityChart data={series} />
            )}
          </div>
        </Card>
        <Card delay={160}>
          <CardHeader title="Distribución por clase" subtitle="Objetos sobre umbral en el rango" icon={Boxes} />
          <div className="p-5">
            {byClass.length ? <ClassDistributionChart data={byClass} /> : <EmptyState title="Sin detecciones en el rango" />}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card delay={200}>
          <CardHeader title="Alertas recientes abiertas" subtitle="Requieren revisión humana" icon={Bell} actions={<Link to="/operaciones/alertas" className="flex items-center gap-1 text-xs font-medium text-[var(--accent-ink)] hover:underline">Ver todas <ArrowRight className="h-3 w-3" /></Link>} />
          {recentAlerts.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {recentAlerts.map((a, i) => (
                <li key={a.id} className="anim-fade-in flex items-center gap-3 px-5 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className={cx("h-2 w-2 shrink-0 rounded-full", a.status === "new" ? "anim-pulse bg-[var(--critical)]" : "bg-[var(--accent)]")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link to={`/analisis/${a.analysisId}`} className="block truncate text-sm font-medium hover:underline">{a.message}</Link>
                    <p className="text-xs text-[var(--ink-3)]">
                      {a.cameraName ? `📹 ${a.cameraName} · ` : ""}{scen(a.scenarioId)} · {fmtRelative(a.createdAt)}
                    </p>
                  </div>
                  <SeverityBadge severity={a.severity} />
                  <AlertStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No hay alertas abiertas" description="Todas las alertas fueron revisadas y cerradas." />
          )}
        </Card>
        <Card delay={240}>
          <CardHeader title="Análisis recientes" icon={ScanSearch} actions={<Link to="/operaciones/historial" className="flex items-center gap-1 text-xs font-medium text-[var(--accent-ink)] hover:underline">Historial <ArrowRight className="h-3 w-3" /></Link>} />
          {recent.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((a, i) => (
                <li key={a.id} className="anim-fade-in flex items-center gap-3 px-5 py-3" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="min-w-0 flex-1">
                    <Link to={`/analisis/${a.id}`} className="block truncate text-sm font-medium hover:underline">
                      {a.cameraName ? `📹 ${a.cameraName} · ` : ""}{scen(a.scenarioId)} · {MODE_LABEL[a.mode]}
                    </Link>
                    <p className="tabular text-xs text-[var(--ink-3)]">{a.id} · {a.createdBy} · {fmtRelative(a.createdAt)}</p>
                  </div>
                  <span className="tabular hidden text-xs text-[var(--ink-2)] sm:inline">{a.detections.filter((d) => d.confidence >= a.threshold).length} obj.</span>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aún no hay análisis" action={<Link to="/analisis"><Button variant="primary">Ejecutar el primero</Button></Link>} />
          )}
        </Card>
      </div>
    </>
  );
}
