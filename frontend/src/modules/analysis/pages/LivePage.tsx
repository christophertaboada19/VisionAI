// Monitoreo en vivo con Cámaras Reales y Mosaico Multi-Cámara:
// 1) Mosaico de Todas las Cámaras en Vivo (vista general en simultáneo + activar/desactivar cámara)
// 2) Vista Detallada por Cámara (abre todo el centro de análisis, alertas e historial de la cámara seleccionada)
// 3) Persistencia automática de la configuración de cada cámara en todos los módulos del sistema
import { useCameraResolver } from "@/shared/camera/cameraFilter";
import { fetchWithTimeout, readApiError } from "@/infrastructure/http";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Boxes,
  Camera,
  CheckCircle2,
  Cpu,
  Eye,
  Gauge,
  Grid,
  History,
  Maximize2,
  Pause,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Square,
  Timer,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE_URL, repository } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { LIVE_MAX_SECONDS } from "@/core/application/liveMonitoring";
import type { AnalysisMode, CameraConfig, CameraSourceKind, Detection, PatternResult } from "@/core/domain/entities";
import { MODE_LABEL } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { useAlerts, useAnalyses, useCameras, useClasses, useRules } from "@/shared/hooks/useRepository";
import { ALERT_TARGET_OPTIONS, getAlertTargetLabel } from "@/modules/scenarios/data/seedCatalog";
import { CapacityInput } from "@/modules/scenarios/components/CapacityInput";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { LIVE_HINT } from "@/modules/scenarios/data/liveScenes";
import {
  AlertStatusBadge,
  Button,
  Card,
  CardHeader,
  ClassDot,
  ConfidenceBar,
  cx,
  EmptyState,
  ExpandableThumbnail,
  Field,
  findAlertRelatedDetections,
  fmtDateTime,
  Input,
  isNonCompliantDetection,
  type LightboxItem,
  Notice,
  PageHeader,
  Select,
  SeverityBadge,
  SnapshotLightbox,
} from "@/shared/ui";
import { AlertActions } from "@/modules/alerts/components/AlertActions";
import { ViewerToolbar } from "../components/AnalysisWorkspace";
import { DEFAULT_LAYERS, Legend, Viewer, type Layers } from "../components/Viewer";
import type { PreprocessView } from "../services/imageProcessing";
import { useLiveMonitor, type PublicStreamOption } from "../hooks/useLiveMonitor";
import { LiveStreamVideo, playableStreamKind } from "../components/LiveStreamVideo";

const MODES: AnalysisMode[] = ["detection", "segmentation", "patterns", "combined"];

const EVENT_LABEL: Record<string, string> = {
  ppe_missing: "Personas sin EPP (casco/chaleco)",
  ppe_ok: "Personas con EPP completo",
  surface_defect: "Botellas malogradas / con defecto",
  label_misaligned: "Etiquetas ausentes o torcidas",
  conforming: "Botellas sanas (conformes)",
  zone_intrusion: "Invasión de zona / carril restringido",
  traffic_congestion: "Congestión vehicular alta",
  "count:person": "Aforo máximo excedido",
  crowding: "Aforo máximo excedido",
  abandoned_object: "Objetos abandonados (sin dueño)",
  unattended_object: "Bultos sin persona cerca (en vigilancia)",
};

const FALLBACK_PUBLIC_STREAMS: PublicStreamOption[] = [
  {
    id: "seattle-35-barton",
    name: "Seattle DOT · 35th Ave SW & SW Barton St (HD En Vivo)",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Barton_EW.stream/playlist.m3u8",
    location: "Seattle Travelers · 35th Ave SW & Barton (Buses, Camiones y Autos HD)",
    scenarioId: "public-traffic",
  },
  {
    id: "seattle-24-market",
    name: "Seattle DOT · 24th Ave NW & NW Market St (HD En Vivo)",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/24_NW_Market_EW.stream/playlist.m3u8",
    location: "Seattle Travelers · Ballard 24th & Market (Corredor Urbano HD)",
    scenarioId: "public-traffic",
  },
  {
    id: "seattle-35-roxbury",
    name: "Seattle DOT · 35th Ave SW & SW Roxbury St (HD En Vivo)",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Roxbury_EW.stream/playlist.m3u8",
    location: "Seattle Travelers · West Seattle Roxbury (Tráfico y Transporte Pesado HD)",
    scenarioId: "public-traffic",
  },
  {
    id: "seattle-41-admiral",
    name: "Seattle DOT · 41st Ave SW & SW Admiral Way (HD En Vivo)",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/41_SW_Admiral.stream/playlist.m3u8",
    location: "Seattle Travelers · Admiral Way (Pendiente y Cruce Vial HD)",
    scenarioId: "public-traffic",
  },
  {
    id: "seattle-california-alaska",
    name: "Seattle DOT · California Ave SW & SW Alaska St (HD En Vivo)",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/California_SW_Alaska_NS.stream/playlist.m3u8",
    location: "Seattle Travelers · Junction Alaska St (Intersección Principal HD)",
    scenarioId: "public-traffic",
  },
  {
    id: "pub-i5-meadowdale",
    name: "Autopista I-5 · Meadowdale (Tráfico en Vivo)",
    url: "https://wzmedia.dot.ca.gov/D7/CCTV-25.stream/playlist.m3u8",
    location: "Los Ángeles DOT · Interestatal 5 (Meadowdale)",
    scenarioId: "public-traffic",
  },
  {
    id: "pub-i5-south-i10",
    name: "Autopista I-5 · Sur de I-10 (Camiones y Autos en Vivo)",
    url: "https://wzmedia.dot.ca.gov/D7/CCTV-17.stream/playlist.m3u8",
    location: "Los Ángeles DOT · Cruce I-5 / I-10",
    scenarioId: "public-traffic",
  },
  {
    id: "pub-i5-burbank",
    name: "Autopista I-5 · Burbank Blvd (Carril Restringido)",
    url: "https://wzmedia.dot.ca.gov/D7/CCTV-40.stream/playlist.m3u8",
    location: "Los Ángeles DOT · I-5 Norte de Burbank",
    scenarioId: "public-traffic",
  },
  {
    id: "pub-i110-ave26",
    name: "Autopista I-110 · Avenue 26 (Cámara Vial Pública)",
    url: "https://wzmedia.dot.ca.gov/D7/CCTV-196.stream/playlist.m3u8",
    location: "Los Ángeles DOT · Corredor I-110",
    scenarioId: "public-traffic",
  },
];

interface MosaicPreviewState {
  snapshotUrl: string;
  objectsCount: number;
  alertsCount: number;
  latencyMs: number;
  detections: Detection[];
  patterns: PatternResult[];
  updatedAt: string;
  loading?: boolean;
  error?: string;
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Boxes; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </p>
      <p className="tabular text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-[10px] text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}

/** Interruptor por cámara: enviar (o no) sus alertas al celular por Telegram / ntfy. */
function NotifyToggle({ cam }: { cam: CameraConfig }) {
  const toast = useToast();
  const on = cam.notifyMobile !== false;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        repository.saveCamera({ ...cam, notifyMobile: !on });
        toast({
          kind: on ? "warning" : "success",
          title: on ? `Avisos al celular silenciados: ${cam.name}` : `Avisos al celular activados: ${cam.name}`,
          description: on
            ? "Las alertas de esta cámara se siguen registrando, pero no llegarán al celular."
            : "Las alertas de esta cámara se enviarán a Telegram / ntfy.",
        });
      }}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        on ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
      )}
      title="Enviar o no las alertas de esta cámara al celular"
    >
      {on ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      {on ? "Celular: avisos activos" : "Celular: silenciado"}
    </button>
  );
}

