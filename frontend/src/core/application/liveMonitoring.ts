// Caso de uso: monitoreo en vivo fotograma a fotograma.
// - Aplica clases habilitadas y umbral a cada fotograma (baja confianza marcada, no borrada).
// - Evalúa reglas con ANTIRREBOTE (la condición debe sostenerse `persistSeconds`) y
//   ENFRIAMIENTO (la misma regla + objeto no vuelve a alertar antes de `cooldownSeconds`).
// - No graba video: guarda la sesión, una instantánea final y las alertas con su instante t.
import type { VisionFrame, VisionStream } from "../contracts/vision";
import type { Alert, Analysis, AnalysisMode, Detection, LiveStats, PatternResult, Rule, Scenario, User } from "../domain/entities";
import { averageConfidence, evaluateRules, splitByThreshold, type RuleHit } from "../domain/logic";
import { can } from "../domain/permissions";
import type { AnalysisRepository, ScenarioCatalog, VisionStreamEngine } from "../ports";
import { newId } from "./analysis";

export interface LiveConfig {
  scenarioId: string;
  mode: AnalysisMode;
  threshold: number;
  ruleIds?: string[];
  persistSeconds?: number;
  cooldownSeconds?: number;
  cameraId?: string;
  cameraName?: string;
}

export interface LiveSnapshot extends LiveStats {
  objectsNow: number;
  lowNow: number;
  byClassNow: Record<string, number>;
  alerts: number;
  averageConfidence: number;
}

export interface LiveFrameResult {
  frame: VisionFrame;
  detections: Detection[];
  patterns: PatternResult[];
  /** Reglas cumplidas en este fotograma (incluye las que aún no superan el antirrebote). */
  hits: RuleHit[];
  /** Claves en espera de antirrebote → segundos acumulados. */
  pending: { key: string; rule: string; seconds: number }[];
  newAlerts: Alert[];
  stats: LiveSnapshot;
}

export const LIVE_MAX_SECONDS = 300;

export class LiveMonitoring {
  constructor(
    private readonly engine: VisionStreamEngine,
    private readonly repo: AnalysisRepository,
    private readonly scenarios: ScenarioCatalog,
  ) {}

  get kind() {
    return this.engine.kind;
  }

  start(cfg: LiveConfig, user: User): LiveSession {
    if (!can(user.role, "analysis.run")) throw new Error("Su perfil no tiene permiso para iniciar un monitoreo.");
    const scenario = this.scenarios.get(cfg.scenarioId);
    if (!scenario) throw new Error("Seleccione un escenario válido.");
    if (!(cfg.threshold >= 0 && cfg.threshold <= 1)) throw new Error("El umbral debe estar entre 0 y 100 %.");
    const stream = this.engine.open(scenario.id, cfg.mode);
    return new LiveSession(stream, this.repo, scenario, cfg, user, this.engine.kind);
  }

  /** Reconstruye un fotograma (determinista en DEMO) para revisar la evidencia de una alerta. */
  replay(scenarioId: string, mode: AnalysisMode, t: number): VisionFrame {
    return this.engine.open(scenarioId, mode).frame(t, Math.round(t * 15));
  }
}

export class LiveSession {
  readonly analysisId: string;
  private readonly rules: Rule[];
  private readonly enabledClasses: Set<string>;
  private readonly persist: number;
  private readonly cooldown: number;
  private readonly startedWall = Date.now();
  private readonly pendingSince = new Map<string, number>();
  private readonly lastAlertAt = new Map<string, number>();
  private readonly tracks = new Set<string>();
  private readonly patternKeys = new Map<string, Set<string>>();
  private firstT: number | null = null;
  private frames = 0;
  private latencySum = 0;
  private confSum = 0;
  private confN = 0;
  private maxObjects = 0;
  private alertCount = 0;
  private last: { frame: VisionFrame; detections: Detection[]; patterns: PatternResult[]; snapshotUrl?: string } | null = null;
  private stopped = false;
  private readonly base: Analysis;

