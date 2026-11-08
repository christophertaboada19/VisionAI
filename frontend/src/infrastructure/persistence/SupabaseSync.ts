// Sincronización bidireccional entre el repositorio reactivo de la UI y Supabase (PostgreSQL + RLS).
import type { Alert, Analysis, AuditEvent, Rule, Settings, VisionClass } from "@/core/domain/entities";
import { supabase } from "../supabase/client";
import type { RepositoryState } from "./LocalAnalysisRepository";

function rowToAnalysis(r: Record<string, unknown>): Analysis {
  const liveRaw = (r.live as (Analysis["live"] & { snapshotUrl?: string; cameraId?: string; cameraName?: string }) | null) ?? undefined;
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    createdBy: String(r.created_by),
    sourceName: String(r.source_name),
    sourceKind: (r.source_kind as Analysis["sourceKind"]) ?? "scenario",
    scenarioId: String(r.scenario_id),
    mode: (r.mode as Analysis["mode"]) ?? "combined",
    status: (r.status as Analysis["status"]) ?? "completed",
    engine: (r.engine as Analysis["engine"]) ?? "REAL",
    threshold: Number(r.threshold ?? 0.5),
    durationMs: Number(r.duration_ms ?? 0),
    averageConfidence: Number(r.average_confidence ?? 0),
    detections: (r.detections as Analysis["detections"]) ?? [],
    masks: (r.masks as Analysis["masks"]) ?? [],
    patterns: (r.patterns as Analysis["patterns"]) ?? [],
    warnings: (r.warnings as string[]) ?? [],
    error: r.error ? String(r.error) : undefined,
    observations: r.observations ? String(r.observations) : undefined,
    observationsBy: r.observations_by ? String(r.observations_by) : undefined,
    seed: Boolean(r.seed),
    frameT: r.frame_t !== null && r.frame_t !== undefined ? Number(r.frame_t) : undefined,
    live: liveRaw && typeof liveRaw.frames === "number" ? liveRaw : undefined,
    snapshotUrl: liveRaw?.snapshotUrl ? String(liveRaw.snapshotUrl) : undefined,
    // La cámara viaja dentro del JSON "live" (no requiere columnas nuevas en la tabla analyses).
    cameraId: liveRaw?.cameraId ? String(liveRaw.cameraId) : undefined,
    cameraName: liveRaw?.cameraName ? String(liveRaw.cameraName) : undefined,
  };
}

function analysisToRow(a: Analysis) {
  const livePayload =
    a.live || a.snapshotUrl || a.cameraId
      ? {
          ...(a.live ?? {}),
          ...(a.snapshotUrl ? { snapshotUrl: a.snapshotUrl } : {}),
          ...(a.cameraId ? { cameraId: a.cameraId, cameraName: a.cameraName } : {}),
        }
      : null;
  return {
    id: a.id,
    created_at: a.createdAt,
    created_by: a.createdBy,
    source_name: a.sourceName,
    source_kind: a.sourceKind,
    scenario_id: a.scenarioId,
    mode: a.mode,
    status: a.status,
    engine: a.engine,
    threshold: a.threshold,
    duration_ms: Math.round(a.durationMs),
    average_confidence: a.averageConfidence,
    detections: a.detections,
    masks: a.masks,
    patterns: a.patterns,
    warnings: a.warnings,
    error: a.error ?? null,
    observations: a.observations ?? null,
    observations_by: a.observationsBy ?? null,
    seed: Boolean(a.seed),
    frame_t: a.frameT ?? null,
    live: livePayload,
  };
}

