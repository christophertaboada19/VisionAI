// Explorador transversal de resultados: detecciones, máscaras o patrones de todos los análisis.
import { CameraFilterBar, cameraMatches, NO_CAMERA, selectionLabel, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Boxes, Layers, Lightbulb, Sparkles } from "lucide-react";
import { useAnalyses, useClasses } from "@/shared/hooks/useRepository";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Card, ClassDot, ConfidenceBar, cx, EmptyState, fmtDateTime, MultiSelect, PageHeader } from "@/shared/ui";

type Kind = "detections" | "masks" | "patterns";

const META: Record<Kind, { title: string; icon: typeof Boxes; concept: string; flow: string }> = {
  detections: {
    title: "Detecciones",
    icon: Boxes,
    concept: "La detección localiza y clasifica instancias: cada resultado tiene clase, confianza y una caja delimitadora (x, y, ancho, alto) normalizada 0–1.",
    flow: "imagen → preprocesamiento → detector (CNN tipo YOLO) → umbral + NMS → cajas, clases y confianza",
  },
  masks: {
    title: "Segmentación",
    icon: Layers,
    concept: "La segmentación asigna una clase a los píxeles. Semántica: una máscara por clase (piso, pasillo). Instancia: una máscara por objeto (persona #1, #2…).",
    flow: "imagen → preprocesamiento → segmentador → máscara de píxeles → área y contorno",
  },
  patterns: {
    title: "Patrones",
    icon: Sparkles,
    concept: "El reconocimiento de patrones identifica regularidades o eventos (EPP incompleto, zona restringida, defecto, ocupación). Puede venir del motor o de reglas de negocio.",
    flow: "detecciones + máscaras → clasificador / reglas → patrón + evidencia → alerta revisable",
  },
};

interface Row {
  key: string;
  analysisId: string;
  cameraId: string;
  createdAt: string;
  scenarioId: string;
  classId?: string;
  label: string;
  confidence: number;
  low: boolean;
  extra: string;
}

export function VisionExplorerPage({ kind }: { kind: Kind }) {
  const analyses = useAnalyses();
  const classes = useClasses();
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [onlyLow, setOnlyLow] = useState(false);
  const [camF] = useCameraFilter();
  const cam = useCameraResolver();
  const m = META[kind];

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const a of analyses) {
      if (a.status !== "completed") continue;
      const cameraId = cam.ofAnalysis(a);
      if (kind === "detections") for (const d of a.detections) out.push({ key: a.id + d.id, analysisId: a.id, cameraId, createdAt: a.createdAt, scenarioId: a.scenarioId, classId: d.classId, label: d.label, confidence: d.confidence, low: d.confidence < a.threshold, extra: `x ${d.box.x.toFixed(2)} · y ${d.box.y.toFixed(2)} · ${d.box.width.toFixed(2)}×${d.box.height.toFixed(2)}` });
      if (kind === "masks") for (const s of a.masks) out.push({ key: a.id + s.id, analysisId: a.id, cameraId, createdAt: a.createdAt, scenarioId: a.scenarioId, classId: s.classId, label: s.label, confidence: s.confidence, low: false, extra: `${s.kind === "instance" ? "Instancia" : "Semántica"} · área ${(s.areaRatio * 100).toFixed(1)} %` });
      if (kind === "patterns") for (const p of a.patterns) out.push({ key: a.id + p.id, analysisId: a.id, cameraId, createdAt: a.createdAt, scenarioId: a.scenarioId, label: p.label, confidence: p.confidence, low: false, extra: `${p.source === "model" ? "Motor" : "Regla"} · ${p.evidence}` });
    }
    return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  }, [analyses, kind, cam]);

  const filtered = rows.filter((r) => cameraMatches(camF, r.cameraId) && (!scenarios.length || scenarios.includes(r.scenarioId)) && (!classIds.length || (!!r.classId && classIds.includes(r.classId))) && (!onlyLow || r.low));
  const availableClassIds = [...new Set(rows.map((r) => r.classId).filter(Boolean))] as string[];
  const scen = (id: string) => ALL_SCENARIOS.find((s) => s.id === id)?.name ?? id;
  const color = (id?: string) => classes.find((c) => c.id === id)?.color ?? "#8a8f98";
  const name = (id?: string) => classes.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title={m.title} description={`Resultados de ${m.title.toLowerCase()} de ${selectionLabel(camF, cam)}.`} />
      <CameraFilterBar
        className="mb-4"
        label={`Ver ${m.title.toLowerCase()} de`}
        count={(id) => rows.filter((r) => cameraMatches(id, r.cameraId)).length}
      />
      <Card className="mb-4 p-4">
        <div className="flex gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <div className="text-sm">
            <p className="text-[var(--ink)]">{m.concept}</p>
            <p className="mt-1.5 font-mono text-xs text-[var(--ink-3)]">{m.flow}</p>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <MultiSelect values={scenarios} onChange={setScenarios} aria-label="Escenarios" allLabel="Todos los escenarios" className="w-60">
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </MultiSelect>
          {kind !== "patterns" && (
            <MultiSelect values={classIds} onChange={setClassIds} aria-label="Clases" allLabel="Todas las clases" className="w-52">
              {availableClassIds.map((id) => <option key={id} value={id}>{name(id)}</option>)}
            </MultiSelect>
          )}
          {kind === "detections" && (
            <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]"><input type="checkbox" className="accent-[var(--accent)]" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Solo baja confianza</label>
          )}
          <span className="ml-auto text-xs text-[var(--ink-3)]">{filtered.length} resultados</span>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="px-4 py-2.5">{kind === "patterns" ? "Patrón" : "Clase / etiqueta"}</th><th className="px-3">Confianza</th><th className="px-3">Detalle</th><th className="px-3">Cámara / Escenario</th><th className="px-3">Análisis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.slice(0, 150).map((r, ri) => (
                  <tr key={`${r.key}-${ri}`} className={cx("hover:bg-[var(--surface-2)]", r.low && "bg-[var(--warning-soft)]/40")}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">{r.classId && <ClassDot color={color(r.classId)} />}<span className="font-medium">{r.label}</span>{r.low && <span className="rounded bg-[var(--warning-soft)] px-1.5 text-[10px] font-semibold text-[var(--warning-ink)]">BAJA</span>}</span>
                    </td>
                    <td className="px-3"><ConfidenceBar value={r.confidence} /></td>
                    <td className="max-w-[360px] truncate px-3 text-xs text-[var(--ink-2)]" title={r.extra}>{r.extra}</td>
                    <td className="px-3 text-[var(--ink-2)]"><p className="text-xs font-semibold text-[var(--ink)]">{r.cameraId === NO_CAMERA ? "🖼️ Imagen" : `📹 ${cam.name(r.cameraId)}`}</p><p className="text-[11px]">{scen(r.scenarioId)}</p></td>
                    <td className="px-3"><Link className="tabular text-xs text-[var(--accent-ink)] hover:underline" to={`/analisis/${r.analysisId}`}>{r.analysisId}</Link><p className="text-[11px] text-[var(--ink-3)]">{fmtDateTime(r.createdAt)}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 150 && <p className="px-5 py-3 text-xs text-[var(--ink-3)]">Se muestran los 150 más recientes. Use el historial para exportar todo.</p>}
          </div>
        ) : (
          <EmptyState icon={m.icon} title="Sin resultados" description="Ejecute análisis con el perfil adecuado o ajuste los filtros." />
        )}
      </Card>
    </>
  );
}
