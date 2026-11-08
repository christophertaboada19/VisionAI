import { useSyncExternalStore } from "react";
import { repository } from "@/app/providers/container";

/** Re-renderiza cuando cambia el repositorio y devuelve la lectura seleccionada. */
export function useRepo<T>(select: (r: typeof repository) => T): T {
  useSyncExternalStore(repository.subscribe, repository.version, repository.version);
  return select(repository);
}

export const useAnalyses = () => useRepo((r) => r.listAnalyses());
export const useAlerts = () => useRepo((r) => r.listAlerts());
export const useRules = () => useRepo((r) => r.listRules());
export const useClasses = () => useRepo((r) => r.listClasses());
export const useSettings = () => useRepo((r) => r.getSettings());
export const useCameras = () => useRepo((r) => r.listCameras());
export const useEvents = () => useRepo((r) => r.listEvents());