/**
 * Vista previa EN VIVO de la webcam dentro del mosaico del Monitoreo general.
 * Si esa webcam es la que se está analizando, `onVideo` entrega el <video> al motor de análisis
 * para que la IA siga procesando fotogramas aunque estemos viendo todas las cámaras.
 */
function MosaicWebcamPreview({ onVideo }: { onVideo?: (el: HTMLVideoElement | null) => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("El navegador no permite acceso a la cámara web.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 400 } }, audio: false })
      .then((st) => {
        if (cancelled) {
          st.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = st;
        if (ref.current) {
          ref.current.srcObject = st;
          void ref.current.play().catch(() => {});
        }
      })
      .catch((e: Error) => setErr(`Cámara web no disponible: ${e.message}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return err ? (
    <div className="grid h-full w-full place-items-center bg-slate-900 p-4 text-center text-xs text-slate-300">{err}</div>
  ) : (
    <video
      ref={(el) => {
        ref.current = el;
        onVideo?.(el);
      }}
      muted
      playsInline
      autoPlay
      className="h-full w-full object-cover"
    />
  );
}

export function LivePage() {
  const user = useUser();
  const toast = useToast();
  const rules = useRules();
  const classes = useClasses();
  const allAlerts = useAlerts();
  const allAnalyses = useAnalyses();
  const cameras = useCameras();
  const [params, setParams] = useSearchParams();

  const paramCamId = params.get("camara");
  const paramVista = params.get("vista");
  const paramEscenario = params.get("escenario");

  // Modo de vista: "mosaic" (ver todas las cámaras en vivo) o "single" (abrir todo lo de 1 cámara)
  const [viewMode, setViewMode] = useState<"mosaic" | "single">(
    paramVista === "mosaico" ? "mosaic" : "single",
  );

  // Cámara seleccionada actualmente
  const initialCam =
    cameras.find((c) => c.id === paramCamId) ??
    (paramEscenario ? cameras.find((c) => c.scenarioId === paramEscenario) : undefined) ??
    cameras.find((c) => c.enabled) ??
    cameras[0];

  const [activeCameraId, setActiveCameraId] = useState<string>(initialCam?.id ?? "cam-seattle-barton");
  const activeCamera = cameras.find((c) => c.id === activeCameraId) ?? cameras[0];

  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [hl, setHl] = useState<string | null>(null);
  const [view, setView] = useState<PreprocessView>("original");
  const [binaryT, setBinaryT] = useState(60);
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);

  // Estado para añadir nueva cámara
  const [showAddCam, setShowAddCam] = useState(false);
  const [newCamName, setNewCamName] = useState("");
  const [newCamSource, setNewCamSource] = useState<CameraSourceKind>("public-stream");
  const [newCamUrl, setNewCamUrl] = useState(FALLBACK_PUBLIC_STREAMS[0].url);
  const [newCamScenario, setNewCamScenario] = useState("public-traffic");
  const [newCamAlertTarget, setNewCamAlertTarget] = useState("all");

  // Estado de dispositivos locales y streams públicos
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [webcamReady, setWebcamReady] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [publicStreams, setPublicStreams] = useState<PublicStreamOption[]>(FALLBACK_PUBLIC_STREAMS);

  // Estado del Mosaico Multi-Cámara en Vivo
  const [mosaicPreviews, setMosaicPreviews] = useState<Record<string, MosaicPreviewState>>({});
  const [mosaicAutoRefresh, setMosaicAutoRefresh] = useState(true);
  const mosaicInFlightRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const live = useLiveMonitor();
  const [videoStatus, setVideoStatus] = useState<"loading" | "playing" | "error">("loading");
  const camR = useCameraResolver();
  const scenarioId = activeCamera?.scenarioId ?? "public-traffic";
  const mode = activeCamera?.mode ?? "combined";
  const threshold = activeCamera?.threshold ?? 0.5;
  const sourceKind = activeCamera?.sourceKind ?? "public-stream";
  const alertTarget = activeCamera?.alertTarget ?? "all";
  const activeUrl = activeCamera?.url ?? "";
  const isCamEnabled = activeCamera?.enabled !== false;

  const scenario = ALL_SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  // Cámaras públicas (HLS) e IP Webcam (MJPEG) se ven como VIDEO FLUIDO en el navegador; la IA analiza aparte.
  // Con un filtro OpenCV (gris, bordes…) se usa la imagen del último fotograma analizado.
  const smoothVideo = isCamEnabled && sourceKind !== "webcam" && view === "original" && playableStreamKind(activeUrl) !== null;
  const streamStill =
    live.streamFrameUrl ??
    mosaicPreviews[activeCamera?.id ?? ""]?.snapshotUrl ??
    ((ALL_SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]).cover || (ALL_SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]).asset);
  const analyzing = live.status === "analyzing";
  const active = analyzing || live.status === "paused";
  const canRun = can(user.role, "analysis.run");
  const r = live.result;

  // Actualizar y persistir cualquier cambio en la configuración de la cámara activa
  const updateActiveCameraConfig = (patch: Partial<CameraConfig>) => {
    if (!activeCamera) return;
    repository.saveCamera({ ...activeCamera, ...patch });
  };

  // Cámara a la que debe continuar el análisis tras un cambio (sin obligar a detener manualmente)
  const pendingAutoStartRef = useRef<string | null>(null);

  // Cambiar de cámara: si hay un análisis en curso, se guarda la sesión de la cámara actual
  // y el análisis IA continúa automáticamente en la cámara elegida.
  const switchCamera = (camId: string) => {
    if (camId === activeCameraId) return;
    if (active) {
      live.stop(`Cambio a otra cámara`);
      pendingAutoStartRef.current = camId;
    }
    setActiveCameraId(camId);
  };

  // Seleccionar una cámara y abrir todo su panel completo
  const openCameraDetail = (cam: CameraConfig) => {
    switchCamera(cam.id);
    setViewMode("single");
    setParams({ camara: cam.id }, { replace: true });
  };

  // Activar o desactivar cualquier cámara
  const handleToggleCameraEnabled = (cam: CameraConfig) => {
    const nextEnabled = !cam.enabled;
    if (!nextEnabled && active && cam.id === activeCameraId) {
      live.stop("La cámara fue desactivada por el usuario");
    }
    repository.toggleCamera(cam.id, nextEnabled);
    toast({
      kind: nextEnabled ? "success" : "warning",
      title: nextEnabled ? `Cámara activada: ${cam.name}` : `Cámara desactivada: ${cam.name}`,
      description: nextEnabled
        ? "La cámara está lista para transmitir y detectar alertas en vivo."
        : "La cámara quedó en pausa y no generará alertas hasta reactivarla.",
    });
  };

  // Registrar una nueva cámara persistente
  const handleAddCamera = () => {
    const trimmedName = newCamName.trim() || `Cámara ${cameras.length + 1}`;
    const finalUrl = newCamSource === "webcam" ? "" : newCamUrl.trim() || FALLBACK_PUBLIC_STREAMS[0].url;
    const created: CameraConfig = {
      id: `cam-${Date.now().toString(36)}`,
      name: trimmedName,
      sourceKind: newCamSource,
      url: finalUrl,
      scenarioId: newCamScenario,
      alertTarget: newCamAlertTarget,
      mode: "combined",
      threshold: 0.5,
      enabled: true,
    };
    repository.saveCamera(created);
    switchCamera(created.id);
    setParams({ camara: created.id }, { replace: true });
    setShowAddCam(false);
    setNewCamName("");
    toast({
      kind: "success",
      title: "Cámara añadida y guardada",
      description: `${created.name} está disponible en En Vivo, Dashboard, Historial, Alertas y Configuración.`,
    });
  };

  const handleDeleteCamera = (camId: string) => {
    if (cameras.length <= 1) return;
    if (active && activeCameraId === camId) {
      live.stop("Cámara eliminada");
    }
    repository.deleteCamera(camId);
    const remaining = repository.listCameras();
    if (activeCameraId === camId && remaining[0]) {
      setActiveCameraId(remaining[0].id);
    }
    toast({ kind: "info", title: "Cámara eliminada del sistema" });
  };

  // Cargar catálogo de cámaras públicas desde el backend
  useEffect(() => {
    fetchWithTimeout(`${API_BASE_URL}/api/v1/streams/public`, {}, 8_000)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.streams?.length) {
          setPublicStreams(data.streams);
        }
      })
      .catch(() => {
        /* usa catálogo local */
      });
  }, []);

  // Sincronizar fuente activa + objetivo de alerta con el hook useLiveMonitor
  useEffect(() => {
    live.configureSource(sourceKind, activeUrl, alertTarget);
  }, [sourceKind, activeUrl, alertTarget, live]);

  // Refresco en vivo del Mosaico Multi-Cámara (captura todas las cámaras activas de stream)
  const refreshMosaicCameras = useCallback(async () => {
    if (mosaicInFlightRef.current) return;
    mosaicInFlightRef.current = true;
    try {
      const enabledStreamCams = cameras.filter((c) => c.enabled && c.sourceKind !== "webcam" && c.url.trim());
      await Promise.all(
        enabledStreamCams.map(async (cam, idx) => {
          setMosaicPreviews((prev) => ({
            ...prev,
            [cam.id]: {
              ...(prev[cam.id] ?? {
                snapshotUrl: ALL_SCENARIOS.find((s) => s.id === cam.scenarioId)?.asset ?? "",
                objectsCount: 0,
                alertsCount: 0,
                latencyMs: 0,
                detections: [],
                patterns: [],
                updatedAt: "",
              }),
              loading: true,
            },
          }));
          try {
            const resp = await fetchWithTimeout(`${API_BASE_URL}/api/v1/streams/capture`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                streamUrl: cam.url,
                scenarioId: cam.scenarioId,
                mode: cam.mode,
                threshold: cam.threshold,
                frameIndex: idx + 1,
                t: Date.now() / 1000,
                alertTarget: cam.alertTarget,
              }),
            }, 45_000);
            if (!resp.ok) throw await readApiError(resp, "No se pudo capturar la cámara");
            const data = await resp.json();
            const dets = (data.detections ?? []) as Detection[];
            const pats = (data.patterns ?? []) as PatternResult[];
            const nonOkPats = pats.filter((p) => !["ppe_ok", "conforming", "person_identified"].includes(p.type));
            setMosaicPreviews((prev) => ({
              ...prev,
              [cam.id]: {
                snapshotUrl: data.annotatedSnapshotUrl || data.frameDataUrl,
                objectsCount: dets.filter((d) => d.confidence >= cam.threshold).length,
                alertsCount: nonOkPats.length,
                latencyMs: data.latencyMs ?? 0,
                detections: dets,
                patterns: pats,
                updatedAt: new Date().toLocaleTimeString(),
                loading: false,
                error: undefined,
              },
            }));
          } catch (err) {
            setMosaicPreviews((prev) => ({
              ...prev,
              [cam.id]: {
                ...(prev[cam.id] ?? {
                  snapshotUrl: ALL_SCENARIOS.find((s) => s.id === cam.scenarioId)?.asset ?? "",
                  objectsCount: 0,
                  alertsCount: 0,
                  latencyMs: 0,
                  detections: [],
                  patterns: [],
                  updatedAt: "",
                }),
                loading: false,
                error: (err as Error).message,
              },
            }));
          }
        }),
      );
    } finally {
      mosaicInFlightRef.current = false;
    }
  }, [cameras]);

  useEffect(() => {
    if (viewMode !== "mosaic") return;
    void refreshMosaicCameras();
    if (!mosaicAutoRefresh) return;
    const timer = window.setInterval(() => {
      void refreshMosaicCameras();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [viewMode, mosaicAutoRefresh, refreshMosaicCameras]);

  // Iniciar / detener cámara web local (getUserMedia) cuando sourceKind === "webcam" e isCamEnabled
  const startWebcam = async (preferredDeviceId?: string) => {
    setWebcamError(null);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError("Su navegador no permite acceso a cámara web (getUserMedia).");
      return;
    }
    try {
      const constraints: MediaStreamConstraints = {
        video: preferredDeviceId
          ? { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setWebcamReady(true);
      const allDevs = await navigator.mediaDevices.enumerateDevices();
      const vids = allDevs.filter((d) => d.kind === "videoinput");
      setDevices(vids);
      if (!preferredDeviceId && vids.length > 0) {
        const currentTrack = stream.getVideoTracks()[0];
        const sId = currentTrack?.getSettings()?.deviceId;
        if (sId) setDeviceId(sId);
      }
    } catch (err) {
      setWebcamReady(false);
      setWebcamError(`No se pudo abrir la cámara web: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    if (viewMode === "single" && sourceKind === "webcam" && isCamEnabled) {
      void startWebcam(deviceId || undefined);
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
      }
      setWebcamReady(false);
    }
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
        mediaStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sourceKind, isCamEnabled]);

  live.onAlert((alerts) => {
    for (const a of alerts) {
      toast({
        kind: a.severity === "critical" || a.severity === "high" ? "error" : "warning",
        title: `Alerta en ${activeCamera?.name ?? "Cámara"}: ${a.ruleName}`,
        description: a.message,
      });
    }
  });

  useEffect(() => {
    if (live.autoPaused) {
      toast({
        kind: "info",
        title: "Análisis en pausa",
        description: "Se pausó al ocultar la pestaña. Pulse Reanudar para continuar.",
      });
    }
  }, [live.autoPaused, toast]);

  const begin = () => {
    if (!isCamEnabled) {
      toast({
        kind: "warning",
        title: "Cámara desactivada",
        description: "Active primero esta cámara con el botón «Activar cámara» para iniciar el análisis.",
      });
      return;
    }
    try {
      live.start(
        {
          scenarioId,
          mode,
          threshold,
          ruleIds: rules.filter((x) => x.enabled).map((x) => x.id),
          cameraId: activeCamera?.id,
          cameraName: activeCamera?.name,
        },
        user,
      );
      toast({
        kind: "info",
        title: `Monitoreo iniciado en ${activeCamera?.name}`,
        description: `${scenario.name} · ${getAlertTargetLabel(scenarioId, alertTarget, true)}`,
      });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo iniciar", description: (e as Error).message });
    }
  };

  // La URL manda: ?vista=mosaico abre el Monitoreo general; ?camara=ID abre esa cámara.
  // Así funcionan el menú lateral y los enlaces de otros módulos aunque ya estemos en esta página.
  useEffect(() => {
    if (paramVista === "mosaico") {
      setViewMode("mosaic");
      return;
    }
    setViewMode("single");
    if (paramCamId && cameras.some((c) => c.id === paramCamId)) switchCamera(paramCamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramVista, paramCamId]);

  // Tras cambiar de cámara con un análisis en curso, iniciarlo en la nueva cámara.
  // Se ejecuta después del efecto configureSource, así el hook ya apunta a la nueva fuente.
  useEffect(() => {
    if (!pendingAutoStartRef.current || pendingAutoStartRef.current !== activeCamera?.id) return;
    pendingAutoStartRef.current = null;
    if (canRun) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCamera?.id]);

  const end = () => {
    pendingAutoStartRef.current = null;
    live.stop();
    toast({
      kind: "success",
      title: "Análisis finalizado",
      description: `La sesión y las alertas de ${activeCamera?.name} quedaron guardadas en el historial.`,
    });
  };

  // Alertas e historial filtrados exclusivamente para la cámara seleccionada
  const cameraAlerts = allAlerts
    .filter((a) => camR.ofAlert(a) === activeCamera?.id || live.sessionAlerts.some((sa) => sa.id === a.id))
    .slice(0, 25);
  const cameraHistory = allAnalyses.filter((a) => camR.ofAnalysis(a) === activeCamera?.id).slice(0, 8);
  const events = Object.entries(r?.stats.patternEvents ?? {});
  const persist = 1.5;
  const activeCount = cameras.filter((c) => c.enabled).length;

  return (
    <>
      <PageHeader
        title="Centro de Cámaras en Vivo y Monitoreo Multi-Escenario"
        description="Visualice todas sus cámaras en vivo en simultáneo (Mosaico) o seleccione una cámara para abrir todo su panel de control, alertas, historial y configuración persistente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full flex-col rounded-lg border border-[var(--border)] bg-white p-0.5 shadow-xs sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setViewMode("mosaic");
                  setParams({ vista: "mosaico" }, { replace: true });
                }}
                className={cx(
                  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  viewMode === "mosaic"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                )}
              >
                <Grid className="h-3.5 w-3.5" />
                Monitoreo general ({activeCount}/{cameras.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("single");
                  if (activeCamera) setParams({ camara: activeCamera.id }, { replace: true });
                }}
                className={cx(
                  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  viewMode === "single"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                )}
              >
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[220px] truncate">{activeCamera?.name}</span>
              </button>
            </div>
            <Button
              size="sm"
              variant={showAddCam ? "secondary" : "primary"}
              icon={showAddCam ? X : Plus}
              onClick={() => setShowAddCam((v) => !v)}
            >
              {showAddCam ? "Cerrar formulario" : "Añadir cámara"}
            </Button>
          </div>
        }
      />

      {/* Formulario desplegable para Añadir Nueva Cámara (se guarda permanentemente) */}
      {showAddCam && (
        <Card className="mb-4 border-[var(--accent)] bg-[var(--surface-2)]">
          <div className="space-y-3 p-4">
            <p className="text-xs font-semibold text-[var(--accent-ink)]">
              Registrar nueva cámara en el sistema (su configuración quedará guardada automáticamente en todos los módulos)
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Field label="Nombre de la cámara" htmlFor="nc-name">
                <Input
                  id="nc-name"
                  value={newCamName}
                  onChange={(e) => setNewCamName(e.target.value)}
                  placeholder="Ej. Seattle Alki HD / Almacén Botellas Cielo"
                />
              </Field>
              <Field label="Tipo de fuente" htmlFor="nc-src">
                <Select
                  id="nc-src"
                  value={newCamSource}
                  onChange={(e) => {
                    const k = e.target.value as CameraSourceKind;
                    setNewCamSource(k);
                    if (k === "public-stream") {
                      setNewCamScenario("public-traffic");
                      setNewCamAlertTarget("all");
                      setNewCamUrl(FALLBACK_PUBLIC_STREAMS[0].url);
                    } else if (k === "mobile-ip") {
                      setNewCamUrl("http://192.168.1.40:8080/video");
                    } else {
                      setNewCamUrl("");
                    }
                  }}
                  className="w-full"
                >
                  <option value="public-stream">Cámara Pública en Vivo (Seattle DOT / HLS .m3u8)</option>
                  <option value="webcam">Cámara Web (PC / Laptop)</option>
                  <option value="mobile-ip">Cámara Celular (IP Webcam Wi-Fi)</option>
                </Select>
              </Field>
              <Field label="Tipo de escenario asignado" htmlFor="nc-sc">
                <Select
                  id="nc-sc"
                  value={newCamScenario}
                  onChange={(e) => {
                    const sc = e.target.value;
                    setNewCamScenario(sc);
                    setNewCamAlertTarget(ALERT_TARGET_OPTIONS[sc]?.[0]?.value ?? "all");
                  }}
                  className="w-full"
                >
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={newCamScenario === "retail-store" ? "Aforo máximo de la sala" : "Qué queremos que detecte como Alerta"} htmlFor="nc-target">
                {newCamScenario === "retail-store" ? (
                  <CapacityInput id="nc-target" target={newCamAlertTarget} onChange={setNewCamAlertTarget} />
                ) : (
                <Select
                  id="nc-target"
                  value={newCamAlertTarget}
                  onChange={(e) => setNewCamAlertTarget(e.target.value)}
                  className="w-full"
                >
                  {(ALERT_TARGET_OPTIONS[newCamScenario] ?? ALERT_TARGET_OPTIONS["public-traffic"]).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                )}
              </Field>
            </div>

            {newCamSource !== "webcam" && (
              <div className="grid gap-3 md:grid-cols-2">
                {newCamSource === "public-stream" && (
                  <Field label="Elegir cámara pública precargada (Seattle DOT Travelers HD / Caltrans)" htmlFor="nc-preset">
                    <Select
                      id="nc-preset"
                      value={publicStreams.some((p) => p.url === newCamUrl) ? newCamUrl : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setNewCamUrl(e.target.value);
                          const found = publicStreams.find((p) => p.url === e.target.value);
                          if (found && !newCamName.trim()) setNewCamName(found.name);
                        }
                      }}
                      className="w-full"
                    >
                      <option value="">-- Seleccionar del catálogo HD --</option>
                      {publicStreams.map((s) => (
                        <option key={s.id} value={s.url}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field
                  label="URL del Stream (Acepta https://web.seattle.gov/Travelers/, .m3u8 o IP Webcam)"
                  htmlFor="nc-url"
                >
                  <Input
                    id="nc-url"
                    value={newCamUrl}
                    onChange={(e) => setNewCamUrl(e.target.value)}
                    placeholder="https://web.seattle.gov/Travelers/ o https://.../playlist.m3u8"
                  />
                </Field>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setShowAddCam(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" icon={Plus} onClick={handleAddCamera}>
                Guardar cámara en el sistema
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* =====================================================================
          APARTADO 1: MOSAICO DE TODAS LAS CÁMARAS EN VIVO (VISTA MULTICÁMARA)
          ===================================================================== */}
      {viewMode === "mosaic" && (
        <div className="space-y-4">
          {active && activeCamera && (
            <Notice tone="info" title={`Análisis IA en curso: ${activeCamera.name} (${live.sessionClock ?? "00:00"})`}>
              El análisis sigue activo mientras revisa el mosaico. Abra cualquier otra cámara y el análisis continuará
              automáticamente en ella (la sesión actual se guarda en el historial).{" "}
              <button type="button" className="font-semibold underline" onClick={() => openCameraDetail(activeCamera)}>
                Volver a {activeCamera.name}
              </button>
            </Notice>
          )}
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  Monitoreo general · Todas las cámaras al mismo tiempo ({activeCount} activas · {cameras.length - activeCount} desactivadas)
                </h2>
                <p className="text-xs text-[var(--ink-3)]">
                  Haga clic en cualquier cámara o en <strong>«Abrir todo de esta cámara»</strong> para entrar a su consola completa de análisis IA, alertas e historial. También puede desactivar o activar cualquier cámara con un clic.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={mosaicAutoRefresh}
                    onChange={(e) => setMosaicAutoRefresh(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Auto-refresco en vivo (4 s)
                </label>
                <Button size="sm" icon={RefreshCw} onClick={() => void refreshMosaicCameras()}>
                  Capturar todas ahora
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cameras.map((cam) => {
              const sc = ALL_SCENARIOS.find((s) => s.id === cam.scenarioId) ?? SCENARIOS[0];
              const preview = mosaicPreviews[cam.id];
              const camAlertsTotal = allAlerts.filter((a) => camR.ofAlert(a) === cam.id && a.status !== "closed").length;
              const camAnalysesTotal = allAnalyses.filter((a) => camR.ofAnalysis(a) === cam.id).length;
              const targetLabel = getAlertTargetLabel(cam.scenarioId, cam.alertTarget, true);
              const imgSrc = preview?.snapshotUrl || sc.cover || sc.asset;

              return (
                <Card
                  key={cam.id}
                  className={cx(
                    "flex flex-col justify-between overflow-hidden transition-all",
                    cam.enabled
                      ? "border-[var(--border)] hover:border-[var(--accent)] hover:shadow-md"
                      : "border-dashed border-slate-300 bg-slate-50/90 opacity-85",
                  )}
                >
                  {/* Cabecera de la tarjeta de cámara */}
                  <div>
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cx(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                              cam.enabled
                                ? "bg-red-600 text-white"
                                : "bg-slate-300 text-slate-700",
                            )}
                          >
                            <span className={cx("h-1.5 w-1.5 rounded-full", cam.enabled ? "anim-pulse bg-white" : "bg-slate-600")} />
                            {cam.enabled ? "EN VIVO" : "DESACTIVADA"}
                          </span>
                          <span className="truncate text-xs font-bold text-[var(--ink)]" title={cam.name}>
                            {cam.name}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleCameraEnabled(cam)}
                        className={cx(
                          "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          cam.enabled
                            ? "border-slate-300 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                            : "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700",
                        )}
                        title={cam.enabled ? "Desactivar esta cámara" : "Activar esta cámara"}
                      >
                        <Power className="h-3 w-3" />
                        {cam.enabled ? "Desactivar" : "Activar"}
                      </button>
                    </div>

                    {/* Vista previa en vivo del video / stream */}
                    <div
                      onClick={() => openCameraDetail(cam)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openCameraDetail(cam);
                      }}
                      className="group relative aspect-[16/10] w-full cursor-pointer overflow-hidden bg-slate-950"
                    >
                      {cam.enabled ? (
                        <>
                          {cam.sourceKind === "webcam" ? (
                            <MosaicWebcamPreview onVideo={cam.id === activeCameraId ? live.bindVideoElement : undefined} />
                          ) : (
                            <LiveStreamVideo
                              url={cam.url}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                              fallback={
                                <img
                                  src={imgSrc}
                                  alt={cam.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                              }
                            />
                          )}
                          {active && cam.id === activeCameraId && (
                            <span className="absolute right-2 top-10 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white shadow">
                              <Cpu className="h-3 w-3" /> IA ANALIZANDO · {live.sessionClock}
                            </span>
                          )}
                          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-slate-950/80 to-transparent p-2.5 text-[11px] text-white">
                            <span className="rounded bg-slate-900/80 px-2 py-0.5 font-semibold">
                              {sc.name}
                            </span>
                            {preview?.updatedAt && (
                              <span className="tabular rounded bg-slate-900/80 px-2 py-0.5 text-[10px] text-sky-300">
                                IA: {preview.objectsCount} obj. · {preview.latencyMs} ms
                              </span>
                            )}
                          </div>
                          {preview?.error && !preview.loading && (
                            <div
                              className="absolute inset-x-2 top-10 rounded-md bg-red-700/90 px-2 py-1 text-[11px] font-medium text-white"
                              title={preview.error}
                            >
                              ⚠ Sin señal: {preview.error.length > 110 ? `${preview.error.slice(0, 110)}…` : preview.error}
                            </div>
                          )}
                          {preview?.loading && !preview.updatedAt && (
                            <div className="absolute inset-x-2 top-10 rounded-md bg-slate-900/80 px-2 py-1 text-[11px] text-sky-200">
                              Conectando con la cámara…
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent p-2.5 text-xs text-white">
                            <span className="truncate font-medium">🎯 Detecta: {targetLabel}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                              Abrir cámara <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-slate-900 p-6 text-center text-slate-400">
                          <div className="space-y-2">
                            <Power className="mx-auto h-8 w-8 text-slate-500" />
                            <p className="text-sm font-semibold text-slate-300">CÁMARA DESACTIVADA</p>
                            <p className="text-xs text-slate-400">
                              Esta cámara está pausada. Pulse «Activar» para reanudar su transmisión en vivo.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pie de tarjeta con estadísticas por cámara y acceso directo */}
                  <div className="space-y-2.5 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[var(--ink-2)]">
                        Fuente:{" "}
                        <strong>
                          {cam.sourceKind === "public-stream"
                            ? "Stream Público HD"
                            : cam.sourceKind === "mobile-ip"
                              ? "Celular IP"
                              : "Webcam PC"}
                        </strong>
                      </span>
                      <span className="tabular text-[var(--ink-3)]">
                        {camAnalysesTotal} sesiones ·{" "}
                        <strong className={camAlertsTotal > 0 ? "text-red-600" : ""}>
                          {camAlertsTotal} alertas abiertas
                        </strong>
                      </span>
                    </div>

                    <NotifyToggle cam={cam} />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Maximize2}
                        className="flex-1"
                        onClick={() => openCameraDetail(cam)}
                      >
                        Abrir todo de esta cámara
                      </Button>
                      {cameras.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          onClick={() => handleDeleteCamera(cam.id)}
                          title="Eliminar cámara"
                        />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          APARTADO 2: VISTA COMPLETA DE LA CÁMARA SELECCIONADA
          ===================================================================== */}
      {viewMode === "single" && activeCamera && (
        <>
          {/* Barra superior de selección rápida de cámara y botón para volver al Mosaico */}
          <Card className="mb-4">
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={ArrowLeft}
                    onClick={() => {
                      setViewMode("mosaic");
                      setParams({ vista: "mosaico" }, { replace: true });
                    }}
                  >
                    Monitoreo general ({cameras.length})
                  </Button>
                  <span className="text-sm font-bold text-[var(--ink)]">{activeCamera.name}</span>
                  <span
                    className={cx(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                      isCamEnabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200",
                    )}
                  >
                    {isCamEnabled ? "Cámara Activa" : "Cámara Desactivada"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={isCamEnabled ? "secondary" : "primary"}
                    icon={Power}
                    onClick={() => handleToggleCameraEnabled(activeCamera)}
                  >
                    {isCamEnabled ? "Desactivar esta cámara" : "Activar esta cámara"}
                  </Button>
                  <NotifyToggle cam={activeCamera} />
                  {live.sessionId && live.status === "stopped" && (
                    <Link to={`/analisis/${live.sessionId}`}>
                      <Button size="sm" icon={Eye}>
                        Ver última sesión guardada
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              {/* Pestañas rápidas para cambiar entre las cámaras registradas */}
              <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>button]:shrink-0">
                {cameras.map((cam) => {
                  const isSelected = cam.id === activeCamera.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => openCameraDetail(cam)}
                      title={active && !isSelected ? "El análisis continuará automáticamente en esta cámara" : undefined}
                      className={cx(
                        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] ring-1 ring-[var(--accent)]"
                          : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                        !cam.enabled && "opacity-60",
                      )}
                    >
                      <span className={cx("h-2 w-2 rounded-full", cam.enabled ? "bg-emerald-500" : "bg-slate-400")} />
                      <span>{cam.name}</span>
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>

              {/* Configuración persistente de la fuente de esta cámara */}
              <div className="grid gap-3 rounded-xl bg-[var(--surface-2)] p-3 md:grid-cols-3">
                <Field label="1. Nombre de esta cámara (se guarda automáticamente)" htmlFor="cam-edit-name">
                  <Input
                    id="cam-edit-name"
                    value={activeCamera.name}
                    disabled={active}
                    onChange={(e) => updateActiveCameraConfig({ name: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de fuente de video" htmlFor="cam-edit-source">
                  <Select
                    id="cam-edit-source"
                    value={sourceKind}
                    disabled={active}
                    onChange={(e) => {
                      const nextSk = e.target.value as CameraSourceKind;
                      updateActiveCameraConfig({
                        sourceKind: nextSk,
                        url:
                          nextSk === "webcam"
                            ? ""
                            : nextSk === "mobile-ip"
                              ? "http://192.168.1.40:8080/video"
                              : activeUrl || FALLBACK_PUBLIC_STREAMS[0].url,
                      });
                    }}
                    className="w-full"
                  >
                    <option value="public-stream">Cámara Pública en Vivo (Seattle DOT HD / HLS)</option>
                    <option value="webcam">Cámara Web (PC / Dispositivo)</option>
                    <option value="mobile-ip">Cámara Celular (IP Webcam / Wi-Fi)</option>
                  </Select>
                </Field>

                {sourceKind === "webcam" ? (
                  <Field label="Dispositivo de cámara web" htmlFor="cam-dev">
                    <div className="flex gap-2">
                      <Select
                        id="cam-dev"
                        value={deviceId}
                        disabled={active}
                        onChange={(e) => {
                          setDeviceId(e.target.value);
                          void startWebcam(e.target.value);
                        }}
                        className="flex-1"
                      >
                        {devices.length === 0 ? (
                          <option value="">Cámara predeterminada del sistema</option>
                        ) : (
                          devices.map((d, i) => (
                            <option key={d.deviceId || i} value={d.deviceId}>
                              {d.label || `Cámara ${i + 1}`}
                            </option>
                          ))
                        )}
                      </Select>
                      <Button size="sm" icon={RefreshCw} onClick={() => startWebcam(deviceId || undefined)} disabled={active}>
                        Reiniciar
                      </Button>
                    </div>
                  </Field>
                ) : (
                  <Field
                    label={
                      sourceKind === "public-stream"
                        ? "Stream Público HD (Seattle Travelers o URL .m3u8)"
                        : "URL IP Webcam del celular"
                    }
                    htmlFor="cam-edit-url"
                  >
                    <div className="flex flex-col gap-2">
                      {sourceKind === "public-stream" && (
                        <Select
                          value={publicStreams.some((s) => s.url === activeUrl) ? activeUrl : ""}
                          disabled={active}
                          aria-label="Cámara pública del catálogo HD"
                          onChange={(e) => {
                            if (e.target.value) updateActiveCameraConfig({ url: e.target.value });
                          }}
                          className="w-full"
                        >
                          <option value="">URL personalizada (escríbala abajo)</option>
                          {publicStreams.map((s) => (
                            <option key={s.id} value={s.url}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Input
                        id="cam-edit-url"
                        value={activeUrl}
                        disabled={active}
                        onChange={(e) => updateActiveCameraConfig({ url: e.target.value })}
                        placeholder="https://web.seattle.gov/Travelers/ o .m3u8"
                        className="w-full min-w-0 text-xs"
                      />
                    </div>
                  </Field>
                )}
              </div>
            </div>
          </Card>

          {/* Controles del Escenario, Objetivo de Alerta y Motor de Análisis de esta Cámara */}
          <Card className="relative z-20 mb-4">
            <div className="flex flex-wrap items-end gap-4 p-4">
              <div className="w-full sm:w-56">
                <Field label="2. Escenario de esta cámara" htmlFor="lsc">
                  <Select
                    id="lsc"
                    className="w-full"
                    value={scenarioId}
                    onChange={(e) => {
                      const nextSc = e.target.value;
                      const nextTarget = ALERT_TARGET_OPTIONS[nextSc]?.[0]?.value ?? "all";
                      updateActiveCameraConfig({ scenarioId: nextSc, alertTarget: nextTarget });
                    }}
                    disabled={active}
                  >
                    {SCENARIOS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="w-full sm:w-80">
                <Field label={scenarioId === "retail-store" ? "3. Aforo máximo de la sala" : "3. Qué detectar como Alerta en esta cámara"} htmlFor="ltarget">
                  {scenarioId === "retail-store" ? (
                    <CapacityInput id="ltarget" target={alertTarget} disabled={active} onChange={(t) => updateActiveCameraConfig({ alertTarget: t })} />
                  ) : (
                  <Select
                    id="ltarget"
                    className="w-full"
                    value={alertTarget}
                    onChange={(e) => updateActiveCameraConfig({ alertTarget: e.target.value })}
                    disabled={active}
                  >
                    {(ALERT_TARGET_OPTIONS[scenarioId] ?? ALERT_TARGET_OPTIONS["public-traffic"]).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  )}
                </Field>
              </div>
              <Field label="Perfil de análisis">
                <div
                  className="flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5"
                  role="radiogroup"
                  aria-label="Perfil"
                >
                  {MODES.map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={mode === m}
                      disabled={active}
                      onClick={() => updateActiveCameraConfig({ mode: m })}
                      className={cx(
                        "rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed",
                        mode === m
                          ? "bg-white text-[var(--accent-ink)] shadow-sm ring-1 ring-[var(--border)]"
                          : "text-[var(--ink-2)]",
                      )}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="w-44">
                <Field label={`Umbral · ${(threshold * 100).toFixed(0)} %`} htmlFor="lthr">
                  <input
                    id="lthr"
                    type="range"
                    min={0.1}
                    max={0.95}
                    step={0.05}
                    value={threshold}
                    disabled={active}
                    onChange={(e) => updateActiveCameraConfig({ threshold: +e.target.value })}
                    className="h-9 w-full accent-[var(--accent)]"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2 lg:ml-auto">
                {!active ? (
                  <Button variant="primary" size="lg" icon={Play} onClick={begin} disabled={!canRun || !isCamEnabled}>
                    {live.status === "stopped" ? "Nuevo análisis en vivo" : "Iniciar análisis IA"}
                  </Button>
                ) : (
                  <>
                    {analyzing ? (
                      <Button size="lg" icon={Pause} onClick={live.pause}>
                        Pausar
                      </Button>
                    ) : (
                      <Button size="lg" variant="primary" icon={Play} onClick={live.resume}>
                        Reanudar
                      </Button>
                    )}
                    <Button size="lg" variant="danger" icon={Square} onClick={end}>
                      Detener análisis
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>

          {!isCamEnabled && (
            <div className="mb-4">
              <Notice tone="warning" title={`${activeCamera.name} está desactivada`}>
                Esta cámara fue desactivada. Pulse el botón <strong>«Activar esta cámara»</strong> arriba a la derecha para encender su transmisión y análisis IA.
              </Notice>
            </div>
          )}

          {webcamError && sourceKind === "webcam" && isCamEnabled && (
            <div className="mb-4">
              <Notice tone="warning" title="Cámara web no disponible">
                {webcamError} Puede cambiar el tipo de fuente a <strong>Cámara Pública en Vivo</strong> o <strong>Cámara Celular IP</strong>.
              </Notice>
            </div>
          )}

          {live.streamError && (
            <div className="mb-4">
              <Notice tone="error" title="Aviso de conexión con el stream / backend">
                {live.streamError}
              </Notice>
            </div>
          )}

          {live.status === "stopped" && live.summary && (
            <div className="mb-4">
              <Notice tone="success" title={`Sesión ${live.summary.id} guardada en el historial de ${activeCamera.name}`}>
                <p>
                  {live.summary.live?.frames} fotogramas analizados · {live.summary.live?.seconds} s ·{" "}
                  {live.summary.live?.uniqueTracks} objetos rastreados · {live.sessionAlerts.length} alertas.{" "}
                  <Link className="font-medium underline" to={`/analisis/${live.summary.id}`}>
                    Revisar detalle de la sesión
                  </Link>
                  .
                </p>
              </Notice>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
            <div className="min-w-0 space-y-4">
              <Card className="min-w-0">
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {!isCamEnabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-600 px-2 py-0.5 font-bold tracking-wide text-white">
                        <Power className="h-3 w-3" />
                        CÁMARA DESACTIVADA
                      </span>
                    ) : live.status === "paused" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink-2)] px-2 py-0.5 font-bold tracking-wide text-white">
                        <Pause className="h-3 w-3" />
                        PAUSADO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--critical)] px-2 py-0.5 font-bold tracking-wide text-white">
                        <span className="anim-pulse h-2 w-2 rounded-full bg-white" />
                        {activeCamera.name} · EN VIVO
                      </span>
                    )}
                    {active ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-0.5 font-bold tracking-wide text-white">
                        <Cpu className="h-3 w-3" />
                        IA REAL ANALIZANDO · {live.sessionClock}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-semibold text-[var(--ink-2)] ring-1 ring-[var(--border)]">
                        <Radio className="h-3 w-3" />
                        IA EN ESPERA (PULSE INICIAR)
                      </span>
                    )}
                    <span className="tabular text-[var(--ink-3)]">
                      {r
                        ? `Fotograma #${r.frame.index} · inferencia ${r.frame.latencyMs} ms`
                        : analyzing
                          ? `Conectando con ${activeCamera.name} y cargando IA…`
                          : ""}
                    </span>
                    <span className="ml-auto text-[var(--ink-3)]">Máx. sesión: {LIVE_MAX_SECONDS / 60} min</span>
                  </div>

                  <ViewerToolbar
                    layers={layers}
                    setLayers={setLayers}
                    view={view}
                    setView={setView}
                    binaryT={binaryT}
                    setBinaryT={setBinaryT}
                    hidePreprocess={sourceKind === "webcam"}
                  />

                  <Viewer
                    background={
                      !isCamEnabled ? (
                        <div className="grid aspect-[16/10] w-full place-items-center bg-slate-900 p-8 text-center text-slate-300">
                          <div className="space-y-3">
                            <Power className="mx-auto h-10 w-10 text-slate-400" />
                            <p className="text-base font-semibold">Esta cámara se encuentra desactivada</p>
                            <Button variant="primary" icon={Power} onClick={() => handleToggleCameraEnabled(activeCamera)}>
                              Activar cámara ahora
                            </Button>
                          </div>
                        </div>
                      ) : sourceKind === "webcam" ? (
                        <div className="relative aspect-[16/10] w-full bg-[#0b1726]">
                          <video
                            ref={(el) => {
                              videoRef.current = el;
                              live.bindVideoElement(el);
                            }}
                            muted
                            playsInline
                            autoPlay
                            className="h-full w-full object-cover"
                          />
                          {!webcamReady && (
                            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#94a3b8]">
                              <div>
                                <Camera className="mx-auto mb-2 h-8 w-8 opacity-60" />
                                <p>Esperando permiso de cámara web del navegador…</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : smoothVideo ? (
                        <div className="relative w-full bg-black">
                          <LiveStreamVideo
                            url={activeUrl}
                            onStatus={setVideoStatus}
                            fallback={<img src={streamStill} alt={`Transmisión en vivo ${activeCamera.name}`} className="block h-auto w-full" />}
                          />
                          <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {videoStatus === "playing"
                              ? "● Video en vivo (fluido)" + (active ? " · cajas IA actualizadas cada análisis" : "")
                              : videoStatus === "error"
                                ? "Video no disponible: mostrando el último fotograma analizado"
                                : "Conectando al video en vivo…"}
                          </span>
                        </div>
                      ) : undefined
                    }
                    src={isCamEnabled && sourceKind !== "webcam" && !smoothVideo ? streamStill : undefined}
                    alt={`Transmisión en vivo ${activeCamera.name}`}
                    detections={active ? r?.detections ?? [] : []}
                    masks={active ? r?.frame.masks ?? [] : []}
                    zones={scenario.zones}
                    classes={classes}
                    threshold={threshold}
                    layers={layers}
                    highlightId={hl}
                    onHover={setHl}
                    preprocess={view}
                    binaryThreshold={binaryT}
                    live
                  />

                  <Legend classes={classes} detections={r?.detections ?? []} masks={r?.frame.masks ?? []} />
                  <p className="text-xs text-[var(--ink-3)]">{LIVE_HINT[scenarioId]}</p>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={`Objetos detectados en ${activeCamera.name}`}
                  subtitle="Detecciones reales sobre el umbral por segundo · últimos 60 s"
                  icon={Activity}
                />
                <div className="h-44 p-4">
                  {live.series.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={live.series} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                        <CartesianGrid stroke="var(--grid)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "var(--ink-3)", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "var(--axis)" }}
                          minTickGap={24}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "var(--ink-3)", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                          formatter={(v: number) => [v, "Objetos"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="objects"
                          name="Objetos"
                          stroke="var(--series-1)"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="grid h-full place-items-center text-sm text-[var(--ink-3)]">
                      La serie temporal de {activeCamera.name} aparece al pulsar «Iniciar análisis IA».
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader title={`Métricas de ${activeCamera.name}`} icon={Gauge} />
                <div className="grid grid-cols-2 gap-2 p-4">
                  <Stat
                    icon={Boxes}
                    label="Objetos ahora"
                    value={String(r?.stats.objectsNow ?? 0)}
                    hint={r?.stats.lowNow ? `+${r.stats.lowNow} de baja confianza` : undefined}
                  />
                  <Stat
                    icon={Users}
                    label="Objetos rastreados"
                    value={String(r?.stats.uniqueTracks ?? 0)}
                    hint="IDs únicos (track)"
                  />
                  <Stat icon={Activity} label="Máx. simultáneos" value={String(r?.stats.maxObjects ?? 0)} />
                  <Stat icon={Bell} label="Alertas sesión" value={String(r?.stats.alerts ?? 0)} />
                  <Stat
                    icon={Gauge}
                    label="Confianza media"
                    value={`${((r?.stats.averageConfidence ?? 0) * 100).toFixed(1)} %`}
                  />
                  <Stat icon={Timer} label="Latencia IA" value={`${r?.stats.avgLatencyMs ?? 0} ms`} hint="OpenCV + YOLO + CNN" />
                </div>
                {r && Object.keys(r.stats.byClassNow).length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--ink-2)]">
                    <span className="font-medium text-[var(--ink)]">En cámara ahora:</span>
                    {Object.entries(r.stats.byClassNow).map(([id, n]) => {
                      const c = classes.find((x) => x.id === id);
                      return (
                        <span key={id} className="tabular flex items-center gap-1">
                          <ClassDot color={c?.color ?? "#888"} />
                          {c?.name ?? id} {n}
                        </span>
                      );
                    })}
                  </div>
                )}
                {events.length > 0 && (
                  <ul className="space-y-1 border-t border-[var(--border)] px-4 py-3 text-sm">
                    <li className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                      Eventos únicos en la sesión
                    </li>
                    {events.map(([k, n]) => (
                      <li key={k} className="flex justify-between">
                        <span className="text-[var(--ink-2)]">{EVENT_LABEL[k] ?? k}</span>
                        <span className="tabular font-semibold">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {(mode === "patterns" || mode === "combined") && (
                <Card>
                  <CardHeader
                    title="Reglas en evaluación"
                    subtitle={`Objetivo: ${getAlertTargetLabel(scenarioId, alertTarget, true)}`}
                    icon={Activity}
                  />
                  <div className="p-4">
                    {r && r.pending.length ? (
                      <ul className="space-y-2">
                        {r.pending.map((p) => (
                          <li key={p.key} className="text-xs">
                            <div className="flex justify-between">
                              <span className="font-medium">{p.rule}</span>
                              <span className="tabular text-[var(--ink-3)]">
                                {p.key.split(":")[1] || "escena"} · {p.seconds.toFixed(1)} s
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                              <div
                                className="h-full rounded-full bg-[var(--warning)]"
                                style={{ width: `${Math.min(100, (p.seconds / persist) * 100)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[var(--ink-3)]">
                        {active ? "Ninguna condición de alerta activa en este instante." : "Pulse «Iniciar análisis IA»."}
                      </p>
                    )}
                    {r && r.patterns.length > 0 && (
                      <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                        {r.patterns.slice(0, 5).map((p) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-2 text-xs"
                            onMouseEnter={() => setHl(p.relatedDetectionIds?.[0] ?? null)}
                            onMouseLeave={() => setHl(null)}
                          >
                            <span
                              className={cx(
                                "rounded px-1 text-[9px] font-bold",
                                p.source === "model"
                                  ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                                  : "bg-[var(--surface-2)] text-[var(--ink-2)]",
                              )}
                            >
                              {p.source === "model" ? "CNN/IA" : "REGLA"}
                            </span>
                            <span className="min-w-0 flex-1 truncate" title={p.label}>
                              {p.label}
                            </span>
                            <ConfidenceBar value={p.confidence} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              )}

              {/* Alertas exclusivas de esta cámara */}
              <Card>
                <CardHeader
                  title={`Alertas de ${activeCamera.name} (${cameraAlerts.length})`}
                  subtitle={`Escenario: ${scenario.name}`}
                  icon={Bell}
                />
                {cameraAlerts.length ? (
                  <ul className="max-h-[380px] divide-y divide-[var(--border)] overflow-y-auto">
                    {cameraAlerts.map((a) => {
                      const frameDets = r?.detections ?? live.summary?.detections ?? [];
                      const framePats = r?.patterns ?? live.summary?.patterns ?? [];
                      const relatedDets = findAlertRelatedDetections(a, { detections: frameDets, patterns: framePats });
                      const targetDet = relatedDets[0] ?? frameDets.find(isNonCompliantDetection) ?? frameDets[0];
                      return (
                        <li key={a.id} className="anim-slide-up space-y-2 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={a.severity} />
                            <AlertStatusBadge status={a.status} />
                            <span className="tabular ml-auto text-[11px] text-[var(--ink-3)]">
                              {a.frameT !== undefined ? `t = ${a.frameT.toFixed(1)} s` : fmtDateTime(a.createdAt)}
                            </span>
                          </div>
                          {a.snapshotUrl && (
                            <ExpandableThumbnail
                              src={a.snapshotUrl}
                              alt="Evidencia capturada"
                              className="h-28 w-full"
                              onExpand={() =>
                                setLightbox({
                                  src: a.snapshotUrl!,
                                  title: a.message,
                                  subtitle: `Cámara: ${activeCamera.name} · Regla: ${a.ruleName}`,
                                  evidence: a.evidence,
                                  badge: a.id,
                                  focusBox: targetDet?.box,
                                  focusLabel: targetDet?.label,
                                  targetIds: relatedDets.map((d) => d.id),
                                  detections: frameDets,
                                })
                              }
                            />
                          )}
                          <p className="text-sm font-medium">{a.message}</p>
                          <p className="text-xs text-[var(--ink-2)]">{a.evidence}</p>
                          <AlertActions alert={a} compact />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Bell}
                    title="Sin alertas en esta cámara"
                    description="Las alertas generadas por esta cámara aparecerán aquí y se enviarán a su celular."
                  />
                )}
              </Card>

              {/* Historial exclusivo de esta cámara */}
              <Card>
                <CardHeader
                  title={`Historial de ${activeCamera.name} (${cameraHistory.length})`}
                  icon={History}
                  actions={
                    <Link to="/operaciones/historial" className="text-xs font-medium text-[var(--accent-ink)] hover:underline">
                      Ver todo
                    </Link>
                  }
                />
                {cameraHistory.length ? (
                  <ul className="divide-y divide-[var(--border)] text-xs">
                    {cameraHistory.map((hItem) => (
                      <li key={hItem.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <div className="min-w-0">
                          <Link to={`/analisis/${hItem.id}`} className="font-semibold text-[var(--accent-ink)] hover:underline">
                            {hItem.id}
                          </Link>
                          <p className="truncate text-[var(--ink-3)]">
                            {fmtDateTime(hItem.createdAt)} · {hItem.live?.frames ?? 0} fotogramas
                          </p>
                        </div>
                        <span className="tabular font-medium text-[var(--ink-2)]">
                          {hItem.detections.filter((d) => d.confidence >= hItem.threshold).length} obj.
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-xs text-[var(--ink-3)]">
                    Aún no hay sesiones guardadas para <strong>{activeCamera.name}</strong>.
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <SnapshotLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
