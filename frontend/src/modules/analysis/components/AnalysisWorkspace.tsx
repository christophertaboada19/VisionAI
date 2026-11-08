// Visor + panel lateral para un análisis ya ejecutado (lo usan Nuevo análisis y Detalle).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Image as ImageIcon, Rewind } from "lucide-react";
import { cameraFeed, liveMonitoring } from "@/app/providers/container";
import { evaluateRules } from "@/core/domain/logic";
import type { Analysis } from "@/core/domain/entities";
import { useAlerts, useClasses, useRules } from "@/shared/hooks/useRepository";
import { ALL_SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Card, cx, Notice, Select, Toggle } from "@/shared/ui";
import { DEFAULT_LAYERS, Legend, Viewer, type Layers } from "./Viewer";
import { ResultsPanel } from "./ResultsPanel";
import { PREPROCESS_LABEL, type PreprocessView } from "../services/imageProcessing";

/** Imágenes subidas en esta sesión (no se persisten para no exponer imágenes privadas). */
export const uploadCache = new Map<string, string>();

const LAYER_LABEL: Record<keyof Layers, string> = { boxes: "Cajas", masks: "Máscaras", labels: "Etiquetas", zones: "Zonas", lowConfidence: "Baja confianza" };

export function ViewerToolbar({ layers, setLayers, view, setView, binaryT, setBinaryT, hidePreprocess }: {
  layers: Layers; setLayers: (l: Layers) => void; view: PreprocessView; setView: (v: PreprocessView) => void; binaryT: number; setBinaryT: (n: number) => void; hidePreprocess?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ink-2)]">
      {(Object.keys(LAYER_LABEL) as (keyof Layers)[]).map((k) => (
        <label key={k} className="flex items-center gap-1.5">
          <Toggle checked={layers[k]} onChange={(v) => setLayers({ ...layers, [k]: v })} label={LAYER_LABEL[k]} />
          {LAYER_LABEL[k]}
        </label>
      ))}
      {!hidePreprocess && <div className="ml-auto flex items-center gap-2">
        <label htmlFor="pre" className="whitespace-nowrap">Vista</label>
        <Select id="pre" value={view} onChange={(e) => setView(e.target.value as PreprocessView)} className="h-8 text-xs">
          {(Object.keys(PREPROCESS_LABEL) as PreprocessView[]).map((v) => <option key={v} value={v}>{PREPROCESS_LABEL[v]}</option>)}
        </Select>
        {view === "binary" && (
          <input type="range" min={10} max={200} value={binaryT} onChange={(e) => setBinaryT(+e.target.value)} aria-label="Umbral de binarización" className="w-24 accent-[var(--accent)]" />
        )}
      </div>}
    </div>
  );
}

