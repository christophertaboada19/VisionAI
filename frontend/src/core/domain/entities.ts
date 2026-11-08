// Entidades del dominio VISION AI. Independientes de la UI y de la infraestructura.

export type AnalysisMode = "detection" | "segmentation" | "patterns" | "combined";
export type AnalysisStatus = "queued" | "processing" | "completed" | "failed";
export type EngineKind = "DEMO" | "REAL";
export type Role = "admin" | "operator" | "supervisor" | "auditor";
export type Severity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "new" | "reviewed" | "closed";
export type CameraSourceKind = "webcam" | "mobile-ip" | "public-stream";

export interface CameraConfig {
  id: string;
  name: string;
  sourceKind: CameraSourceKind;
  url: string;
  scenarioId: string;
  alertTarget: string;
  mode: AnalysisMode;
  threshold: number;
  enabled: boolean;
  location?: string;
  /** Si es false, las alertas de esta cámara NO se envían al celular (Telegram / ntfy). Por defecto true. */
  notifyMobile?: boolean;
}

/** Coordenadas relativas normalizadas 0..1 respecto a la imagen. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Punto normalizado [x, y] en 0..1. */
export type Point = [number, number];

export interface Detection {
  id: string;
  label: string;
  classId: string;
  /** 0..1 internamente; se muestra como porcentaje. */
  confidence: number;
  box: BoundingBox;
  trackId?: string;
}

export interface SegmentationResult {
  id: string;
  classId: string;
  label: string;
  kind: "semantic" | "instance";
  /** Máscara representada como polígono normalizado (maskData). */
  polygon: Point[];
  areaRatio: number;
  confidence: number;
}

export interface PatternResult {
  id: string;
  type: string;
  label: string;
  confidence: number;
  evidence: string;
  /** "model": lo produjo el motor de visión; "rule": lo derivó una regla de negocio. */
  source: "model" | "rule";
  relatedDetectionIds?: string[];
}

export interface Analysis {
  id: string;
  createdAt: string;
  createdBy: string;
  sourceName: string;
  sourceKind: "scenario" | "upload" | "live";
  scenarioId: string;
  mode: AnalysisMode;
  status: AnalysisStatus;
  engine: EngineKind;
  threshold: number;
  durationMs: number;
  averageConfidence: number;
  detections: Detection[];
  masks: SegmentationResult[];
  patterns: PatternResult[];
  warnings: string[];
  error?: string;
  observations?: string;
  observationsBy?: string;
  /** Datos semilla generados al iniciar la demo (no ejecutados por un usuario). */
  seed?: boolean;
  /** Sesión en vivo: instante (s) del fotograma guardado como instantánea. */
  frameT?: number;
  /** Sesión en vivo: estadísticas acumuladas. */
  live?: LiveStats;
  /** Captura visual del análisis con los objetos/personas detectados y etiquetados. */
  snapshotUrl?: string;
  /** Cámara asociada cuando el análisis proviene de una cámara registrada del sistema. */
  cameraId?: string;
  cameraName?: string;
}

export interface LiveStats {
  /** Instante (s) de la escena en que empezó el análisis. */
  startT: number;
  frames: number;
  seconds: number;
  fps: number;
  avgLatencyMs: number;
  uniqueTracks: number;
  maxObjects: number;
  /** Eventos únicos por tipo de patrón (por ejemplo, productos defectuosos distintos). */
  patternEvents: Record<string, number>;
}

export interface Alert {
  id: string;
  analysisId: string;
  scenarioId: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  evidence: string;
  status: AlertStatus;
  createdAt: string;
  assignee?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  /** Alertas en vivo: instante (s) del fotograma que la originó, para reconstruir la evidencia. */
  frameT?: number;
  frameIndex?: number;
  /** Captura del fotograma de evidencia con la caja dibujada (data URL o URL en almacenamiento). */
  snapshotUrl?: string;
  /** Cámara de origen de la alerta para filtrado y notificaciones diferenciadas por cámara. */
  cameraId?: string;
  cameraName?: string;
}

export interface VisionClass {
  id: string;
  name: string;
  color: string;
  description: string;
  enabled: boolean;
}

export type RuleCondition =
  | { kind: "pattern"; patternType: string }
  | { kind: "count"; classId: string; min: number }
  | { kind: "zone"; classIds: string[]; zoneId: string };

export interface Rule {
  id: string;
  name: string;
  description: string;
  condition: RuleCondition;
  /** Confianza mínima requerida para disparar la regla (0..1). */
  threshold: number;
  severity: Severity;
  enabled: boolean;
}

export interface Zone {
  id: string;
  name: string;
  kind: "restricted" | "monitored";
  polygon: Point[];
}

export interface Scenario {
  id: string;
  name: string;
  sector: string;
  description: string;
  /** Recurso visual (data URL / URL) calibrado con los resultados semilla. */
  asset: string;
  /** Foto de portada para elegir el escenario (galería, Nuevo análisis, Agregar escenario). */
  cover?: string;
  /** Autoría y licencia de la foto de portada (obligatorio citar en licencias CC BY / CC BY-SA). */
  coverCredit?: { author: string; license: string; url: string };
  expectedResults: string;
  tags: string[];
  zones: Zone[];
}

export interface AuditEvent {
  id: string;
  at: string;
  user: string;
  type:
    | "analysis.started"
    | "analysis.completed"
    | "analysis.failed"
    | "live.started"
    | "live.stopped"
    | "alert.created"
    | "alert.updated"
    | "rule.changed"
    | "scenario.changed"
    | "class.changed"
    | "settings.changed"
    | "export"
    | "session"
    | "observation";
  level: "info" | "success" | "warning" | "error";
  message: string;
  ref?: string;
}

export interface Settings {
  defaultThreshold: number;
  /** Modo aleatorio de demostración: varía levemente la confianza. Desactivado = determinista. */
  randomDemo: boolean;
  /** Fuerza un fallo en el próximo análisis (para demostrar el estado de error). */
  simulateNextFailure: boolean;
  maxUploadMb: number;
  /** Configuración de notificaciones móviles en tiempo real (Telegram Bot y ntfy.sh). */
  notificationsEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  ntfyTopic?: string;
  /** Registro centralizado de cámaras del sistema con su estado activo/desactivado y configuración guardada. */
  cameras?: CameraConfig[];
}

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operador de análisis",
  supervisor: "Supervisor",
  auditor: "Auditor",
};

export const MODE_LABEL: Record<AnalysisMode, string> = {
  detection: "Detección",
  segmentation: "Segmentación",
  patterns: "Patrones",
  combined: "Combinado",
};

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  queued: "En cola",
  processing: "En proceso",
  completed: "Completado",
  failed: "Fallido",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: "Nueva",
  reviewed: "Revisada",
  closed: "Cerrada",
};
