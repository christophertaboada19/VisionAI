// Hook de Monitoreo en Vivo: soporta Webcam real (getUserMedia), Cámara Celular IP (IP Webcam / RTSP)
// y Cámaras Públicas en vivo (.m3u8) conectadas al motor real Python (FastAPI + OpenCV + YOLOv8 + CNN).
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, liveMonitoring, repository } from "@/app/providers/container";
import { LIVE_MAX_SECONDS, type LiveConfig, type LiveFrameResult, type LiveSession } from "@/core/application/liveMonitoring";
import type { VisionFrame } from "@/core/contracts/vision";
import type { Alert, Analysis, User } from "@/core/domain/entities";
import { ALL_SCENARIOS } from "@/modules/scenarios/data/scenes";
import { uploadCache } from "../components/AnalysisWorkspace";
import { fetchWithTimeout, isAbortError, postJson } from "@/infrastructure/http";

const LIVE_FRAME_TIMEOUT_MS = 30_000;
const STREAM_CAPTURE_TIMEOUT_MS = 45_000;

export type LiveStatus = "idle" | "analyzing" | "paused" | "stopped";
export type CameraSourceKind = "webcam" | "mobile-ip" | "public-stream";
export const TARGET_FPS = 15;

export interface SeriesPoint {
  t: number;
  label: string;
  objects: number;
}

export interface PublicStreamOption {
  id: string;
  name: string;
  url: string;
  location: string;
  scenarioId: string;
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function useLiveMonitor() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [t, setT] = useState(0);
  const [result, setResult] = useState<LiveFrameResult | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [sessionAlerts, setSessionAlerts] = useState<Alert[]>([]);
  const [fps, setFps] = useState(0);
  const [summary, setSummary] = useState<Analysis | null>(null);
  const [speed, setSpeed] = useState(1);
  const [autoPaused, setAutoPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamFrameUrl, setStreamFrameUrl] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const session = useRef<LiveSession | null>(null);
  const cfgRef = useRef<LiveConfig | null>(null);
  const tRef = useRef(0);
  const startT = useRef(0);
  const idxRef = useRef(0);
  const raf = useRef<number | null>(null);
  const lastWall = useRef<number | null>(null);
  const acc = useRef(0);
  const fpsWindow = useRef({ start: 0, frames: 0 });
  const lastSample = useRef(-1);
  const speedRef = useRef(1);
  const statusRef = useRef<LiveStatus>("idle");
  const onAlertRef = useRef<((a: Alert[]) => void) | null>(null);
  const inFlight = useRef(false);
  const lastSnapshotRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryAtRef = useRef(0);
  const errorCountRef = useRef(0);

  // Referencia al elemento <video> de la webcam o función capturadora
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const sourceKindRef = useRef<CameraSourceKind>("webcam");
  const streamUrlRef = useRef<string>("");
  const alertTargetRef = useRef<string>("all");

  speedRef.current = speed;

