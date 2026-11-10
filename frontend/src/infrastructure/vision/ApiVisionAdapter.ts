// Adaptador para un servicio REAL de visión (fase 2: Python + FastAPI + OpenCV + YOLO).
// Implementa el mismo contrato VisionEngine, por lo que la UI no cambia al activarlo.
// Se activa con VITE_VISION_MODE=api y VITE_VISION_API_URL=http://localhost:8000
import type { AnalysisInput, ProgressListener, VisionResult } from "@/core/contracts/vision";
import type { VisionEngine } from "@/core/ports";
import { fetchWithTimeout, readApiError } from "@/infrastructure/http";

interface ApiResultsResponse {
  analysisId: string;
  status: "queued" | "processing" | "completed" | "failed";
  detections: VisionResult["detections"];
  masks: VisionResult["masks"];
  patterns: VisionResult["patterns"];
  durationMs: number;
  annotatedSnapshotUrl?: string;
  error?: string;
}

export class ApiVisionAdapter implements VisionEngine {
  readonly kind = "REAL" as const;
  // 90 s: la primera inferencia carga YOLO en memoria y puede tardar bastante más que las siguientes.
  constructor(private readonly baseUrl: string, private readonly pollMs = 800, private readonly timeoutMs = 90_000) {}

  async analyze(input: AnalysisInput, onProgress?: ProgressListener): Promise<VisionResult> {
    const form = new FormData();
    form.append("mode", input.mode);
    form.append("threshold", String(input.threshold));
    form.append("scenarioId", input.scenarioId);
    form.append("alertTarget", input.alertTarget ?? "all");
    if (input.source.kind === "upload") {
      const blob = await (await fetch(input.source.dataUrl)).blob();
      form.append("image", blob, input.source.fileName);
    }
    onProgress?.({ stage: "preprocessing", percent: 15 });
    const created = await this.request<{ analysisId: string; status: string }>("/api/v1/analyses", { method: "POST", body: form });

    const started = Date.now();
    for (;;) {
      const res = await this.request<ApiResultsResponse>(`/api/v1/analyses/${created.analysisId}/results`);
      if (res.status === "completed") {
        return {
          analysisId: input.analysisId,
          engine: "REAL",
          detections: res.detections,
          masks: res.masks,
          patterns: res.patterns,
          durationMs: res.durationMs,
          annotatedSnapshotUrl: res.annotatedSnapshotUrl,
        };
      }
      if (res.status === "failed") throw new Error(res.error ?? "El servicio de visión informó un error.");
      if (Date.now() - started > this.timeoutMs) throw new Error("Tiempo de espera agotado consultando el servicio de visión.");
      onProgress?.({ stage: "detecting", percent: Math.min(80, 20 + Math.round(((Date.now() - started) / this.timeoutMs) * 60)) });
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, init, this.timeoutMs);
    if (!res.ok) throw await readApiError(res, "Servicio de visión");
    return (await res.json()) as T;
  }
}
