// Contratos (DTO) entre la aplicación y cualquier motor de visión (demo o real).
import type {
  AnalysisMode,
  Detection,
  EngineKind,
  PatternResult,
  SegmentationResult,
} from "../domain/entities";

export type AnalysisSource =
  | { kind: "scenario" }
  | { kind: "upload"; fileName: string; mime: string; size: number; dataUrl: string };

export interface AnalysisInput {
  analysisId: string;
  scenarioId: string;
  mode: AnalysisMode;
  threshold: number;
  source: AnalysisSource;
}

export interface VisionResult {
  analysisId: string;
  engine: EngineKind;
  detections: Detection[];
  masks: SegmentationResult[];
  patterns: PatternResult[];
  durationMs: number;
  /** Captura anotada con OpenCV (cajas y etiquetas dibujadas sobre la imagen). */
  annotatedSnapshotUrl?: string;
}

export type AnalysisStage =
  | "validating"
  | "preprocessing"
  | "detecting"
  | "segmenting"
  | "patterns"
  | "rules"
  | "saving";

export const STAGE_LABEL: Record<AnalysisStage, string> = {
  validating: "Validando entrada",
  preprocessing: "Preprocesando imagen",
  detecting: "Detectando objetos",
  segmenting: "Generando máscaras",
  patterns: "Reconociendo patrones",
  rules: "Evaluando reglas",
  saving: "Guardando resultado",
};

export interface ProgressEvent {
  stage: AnalysisStage;
  /** 0..100 */
  percent: number;
}

export type ProgressListener = (e: ProgressEvent) => void;

/** Resultado de un fotograma de una transmisión en vivo. */
export interface VisionFrame {
  index: number;
  /** Tiempo de la escena en segundos. */
  t: number;
  engine: EngineKind;
  detections: Detection[];
  masks: SegmentationResult[];
  patterns: PatternResult[];
  /** Latencia de inferencia del fotograma (simulada en DEMO). */
  latencyMs: number;
  /** Captura anotada con OpenCV (cajas y etiquetas dibujadas sobre el fotograma). */
  annotatedSnapshotUrl?: string;
}

export interface VisionStream {
  readonly scenarioId: string;
  readonly mode: AnalysisMode;
  /** Analiza el fotograma en el instante t (determinista en DEMO: mismo t, mismo resultado). */
  frame(t: number, index: number): VisionFrame;
}