  constructor(
    private readonly stream: VisionStream,
    private readonly repo: AnalysisRepository,
    private readonly scenario: Scenario,
    private readonly cfg: LiveConfig,
    private readonly user: User,
    engine: "DEMO" | "REAL",
  ) {
    this.persist = cfg.persistSeconds ?? 1.5;
    this.cooldown = cfg.cooldownSeconds ?? 30;
    this.rules = repo.listRules().filter((r) => r.enabled && (!cfg.ruleIds || cfg.ruleIds.includes(r.id)));
    this.enabledClasses = new Set(repo.listClasses().filter((c) => c.enabled).map((c) => c.id));
    const now = new Date();
    this.analysisId = newId("LV", now);
    this.base = {
      id: this.analysisId,
      createdAt: now.toISOString(),
      createdBy: user.name,
      sourceName: cfg.cameraName ? `${cfg.cameraName} (${scenario.name})` : `${scenario.name} (transmisión en vivo)`,
      sourceKind: "live",
      scenarioId: scenario.id,
      cameraId: cfg.cameraId,
      cameraName: cfg.cameraName,
      mode: cfg.mode,
      status: "processing",
      engine,
      threshold: cfg.threshold,
      durationMs: 0,
      averageConfidence: 0,
      detections: [],
      masks: [],
      patterns: [],
      warnings: [],
    };
    repo.saveAnalysis(this.base);
    repo.addEvent({ id: newId("EV"), at: now.toISOString(), user: user.name, type: "live.started", level: "info", ref: this.analysisId, message: `${cfg.cameraName ? `📹 ${cfg.cameraName}: m` : "M"}onitoreo en vivo ${this.analysisId} iniciado (${scenario.name}).` });
  }

  get isStopped() {
    return this.stopped;
  }

  process(t: number, index: number): LiveFrameResult {
    if (this.stopped) throw new Error("La sesión ya fue detenida.");
    const frame = this.stream.frame(t, index);
    return this.processFrame(frame);
  }

  /** Procesa un fotograma (real desde cámara/backend o simulado) evaluando reglas, antirrebote y KPIs. */
  processFrame(frame: VisionFrame, snapshotUrl?: string): LiveFrameResult {
    if (this.stopped) throw new Error("La sesión ya fue detenida.");
    const { t, index } = frame;
    if (this.firstT === null) this.firstT = t;
    const detections = frame.detections.filter((d) => this.enabledClasses.has(d.classId));
    const { visible, low } = splitByThreshold(detections, this.cfg.threshold);

    const usesPatterns = this.cfg.mode === "patterns" || this.cfg.mode === "combined";
    const hits = usesPatterns
      ? evaluateRules({ rules: this.rules, detections, patterns: frame.patterns, zones: this.scenario.zones, threshold: this.cfg.threshold })
      : [];
    const patterns = [...frame.patterns, ...hits.flatMap((h) => (h.pattern ? [h.pattern] : []))];

    // Antirrebote y enfriamiento por clave (regla + objeto).
    const present = new Set(hits.map((h) => h.key));
    for (const k of [...this.pendingSince.keys()]) if (!present.has(k)) this.pendingSince.delete(k);
    const newAlerts: Alert[] = [];
    const seenKeys = new Set<string>();
    const effectiveSnap = frame.annotatedSnapshotUrl ?? snapshotUrl ?? this.scenario.asset;
    for (const h of hits) {
      if (seenKeys.has(h.key)) continue;
      seenKeys.add(h.key);
      if (!this.pendingSince.has(h.key)) this.pendingSince.set(h.key, t);
      const held = t - (this.pendingSince.get(h.key) ?? t);
      const lastAt = this.lastAlertAt.get(h.key);
      if (held >= this.persist && (lastAt === undefined || t - lastAt >= this.cooldown)) {
        this.lastAlertAt.set(h.key, t);
        const alert: Alert = {
          id: newId("AL"),
          analysisId: this.analysisId,
          scenarioId: this.scenario.id,
          cameraId: this.cfg.cameraId,
          cameraName: this.cfg.cameraName,
          ruleId: h.rule.id,
          ruleName: h.rule.name,
          severity: h.rule.severity,
          message: this.cfg.cameraName ? `[${this.cfg.cameraName}] ${h.message}` : h.message,
          evidence: `${this.cfg.cameraName ? `Cámara: ${this.cfg.cameraName} · ` : ""}${h.evidence} Condición sostenida ${held.toFixed(1)} s · fotograma #${index} (t = ${t.toFixed(1)} s).`,
          status: "new",
          createdAt: new Date().toISOString(),
          frameT: +t.toFixed(3),
          frameIndex: index,
          snapshotUrl: effectiveSnap,
        };
        this.repo.saveAlert(alert);
        this.repo.addEvent({ id: newId("EV"), at: alert.createdAt, user: this.user.name, type: "alert.created", level: "warning", ref: alert.id, message: `${this.cfg.cameraName ? `📹 ${this.cfg.cameraName} · ` : ""}Alerta en vivo ${alert.id}: ${alert.message}` });
        this.alertCount++;
        newAlerts.push(alert);
      }
    }

    // Estadísticas acumuladas.
    this.frames++;
    this.latencySum += frame.latencyMs;
    for (const d of visible) {
      if (d.trackId) this.tracks.add(`${d.classId}:${d.trackId}`);
      this.confSum += d.confidence;
      this.confN++;
    }
    this.maxObjects = Math.max(this.maxObjects, visible.length);
    for (const p of patterns) {
      if (!this.patternKeys.has(p.type)) this.patternKeys.set(p.type, new Set());
      this.patternKeys.get(p.type)!.add(p.id);
    }
    const byClassNow: Record<string, number> = {};
    for (const d of visible) byClassNow[d.classId] = (byClassNow[d.classId] ?? 0) + 1;

    this.last = { frame: { ...frame, detections }, detections, patterns, snapshotUrl: effectiveSnap };
    return {
      frame: { ...frame, detections },
      detections,
      patterns,
      hits,
      pending: [...this.pendingSince.entries()].map(([key, since]) => ({ key, rule: this.rules.find((r) => key.startsWith(r.id))?.name ?? key, seconds: +(t - since).toFixed(1) })),
      newAlerts,
      stats: { ...this.statsBase(t), objectsNow: visible.length, lowNow: low.length, byClassNow, alerts: this.alertCount, averageConfidence: this.confN ? this.confSum / this.confN : 0 },
    };
  }

