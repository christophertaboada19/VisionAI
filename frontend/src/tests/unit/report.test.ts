import { describe, expect, it } from "vitest";
import type { Alert, Analysis, CameraConfig, VisionClass } from "@/core/domain/entities";
import { buildReport, DEFAULT_REPORT_OPTIONS, reportFileName } from "@/infrastructure/export/report";
import { buildCameraResolver, NO_CAMERA } from "@/shared/camera/cameraResolver";

const cam = (id: string, name: string): CameraConfig => ({ id, name, sourceKind: "public-stream", url: "", scenarioId: "public-traffic", alertTarget: "all", mode: "combined", threshold: 0.5, enabled: true });
const det = (classId: string, confidence: number) => ({ id: `${classId}-${confidence}`, label: classId, classId, confidence, box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } });
const an = (id: string, createdAt: string, extra: Partial<Analysis>): Analysis =>
  ({ id, createdAt, createdBy: "Ana", sourceName: "s", sourceKind: "live", scenarioId: "public-traffic", mode: "combined", status: "completed", engine: "REAL", threshold: 0.5, durationMs: 1000, averageConfidence: 0.8, detections: [], masks: [], patterns: [], warnings: [], ...extra }) as Analysis;
const al = (id: string, analysisId: string, severity: Alert["severity"], status: Alert["status"], createdAt: string): Alert =>
  ({ id, analysisId, scenarioId: "public-traffic", ruleId: "r", ruleName: "Regla", severity, message: "msg", evidence: "ev", status, createdAt }) as Alert;

const cameras = [cam("c1", "Cámara 1"), cam("c2", "Cámara 2")];
const classes: VisionClass[] = [{ id: "car", name: "Auto", color: "#2563eb" } as VisionClass, { id: "truck", name: "Camión", color: "#d97706" } as VisionClass];
const analyses = [
  an("A1", "2026-11-05T10:00:00", { cameraId: "c1", detections: [det("car", 0.9), det("car", 0.3), det("truck", 0.7)] }),
  an("A2", "2026-11-06T10:00:00", { cameraId: "c2", detections: [det("car", 0.8)] }),
  an("A3", "2026-11-07T10:00:00", { sourceKind: "upload", detections: [det("truck", 0.95)] }),
];
const alerts = [al("L1", "A1", "critical", "new", "2026-11-05T10:01:00"), al("L2", "A1", "low", "closed", "2026-11-05T10:02:00"), al("L3", "A2", "high", "reviewed", "2026-11-06T10:01:00")];
const base = (o: Partial<typeof DEFAULT_REPORT_OPTIONS>) =>
  buildReport({ analyses, alerts, cameras, scenarios: [], classes, resolver: buildCameraResolver(analyses, alerts, cameras), options: { ...DEFAULT_REPORT_OPTIONS, ...o }, generatedBy: "Ana", engine: "REAL" });

describe("reporte personalizado", () => {
  it("todas las cámaras: cuenta todo, solo detecciones sobre umbral", () => {
    const r = base({});
    expect(r.meta.scope).toBe("Todas las cámaras");
    expect(r.analyses).toHaveLength(3);
    expect(r.kpis.find((k) => k.label === "Objetos detectados")?.value).toBe("4");
    expect(r.classes.map((c) => [c.name, c.count])).toEqual([["Auto", 2], ["Camión", 2]]);
    expect(r.perCamera.find((p) => p.camera === "Cámara 1")).toMatchObject({ analyses: 1, objects: 2, alerts: 2, openAlerts: 1, critical: 1 });
  });
  it("filtra por una cámara", () => {
    const r = base({ cameraIds: ["c1"], sections: ["detections"], onlyAboveThreshold: false });
    expect(r.meta.scope).toBe("Cámara 1");
    expect(r.analyses.map((a) => a.id)).toEqual(["A1"]);
    expect(r.detections).toHaveLength(3);
    expect(r.perCamera).toHaveLength(1);
  });
  it("imágenes subidas sin cámara", () => {
    expect(base({ cameraIds: [NO_CAMERA] }).analyses.map((a) => a.id)).toEqual(["A3"]);
  });
  it("rango de fechas, estado y severidad mínima de alertas", () => {
    expect(base({ from: "2026-11-06", to: "2026-11-06" }).analyses.map((a) => a.id)).toEqual(["A2"]);
    expect(base({ alertStatuses: ["new", "reviewed"] }).alerts.map((a) => a.id).sort()).toEqual(["L1", "L3"]);
    expect(base({ severities: ["critical", "high"] }).alerts.map((a) => a.id).sort()).toEqual(["L1", "L3"]);
    expect(base({ severities: ["low"] }).alerts.map((a) => a.id)).toEqual(["L2"]);
    expect(base({ alertStatuses: ["closed"] }).alerts.map((a) => a.id)).toEqual(["L2"]);
  });
  it("nombre de archivo legible y seguro", () => {
    const r = base({ title: "Reporte Semanal Ñandú", cameraIds: ["c1"] });
    expect(reportFileName(r, "pdf")).toMatch(/^vision-ai_reporte-semanal-nandu_camara-1_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
  it("varias cámaras a la vez (Cámara 1 + Cámara 2) y varios escenarios", () => {
    const r = base({ cameraIds: ["c1", "c2"] });
    expect(r.meta.scope).toBe("Cámara 1, Cámara 2");
    expect(r.analyses.map((a) => a.id).sort()).toEqual(["A1", "A2"]);
    expect(r.perCamera.map((p) => p.camera)).toEqual(["Cámara 1", "Cámara 2"]);
    const r2 = base({ cameraIds: ["c2", NO_CAMERA] });
    expect(r2.analyses.map((a) => a.id).sort()).toEqual(["A2", "A3"]);
    expect(base({ scenarioIds: ["otro"] }).analyses).toHaveLength(0);
    expect(base({ scenarioIds: ["otro", "public-traffic"] }).analyses).toHaveLength(3);
  });
});
