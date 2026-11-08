import { useState } from "react";
import { CameraFilterBar, cameraMatches, NO_CAMERA, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import type { AuditEvent } from "@/core/domain/entities";
import { useEvents } from "@/shared/hooks/useRepository";
import { Card, cx, EmptyState, fmtDateTime, MultiSelect, PageHeader } from "@/shared/ui";

const TYPE_LABEL: Record<AuditEvent["type"], string> = {
  "analysis.started": "Análisis iniciado",
  "analysis.completed": "Análisis completado",
  "analysis.failed": "Análisis fallido",
  "live.started": "Monitoreo en vivo iniciado",
  "live.stopped": "Monitoreo en vivo finalizado",
  "alert.created": "Alerta creada",
  "alert.updated": "Alerta actualizada",
  "rule.changed": "Regla modificada",
  "class.changed": "Clase modificada",
  "settings.changed": "Configuración",
  export: "Exportación",
  session: "Sesión",
  observation: "Observación",
  "scenario.changed": "Escenario agregado / quitado",
};

const DOT = { info: "bg-[var(--accent)]", success: "bg-[var(--good)]", warning: "bg-[var(--warning)]", error: "bg-[var(--critical)]" };
const LEVEL = { info: "Información", success: "Éxito", warning: "Advertencia", error: "Error" };

export function ActivityPage() {
  const events = useEvents();
  const [types, setTypes] = useState<string[]>([]);
  const [camF] = useCameraFilter();
  const cam = useCameraResolver();
  // Con una cámara elegida solo se muestran los eventos ligados a ella (sesiones, alertas, observaciones).
  const list = events.filter((e) => (!types.length || types.includes(e.type)) && cameraMatches(camF, cam.ofEvent(e)));
  return (
    <>
      <PageHeader title="Actividad reciente" description="Registro de auditoría: análisis, alertas, cambios de reglas, configuración y exportaciones." />
      <CameraFilterBar
        className="mb-4"
        label="Ver actividad de"
        count={(id) => events.filter((e) => cameraMatches(id, cam.ofEvent(e))).length}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <label htmlFor="evtype" className="text-sm text-[var(--ink-2)]">Tipo de evento</label>
          <MultiSelect id="evtype" values={types} onChange={setTypes} allLabel="Todos los tipos" className="w-64">
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </MultiSelect>
          <span className="ml-auto text-xs text-[var(--ink-3)]">{list.length} eventos</span>
        </div>
        {list.length ? (
          <ol className="divide-y divide-[var(--border)]">
            {list.slice(0, 200).map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-3">
                <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT[e.level])} title={LEVEL[e.level]} aria-label={LEVEL[e.level]} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.message}</p>
                  <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                    {(() => { const c = cam.ofEvent(e); return c ? `${c === NO_CAMERA ? "🖼️ Imagen" : `📹 ${cam.name(c)}`} · ` : ""; })()}
                    {TYPE_LABEL[e.type]} · {e.user} · {fmtDateTime(e.at)}
                    {e.ref?.startsWith("AN") && <> · <Link className="text-[var(--accent-ink)] hover:underline" to={`/analisis/${e.ref}`}>ver análisis</Link></>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={Activity} title="Sin eventos" />
        )}
      </Card>
    </>
  );
}
