// Prueba de integración del flujo completo con el adaptador demo y un repositorio en memoria.
import { describe, expect, it } from "vitest";
import { AnalyzeImage } from "@/core/application/analysis";
import { ManageAlerts, searchHistory } from "@/core/application/operations";
import type { User } from "@/core/domain/entities";
import { computeKpis } from "@/core/domain/logic";
import { LocalAnalysisRepository, type KeyValueStorage } from "@/infrastructure/persistence/LocalAnalysisRepository";
import { DemoVisionAdapter } from "@/infrastructure/vision/DemoVisionAdapter";
import { SCENARIO_SEEDS, scenarioCatalog } from "@/modules/scenarios/data/scenes";
import { DEFAULT_CLASSES, DEFAULT_RULES, DEFAULT_SETTINGS } from "@/modules/scenarios/data/seedCatalog";
import { buildSeedState } from "@/app/providers/seedState";

const operator: User = { id: "o", name: "Op", role: "operator", email: "" };
const supervisor: User = { id: "s", name: "Sup", role: "supervisor", email: "" };
const auditor: User = { id: "a", name: "Aud", role: "auditor", email: "" };

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function setup(failNext = false) {
  const storage = memoryStorage();
  const repo = new LocalAnalysisRepository(storage, "t", () => ({ schema: 1, analyses: [], alerts: [], rules: DEFAULT_RULES, classes: DEFAULT_CLASSES, settings: { ...DEFAULT_SETTINGS, simulateNextFailure: failNext }, events: [] }));
  const engine = new DemoVisionAdapter({
    seeds: SCENARIO_SEEDS, stageDelayMs: 0,
    settings: () => repo.getSettings(),
    onFailureConsumed: () => repo.saveSettings({ ...repo.getSettings(), simulateNextFailure: false }),
  });
  return { storage, repo, uc: new AnalyzeImage(engine, repo, scenarioCatalog) };
}

