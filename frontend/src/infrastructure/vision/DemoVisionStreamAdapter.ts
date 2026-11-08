// Transmisión en vivo SIMULADA. Imita la salida fotograma a fotograma de un detector tipo YOLO
// (clase, confianza, caja normalizada) + un rastreador tipo ByteTrack (trackId estable).
// NO ejecuta un modelo: en la fase 2 se reemplaza por un adaptador que reciba los resultados de
// YOLO desde el servidor (WebSocket/SSE) implementando el mismo puerto VisionStreamEngine.
import type { VisionFrame, VisionStream } from "@/core/contracts/vision";
import type { AnalysisMode } from "@/core/domain/entities";
import type { CameraFeed, VisionStreamEngine } from "@/core/ports";
import { liveFrame } from "@/modules/scenarios/data/liveScenes";
import { sceneImage } from "@/modules/scenarios/data/scenes";

export class DemoVisionStreamAdapter implements VisionStreamEngine {
  readonly kind = "DEMO" as const;

  open(scenarioId: string, mode: AnalysisMode): VisionStream {
    liveFrame(scenarioId, 0); // valida que el escenario tenga transmisión
    const wantsDet = mode !== "segmentation";
    const wantsMasks = mode === "segmentation" || mode === "combined";
    const wantsPatterns = mode === "patterns" || mode === "combined";
    return {
      scenarioId,
      mode,
      frame(t: number, index: number): VisionFrame {
        const f = liveFrame(scenarioId, t);
        return {
          index,
          t,
          engine: "DEMO",
          detections: wantsDet ? f.detections : [],
          masks: wantsMasks ? f.masks : [],
          patterns: wantsPatterns ? f.patterns : [],
          // Latencia simulada de inferencia (≈ 28–46 ms), reproducible para el mismo t.
          latencyMs: Math.round(37 + 7 * Math.sin(t * 2.3) + 2 * Math.sin(t * 7.1)),
        };
      },
    };
  }
}

/** Previsualización 2D del escenario en el instante t (sin motor 3D). */
export class DemoCameraFeed implements CameraFeed {
  render(scenarioId: string, t: number): string {
    return sceneImage(scenarioId, t);
  }
}
