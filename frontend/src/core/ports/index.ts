// Puertos: interfaces que la aplicación necesita y que la infraestructura implementa.
import type { AnalysisInput, ProgressListener, VisionResult, VisionStream } from "../contracts/vision";
import type { AnalysisMode } from "../domain/entities";
import type {
  Alert,
  Analysis,
  AuditEvent,
  CameraConfig,
  Rule,
  Scenario,
  Settings,
  VisionClass,
} from "../domain/entities";

/** Contrato de reemplazo: DemoVisionAdapter hoy, ApiVisionAdapter mañana. */
export interface VisionEngine {
  readonly kind: "DEMO" | "REAL";
  analyze(input: AnalysisInput, onProgress?: ProgressListener): Promise<VisionResult>;
}

/** Motor de visión para transmisiones (fotograma a fotograma). */
export interface VisionStreamEngine {
  readonly kind: "DEMO" | "REAL";
  open(scenarioId: string, mode: AnalysisMode): VisionStream;
}

/** Fuente de video: imagen del fotograma en el instante t (render 3D en DEMO; en producción, la cámara/grabador). */
export interface CameraFeed {
  render(scenarioId: string, t: number): string;
}

export interface AnalysisRepository {
  listAnalyses(): Analysis[];
  getAnalysis(id: string): Analysis | undefined;
  saveAnalysis(a: Analysis): void;

  listAlerts(): Alert[];
  saveAlert(a: Alert): void;

  listRules(): Rule[];
  saveRule(r: Rule): void;
  deleteRule(id: string): void;

  listClasses(): VisionClass[];
  saveClass(c: VisionClass): void;

  getSettings(): Settings;
  saveSettings(s: Settings): void;

  listCameras?(): CameraConfig[];
  saveCameras?(cams: CameraConfig[]): void;
  saveCamera?(cam: CameraConfig): void;
  deleteCamera?(id: string): void;
  toggleCamera?(id: string, enabled?: boolean): void;

  listEvents(): AuditEvent[];
  addEvent(e: AuditEvent): void;

  reset(): void;
  subscribe(listener: () => void): () => void;
  /** Cambia con cada escritura; sirve como snapshot para React. */
  version(): number;
}

export interface ScenarioCatalog {
  list(): Scenario[];
  get(id: string): Scenario | undefined;
}
