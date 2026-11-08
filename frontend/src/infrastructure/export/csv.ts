// Exportación CSV (RFC 4180) con protección contra inyección de fórmulas en hojas de cálculo.
import type { Alert, Analysis, Scenario } from "@/core/domain/entities";
import { ALERT_STATUS_LABEL, MODE_LABEL, SEVERITY_LABEL, STATUS_LABEL } from "@/core/domain/entities";

export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-PE", { hour12: false });

/** Nombre de cámara de cada registro (o "Imagen subida"); si no se pasa, se usa el guardado en el registro. */
type CameraNameOf<T> = (item: T) => string;
const defaultCam = (x: { cameraName?: string }) => x.cameraName ?? "";

/** Una fila por detección (o una fila por análisis sin detecciones). */
export function detectionsCsv(analyses: Analysis[], scenarios: Scenario[], cameraOf: CameraNameOf<Analysis> = defaultCam): string {
  const name = (id: string) => scenarios.find((s) => s.id === id)?.name ?? id;
  const headers = ["origen", "analisis_id", "fecha", "camara", "usuario", "escenario", "fuente", "modo", "estado_analisis", "umbral", "clase", "confianza_pct", "sobre_umbral", "x", "y", "ancho", "alto"];
  const rows: unknown[][] = [];
  for (const a of analyses) {
    const base = [a.engine, a.id, fmtDate(a.createdAt), cameraOf(a), a.createdBy, name(a.scenarioId), a.sourceName, MODE_LABEL[a.mode], STATUS_LABEL[a.status], a.threshold];
    if (!a.detections.length) rows.push([...base, "", "", "", "", "", "", ""]);
    for (const d of a.detections) {
      rows.push([...base, d.label, (d.confidence * 100).toFixed(1), d.confidence >= a.threshold ? "si" : "no (baja confianza)", d.box.x, d.box.y, d.box.width, d.box.height]);
    }
  }
  return toCsv(headers, rows);
}

export function analysesCsv(analyses: Analysis[], scenarios: Scenario[], alerts: Alert[], cameraOf: CameraNameOf<Analysis> = defaultCam): string {
  const name = (id: string) => scenarios.find((s) => s.id === id)?.name ?? id;
  const headers = ["origen", "analisis_id", "fecha", "camara", "usuario", "escenario", "fuente", "modo", "estado", "duracion_ms", "confianza_media_pct", "objetos_sobre_umbral", "mascaras", "patrones", "alertas", "observaciones"];
  return toCsv(
    headers,
    analyses.map((a) => [
      a.engine, a.id, fmtDate(a.createdAt), cameraOf(a), a.createdBy, name(a.scenarioId), a.sourceName, MODE_LABEL[a.mode], STATUS_LABEL[a.status], a.durationMs,
      (a.averageConfidence * 100).toFixed(1), a.detections.filter((d) => d.confidence >= a.threshold).length, a.masks.length, a.patterns.length,
      alerts.filter((x) => x.analysisId === a.id).length, a.observations ?? "",
    ]),
  );
}

export function alertsCsv(alerts: Alert[], scenarios: Scenario[], cameraOf: CameraNameOf<Alert> = defaultCam, engine = "REAL"): string {
  const name = (id: string) => scenarios.find((s) => s.id === id)?.name ?? id;
  const headers = ["origen", "alerta_id", "analisis_id", "fecha", "camara", "escenario", "regla", "severidad", "mensaje", "estado", "responsable", "revisado_por", "fecha_revision", "nota"];
  return toCsv(
    headers,
    alerts.map((a) => [engine, a.id, a.analysisId, fmtDate(a.createdAt), cameraOf(a), name(a.scenarioId), a.ruleName, SEVERITY_LABEL[a.severity], a.message, ALERT_STATUS_LABEL[a.status], a.assignee ?? "", a.reviewedBy ?? "", a.reviewedAt ? fmtDate(a.reviewedAt) : "", a.note ?? ""]),
  );
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  const blob = new Blob(["﻿", content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
