// Caso de uso AnalyzeImage + ensamblado de resultados (umbral, reglas, alertas).
import type { AnalysisInput, AnalysisSource, ProgressListener, VisionResult } from "../contracts/vision";
import type { Alert, Analysis, AnalysisMode, Rule, Scenario, User, VisionClass } from "../domain/entities";
import { averageConfidence, evaluateRules, splitByThreshold } from "../domain/logic";
import { can } from "../domain/permissions";
import type { AnalysisRepository, ScenarioCatalog, VisionEngine } from "../ports";
import { validateUpload } from "./validation";

let counter = 0;
export function newId(prefix: string, now = new Date()): string {
  counter = (counter + 1) % 1000;
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${d}-${r}${counter.toString().padStart(3, "0")}`;
}

export interface AnalysisRequest {
  scenarioId: string;
  mode: AnalysisMode;
  threshold: number;
  source: AnalysisSource;
  /** Qué alertar (p. ej. aforo máximo "capacity:N" en Control de aforo). */
  alertTarget?: string;
  /** Reglas habilitadas para este análisis (por defecto, todas las activas). */
  ruleIds?: string[];
}

/** Ensambla el análisis final: aplica clases habilitadas, umbral y reglas. Función pura. */
export function assembleAnalysis(params: {
  base: Analysis;
  result: VisionResult;
  rules: Rule[];
  scenario: Scenario;
  classes: VisionClass[];
  now: Date;
  snapshotUrl?: string;
}): { analysis: Analysis; alerts: Alert[] } {
  const { base, result, rules, scenario, classes, now, snapshotUrl } = params;
  const enabled = new Set(classes.filter((c) => c.enabled).map((c) => c.id));
  const detections = result.detections.filter((d) => enabled.has(d.classId));
  const masks = result.masks.filter((m) => enabled.has(m.classId));
  const warnings = [...base.warnings];
  const excluded = result.detections.length - detections.length;
  if (excluded > 0) warnings.push(`${excluded} detección(es) omitidas por pertenecer a clases deshabilitadas.`);

  const { visible, low } = splitByThreshold(detections, base.threshold);
  if (low.length) warnings.push(`${low.length} detección(es) bajo el umbral de ${(base.threshold * 100).toFixed(0)} %: se marcan como baja confianza y requieren revisión.`);

  const usesPatterns = base.mode === "patterns" || base.mode === "combined";
  const hits = usesPatterns
    ? evaluateRules({ rules, detections, patterns: result.patterns, zones: scenario.zones, threshold: base.threshold })
    : [];
  const patterns = [...result.patterns, ...hits.flatMap((h) => (h.pattern ? [h.pattern] : []))];

  const finalSnapshot = result.annotatedSnapshotUrl ?? snapshotUrl;
  const alerts: Alert[] = hits.map((h) => ({
    id: newId("AL", now),
    analysisId: base.id,
    scenarioId: base.scenarioId,
    ruleId: h.rule.id,
    ruleName: h.rule.name,
    severity: h.rule.severity,
    message: h.message,
    evidence: h.evidence,
    status: "new",
    createdAt: now.toISOString(),
    snapshotUrl: finalSnapshot,
  }));
  if (alerts.length) warnings.push(`${alerts.length} regla(s) activada(s): revise la evidencia antes de concluir un incumplimiento.`);

  const confSource = visible.length ? visible : masks;
  return {
    analysis: {
      ...base,
      status: "completed",
      engine: result.engine,
      detections,
      masks,
      patterns,
      durationMs: result.durationMs,
      averageConfidence: +averageConfidence(confSource).toFixed(4),
      warnings,
      snapshotUrl: finalSnapshot,
    },
    alerts,
  };
}

export class AnalyzeImage {
  constructor(
    private readonly engine: VisionEngine,
    private readonly repo: AnalysisRepository,
    private readonly scenarios: ScenarioCatalog,
  ) {}

  async execute(req: AnalysisRequest, user: User, onProgress?: ProgressListener): Promise<Analysis> {
    if (!can(user.role, "analysis.run")) throw new Error("Su perfil no tiene permiso para ejecutar análisis.");
    onProgress?.({ stage: "validating", percent: 5 });

    const scenario = this.scenarios.get(req.scenarioId);
    if (!scenario) throw new Error("Seleccione un escenario válido.");
    if (!(req.threshold >= 0 && req.threshold <= 1)) throw new Error("El umbral de confianza debe estar entre 0 y 100 %.");
    if (req.source.kind === "upload") {
      const v = validateUpload({ name: req.source.fileName, type: req.source.mime, size: req.source.size }, this.repo.getSettings().maxUploadMb);
      if (!v.ok) throw new Error(v.error);
    }

    const now = new Date();
    const warnings: string[] = [];
    if (req.source.kind === "upload" && this.engine.kind === "DEMO") {
      warnings.push(
        `Imagen propia en modo DEMO: los resultados son de referencia del escenario "${scenario.name}" (simulados) y NO corresponden al contenido de "${req.source.fileName}".`,
      );
    }
    const base: Analysis = {
      id: newId("AN", now),
      createdAt: now.toISOString(),
      createdBy: user.name,
      sourceName: req.source.kind === "upload" ? req.source.fileName : `${scenario.name} (escena semilla)`,
      sourceKind: req.source.kind,
      scenarioId: scenario.id,
      mode: req.mode,
      status: "processing",
      engine: this.engine.kind,
      threshold: req.threshold,
      durationMs: 0,
      averageConfidence: 0,
      detections: [],
      masks: [],
      patterns: [],
      warnings,
    };
    this.repo.saveAnalysis(base);
    this.log(user, "analysis.started", "info", `Análisis ${base.id} iniciado (${scenario.name}).`, base.id);

    const input: AnalysisInput = { analysisId: base.id, scenarioId: scenario.id, mode: req.mode, threshold: req.threshold, source: req.source, alertTarget: req.alertTarget };
    const t0 = performance.now();
    try {
      const result = await this.engine.analyze(input, onProgress);
      onProgress?.({ stage: "rules", percent: 88 });
      const { analysis, alerts } = assembleAnalysis({
        base,
        result: { ...result, durationMs: Math.round(performance.now() - t0) },
        rules: this.repo.listRules().filter((r) => !req.ruleIds || req.ruleIds.includes(r.id)),
        scenario,
        classes: this.repo.listClasses(),
        now: new Date(),
        snapshotUrl: req.source.kind === "upload" ? req.source.dataUrl : scenario.asset,
      });
      onProgress?.({ stage: "saving", percent: 96 });
      this.repo.saveAnalysis(analysis);
      for (const al of alerts) {
        this.repo.saveAlert(al);
        this.log(user, "alert.created", "warning", `Alerta ${al.id}: ${al.message}`, al.id);
      }
      this.log(user, "analysis.completed", "success", `Análisis ${analysis.id} completado en ${(analysis.durationMs / 1000).toFixed(1)} s.`, analysis.id);
      onProgress?.({ stage: "saving", percent: 100 });
      return analysis;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido durante el análisis.";
      const failed: Analysis = { ...base, status: "failed", error: message, durationMs: Math.round(performance.now() - t0) };
      this.repo.saveAnalysis(failed);
      this.log(user, "analysis.failed", "error", `Análisis ${base.id} fallido: ${message}`, base.id);
      throw Object.assign(new Error(message), { analysisId: base.id });
    }
  }

  private log(user: User, type: Parameters<AnalysisRepository["addEvent"]>[0]["type"], level: "info" | "success" | "warning" | "error", message: string, ref?: string) {
    this.repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type, level, message, ref });
  }
}
