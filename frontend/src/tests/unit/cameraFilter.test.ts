import { describe, expect, it } from "vitest";
import type { Alert, Analysis, AuditEvent, CameraConfig } from "@/core/domain/entities";
import { ALL_CAMERAS, buildCameraResolver, cameraMatches, NO_CAMERA } from "@/shared/camera/cameraResolver";

const cam = (id: string, name: string): CameraConfig => ({ id, name, sourceKind: "public-stream", url: "", scenarioId: "public-traffic", alertTarget: "all", mode: "combined", threshold: 0.5, enabled: true });
const an = (id: string, extra: Partial<Analysis> = {}) => ({ id, ...extra }) as Analysis;
const al = (id: string, analysisId: string, extra: Partial<Alert> = {}) => ({ id, analysisId, ...extra }) as Alert;

describe("filtro por cámara", () => {
  const cameras = [cam("cam-1", "Cámara 1 · Barton"), cam("cam-2", "Cámara 2 · Market")];
  const analyses = [
    an("LV-1", { cameraId: "cam-1" }),
    an("LV-2", { cameraName: "Cámara 2 · Market" }), // dato antiguo: solo nombre
    an("AN-3"), // imagen subida, sin cámara
  ];
  const alerts = [al("AL-1", "LV-1"), al("AL-2", "LV-2"), al("AL-3", "AN-3"), al("AL-4", "AN-3", { cameraId: "cam-2" })];
  const r = buildCameraResolver(analyses, alerts, cameras);

  it("resuelve la cámara de cada análisis (por id, por nombre o sin cámara)", () => {
    expect(r.ofAnalysis(analyses[0])).toBe("cam-1");
    expect(r.ofAnalysis(analyses[1])).toBe("cam-2");
    expect(r.ofAnalysis(analyses[2])).toBe(NO_CAMERA);
  });

  it("una alerta sin cámara hereda la de su análisis; con cámara propia usa la suya", () => {
    expect(r.ofAlert(alerts[0])).toBe("cam-1");
    expect(r.ofAlert(alerts[1])).toBe("cam-2");
    expect(r.ofAlert(alerts[2])).toBe(NO_CAMERA);
    expect(r.ofAlert(alerts[3])).toBe("cam-2");
  });

  it("los eventos se resuelven por su referencia; los de configuración no tienen cámara", () => {
    const ev = (ref?: string) => ({ id: "e", at: "", user: "u", type: "alert.created", level: "info", message: "", ref }) as AuditEvent;
    expect(r.ofEvent(ev("AL-1"))).toBe("cam-1");
    expect(r.ofEvent(ev("LV-2"))).toBe("cam-2");
    expect(r.ofEvent(ev("RULE-9"))).toBeNull();
    expect(r.ofEvent(ev())).toBeNull();
  });

  it("'Todas' deja pasar todo y una cámara solo lo suyo", () => {
    expect(cameraMatches(ALL_CAMERAS, "cam-1")).toBe(true);
    expect(cameraMatches(ALL_CAMERAS, null)).toBe(true);
    expect(cameraMatches("cam-1", "cam-1")).toBe(true);
    expect(cameraMatches("cam-1", "cam-2")).toBe(false);
    expect(cameraMatches("cam-1", null)).toBe(false);
    expect(cameraMatches(NO_CAMERA, NO_CAMERA)).toBe(true);
  });

  it("nombres legibles", () => {
    expect(r.name("cam-1")).toBe("Cámara 1 · Barton");
    expect(r.name(NO_CAMERA)).toBe("Imágenes subidas (sin cámara)");
  });
});

describe("datos antiguos de Supabase sin cámara", () => {
  it("una sesión en vivo se asigna a su cámara por el nombre de la fuente", () => {
    const cameras = [cam("cam-1", "Cámara 1 · Barton"), cam("cam-10", "Cámara 1 · Barton Norte")];
    const a1 = an("LV-9", { sourceKind: "live", sourceName: "Cámara 1 · Barton Norte (Monitoreo vial)" });
    const a2 = an("LV-8", { sourceKind: "live", sourceName: "Cámara 1 · Barton (Monitoreo vial)" });
    const r = buildCameraResolver([a1, a2], [al("AL-9", "LV-9")], cameras);
    expect(r.ofAnalysis(a1)).toBe("cam-10");
    expect(r.ofAnalysis(a2)).toBe("cam-1");
    expect(r.ofAlert(al("AL-9", "LV-9"))).toBe("cam-10");
  });
});

describe("CSV con columna de cámara", () => {
  it("analysesCsv y alertsCsv incluyen la cámara de cada registro", async () => {
    const { analysesCsv, alertsCsv } = await import("@/infrastructure/export/csv");
    const a = an("LV-1", { createdAt: "2026-11-08T10:00:00Z", createdBy: "u", sourceName: "s", scenarioId: "public-traffic", mode: "combined", status: "completed", engine: "REAL", threshold: 0.5, durationMs: 1, averageConfidence: 0.5, detections: [], masks: [], patterns: [], warnings: [] });
    const rows = analysesCsv([a], [], [], () => "Cámara 1 · Barton").split("\r\n");
    const header = rows[0].split(",");
    expect(header[3]).toBe("camara");
    expect(rows[1]).toContain("Cámara 1 · Barton");
    const alertRows = alertsCsv([{ ...al("AL-1", "LV-1"), createdAt: "2026-11-08T10:00:00Z", scenarioId: "x", ruleName: "r", severity: "high", message: "m", status: "new" } as Alert], [], () => "Cámara 4", "REAL").split("\r\n");
    expect(alertRows[0].split(",")[4]).toBe("camara");
    expect(alertRows[1].startsWith("REAL,AL-1,LV-1,")).toBe(true);
    expect(alertRows[1]).toContain("Cámara 4");
  });
});

describe("selección múltiple de cámaras", () => {
  it("una lista vacía incluye todo y una lista con varias incluye solo esas", () => {
    expect(cameraMatches([], "cam-1")).toBe(true);
    expect(cameraMatches([], null)).toBe(true);
    expect(cameraMatches(["cam-1", "cam-3"], "cam-1")).toBe(true);
    expect(cameraMatches(["cam-1", "cam-3"], "cam-3")).toBe(true);
    expect(cameraMatches(["cam-1", "cam-3"], "cam-2")).toBe(false);
    expect(cameraMatches(["cam-1", NO_CAMERA], NO_CAMERA)).toBe(true);
    expect(cameraMatches(["cam-1"], null)).toBe(false);
  });
});
