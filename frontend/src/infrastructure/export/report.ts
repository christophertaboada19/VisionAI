// Modelo de REPORTE PERSONALIZADO (fuente única para PDF y Excel).
// Recibe los datos del sistema + las opciones elegidas por el usuario y devuelve
// las secciones ya calculadas y filtradas. Es lógica pura (testeable, sin React ni librerías).
import type { Alert, AlertStatus, Analysis, CameraConfig, Scenario, Severity, VisionClass } from "@/core/domain/entities";
import { ALERT_STATUS_LABEL, MODE_LABEL, SEVERITY_LABEL, STATUS_LABEL } from "@/core/domain/entities";
import { computeKpis } from "@/core/domain/logic";
import { cameraMatches, NO_CAMERA, type CameraResolver } from "@/shared/camera/cameraResolver";

export type ReportSection = "summary" | "perCamera" | "classes" | "analyses" | "detections" | "alerts";

export const SECTION_LABEL: Record<ReportSection, string> = {
  summary: "Resumen ejecutivo (indicadores)",
  perCamera: "Resumen por cámara",
  classes: "Objetos detectados por clase",
  analyses: "Detalle de análisis y sesiones en vivo",
  detections: "Detalle de cada detección",
  alerts: "Alertas y trazabilidad",
};

export interface ReportOptions {
  title: string;
  /** Cámaras incluidas ([] = todas). Puede contener NO_CAMERA (imágenes subidas). */
  cameraIds: string[];
  from: string; // yyyy-mm-dd o ""
  to: string;
  /** Escenarios incluidos ([] = todos). */
  scenarioIds: string[];
  sections: ReportSection[];
  /** Estados de alerta incluidos ([] = todos). */
  alertStatuses: AlertStatus[];
  /** Severidades incluidas ([] = todas). */
  severities: Severity[];
  onlyAboveThreshold: boolean;
  /** PDF: incluir las fotos de evidencia de las alertas (máx. `maxPhotos`). */
  includePhotos: boolean;
  maxPhotos: number;
  orientation: "landscape" | "portrait";
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  title: "Reporte de monitoreo VISION AI",
  cameraIds: [],
  from: "",
  to: "",
  scenarioIds: [],
  sections: ["summary", "perCamera", "classes", "analyses", "alerts"],
  alertStatuses: [],
  severities: [],
  onlyAboveThreshold: true,
  includePhotos: true,
  maxPhotos: 8,
  orientation: "landscape",
};


export interface ReportData {
  meta: {
    title: string;
    scope: string;
    range: string;
    scenario: string;
    generatedAt: string;
    generatedBy: string;
    engine: string;
    filters: string[];
  };
  sections: ReportSection[];
  kpis: { label: string; value: string; hint?: string }[];
  perCamera: { camera: string; status: string; scenario: string; analyses: number; objects: number; alerts: number; openAlerts: number; critical: number }[];
  classes: { name: string; color: string; count: number; pct: number }[];
  analyses: {
    id: string; date: string; camera: string; scenario: string; source: string; mode: string; status: string;
    objects: number; avgConfidencePct: number; durationS: number; frames: number | ""; alerts: number; user: string;
  }[];
  detections: {
    analysisId: string; date: string; camera: string; scenario: string; label: string; className: string;
    confidencePct: number; aboveThreshold: boolean; x: number; y: number; w: number; h: number;
  }[];
  alerts: {
    id: string; date: string; camera: string; scenario: string; rule: string; severity: Severity; severityLabel: string;
    message: string; evidence: string; status: string; assignee: string; reviewedBy: string; note: string; snapshotUrl?: string;
  }[];
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDay = (ymd: string) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString("es-PE") : "");

