import { describe, expect, it } from "vitest";
import type { Alert, Analysis, Detection, Rule } from "@/core/domain/entities";
import { computeKpis, evaluateRules, iou, nonMaxSuppression, pointInPolygon, polygonArea, splitByThreshold } from "@/core/domain/logic";
import { allowedAlertTransitions, can } from "@/core/domain/permissions";
import { sniffImageMime, validateUpload } from "@/core/application/validation";
import { csvCell, toCsv } from "@/infrastructure/export/csv";

const det = (id: string, classId: string, confidence: number, x = 0.1, y = 0.1, w = 0.1, h = 0.1): Detection => ({ id, classId, label: classId, confidence, box: { x, y, width: w, height: h } });

describe("umbral de confianza", () => {
  it("separa por umbral sin borrar el registro bruto", () => {
    const all = [det("a", "person", 0.9), det("b", "helmet", 0.36)];
    const { visible, low } = splitByThreshold(all, 0.5);
    expect(visible.map((d) => d.id)).toEqual(["a"]);
    expect(low.map((d) => d.id)).toEqual(["b"]);
    expect(all).toHaveLength(2);
  });
});

describe("geometría", () => {
  it("punto en polígono (ray casting)", () => {
    const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(pointInPolygon([0.5, 0.5], sq)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], sq)).toBe(false);
  });
  it("área normalizada de un polígono", () => {
    expect(polygonArea([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]])).toBeCloseTo(0.25);
  });
  it("IoU y NMS eliminan duplicados de la misma clase", () => {
    const a = det("a", "box", 0.9, 0.1, 0.1, 0.2, 0.2);
    const b = det("b", "box", 0.7, 0.11, 0.11, 0.2, 0.2);
    const c = det("c", "person", 0.8, 0.11, 0.11, 0.2, 0.2);
    expect(iou(a.box, b.box)).toBeGreaterThan(0.8);
    expect(nonMaxSuppression([a, b, c]).map((d) => d.id).sort()).toEqual(["a", "c"]);
  });
});

describe("reglas", () => {
  const rules: Rule[] = [
    { id: "r1", name: "EPP", description: "", condition: { kind: "pattern", patternType: "ppe_missing" }, threshold: 0.7, severity: "high", enabled: true },
    { id: "r2", name: "Ocupación", description: "", condition: { kind: "count", classId: "person", min: 2 }, threshold: 0.6, severity: "medium", enabled: true },
    { id: "r3", name: "Zona", description: "", condition: { kind: "zone", classIds: ["box"], zoneId: "z" }, threshold: 0.6, severity: "high", enabled: true },
    { id: "r4", name: "Inactiva", description: "", condition: { kind: "count", classId: "person", min: 1 }, threshold: 0.1, severity: "low", enabled: false },
  ];
  const zones = [{ id: "z", name: "Z", kind: "restricted" as const, polygon: [[0.6, 0.6], [1, 0.6], [1, 1], [0.6, 1]] as [number, number][] }];

  it("dispara patrón, conteo y zona; ignora reglas inactivas y bajo umbral", () => {
    const hits = evaluateRules({
      rules, zones, threshold: 0.5,
      detections: [det("p1", "person", 0.9), det("p2", "person", 0.8), det("p3", "person", 0.4), det("b1", "box", 0.9, 0.7, 0.7, 0.1, 0.1), det("b2", "box", 0.9, 0.1, 0.1, 0.1, 0.1)],
      patterns: [{ id: "x", type: "ppe_missing", label: "EPP", confidence: 0.86, evidence: "e", source: "model" }],
    });
    expect(hits.map((h) => h.rule.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(hits.find((h) => h.rule.id === "r3")?.message).toContain("en Z");
  });

  it("no dispara un patrón por debajo de la confianza de la regla", () => {
    const hits = evaluateRules({ rules: [rules[0]], zones: [], threshold: 0.5, detections: [], patterns: [{ id: "x", type: "ppe_missing", label: "EPP", confidence: 0.5, evidence: "", source: "model" }] });
    expect(hits).toHaveLength(0);
  });
});

describe("KPI derivados de los datos", () => {
  it("se calculan desde análisis y alertas almacenados", () => {
    const base: Omit<Analysis, "id" | "status" | "durationMs" | "averageConfidence" | "detections"> = { createdAt: new Date().toISOString(), createdBy: "u", sourceName: "s", sourceKind: "scenario", scenarioId: "s", mode: "combined", engine: "DEMO", threshold: 0.5, masks: [], patterns: [], warnings: [] };
    const analyses: Analysis[] = [
      { ...base, id: "1", status: "completed", durationMs: 2000, averageConfidence: 0.9, detections: [det("a", "x", 0.9), det("b", "x", 0.3)] },
      { ...base, id: "2", status: "failed", durationMs: 100, averageConfidence: 0, detections: [] },
    ];
    const alerts = [{ status: "new" }, { status: "closed" }] as Alert[];
    const k = computeKpis(analyses, alerts);
    expect(k).toMatchObject({ analyses: 2, completed: 1, failed: 1, objects: 1, openAlerts: 1, totalAlerts: 2, averageDurationMs: 2000 });
    expect(k.averageConfidence).toBeCloseTo(0.9);
  });
});

describe("permisos y ciclo de vida de alertas", () => {
  it("auditor es solo lectura; supervisor puede cerrar", () => {
    expect(can("auditor", "analysis.run")).toBe(false);
    expect(allowedAlertTransitions("auditor", "new")).toEqual([]);
    expect(allowedAlertTransitions("operator", "new")).toEqual(["reviewed"]);
    expect(allowedAlertTransitions("supervisor", "new")).toEqual(["reviewed", "closed"]);
    expect(allowedAlertTransitions("supervisor", "closed")).toEqual(["reviewed"]);
  });
});

describe("validación de archivos", () => {
  it("acepta JPG/PNG y rechaza otros formatos, MIME falso y tamaño excedido", () => {
    expect(validateUpload({ name: "a.jpg", type: "image/jpeg", size: 1000 }, 8).ok).toBe(true);
    expect(validateUpload({ name: "a.gif", type: "image/gif", size: 1000 }, 8).ok).toBe(false);
    expect(validateUpload({ name: "a.png", type: "text/html", size: 1000 }, 8).ok).toBe(false);
    expect(validateUpload({ name: "a.png", type: "image/png", size: 9 * 1024 * 1024 }, 8).ok).toBe(false);
  });
  it("detecta la firma real del contenido", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageMime(new Uint8Array([0x3c, 0x68, 0x74, 0x6d]))).toBeNull();
  });
});

describe("CSV", () => {
  it("escapa comillas/comas y neutraliza fórmulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(toCsv(["h1", "h2"], [[1, "x"]])).toBe("h1,h2\r\n1,x");
  });
});