  const setStatusBoth = (s: LiveStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const captureVideoElementDataUrl = (): string | null => {
    const vid = videoElRef.current;
    if (!vid || vid.readyState < 2 || !vid.videoWidth || !vid.videoHeight) return null;
    const maxW = 640;
    const scale = Math.min(1, maxW / vid.videoWidth);
    const w = Math.max(1, Math.round(vid.videoWidth * scale));
    const h = Math.max(1, Math.round(vid.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.78);
  };

  const dispatchMobileAlerts = async (alerts: Alert[], frameDataUrl: string | null, detections: VisionFrame["detections"]) => {
    const st = repository.getSettings();
    if (st.notificationsEnabled === false) return;
    // Cada cámara decide si sus alertas llegan al celular (interruptor "Celular: avisos activos").
    const camId = cfgRef.current?.cameraId;
    const camCfg = camId ? repository.listCameras().find((c) => c.id === camId) : undefined;
    if (camCfg?.notifyMobile === false) return;
    for (const al of alerts) {
      const scName = ALL_SCENARIOS.find((s) => s.id === al.scenarioId)?.name ?? al.scenarioId;
      const camLabel = al.cameraName || cfgRef.current?.cameraName;
      void fetchWithTimeout(`${API_BASE_URL}/api/v1/notifications/alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: camLabel ? `${al.ruleName} · ${camLabel}` : al.ruleName,
          message: al.message,
          severity: al.severity,
          scenarioName: camLabel ? `${camLabel} (${scName})` : scName,
          evidence: al.evidence,
          imageDataUrl: al.snapshotUrl ?? frameDataUrl,
          detections: al.snapshotUrl ? [] : detections,
          telegramBotToken: st.telegramBotToken || undefined,
          telegramChatId: st.telegramChatId || undefined,
          ntfyTopic: st.ntfyTopic || undefined,
        }),
      }, 25_000).catch(() => {
        /* ignorado si el servidor de notificaciones no responde */
      });
    }
  };

  const finish = useCallback((reason?: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    const s = session.current;
    if (s && !s.isStopped) {
      if (lastSnapshotRef.current) {
        uploadCache.set(s.analysisId, lastSnapshotRef.current);
      }
      setSummary(s.stop(reason));
    }
    setResult(null);
    setStatusBoth("stopped");
  }, []);

  // Aplica un fotograma analizado a la sesión (común para webcam y streams).
  const applyFrame = (s: LiveSession, vf: VisionFrame, frameDataUrl: string, nowT: number) => {
    const r = s.processFrame(vf, frameDataUrl);
    setResult(r);
    if (r.newAlerts.length) {
      setSessionAlerts((list) => [...r.newAlerts, ...list]);
      onAlertRef.current?.(r.newAlerts);
      void dispatchMobileAlerts(r.newAlerts, frameDataUrl, r.detections);
    }
    const sec = Math.floor(nowT);
    if (sec !== lastSample.current) {
      lastSample.current = sec;
      setSeries((p) => [...p, { t: sec, label: mmss(sec - startT.current), objects: r.stats.objectsNow }].slice(-60));
    }
  };

  const processRealBackendStep = useCallback(async (nowT: number, frameIdx: number) => {
    const s = session.current;
    const cfg = cfgRef.current;
    if (!s || !cfg || s.isStopped || inFlight.current) return;
    // Tras un error se espera un poco antes de reintentar (no se bombardea al backend caído).
    if (performance.now() < retryAtRef.current) return;

    const sk = sourceKindRef.current;
    const signal = abortRef.current?.signal;
    inFlight.current = true;
    try {
      if (sk === "webcam") {
        const dataUrl = captureVideoElementDataUrl();
        if (!dataUrl) return; // la cámara aún no entrega imagen
        const vf = await postJson<VisionFrame>(
          "/api/v1/live/frame",
          {
            scenarioId: cfg.scenarioId,
            mode: cfg.mode,
            threshold: cfg.threshold,
            frameIndex: frameIdx,
            t: nowT,
            imageDataUrl: dataUrl,
            alertTarget: alertTargetRef.current,
            cameraId: cfg.cameraId,
          },
          LIVE_FRAME_TIMEOUT_MS,
          signal,
        );
        if (s.isStopped || session.current !== s) return;
        lastSnapshotRef.current = dataUrl;
        errorCountRef.current = 0;
        setStreamError(null);
        applyFrame(s, vf, dataUrl, nowT);
      } else {
        // mobile-ip o public-stream: OpenCV captura el stream en el backend
        const url = streamUrlRef.current.trim();
        if (!url) {
          setStreamError("Ingrese o seleccione una URL de cámara IP o stream público.");
          return;
        }
        const payload = await postJson<VisionFrame & { frameDataUrl: string }>(
          "/api/v1/streams/capture",
          {
            streamUrl: url,
            scenarioId: cfg.scenarioId,
            mode: cfg.mode,
            threshold: cfg.threshold,
            frameIndex: frameIdx,
            t: nowT,
            alertTarget: alertTargetRef.current,
          },
          STREAM_CAPTURE_TIMEOUT_MS,
          signal,
        );
        // Si mientras llegaba la respuesta se cambió de cámara, el fotograma pertenece a la sesión anterior.
        if (s.isStopped || session.current !== s) return;
        if (!payload?.frameDataUrl) throw new Error("El backend no devolvió imagen del stream.");
        errorCountRef.current = 0;
        setStreamError(null);
        setStreamFrameUrl(payload.frameDataUrl);
        lastSnapshotRef.current = payload.frameDataUrl;
        applyFrame(s, payload, payload.frameDataUrl, nowT);
      }
    } catch (err) {
      if (isAbortError(err) || session.current !== s || s.isStopped) return;
      errorCountRef.current += 1;
      // Espera creciente: 1.5 s, 3 s, 4.5 s… hasta 10 s entre reintentos.
      retryAtRef.current = performance.now() + Math.min(10_000, 1500 * errorCountRef.current);
      setStreamError(`${(err as Error).message} (reintento automático #${errorCountRef.current})`);
    } finally {
      inFlight.current = false;
    }
  }, []);

  const tick = useCallback((now: number) => {
    raf.current = requestAnimationFrame(tick);
    if (statusRef.current === "paused") {
      lastWall.current = null;
      return;
    }
    if (lastWall.current === null) lastWall.current = now;
    const dt = Math.min(0.25, (now - lastWall.current) / 1000);
    lastWall.current = now;
    acc.current += dt;
    // Para cámara real enviamos ~5-6 fotogramas por segundo al backend para no saturar CPU
    const interval = 1 / 6;
    if (acc.current < interval) return;
    tRef.current += acc.current * speedRef.current;
    acc.current = 0;
    setT(tRef.current);

    const w = fpsWindow.current;
    w.frames++;
    if (now - w.start >= 1000) {
      setFps(+((w.frames * 1000) / (now - w.start)).toFixed(1));
      fpsWindow.current = { start: now, frames: 0 };
    }

    const s = session.current;
    if (statusRef.current !== "analyzing" || !s) return;
    idxRef.current++;
    void processRealBackendStep(tRef.current, idxRef.current);

    if (tRef.current - startT.current >= LIVE_MAX_SECONDS) finish(`Límite de ${LIVE_MAX_SECONDS / 60} minutos alcanzado`);
  }, [finish, processRealBackendStep]);

  useEffect(() => {
    fpsWindow.current = { start: performance.now(), frames: 0 };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      abortRef.current?.abort();
      const s = session.current;
      if (s && !s.isStopped) s.stop("Se abandonó la pantalla de monitoreo");
    };
  }, [tick]);

  const start = useCallback((cfg: LiveConfig, user: User) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    retryAtRef.current = 0;
    errorCountRef.current = 0;
    inFlight.current = false;
    const s = liveMonitoring.start(cfg, user);
    session.current = s;
    cfgRef.current = cfg;
    setSessionId(s.analysisId);
    startT.current = tRef.current;
    idxRef.current = 0;
    lastSample.current = -1;
    setSeries([]);
    setSessionAlerts([]);
    setSummary(null);
    setStreamError(null);
    setStreamFrameUrl(null);
    setResult(null);
    lastSnapshotRef.current = null;
    setStatusBoth("analyzing");
    return s;
  }, []);

  const pause = useCallback(() => setStatusBoth("paused"), []);
  const resume = useCallback(() => {
    setAutoPaused(false);
    setStatusBoth(session.current && !session.current.isStopped ? "analyzing" : "idle");
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && statusRef.current === "analyzing") {
        setStatusBoth("paused");
        setAutoPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onUnload = () => {
      const s = session.current;
      if (s && !s.isStopped) s.stop("Se cerró la página");
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const bindVideoElement = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
  }, []);

  const configureSource = useCallback((kind: CameraSourceKind, streamUrl = "", alertTarget = "all") => {
    sourceKindRef.current = kind;
    streamUrlRef.current = streamUrl;
    alertTargetRef.current = alertTarget;
  }, []);

  return {
    status,
    t,
    result,
    series,
    sessionAlerts,
    fps,
    summary,
    speed,
    autoPaused,
    sessionId,
    streamFrameUrl,
    streamError,
    clock: mmss(t),
    sessionClock: status === "analyzing" || status === "paused" ? mmss(t - startT.current) : null,
    setSpeed,
    start,
    pause,
    resume,
    stop: finish,
    bindVideoElement,
    configureSource,
    onAlert: (fn: (a: Alert[]) => void) => {
      onAlertRef.current = fn;
    },
  };
}
