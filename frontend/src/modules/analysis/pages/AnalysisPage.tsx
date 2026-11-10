// Centro de análisis: selección de entrada → perfil/umbral/reglas → Analizar → resultados.
// Estados de pantalla: Vacío · Preparado · Procesando · Completado · Advertencia · Error.
import { fetchWithTimeout } from "@/infrastructure/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Camera, Check, ChevronDown, FileImage, History, ImagePlus, Loader2, Play, Radio, RefreshCw, ScanSearch, Upload, X } from "lucide-react";
import { analyzeImage, API_BASE_URL, repository, visionEngine } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import type { AnalysisStage, ProgressEvent } from "@/core/contracts/vision";
import { STAGE_LABEL } from "@/core/contracts/vision";
import type { AnalysisMode } from "@/core/domain/entities";
import { MODE_LABEL } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { useAnalyses, useClasses, useRules, useSettings } from "@/shared/hooks/useRepository";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Button, Card, cx, DemoBadge, EmptyState, Field, Notice, PageHeader, Select } from "@/shared/ui";
import { AnalysisWorkspace, uploadCache } from "../components/AnalysisWorkspace";
import { CapacityInput } from "@/modules/scenarios/components/CapacityInput";
import { DEFAULT_LAYERS, Viewer } from "../components/Viewer";
import { readImageFile, type LoadedImage } from "../validators/readImageFile";

type Phase = "empty" | "ready" | "processing" | "done" | "error";
const MODES: AnalysisMode[] = ["detection", "segmentation", "patterns", "combined"];
const MODE_HINT: Record<AnalysisMode, string> = {
  detection: "Cajas delimitadoras, clase y confianza.",
  segmentation: "Máscaras de píxeles (semántica e instancia).",
  patterns: "Detección + patrones + reglas y alertas.",
  combined: "Los tres: cajas, máscaras, patrones y alertas.",
};
const STAGES: Record<AnalysisMode, AnalysisStage[]> = {
  detection: ["validating", "preprocessing", "detecting", "rules", "saving"],
  segmentation: ["validating", "preprocessing", "segmenting", "rules", "saving"],
  patterns: ["validating", "preprocessing", "detecting", "patterns", "rules", "saving"],
  combined: ["validating", "preprocessing", "detecting", "segmenting", "patterns", "rules", "saving"],
};

