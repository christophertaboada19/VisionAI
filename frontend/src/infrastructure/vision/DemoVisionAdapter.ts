// Motor de visión SIMULADO. Devuelve resultados semilla deterministas por escenario.
// NO es un modelo entrenado ni ejecuta inferencia: sirve para enseñar y demostrar el flujo.
import type { AnalysisInput, AnalysisStage, ProgressListener, VisionResult } from "@/core/contracts/vision";
import type { AnalysisMode } from "@/core/domain/entities";
import { clamp01 } from "@/core/domain/logic";
import type { VisionEngine } from "@/core/ports";
import type { ScenarioSeed } from "@/modules/scenarios/data/scenes";

export interface DemoAdapterOptions {
  seeds: Record<string, ScenarioSeed>;
  /** Lee los ajustes vigentes (modo aleatorio y fallo simulado). */
  settings: () => { randomDemo: boolean; simulateNextFailure: boolean };
  /** Se invoca cuando se consume el fallo simulado. */
  onFailureConsumed?: () => void;
  /** Milisegundos por etapa (0 en pruebas). */
  stageDelayMs?: number;
}

const STAGES_BY_MODE: Record<AnalysisMode, AnalysisStage[]> = {
  detection: ["preprocessing", "detecting"],
  segmentation: ["preprocessing", "segmenting"],
  patterns: ["preprocessing", "detecting", "patterns"],
  combined: ["preprocessing", "detecting", "segmenting", "patterns"],
};

const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Generador pseudoaleatorio reproducible (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DemoVisionAdapter implements VisionEngine {
  readonly kind = "DEMO" as const;
  constructor(private readonly opts: DemoAdapterOptions) {}

  async analyze(input: AnalysisInput, onProgress?: ProgressListener): Promise<VisionResult> {
    const started = performance.now();
    const delay = this.opts.stageDelayMs ?? 450;
    const seed = this.opts.seeds[input.scenarioId];
    const stages = STAGES_BY_MODE[input.mode];
    const { randomDemo, simulateNextFailure } = this.opts.settings();

    for (let i = 0; i < stages.length; i++) {
      onProgress?.({ stage: stages[i], percent: 15 + Math.round((i / stages.length) * 65) });
      await wait(delay);
      if (simulateNextFailure && i === stages.length - 1) {
        this.opts.onFailureConsumed?.();
        throw new Error("El motor de demostración no respondió (fallo simulado). Puede reintentar el análisis.");
      }
    }
    if (!seed) throw new Error(`No existen resultados semilla para el escenario "${input.scenarioId}".`);

    const rand = rng(randomDemo ? Date.now() : 1);
    const jitter = (c: number) => (randomDemo ? +clamp01(c + (rand() - 0.5) * 0.08).toFixed(3) : c);

    const wantsDet = input.mode !== "segmentation";
    const wantsMasks = input.mode === "segmentation" || input.mode === "combined";
    const wantsPatterns = input.mode === "patterns" || input.mode === "combined";

    return {
      analysisId: input.analysisId,
      engine: "DEMO",
      detections: wantsDet ? seed.detections.map((d) => ({ ...d, box: { ...d.box }, confidence: jitter(d.confidence) })) : [],
      masks: wantsMasks ? seed.masks.map((m) => ({ ...m, confidence: jitter(m.confidence) })) : [],
      patterns: wantsPatterns ? seed.patterns.map((p) => ({ ...p, confidence: jitter(p.confidence) })) : [],
      durationMs: Math.round(performance.now() - started),
    };
  }
}
