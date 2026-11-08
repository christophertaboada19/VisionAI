// Pruebas del monitoreo en vivo: determinismo, seguimiento, antirrebote/enfriamiento y cierre de sesión.
import { describe, expect, it } from "vitest";
import { LiveMonitoring } from "@/core/application/liveMonitoring";
import type { User } from "@/core/domain/entities";
import { LocalAnalysisRepository } from "@/infrastructure/persistence/LocalAnalysisRepository";
import { DemoVisionStreamAdapter } from "@/infrastructure/vision/DemoVisionStreamAdapter";
import { liveFrame, qcKind } from "@/modules/scenarios/data/liveScenes";
import { scenarioCatalog } from "@/modules/scenarios/data/scenes";
import { DEFAULT_CLASSES, DEFAULT_RULES, DEFAULT_SETTINGS } from "@/modules/scenarios/data/seedCatalog";

const op: User = { id: "o", name: "Op", role: "operator", email: "" };
const FPS = 15;

function setup() {
  const repo = new LocalAnalysisRepository(null, "t", () => ({ schema: 1, analyses: [], alerts: [], rules: DEFAULT_RULES, classes: DEFAULT_CLASSES, settings: DEFAULT_SETTINGS, events: [] }));
  return { repo, live: new LiveMonitoring(new DemoVisionStreamAdapter(), repo, scenarioCatalog) };
}

/** Ejecuta una sesión simulada de `seconds` a 15 fps. */
function run(scenarioId: string, seconds: number, mode: "combined" | "detection" = "combined") {
  const { repo, live } = setup();
  const s = live.start({ scenarioId, mode, threshold: 0.5 }, op);
  let last;
  for (let i = 0; i <= seconds * FPS; i++) last = s.process(i / FPS, i);
  return { repo, live, s, last: last! };
}

describe("escenas en vivo", () => {
  it("son deterministas: el mismo t produce el mismo fotograma", () => {
    for (const id of ["industrial-safety", "public-traffic", "quality-control", "retail-store"]) {
      expect(liveFrame(id, 12.34)).toEqual(liveFrame(id, 12.34));
      expect(liveFrame(id, 12.34).detections).not.toEqual(liveFrame(id, 3).detections); // la escena se mueve
    }
  });

  it("las cajas siguen a los objetos y quedan dentro de la imagen", () => {
    const a = liveFrame("industrial-safety", 0).detections.find((d) => d.id === "person-T1")!;
    const b = liveFrame("industrial-safety", 3).detections.find((d) => d.id === "person-T1")!;
    expect(a.box.x).not.toBeCloseTo(b.box.x, 2);
    for (let t = 0; t < 60; t += 0.7) {
      for (const d of liveFrame("quality-control", t).detections) {
        expect(d.box.x).toBeGreaterThanOrEqual(0);
        expect(d.box.x + d.box.width).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("cada envase de la faja es un track nuevo", () => {
    const tracks = new Set<string>();
    for (let t = 0; t < 40; t += 0.5) for (const d of liveFrame("quality-control", t).detections) if (d.classId === "product") tracks.add(d.trackId!);
    expect(tracks.size).toBeGreaterThan(8);
    expect(qcKind(2)).toBe("defect");
  });

  it("en aforo retail la ocupación sube y baja", () => {
    const counts = new Set<number>();
    for (let t = 0; t < 90; t += 1) counts.add(liveFrame("retail-store", t).detections.filter((d) => d.classId === "person").length);
    expect(Math.min(...counts)).toBeLessThan(4);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(4);
  });
});

describe("LiveMonitoring", () => {
  it("crea la sesión, alerta EPP solo tras el antirrebote y respeta el enfriamiento", () => {
    const { repo, s } = run("industrial-safety", 40);
    const ppe = repo.listAlerts().filter((a) => a.ruleId === "rule-ppe");
    // Condición permanente: primera alerta a ~1,5 s y la siguiente tras 30 s de enfriamiento.
    expect(ppe).toHaveLength(2);
    expect(ppe.map((a) => a.frameT!).sort((x, y) => x - y)[0]).toBeGreaterThanOrEqual(1.5);
    const fin = s.stop();
    expect(fin.status).toBe("completed");
    expect(fin.sourceKind).toBe("live");
    expect(fin.live!.frames).toBe(40 * FPS + 1);
    expect(fin.live!.uniqueTracks).toBeGreaterThanOrEqual(3);
    expect(repo.listEvents().some((e) => e.type === "live.stopped")).toBe(true);
  });

  it("monitoreo vial: el camión que invade el carril restringido genera alerta de zona", () => {
    const { repo } = run("public-traffic", 20);
    const zone = repo.listAlerts().filter((a) => a.ruleId === "rule-zone");
    expect(zone.some((a) => a.message.includes("Camión"))).toBe(true);
  });

  it("calidad: alerta una vez por envase defectuoso que pasa por inspección", () => {
    const { repo, last } = run("quality-control", 40);
    const def = repo.listAlerts().filter((a) => a.ruleId === "rule-defect");
    expect(def.length).toBeGreaterThanOrEqual(2);
    expect(new Set(def.map((a) => a.message)).size).toBe(def.length); // distintos envases
    expect(last.stats.patternEvents.conforming).toBeGreaterThan(0);
  });

  it("perfil Detección no evalúa reglas", () => {
    const { repo } = run("industrial-safety", 10, "detection");
    expect(repo.listAlerts()).toHaveLength(0);
  });

  it("la evidencia se reconstruye exactamente con replay(t)", () => {
    const { repo, live } = run("industrial-safety", 5);
    const a = repo.listAlerts()[0];
    const f = live.replay(a.scenarioId, "combined", a.frameT!);
    expect(f.patterns.some((p) => p.type === "ppe_missing")).toBe(true);
    expect(f.detections).toEqual(liveFrame("industrial-safety", a.frameT!).detections);
  });
});
