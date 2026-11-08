// Utilidades HTTP compartidas para hablar con el backend de visión (FastAPI).
// - Toda petición tiene un tiempo máximo: si el backend se cuelga, la UI no queda congelada.
// - Los errores se traducen a mensajes claros en español (backend apagado, timeout, detalle del servidor).
// URL base del backend (sin "/" final, para no generar rutas como "//api/v1/..." que dan 404).
const CONFIGURED_API = ((import.meta.env.VITE_VISION_API_URL as string | undefined)?.trim() || "http://localhost:8000").replace(/\/+$/, "");

/**
 * Si la página se abre desde OTRO equipo (p. ej. un celular en http(s)://192.168.x.x:5173) y el backend
 * está configurado como "localhost", ese "localhost" sería el propio celular. En ese caso se usa la
 * misma dirección de la página: el servidor de desarrollo (Vite) reenvía /api al backend de esta PC.
 */
function resolveApiBase(): string {
  if (typeof window === "undefined") return CONFIGURED_API;
  try {
    const cfg = new URL(CONFIGURED_API);
    const isLocalCfg = ["localhost", "127.0.0.1", "0.0.0.0"].includes(cfg.hostname);
    const isLocalPage = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (isLocalCfg && (!isLocalPage || window.location.protocol === "https:")) return window.location.origin;
  } catch {
    /* URL mal escrita: se usa tal cual */
  }
  return CONFIGURED_API;
}

export const API_BASE_URL = resolveApiBase();

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

const BACKEND_DOWN_MSG =
  `No hay conexión con el backend de visión (${API_BASE_URL}). ` +
  "Verifique que esté encendido: en la carpeta backend ejecute «python -m uvicorn app.api.main:app --port 8000».";

/** fetch con tiempo máximo. Respeta además una señal externa (p. ej. al cambiar de cámara). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onExternalAbort = () => ctrl.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (timedOut) {
      throw new ApiError(`El backend tardó más de ${Math.round(timeoutMs / 1000)} s en responder. Se reintentará automáticamente.`);
    }
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(BACKEND_DOWN_MSG);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Extrae el mensaje `detail` que devuelve FastAPI o un texto genérico según el código HTTP. */
export async function readApiError(resp: Response, fallback = "Error del servicio de visión"): Promise<ApiError> {
  let detail = "";
  try {
    const body = await resp.json();
    const d = (body as { detail?: unknown })?.detail;
    if (typeof d === "string") detail = d;
    else if (Array.isArray(d)) detail = d.map((x) => (x as { msg?: string })?.msg ?? String(x)).join("; ");
  } catch {
    /* cuerpo no JSON */
  }
  if (!detail) {
    if (resp.status === 404) detail = "Recurso no encontrado en el backend (¿versión antigua del servidor?).";
    else if (resp.status === 413) detail = "La imagen es demasiado grande.";
    else if (resp.status === 422) detail = "Datos enviados inválidos.";
    else if (resp.status >= 500) detail = "Error interno del backend. Revise la consola donde corre uvicorn.";
  }
  return new ApiError(detail ? `${detail}` : `${fallback} (HTTP ${resp.status})`, resp.status);
}

/** POST JSON con timeout que devuelve el cuerpo tipado o lanza ApiError con mensaje claro. */
export async function postJson<T>(path: string, body: unknown, timeoutMs = 30_000, signal?: AbortSignal): Promise<T> {
  const resp = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    timeoutMs,
    signal,
  );
  if (!resp.ok) throw await readApiError(resp);
  return (await resp.json()) as T;
}

export const isAbortError = (err: unknown) => (err as Error)?.name === "AbortError";