  private statsBase(t: number): LiveStats {
    const wall = (Date.now() - this.startedWall) / 1000;
    const patternEvents: Record<string, number> = {};
    this.patternKeys.forEach((v, k) => (patternEvents[k] = v.size));
    return {
      startT: +(this.firstT ?? t).toFixed(3),
      frames: this.frames,
      seconds: +(t - (this.firstT ?? t)).toFixed(1),
      fps: wall > 0 ? +(this.frames / wall).toFixed(1) : 0,
      avgLatencyMs: this.frames ? Math.round(this.latencySum / this.frames) : 0,
      uniqueTracks: this.tracks.size,
      maxObjects: this.maxObjects,
      patternEvents,
    };
  }

  /** Detiene la sesión y guarda el resumen + la instantánea del último fotograma. */
  stop(reason = "Detenida por el usuario"): Analysis {
    if (this.stopped) return this.repo.getAnalysis(this.analysisId) ?? this.base;
    this.stopped = true;
    const lastT = this.last?.frame.t ?? 0;
    const stats = this.statsBase(lastT);
    const lowFinal = this.last ? splitByThreshold(this.last.detections, this.cfg.threshold).low.length : 0;
    const engineKind = this.last?.frame.engine ?? this.base.engine;
    const warnings = [
      `Sesión en vivo (${engineKind}): ${stats.frames} fotogramas en ${stats.seconds} s (${reason.toLowerCase()}). Se guardó la instantánea final y las alertas con su evidencia.`,
    ];
    if (lowFinal) warnings.push(`${lowFinal} detección(es) bajo el umbral en la instantánea final: se marcan como baja confianza.`);
    if (this.alertCount) warnings.push(`${this.alertCount} alerta(s) generadas durante la sesión: revise la evidencia de cada una.`);
    const final: Analysis = {
      ...this.base,
      engine: engineKind,
      status: this.frames ? "completed" : "failed",
      error: this.frames ? undefined : "La sesión se detuvo antes de procesar fotogramas.",
      durationMs: Date.now() - this.startedWall,
      averageConfidence: +(this.confN ? this.confSum / this.confN : averageConfidence([])).toFixed(4),
      detections: this.last?.detections ?? [],
      masks: this.last?.frame.masks.filter((m) => this.enabledClasses.has(m.classId)) ?? [],
      patterns: this.last?.patterns ?? [],
      frameT: +lastT.toFixed(3),
      live: stats,
      warnings,
      snapshotUrl: this.last?.snapshotUrl ?? this.scenario.asset,
    };
    this.repo.saveAnalysis(final);
    this.repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: this.user.name, type: "live.stopped", level: "success", ref: this.analysisId, message: `${this.cfg.cameraName ? `📹 ${this.cfg.cameraName}: m` : "M"}onitoreo ${this.analysisId} finalizado: ${stats.frames} fotogramas, ${stats.uniqueTracks} objetos rastreados, ${this.alertCount} alertas.` });
    return final;
  }
}