describe("AnalyzeImage (flujo de extremo a extremo)", () => {
  it("seguridad industrial combinado: detecciones, máscaras, patrón EPP y alerta", async () => {
    const { repo, uc } = setup();
    const stages: string[] = [];
    const a = await uc.execute({ scenarioId: "industrial-safety", mode: "combined", threshold: 0.5, source: { kind: "scenario" } }, operator, (e) => stages.push(e.stage));
    expect(a.status).toBe("completed");
    expect(a.engine).toBe("DEMO");
    expect(a.detections.length).toBe(8);
    expect(a.detections.filter((d) => d.confidence < 0.5)).toHaveLength(1); // casco falso positivo marcado, no borrado
    expect(a.masks.length).toBeGreaterThan(0);
    expect(a.patterns.some((p) => p.type === "ppe_missing")).toBe(true);
    expect(repo.listAlerts().map((x) => x.ruleId)).toEqual(["rule-ppe"]);
    expect(stages[0]).toBe("validating");
    expect(stages).toContain("saving");
    for (const d of a.detections) for (const v of [d.box.x, d.box.y, d.box.x + d.box.width, d.box.y + d.box.height]) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });

  it("es determinista: la misma entrada produce el mismo resultado", async () => {
    const { uc } = setup();
    const req = { scenarioId: "quality-control", mode: "combined" as const, threshold: 0.5, source: { kind: "scenario" as const } };
    const a = await uc.execute(req, operator);
    const b = await uc.execute(req, operator);
    expect(a.detections).toEqual(b.detections);
    expect(a.patterns).toEqual(b.patterns);
  });

  it("monitoreo vial: la regla de zona detecta el camión dentro del carril restringido", async () => {
    const { repo, uc } = setup();
    const a = await uc.execute({ scenarioId: "public-traffic", mode: "patterns", threshold: 0.5, source: { kind: "scenario" } }, operator);
    const zoneAlerts = repo.listAlerts().filter((x) => x.ruleId === "rule-zone");
    expect(zoneAlerts).toHaveLength(1);
    expect(zoneAlerts[0].evidence).toContain("Camión");
    expect(a.patterns.some((p) => p.type === "zone_intrusion" && p.relatedDetectionIds?.[0] === "truck-V3")).toBe(true);
  });

  it("aforo retail: la regla de conteo genera alerta de aforo máximo excedido", async () => {
    const { repo, uc } = setup();
    await uc.execute({ scenarioId: "retail-store", mode: "combined", threshold: 0.5, source: { kind: "scenario" } }, operator);
    expect(repo.listAlerts().map((x) => x.ruleId).sort()).toEqual(["rule-occupancy"]);
  });

  it("detección sola no evalúa reglas; segmentación sola no tiene cajas", async () => {
    const { repo, uc } = setup();
    const d = await uc.execute({ scenarioId: "industrial-safety", mode: "detection", threshold: 0.5, source: { kind: "scenario" } }, operator);
    const s = await uc.execute({ scenarioId: "industrial-safety", mode: "segmentation", threshold: 0.5, source: { kind: "scenario" } }, operator);
    expect(d.masks).toHaveLength(0);
    expect(s.detections).toHaveLength(0);
    expect(repo.listAlerts()).toHaveLength(0);
  });

  it("imagen propia: advierte que los resultados son de referencia simulados", async () => {
    const { uc } = setup();
    const a = await uc.execute({ scenarioId: "retail-store", mode: "detection", threshold: 0.5, source: { kind: "upload", fileName: "foto.png", mime: "image/png", size: 1000, dataUrl: "data:," } }, operator);
    expect(a.sourceKind).toBe("upload");
    expect(a.warnings.join(" ")).toMatch(/NO corresponden/);
  });

  it("error: registra el análisis como fallido y permite reintentar", async () => {
    const { repo, uc } = setup(true);
    const req = { scenarioId: "industrial-safety", mode: "detection" as const, threshold: 0.5, source: { kind: "scenario" as const } };
    await expect(uc.execute(req, operator)).rejects.toThrow(/fallo simulado/);
    expect(repo.listAnalyses()[0].status).toBe("failed");
    const retry = await uc.execute(req, operator);
    expect(retry.status).toBe("completed");
  });

  it("el auditor no puede ejecutar análisis", async () => {
    const { uc } = setup();
    await expect(uc.execute({ scenarioId: "industrial-safety", mode: "detection", threshold: 0.5, source: { kind: "scenario" } }, auditor)).rejects.toThrow(/permiso/);
  });

  it("revisar y cerrar una alerta se refleja en KPI y queda en auditoría", async () => {
    const { repo, uc } = setup();
    await uc.execute({ scenarioId: "industrial-safety", mode: "combined", threshold: 0.5, source: { kind: "scenario" } }, operator);
    const ma = new ManageAlerts(repo);
    const al = repo.listAlerts()[0];
    expect(computeKpis(repo.listAnalyses(), repo.listAlerts()).openAlerts).toBe(1);
    ma.updateStatus(al.id, "reviewed", operator, "Verificado en cámara");
    expect(() => ma.updateStatus(al.id, "closed", operator)).toThrow();
    ma.updateStatus(al.id, "closed", supervisor);
    expect(computeKpis(repo.listAnalyses(), repo.listAlerts()).openAlerts).toBe(0);
    expect(repo.listAlerts()[0]).toMatchObject({ status: "closed", reviewedBy: "Sup", note: "Verificado en cámara" });
    expect(repo.listEvents().some((e) => e.type === "alert.updated")).toBe(true);
  });

  it("el historial persiste (se recarga desde el almacenamiento) y se filtra", async () => {
    const { storage, uc } = setup();
    await uc.execute({ scenarioId: "public-traffic", mode: "combined", threshold: 0.5, source: { kind: "scenario" } }, operator);
    const reloaded = new LocalAnalysisRepository(storage, "t", () => { throw new Error("no debería reinicializar"); });
    expect(reloaded.listAnalyses()).toHaveLength(1);
    expect(searchHistory(reloaded.listAnalyses(), [], { scenarioId: "public-traffic", classId: "truck" })).toHaveLength(1);
    expect(searchHistory(reloaded.listAnalyses(), [], { scenarioId: "retail-store" })).toHaveLength(0);
  });
});

describe("datos semilla", () => {
  it("inicia con historial, alertas y eventos limpios (0 registros) y catálogo de reglas/clases cargado", () => {
    const s = buildSeedState(new Date("2026-11-03T18:00:00"));
    expect(s.analyses).toHaveLength(0);
    expect(s.alerts).toHaveLength(0);
    expect(s.events).toHaveLength(0);
    expect(s.rules.length).toBeGreaterThan(0);
    expect(s.classes.length).toBeGreaterThan(0);
  });
});
