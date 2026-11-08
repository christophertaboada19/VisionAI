// Estado inicial limpio: sin historial semilla, sin alertas previas ni advertencias.
// Solo carga el catálogo base de reglas, clases y ajustes del sistema.
import type { RepositoryState } from "@/infrastructure/persistence/LocalAnalysisRepository";
import { DEFAULT_CLASSES, DEFAULT_RULES, DEFAULT_SETTINGS } from "@/modules/scenarios/data/seedCatalog";

export function buildSeedState(_now = new Date()): RepositoryState {
  return {
    schema: 1,
    analyses: [],
    alerts: [],
    rules: DEFAULT_RULES,
    classes: DEFAULT_CLASSES,
    settings: DEFAULT_SETTINGS,
    events: [],
  };
}