export function buildReport(input: {
  analyses: Analysis[];
  alerts: Alert[];
  cameras: CameraConfig[];
  scenarios: Scenario[];
  classes: VisionClass[];
  resolver: CameraResolver;
  options: ReportOptions;
  generatedBy: string;
  engine: string;
  now?: Date;
}): ReportData {
  const { resolver: cam, options: o } = input;
  const scen = (id: string) => input.scenarios.find((s) => s.id === id)?.name ?? id;
  const camLabel = (id: string) => (id === NO_CAMERA ? "Imagen subida" : cam.name(id));
  const className = (id: string) => input.classes.find((c) => c.id === id)?.name ?? id;
  const fromT = o.from ? new Date(`${o.from}T00:00:00`).getTime() : -Infinity;
  const toT = o.to ? new Date(`${o.to}T23:59:59`).getTime() : Infinity;
  const inScenario = (id: string) => !o.scenarioIds.length || o.scenarioIds.includes(id);
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= fromT && t <= toT;
  };

  const analyses = input.analyses
    .filter((a) => inRange(a.createdAt) && cameraMatches(o.cameraIds, cam.ofAnalysis(a)) && inScenario(a.scenarioId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alertsAll = input.alerts
    .filter((a) => inRange(a.createdAt) && cameraMatches(o.cameraIds, cam.ofAlert(a)) && inScenario(a.scenarioId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alerts = alertsAll
    .filter((a) => !o.alertStatuses.length || o.alertStatuses.includes(a.status))
    .filter((a) => !o.severities.length || o.severities.includes(a.severity));

  const k = computeKpis(analyses, alertsAll);
  const critical = alertsAll.filter((a) => a.severity === "critical").length;
  const liveSessions = analyses.filter((a) => a.sourceKind === "live");
  const frames = liveSessions.reduce((n, a) => n + (a.live?.frames ?? 0), 0);

  const visibleDets = (a: Analysis) => (o.onlyAboveThreshold ? a.detections.filter((d) => d.confidence >= a.threshold) : a.detections);

  // Por clase
  const byClass = new Map<string, number>();
  for (const a of analyses) for (const d of visibleDets(a)) byClass.set(d.classId, (byClass.get(d.classId) ?? 0) + 1);
  const totalCls = [...byClass.values()].reduce((s, n) => s + n, 0) || 1;
  const classes = [...byClass.entries()]
    .map(([id, count]) => ({ name: className(id), color: input.classes.find((c) => c.id === id)?.color ?? "#8a8f98", count, pct: Math.round((count / totalCls) * 1000) / 10 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));

  // Por cámara (solo las cámaras dentro del alcance)
  const camIds = o.cameraIds.length ? o.cameraIds : [...input.cameras.map((c) => c.id), NO_CAMERA];
  const perCamera = camIds
    .map((id) => {
      const an = analyses.filter((a) => cam.ofAnalysis(a) === id);
      const al = alertsAll.filter((a) => cam.ofAlert(a) === id);
      const c = input.cameras.find((x) => x.id === id);
      return {
        camera: camLabel(id),
        status: id === NO_CAMERA ? "—" : c?.enabled === false ? "Desactivada" : "Activa",
        scenario: c ? scen(c.scenarioId) : "Varios",
        analyses: an.length,
        objects: an.reduce((n, a) => n + visibleDets(a).length, 0),
        alerts: al.length,
        openAlerts: al.filter((a) => a.status !== "closed").length,
        critical: al.filter((a) => a.severity === "critical").length,
      };
    })
    .filter((r) => o.cameraIds.length > 0 || r.analyses > 0 || r.alerts > 0 || r.camera !== "Imagen subida");

  const alertCountByAnalysis = new Map<string, number>();
  for (const a of alertsAll) alertCountByAnalysis.set(a.analysisId, (alertCountByAnalysis.get(a.analysisId) ?? 0) + 1);

  const filters: string[] = [];
  if (o.alertStatuses.length) filters.push(`Alertas: ${o.alertStatuses.map((x) => ALERT_STATUS_LABEL[x]).join(", ")}`);
  if (o.severities.length) filters.push(`Severidad: ${o.severities.map((x) => SEVERITY_LABEL[x]).join(", ")}`);
  filters.push(o.onlyAboveThreshold ? "Solo detecciones sobre el umbral" : "Incluye detecciones de baja confianza");

  const now = input.now ?? new Date();
  return {
    meta: {
      title: o.title.trim() || DEFAULT_REPORT_OPTIONS.title,
      scope: o.cameraIds.length ? o.cameraIds.map(camLabel).join(", ") : "Todas las cámaras",
      range: o.from || o.to ? `${fmtDay(o.from) || "inicio"} — ${fmtDay(o.to) || "hoy"}` : "Todo el historial",
      scenario: o.scenarioIds.length ? o.scenarioIds.map(scen).join(", ") : "Todos los escenarios",
      generatedAt: now.toLocaleString("es-PE", { hour12: false }),
      generatedBy: input.generatedBy,
      engine: input.engine === "REAL" ? "Motor real (OpenCV + YOLOv8 + CNN)" : "Motor de demostración",
      filters,
    },
    sections: o.sections,
    kpis: [
      { label: "Análisis y sesiones", value: String(k.analyses), hint: `${k.completed} completados · ${k.failed} fallidos` },
      { label: "Sesiones en vivo", value: String(liveSessions.length), hint: `${frames} fotogramas analizados` },
      { label: "Objetos detectados", value: String(k.objects), hint: "Sobre el umbral de cada análisis" },
      { label: "Alertas generadas", value: String(k.totalAlerts), hint: `${k.openAlerts} abiertas · ${critical} críticas` },
      { label: "Confianza media", value: `${(k.averageConfidence * 100).toFixed(1)} %`, hint: "Promedio del modelo IA" },
      { label: "Tiempo medio", value: `${(k.averageDurationMs / 1000).toFixed(2)} s`, hint: "Por análisis" },
    ],
    perCamera,
    classes,
    analyses: analyses.map((a) => ({
      id: a.id,
      date: fmtDateTime(a.createdAt),
      camera: camLabel(cam.ofAnalysis(a)),
      scenario: scen(a.scenarioId),
      source: a.sourceName,
      mode: MODE_LABEL[a.mode],
      status: STATUS_LABEL[a.status],
      objects: visibleDets(a).length,
      avgConfidencePct: Math.round(a.averageConfidence * 1000) / 10,
      durationS: Math.round(a.durationMs / 10) / 100,
      frames: a.live?.frames ?? "",
      alerts: alertCountByAnalysis.get(a.id) ?? 0,
      user: a.createdBy,
    })),
    detections: analyses.flatMap((a) =>
      visibleDets(a).map((d) => ({
        analysisId: a.id,
        date: fmtDateTime(a.createdAt),
        camera: camLabel(cam.ofAnalysis(a)),
        scenario: scen(a.scenarioId),
        label: d.label,
        className: className(d.classId),
        confidencePct: Math.round(d.confidence * 1000) / 10,
        aboveThreshold: d.confidence >= a.threshold,
        x: +d.box.x.toFixed(3),
        y: +d.box.y.toFixed(3),
        w: +d.box.width.toFixed(3),
        h: +d.box.height.toFixed(3),
      })),
    ),
    alerts: alerts.map((a) => ({
      id: a.id,
      date: fmtDateTime(a.createdAt),
      camera: camLabel(cam.ofAlert(a)),
      scenario: scen(a.scenarioId),
      rule: a.ruleName,
      severity: a.severity,
      severityLabel: SEVERITY_LABEL[a.severity],
      message: a.message,
      evidence: a.evidence,
      status: ALERT_STATUS_LABEL[a.status],
      assignee: a.assignee ?? "",
      reviewedBy: a.reviewedBy ?? "",
      note: a.note ?? "",
      snapshotUrl: a.snapshotUrl,
    })),
  };
}

/** Nombre de archivo seguro: vision-ai_<titulo>_<alcance>_<fecha>.<ext> */
export function reportFileName(data: ReportData, ext: "pdf" | "xlsx") {
  const slug = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
  const parts = data.meta.scope.split(", ");
  const scope = parts.length > 1 ? `${parts.length}-camaras` : slug(data.meta.scope);
  return `vision-ai_${slug(data.meta.title)}_${scope}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export const SEVERITY_COLOR: Record<Severity, string> = { critical: "B42318", high: "D9480F", medium: "B7791F", low: "3B7DD8" };
