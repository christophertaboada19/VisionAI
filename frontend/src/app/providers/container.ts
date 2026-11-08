// Composición de dependencias (inyección): conecta el frontend al motor real de IA (FastAPI + OpenCV + YOLO + CNN).
import { AnalyzeImage } from "@/core/application/analysis";
import { ManageAlerts, ManageRules } from "@/core/application/operations";
import { LiveMonitoring } from "@/core/application/liveMonitoring";
import type { VisionEngine } from "@/core/ports";
import { LocalAnalysisRepository } from "@/infrastructure/persistence/LocalAnalysisRepository";
import { ApiVisionAdapter } from "@/infrastructure/vision/ApiVisionAdapter";
import { DemoVisionAdapter } from "@/infrastructure/vision/DemoVisionAdapter";
import { DemoCameraFeed, DemoVisionStreamAdapter } from "@/infrastructure/vision/DemoVisionStreamAdapter";
import { SCENARIO_SEEDS, scenarioCatalog } from "@/modules/scenarios/data/scenes";
import { buildSeedState } from "./seedState";

function safeStorage(): Storage | null {
  try {
    const k = "__visionai_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    // Limpiar caché antigua con datos semilla de demostración
    window.localStorage.removeItem("visionai:v2");
    return window.localStorage;
  } catch {
    return null;
  }
}

import { API_BASE_URL } from "@/infrastructure/http";
export { API_BASE_URL };

export const repository = new LocalAnalysisRepository(safeStorage(), "visionai:v3-clean", () => buildSeedState());

for (const a of repository.listAnalyses()) {
  if (a.sourceKind === "live" && a.status === "processing") {
    repository.saveAnalysis({ ...a, status: "failed", error: "Sesión en vivo interrumpida: la página se cerró antes de detenerla." });
  }
}

const mode = import.meta.env.VITE_VISION_MODE === "demo" ? "demo" : "api";

export const visionEngine: VisionEngine =
  mode === "api"
    ? new ApiVisionAdapter(API_BASE_URL)
    : new DemoVisionAdapter({
        seeds: SCENARIO_SEEDS,
        settings: () => repository.getSettings(),
        onFailureConsumed: () => repository.saveSettings({ ...repository.getSettings(), simulateNextFailure: false }),
      });

export const analyzeImage = new AnalyzeImage(visionEngine, repository, scenarioCatalog);
export const liveMonitoring = new LiveMonitoring(new DemoVisionStreamAdapter(), repository, scenarioCatalog);
export const cameraFeed = new DemoCameraFeed();
export const manageAlerts = new ManageAlerts(repository);
export const manageRules = new ManageRules(repository);
export { scenarioCatalog };
