// Lógica pura (sin React) para saber a qué cámara pertenece cada análisis, alerta o evento.
import type { Alert, Analysis, AuditEvent, CameraConfig } from "@/core/domain/entities";

/** Valor del filtro para análisis de imágenes subidas / escenas sin cámara asociada. */
export const NO_CAMERA = "__manual__";
/** "" = todas las cámaras. */
export const ALL_CAMERAS = "";

export interface CameraResolver {
  ofAnalysis: (a: Analysis) => string;
  ofAlert: (a: Alert) => string;
  ofEvent: (e: AuditEvent) => string | null;
  name: (camId: string) => string;
}

/**
 * Resuelve a qué cámara pertenece cada análisis, alerta o evento.
 * Tolera datos antiguos: si solo se guardó el nombre de la cámara, se busca por nombre;
 * una alerta sin cámara hereda la de su análisis; un evento se resuelve por su referencia.
 */
export function buildCameraResolver(analyses: Analysis[], alerts: Alert[], cameras: CameraConfig[]): CameraResolver {
  const byName = new Map(cameras.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const ids = new Set(cameras.map((c) => c.id));
  const fromFields = (id?: string, name?: string): string | null => {
    if (id) return id;
    if (name) return byName.get(name.trim().toLowerCase()) ?? null;
    return null;
  };
  // Sesiones en vivo antiguas sin cámara guardada: su nombre es "<cámara> (<escenario>)".
  const byNamePrefix = [...cameras].sort((x, y) => y.name.length - x.name.length);
  const fromSourceName = (a: Analysis): string | null => {
    if (a.sourceKind !== "live" || !a.sourceName) return null;
    const src = a.sourceName.trim().toLowerCase();
    return byNamePrefix.find((c) => src.startsWith(`${c.name.trim().toLowerCase()} (`))?.id ?? null;
  };
  const analysisCam = new Map<string, string>();
  for (const a of analyses) analysisCam.set(a.id, fromFields(a.cameraId, a.cameraName) ?? fromSourceName(a) ?? NO_CAMERA);
  const alertCam = new Map<string, string>();
  for (const al of alerts) alertCam.set(al.id, fromFields(al.cameraId, al.cameraName) ?? analysisCam.get(al.analysisId) ?? NO_CAMERA);

  return {
    ofAnalysis: (a) => analysisCam.get(a.id) ?? fromFields(a.cameraId, a.cameraName) ?? NO_CAMERA,
    ofAlert: (al) => alertCam.get(al.id) ?? fromFields(al.cameraId, al.cameraName) ?? NO_CAMERA,
    // Eventos ligados a un análisis o alerta heredan su cámara; los de configuración/reglas no tienen cámara.
    ofEvent: (e) => (e.ref ? analysisCam.get(e.ref) ?? alertCam.get(e.ref) ?? null : null),
    name: (camId) =>
      camId === NO_CAMERA
        ? "Imágenes subidas (sin cámara)"
        : cameras.find((c) => c.id === camId)?.name ?? (ids.has(camId) ? camId : "Cámara eliminada"),
  };
}

/** ¿El elemento con cámara `camId` pasa el filtro seleccionado? */
/**
 * ¿El elemento con cámara `camId` pasa el filtro?
 * `filter` puede ser una cámara ("" = todas) o una lista de cámaras ([] = todas).
 */
export const cameraMatches = (filter: string | readonly string[], camId: string | null | undefined) => {
  if (typeof filter === "string") return filter === ALL_CAMERAS || camId === filter;
  return filter.length === 0 || (!!camId && filter.includes(camId));
};