export function AnalysisPage() {
  const user = useUser();
  const toast = useToast();
  const settings = useSettings();
  const rules = useRules();
  const classes = useClasses();
  const analyses = useAnalyses();
  const [params] = useSearchParams();

  const initialScenario = params.get("escenario");
  const [scenarioId, setScenarioId] = useState(initialScenario && SCENARIOS.some((s) => s.id === initialScenario) ? initialScenario : "");
  const [upload, setUpload] = useState<LoadedImage | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("combined");
  const [threshold, setThreshold] = useState(settings.defaultThreshold);
  /** Aforo máximo (solo escenario "Control de aforo"): "capacity:N". */
  const [occupancyTarget, setOccupancyTarget] = useState("all");
  const [ruleIds, setRuleIds] = useState<string[]>(() => rules.filter((r) => r.enabled).map((r) => r.id));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(initialScenario ? "ready" : "empty");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  const scenario = ALL_SCENARIOS.find((s) => s.id === scenarioId);
  const result = resultId ? analyses.find((a) => a.id === resultId) : undefined;
  const hasInput = !!scenario;
  const canRun = can(user.role, "analysis.run");
  const usesRules = mode === "patterns" || mode === "combined";
  const enabledRules = useMemo(() => rules.filter((r) => r.enabled), [rules]);

  useEffect(() => {
    const h = (e: MouseEvent) => rulesRef.current && !rulesRef.current.contains(e.target as Node) && setRulesOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Cambiar la entrada o la configuración invalida el resultado mostrado (vuelve a "Preparado").
  const touch = () => {
    if (phase === "done" || phase === "error") setPhase(hasInput ? "ready" : "empty");
    setResultId(null);
    setError(null);
  };

  const pickScenario = (id: string) => {
    setScenarioId(id);
    setResultId(null);
    setError(null);
    setPhase(id ? "ready" : "empty");
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setUploadError(null);
    try {
      const img = await readImageFile(file, settings.maxUploadMb);
      setUpload(img);
      setResultId(null);
      setError(null);
      setPhase(scenarioId ? "ready" : "empty");
      toast({ kind: "info", title: "Imagen cargada", description: `${img.fileName} · ${img.width}×${img.height}px. Asóciela a un escenario de referencia.` });
    } catch (e) {
      setUploadError((e as Error).message);
    }
  };

  const clearInput = () => {
    stopWebcam();
    setUpload(null);
    setUploadError(null);
    setScenarioId("");
    setResultId(null);
    setError(null);
    setPhase("empty");
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    setWebcamOpen(false);
  };

  const startWebcamCapture = async () => {
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
        audio: false,
      });
      webcamStreamRef.current = stream;
      setWebcamOpen(true);
      setTimeout(() => {
        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
          void webcamVideoRef.current.play();
        }
      }, 60);
    } catch (e) {
      setUploadError(`No se pudo abrir la cámara web: ${(e as Error).message}`);
    }
  };

  const snapWebcamPhoto = () => {
    const v = webcamVideoRef.current;
    if (!v || v.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const fileName = `captura-camara-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.jpg`;
    setUpload({
      fileName,
      mime: "image/jpeg",
      size: Math.round(dataUrl.length * 0.75),
      width: canvas.width,
      height: canvas.height,
      dataUrl,
    });
    stopWebcam();
    setResultId(null);
    setError(null);
    setPhase(scenarioId ? "ready" : "empty");
    toast({ kind: "info", title: "Foto capturada de cámara", description: `${fileName} (${canvas.width}×${canvas.height}px). Elija el escenario si aún no lo seleccionó.` });
  };

  const run = async () => {
    if (!scenario || phase === "processing") return;
    setPhase("processing");
    setError(null);
    setResultId(null);
    setProgress({ stage: "validating", percent: 2 });
    try {
      const a = await analyzeImage.execute(
        {
          scenarioId: scenario.id,
          mode,
          threshold,
          alertTarget: scenario.id === "retail-store" ? occupancyTarget : "all",
          ruleIds: usesRules ? ruleIds : [],
          source: upload ? { kind: "upload", fileName: upload.fileName, mime: upload.mime, size: upload.size, dataUrl: upload.dataUrl } : { kind: "scenario" },
        },
        user,
        setProgress,
      );
      if (upload) uploadCache.set(a.id, upload.dataUrl);
      setResultId(a.id);
      setPhase("done");
      // Si se generaron alertas, despacharlas al celular (usa backend/.env o los ajustes de Configuración)
      const st = repository.getSettings();
      if (st.notificationsEnabled !== false) {
        const createdAlerts = repository.listAlerts().filter((al) => al.analysisId === a.id);
        for (const al of createdAlerts) {
          void fetchWithTimeout(`${API_BASE_URL}/api/v1/notifications/alert`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: al.ruleName,
              message: al.message,
              severity: al.severity,
              scenarioName: scenario.name,
              evidence: al.evidence,
              imageDataUrl: al.snapshotUrl ?? a.snapshotUrl,
              detections: [],
              telegramBotToken: st.telegramBotToken || undefined,
              telegramChatId: st.telegramChatId || undefined,
              ntfyTopic: st.ntfyTopic || undefined,
            }),
          }, 25_000).catch(() => {});
        }
      }
      const low = a.detections.filter((d) => d.confidence < a.threshold).length;
      if (a.warnings.length) {
        toast({ kind: "warning", title: "Análisis completado: requiere revisión", description: low ? `${low} detección(es) de baja confianza o reglas activadas.` : "Revise las advertencias y alertas asociadas." });
      } else {
        toast({ kind: "success", title: "Análisis completado", description: `${a.id} guardado en el historial.` });
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
      toast({ kind: "error", title: "El análisis falló", description: "Se conservó la entrada; puede reintentar." });
    }
  };

  const stages = STAGES[mode];
  const currentIdx = progress ? stages.indexOf(progress.stage) : -1;

  return (
    <>
      <PageHeader
        title="Análisis visual"
        description="Seleccione una escena semilla o cargue una imagen JPG/PNG, elija el perfil y ejecute el análisis."
        actions={
          <>
            <Link to={`/analisis/en-vivo${scenarioId ? `?escenario=${scenarioId}` : ""}`}><Button icon={Radio}>Monitoreo en vivo</Button></Link>
            {result && <Link to="/operaciones/historial"><Button icon={History}>Ver en historial</Button></Link>}
          </>
        }
      />

      {!canRun && <div className="mb-4"><Notice tone="info" title="Perfil de solo lectura">El rol Auditor puede consultar resultados, historial y exportaciones, pero no ejecutar análisis.</Notice></div>}

      {/* Barra superior: escenario · perfil · umbral · reglas · Analizar */}
      <Card className="relative z-20 mb-4">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,1fr)_auto_minmax(180px,220px)_auto_auto] lg:items-end">
          <Field label={upload ? "Escenario de referencia" : "Escenario"} htmlFor="scenario">
            <Select id="scenario" value={scenarioId} onChange={(e) => pickScenario(e.target.value)} disabled={phase === "processing"}>
              <option value="">Seleccione…</option>
              {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Perfil de análisis">
            <div className="flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5" role="radiogroup" aria-label="Perfil de análisis">
              {MODES.map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} title={MODE_HINT[m]} disabled={phase === "processing"} onClick={() => { setMode(m); touch(); }}
                  className={cx("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === m ? "bg-white text-[var(--accent-ink)] shadow-sm ring-1 ring-[var(--border)]" : "text-[var(--ink-2)] hover:text-[var(--ink)]")}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Umbral de confianza · ${(threshold * 100).toFixed(0)} %`} htmlFor="thr">
            <input id="thr" type="range" min={0.1} max={0.95} step={0.05} value={threshold} disabled={phase === "processing"} onChange={(e) => { setThreshold(+e.target.value); touch(); }} className="h-9 w-full accent-[var(--accent)]" />
          </Field>
          <div className="relative" ref={rulesRef}>
            <Field label="Reglas">
              <Button disabled={!usesRules || phase === "processing"} onClick={() => setRulesOpen((o) => !o)} aria-expanded={rulesOpen} title={usesRules ? "Reglas habilitadas" : "Disponibles en Patrones y Combinado"}>
                {usesRules ? `${ruleIds.filter((id) => enabledRules.some((r) => r.id === id)).length}/${enabledRules.length} activas` : "No aplica"} <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </Field>
            {rulesOpen && (
              <div className="anim-pop-in absolute right-0 z-30 mt-2 w-80 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl">
                <p className="mb-2 text-xs text-[var(--ink-3)]">Reglas habilitadas para este análisis. La configuración global está en Administración › Reglas.</p>
                {enabledRules.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-[var(--surface-2)]">
                    <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={ruleIds.includes(r.id)} onChange={(e) => { setRuleIds((ids) => e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)); touch(); }} />
                    <span><span className="font-medium">{r.name}</span><span className="block text-xs text-[var(--ink-3)]">{r.description}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button variant="primary" size="lg" icon={phase === "processing" ? undefined : phase === "error" ? RefreshCw : Play} loading={phase === "processing"} disabled={!hasInput || phase === "processing" || !canRun} onClick={run} className="w-full lg:w-auto">
            {phase === "processing" ? "Analizando…" : phase === "error" ? "Reintentar" : phase === "done" ? "Analizar de nuevo" : "Analizar"}
          </Button>
        </div>
        {scenarioId === "retail-store" && (
          <div className="border-t border-[var(--border)] px-4 py-3">
            <Field label="Aforo máximo permitido" htmlFor="occupancy">
              <CapacityInput id="occupancy" target={occupancyTarget} disabled={phase === "processing"} onChange={(t) => { setOccupancyTarget(t); touch(); }} />
            </Field>
          </div>
        )}
        {phase === "processing" && progress && (
          <div className="border-t border-[var(--border)] px-4 py-3" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del análisis">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--accent-ink)]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{STAGE_LABEL[progress.stage]}…</span>
              <span className="tabular text-[var(--ink-3)]">{progress.percent} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="progress-stripes h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}
      </Card>

      {phase === "error" && error && (
        <div className="mb-4">
          <Notice tone="error" title="No se pudo completar el análisis">
            <p>{error}</p>
            <p className="text-xs">La entrada y la configuración se conservaron. Pulse <strong>Reintentar</strong>. El intento fallido quedó registrado en el historial.</p>
          </Notice>
        </div>
      )}

      {phase === "done" && result ? (
        <AnalysisWorkspace analysis={result} uploadedSrc={upload?.dataUrl} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="min-w-0">
            {!hasInput ? (
              <div className="p-5">
                <EmptyState icon={ScanSearch} title="Seleccione una entrada para comenzar" description="Elija una escena de demostración o cargue una imagen propia (JPG/PNG). Una imagen propia debe asociarse a un escenario de referencia." />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {SCENARIOS.map((s, i) => (
                    <button key={s.id} onClick={() => pickScenario(s.id)} className="anim-fade-in group overflow-hidden rounded-xl border border-[var(--border)] bg-white text-left transition-shadow hover:shadow-md focus-visible:shadow-md" style={{ animationDelay: `${i * 60}ms` }}>
                      <img src={(s.cover ?? s.asset)} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover transition-transform group-hover:scale-[1.02]" />
                      <div className="p-3">
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--ink-3)]">{s.expectedResults}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div
                  className={cx("mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors", dragOver ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]")}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]); }}
                >
                  <Upload className="mb-2 h-6 w-6 text-[var(--ink-3)]" aria-hidden />
                  <p className="text-sm font-medium">Arrastre una imagen aquí, suba un archivo o capture desde su cámara</p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <Button size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={!canRun}>Cargar JPG/PNG</Button>
                    <Button size="sm" icon={Camera} onClick={webcamOpen ? stopWebcam : startWebcamCapture} disabled={!canRun}>
                      {webcamOpen ? "Cerrar cámara" : "Tomar foto con Cámara Web"}
                    </Button>
                  </div>
                  {webcamOpen && (
                    <div className="mt-3 w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950 p-2">
                      <video ref={webcamVideoRef} muted playsInline className="aspect-video w-full rounded-lg object-cover" />
                      <div className="mt-2 flex justify-center gap-2">
                        <Button size="sm" variant="primary" icon={Camera} onClick={snapWebcamPhoto}>Capturar fotograma ahora</Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={stopWebcam}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--ink-3)]">Máximo {settings.maxUploadMb} MB. Se procesa con OpenCV (Sesión 04) + YOLOv8 + Clasificador CNN (Sesión 03).</p>
                  {upload && <p className="mt-2 text-xs font-medium text-[var(--accent-ink)]">Cargada: {upload.fileName}. Ahora elija el escenario de referencia arriba.</p>}
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FileImage className="h-4 w-4 text-[var(--ink-3)]" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{upload ? `${upload.fileName} · escenario: ${scenario.name}` : `${scenario.name} (escena de referencia)`}</p>
                  {visionEngine.kind === "DEMO" ? <DemoBadge /> : <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">MOTOR REAL IA · YOLOv8 + OpenCV + CNN</span>}
                  <Button size="sm" variant="ghost" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={phase === "processing"}>Subir foto</Button>
                  <Button size="sm" variant="ghost" icon={Camera} onClick={webcamOpen ? stopWebcam : startWebcamCapture} disabled={phase === "processing"}>Cámara</Button>
                  <Button size="sm" variant="ghost" icon={X} onClick={clearInput} disabled={phase === "processing"}>Cambiar entrada</Button>
                </div>
                {webcamOpen && (
                  <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-slate-950 p-3">
                    <video ref={webcamVideoRef} muted playsInline className="mx-auto aspect-video max-h-72 rounded-lg object-cover" />
                    <div className="mt-2 flex justify-center gap-2">
                      <Button size="sm" variant="primary" icon={Camera} onClick={snapWebcamPhoto}>Capturar foto para analizar</Button>
                      <Button size="sm" variant="ghost" icon={X} onClick={stopWebcam}>Cancelar</Button>
                    </div>
                  </div>
                )}
                {upload && visionEngine.kind === "DEMO" && <Notice tone="warning">Imagen propia en modo DEMO: los resultados serán los de referencia del escenario «{scenario.name}» (simulados).</Notice>}
                {upload && visionEngine.kind === "REAL" && <Notice tone="info">Imagen real lista ({upload.fileName}): al pulsar <strong>Analizar</strong> se enviará al backend FastAPI para inferencia real con OpenCV + YOLOv8 + CNN.</Notice>}
                <Viewer src={upload?.dataUrl ?? scenario.asset} alt={upload ? `Imagen cargada ${upload.fileName}` : `Escena ${scenario.name}`} detections={[]} masks={[]} zones={upload ? [] : scenario.zones} classes={classes} threshold={threshold} layers={DEFAULT_LAYERS} processing={phase === "processing"} />
                <p className="text-xs text-[var(--ink-3)]">{scenario.description}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            {uploadError && <div className="px-5 pb-5"><Notice tone="error" title="Archivo no válido">{uploadError}</Notice></div>}
          </Card>

          <Card className="min-w-0 self-start">
            <div className="p-5">
              <h2 className="text-sm font-semibold">{phase === "processing" ? "Procesando" : hasInput ? "Preparado" : "Sin entrada"}</h2>
              <p className="mt-1 text-xs text-[var(--ink-3)]">
                {phase === "processing" ? "El botón está bloqueado para evitar un doble envío." : hasInput ? "Revise el perfil, el umbral y las reglas; luego pulse Analizar." : "Guía: 1) elija escena o imagen · 2) perfil · 3) umbral · 4) Analizar."}
              </p>
              <ol className="mt-4 space-y-2.5">
                {stages.map((s, i) => {
                  const done = phase === "processing" && i < currentIdx;
                  const active = phase === "processing" && i === currentIdx;
                  return (
                    <li key={s} className="flex items-center gap-2.5 text-sm">
                      <span className={cx("grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold", done ? "border-[var(--good)] bg-[var(--good-soft)] text-[var(--good-ink)]" : active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--border)] text-[var(--ink-3)]")}>
                        {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
                      </span>
                      <span className={cx(active ? "font-medium text-[var(--ink)]" : "text-[var(--ink-2)]")}>{STAGE_LABEL[s]}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-5 rounded-lg bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-2)]">
                <p className="font-semibold text-[var(--ink)]">{MODE_LABEL[mode]}</p>
                <p className="mt-0.5">{MODE_HINT[mode]}</p>
                <p className="mt-2">Las detecciones bajo el umbral ({(threshold * 100).toFixed(0)} %) se marcan como baja confianza: no se eliminan del registro.</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