function rowToAlert(r: Record<string, unknown>): Alert {
  return {
    id: String(r.id),
    analysisId: String(r.analysis_id),
    scenarioId: String(r.scenario_id),
    ruleId: String(r.rule_id),
    ruleName: String(r.rule_name),
    severity: (r.severity as Alert["severity"]) ?? "medium",
    message: String(r.message),
    evidence: String(r.evidence),
    status: (r.status as Alert["status"]) ?? "new",
    createdAt: String(r.created_at),
    assignee: r.assignee ? String(r.assignee) : undefined,
    reviewedBy: r.reviewed_by ? String(r.reviewed_by) : undefined,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : undefined,
    note: r.note ? String(r.note) : undefined,
    frameT: r.frame_t !== null && r.frame_t !== undefined ? Number(r.frame_t) : undefined,
    frameIndex: r.frame_index !== null && r.frame_index !== undefined ? Number(r.frame_index) : undefined,
    snapshotUrl: r.snapshot_url ? String(r.snapshot_url) : undefined,
  };
}

function alertToRow(a: Alert) {
  return {
    id: a.id,
    analysis_id: a.analysisId,
    scenario_id: a.scenarioId,
    rule_id: a.ruleId,
    rule_name: a.ruleName,
    severity: a.severity,
    message: a.message,
    evidence: a.evidence,
    status: a.status,
    created_at: a.createdAt,
    assignee: a.assignee ?? null,
    reviewed_by: a.reviewedBy ?? null,
    reviewed_at: a.reviewedAt ?? null,
    note: a.note ?? null,
    frame_t: a.frameT ?? null,
    frame_index: a.frameIndex ?? null,
    snapshot_url: a.snapshotUrl ?? null,
  };
}

// Columnas de alerts SIN la foto de evidencia (snapshot_url guarda imágenes base64 muy pesadas:
// pedirlas en la consulta general hace que Supabase cancele por tiempo, error 57014).
const ALERT_LIGHT_COLUMNS =
  "id,analysis_id,scenario_id,rule_id,rule_name,severity,message,evidence,status,created_at,assignee,reviewed_by,reviewed_at,note,frame_t,frame_index";

export async function fetchSupabaseState(fallback: RepositoryState): Promise<Partial<RepositoryState> | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  // eslint-disable-next-line prefer-const
  let [analysesRes, alertsRes, rulesRes, classesRes, settingsRes, eventsRes] = await Promise.all([
    supabase.from("analyses").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("alerts").select(ALERT_LIGHT_COLUMNS).order("created_at", { ascending: false }).limit(300),
    supabase.from("rules").select("*"),
    supabase.from("vision_classes").select("*"),
    supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("audit_events").select("*").order("at", { ascending: false }).limit(200),
  ]);

  // Las alertas guardan su foto de evidencia (base64); 300 filas pueden superar el tiempo
  // máximo de consulta de Supabase (error 57014). En ese caso se reintenta con menos filas.
  for (const limit of [120, 40]) {
    if (!alertsRes.error) break;
    alertsRes = await supabase.from("alerts").select(ALERT_LIGHT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  }
  if (analysesRes.error) {
    analysesRes = await supabase.from("analyses").select("*").order("created_at", { ascending: false }).limit(60);
  }

  const out: Partial<RepositoryState> = {};

  if (!analysesRes.error && analysesRes.data) {
    const cleanRows = analysesRes.data.map(rowToAnalysis).filter((a) => !a.seed);
    out.analyses = cleanRows;
  }
  if (!alertsRes.error && alertsRes.data) {
    const rows = alertsRes.data as unknown as Record<string, unknown>[];
    // Fotos: se conservan las que ya tiene este navegador y se descargan aparte solo las más recientes.
    const localSnap = new Map(fallback.alerts.filter((a) => a.snapshotUrl).map((a) => [a.id, a.snapshotUrl!]));
    const missing = rows.map((r) => String(r.id)).filter((id) => !localSnap.has(id)).slice(0, 15);
    if (missing.length) {
      const snaps = await supabase.from("alerts").select("id,snapshot_url").in("id", missing);
      if (!snaps.error && snaps.data) {
        for (const r of snaps.data as { id: string; snapshot_url: string | null }[]) if (r.snapshot_url) localSnap.set(r.id, r.snapshot_url);
      }
    }
    out.alerts = rows.map((r) => {
      const a = rowToAlert(r);
      const snap = localSnap.get(a.id);
      return snap ? { ...a, snapshotUrl: snap } : a;
    });
  }
  if (!rulesRes.error && rulesRes.data && rulesRes.data.length > 0) {
    out.rules = rulesRes.data.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      condition: r.condition as Rule["condition"],
      threshold: Number(r.threshold),
      severity: r.severity as Rule["severity"],
      enabled: Boolean(r.enabled),
    }));
  }
  if (!classesRes.error && classesRes.data && classesRes.data.length > 0) {
    out.classes = classesRes.data.map((c) => ({
      id: String(c.id),
      name: String(c.name),
      color: String(c.color),
      description: String(c.description),
      enabled: Boolean(c.enabled),
    }));
  }
  if (!settingsRes.error && settingsRes.data) {
    const s = settingsRes.data;
    out.settings = {
      defaultThreshold: Number(s.default_threshold ?? fallback.settings.defaultThreshold),
      randomDemo: Boolean(s.random_demo),
      simulateNextFailure: Boolean(s.simulate_next_failure),
      maxUploadMb: Number(s.max_upload_mb ?? 8),
      notificationsEnabled: Boolean(s.notifications_enabled),
      telegramBotToken: String(s.telegram_bot_token ?? ""),
      telegramChatId: String(s.telegram_chat_id ?? ""),
      ntfyTopic: String(s.ntfy_topic ?? "vision-ai-senati-alertas"),
    };
  }
  if (!eventsRes.error && eventsRes.data && eventsRes.data.length > 0) {
    out.events = eventsRes.data.map((e) => ({
      id: String(e.id),
      at: String(e.at),
      user: String(e.user),
      type: e.type as AuditEvent["type"],
      level: e.level as AuditEvent["level"],
      message: String(e.message),
      ref: e.ref ? String(e.ref) : undefined,
    }));
  }

  return out;
}