export function AnalysisWorkspace({ analysis, uploadedSrc }: { analysis: Analysis; uploadedSrc?: string }) {
  const classes = useClasses();
  const rules = useRules();
  const alerts = useAlerts().filter((x) => x.analysisId === analysis.id);
  const [params, setParams] = useSearchParams();

  // Sesiones en vivo: se muestra la instantánea guardada o se RECONSTRUYE el fotograma del instante t
  // (el motor demo es determinista: el mismo t produce exactamente el mismo resultado).
  const isLive = analysis.sourceKind === "live";
  const paramT = params.get("t");
  const minT = analysis.live?.startT ?? 0;
  const maxT = analysis.frameT ?? minT;
  const replayT = isLive ? Math.min(maxT, Math.max(minT, paramT !== null && !Number.isNaN(+paramT) ? +paramT : maxT)) : 0;
  const shown = useMemo(() => {
    if (!isLive || paramT === null) return analysis;
    const f = liveMonitoring.replay(analysis.scenarioId, analysis.mode, replayT);
    const enabled = new Set(classes.filter((c) => c.enabled).map((c) => c.id));
    const detections = f.detections.filter((d) => enabled.has(d.classId));
    const sc = ALL_SCENARIOS.find((s) => s.id === analysis.scenarioId);
    const usesPatterns = analysis.mode === "patterns" || analysis.mode === "combined";
    const derived = usesPatterns && sc
      ? evaluateRules({ rules, detections, patterns: f.patterns, zones: sc.zones, threshold: analysis.threshold }).flatMap((h) => (h.pattern ? [h.pattern] : []))
      : [];
    return { ...analysis, detections, masks: f.masks.filter((m) => enabled.has(m.classId)), patterns: [...f.patterns, ...derived] };
  }, [analysis, isLive, paramT, replayT, classes, rules]);
  const liveSrc = useMemo(() => (isLive ? cameraFeed.render(analysis.scenarioId, replayT) : null), [isLive, analysis.scenarioId, replayT]);
  const setT = (t: number) => setParams({ t: t.toFixed(1) }, { replace: true });
  const scenario = ALL_SCENARIOS.find((s) => s.id === analysis.scenarioId);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [hl, setHl] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [view, setView] = useState<PreprocessView>("original");
  const [binaryT, setBinaryT] = useState(60);
  const upload = uploadedSrc ?? uploadCache.get(analysis.id) ?? analysis.snapshotUrl;
  const [imgMode, setImgMode] = useState<"reference" | "upload">(() => (upload ? "upload" : "reference"));
  const showUpload = (analysis.sourceKind === "upload" || analysis.sourceKind === "live") && imgMode === "upload" && !!upload;
  const allowUploadOverlays = analysis.engine === "REAL";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Card className="min-w-0">
        <div className="space-y-3 p-4">
          <ViewerToolbar layers={layers} setLayers={setLayers} view={view} setView={setView} binaryT={binaryT} setBinaryT={setBinaryT} />
          {isLive && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Rewind className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                <label htmlFor="replay" className="font-semibold">Reproducir sesión</label>
                <input id="replay" type="range" min={minT} max={maxT} step={0.1} value={replayT} onChange={(e) => setT(+e.target.value)} className="min-w-[160px] flex-1 accent-[var(--accent)]" />
                <span className="tabular font-medium">t = {replayT.toFixed(1)} s · sesión {minT.toFixed(1)}–{maxT.toFixed(1)} s</span>
              </div>
              {alerts.some((a) => a.frameT !== undefined) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[var(--ink-3)]">Ir a la evidencia:</span>
                  {alerts.filter((a) => a.frameT !== undefined).sort((a, b) => a.frameT! - b.frameT!).map((a) => (
                    <button key={a.id} onClick={() => setT(a.frameT!)} className={cx("tabular rounded-full border px-2 py-0.5", Math.abs(a.frameT! - replayT) < 0.05 ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--border)] bg-white hover:bg-[var(--surface-2)]")} title={a.message}>
                      {a.ruleName} · {a.frameT!.toFixed(1)} s
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">{paramT === null ? "Instantánea guardada al detener la sesión." : "Fotograma reconstruido: el motor DEMO es determinista, el mismo instante produce el mismo resultado. No se grabó video."}</p>
            </div>
          )}
          {analysis.sourceKind === "upload" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5 text-xs" role="group" aria-label="Imagen mostrada">
                {(["reference", "upload"] as const).map((m) => (
                  <button key={m} disabled={m === "upload" && !upload} onClick={() => setImgMode(m)} aria-pressed={imgMode === m} className={cx("rounded-md px-3 py-1.5 font-medium disabled:opacity-40", imgMode === m ? "bg-[var(--nav)] text-white" : "text-[var(--ink-2)]")}>
                    {m === "reference" ? "Escena de referencia (con resultados)" : "Imagen cargada"}
                  </button>
                ))}
              </div>
              {!upload && <span className="text-xs text-[var(--ink-3)]">La imagen cargada no se conserva al recargar (privacidad).</span>}
            </div>
          )}
          {showUpload && !allowUploadOverlays && <Notice tone="warning" icon={ImageIcon}>Imagen propia: en modo DEMO no hay inferencia sobre su contenido, por eso no se dibujan cajas ni máscaras. Puede aplicar el preprocesamiento clásico real (grises, bordes, binarización).</Notice>}
          {scenario && (
            <Viewer
              src={showUpload ? upload! : liveSrc ?? scenario.asset}
              alt={showUpload ? `Imagen cargada ${analysis.sourceName}` : `Escena ${scenario.name}: ${scenario.description}`}
              detections={shown.detections}
              masks={shown.masks}
              zones={scenario.zones}
              classes={classes}
              threshold={analysis.threshold}
              layers={layers}
              highlightId={hl}
              onHover={setHl}
              focusId={focusId}
              onSelectFocus={setFocusId}
              overlays={!showUpload || allowUploadOverlays}
              preprocess={view}
              binaryThreshold={binaryT}
            />
          )}
          <Legend classes={classes} detections={shown.detections} masks={shown.masks} />
        </div>
      </Card>
      <Card className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-hidden">
        <ResultsPanel
          key={analysis.id}
          analysis={shown}
          alerts={alerts}
          classes={classes}
          threshold={analysis.threshold}
          highlightId={hl}
          onHover={setHl}
          focusId={focusId}
          onSelectFocus={setFocusId}
        />
      </Card>
    </div>
  );
}