export const supabaseWriter = {
  async saveAnalysis(a: Analysis) {
    if (!supabase) return;
    await supabase.from("analyses").upsert(analysisToRow(a));
  },
  async saveAlert(a: Alert) {
    if (!supabase) return;
    await supabase.from("alerts").upsert(alertToRow(a));
  },
  async saveRule(r: Rule) {
    if (!supabase) return;
    await supabase.from("rules").upsert({
      id: r.id,
      name: r.name,
      description: r.description,
      condition: r.condition,
      threshold: r.threshold,
      severity: r.severity,
      enabled: r.enabled,
      updated_at: new Date().toISOString(),
    });
  },
  async deleteRule(id: string) {
    if (!supabase) return;
    await supabase.from("rules").delete().eq("id", id);
  },
  async saveClass(c: VisionClass) {
    if (!supabase) return;
    await supabase.from("vision_classes").upsert({
      id: c.id,
      name: c.name,
      color: c.color,
      description: c.description,
      enabled: c.enabled,
      updated_at: new Date().toISOString(),
    });
  },
  async saveSettings(s: Settings) {
    if (!supabase) return;
    await supabase.from("settings").upsert({
      id: 1,
      default_threshold: s.defaultThreshold,
      random_demo: s.randomDemo,
      simulate_next_failure: s.simulateNextFailure,
      max_upload_mb: s.maxUploadMb,
      notifications_enabled: Boolean(s.notificationsEnabled),
      telegram_bot_token: s.telegramBotToken ?? "",
      telegram_chat_id: s.telegramChatId ?? "",
      ntfy_topic: s.ntfyTopic ?? "vision-ai-senati-alertas",
      updated_at: new Date().toISOString(),
    });
  },
  async addEvent(e: AuditEvent) {
    if (!supabase) return;
    await supabase.from("audit_events").upsert({
      id: e.id,
      at: e.at,
      user: e.user,
      type: e.type,
      level: e.level,
      message: e.message,
      ref: e.ref ?? null,
    });
  },
  async clearHistory() {
    if (!supabase) return;
    await Promise.all([
      supabase.from("alerts").delete().neq("id", ""),
      supabase.from("analyses").delete().neq("id", ""),
      supabase.from("audit_events").delete().neq("id", ""),
    ]);
  },
};
