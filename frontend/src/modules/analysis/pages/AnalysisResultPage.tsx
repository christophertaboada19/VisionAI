import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileSearch } from "lucide-react";
import { repository } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { MODE_LABEL } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { analysesCsv, detectionsCsv, downloadText } from "@/infrastructure/export/csv";
import { useAlerts, useAnalyses } from "@/shared/hooks/useRepository";
import { ALL_SCENARIOS, SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Button, Card, DemoBadge, EmptyState, fmtDateTime, Notice, PageHeader, StatusBadge } from "@/shared/ui";
import { AnalysisWorkspace } from "../components/AnalysisWorkspace";

export function AnalysisResultPage() {
  const { id } = useParams();
  const user = useUser();
  const analysis = useAnalyses().find((a) => a.id === id);
  const alerts = useAlerts();

  if (!analysis) {
    return <Card><EmptyState icon={FileSearch} title="Análisis no encontrado" description={`No existe un análisis con identificador ${id}.`} action={<Link to="/operaciones/historial"><Button>Ir al historial</Button></Link>} /></Card>;
  }
  const scenario = ALL_SCENARIOS.find((s) => s.id === analysis.scenarioId);
  const exportOne = () => {
    downloadText(`vision-ai_${analysis.id}_detecciones.csv`, detectionsCsv([analysis], SCENARIOS));
    downloadText(`vision-ai_${analysis.id}_resumen.csv`, analysesCsv([analysis], SCENARIOS, alerts));
    repository.addEvent({ id: `EV-${Date.now()}`, at: new Date().toISOString(), user: user.name, type: "export", level: "info", ref: analysis.id, message: `Reporte CSV exportado de ${analysis.id}.` });
  };

  return (
    <>
      <PageHeader
        title={`${scenario?.name ?? analysis.scenarioId} · ${MODE_LABEL[analysis.mode]}`}
        description={`${analysis.id} · ${fmtDateTime(analysis.createdAt)} · ${analysis.createdBy} · Fuente: ${analysis.sourceName}`}
        actions={
          <>
            <Link to="/operaciones/historial"><Button icon={ArrowLeft}>Historial</Button></Link>
            {can(user.role, "history.export") && analysis.status === "completed" && <Button variant="primary" icon={Download} onClick={exportOne}>Exportar reporte CSV</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={analysis.status} />
        {analysis.engine === "DEMO" && <DemoBadge />}
        {analysis.seed && <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-2)]">Registro semilla</span>}
        {analysis.sourceKind === "live" && <span className="rounded-md bg-[var(--critical-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--critical)]">SESIÓN EN VIVO</span>}
      </div>
      {analysis.live && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Fotogramas", String(analysis.live.frames)],
            ["Duración de escena", `${analysis.live.seconds} s`],
            ["FPS promedio", String(analysis.live.fps)],
            ["Latencia media (sim.)", `${analysis.live.avgLatencyMs} ms`],
            ["Objetos rastreados", String(analysis.live.uniqueTracks)],
            ["Máx. simultáneos", String(analysis.live.maxObjects)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-[var(--border)] bg-white px-3 py-2">
              <p className="text-[11px] text-[var(--ink-3)]">{l}</p>
              <p className="tabular text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>
      )}
      {analysis.status === "failed" ? (
        <Notice tone="error" title="Este análisis falló">
          <p>{analysis.error}</p>
          <p className="text-xs">Puede ejecutar uno nuevo desde <Link className="underline" to={`/analisis?escenario=${analysis.scenarioId}`}>Análisis visual</Link>.</p>
        </Notice>
      ) : analysis.status !== "completed" ? (
        <Notice tone="info" title="Análisis en proceso">El resultado se mostrará al completarse.</Notice>
      ) : (
        <AnalysisWorkspace analysis={analysis} />
      )}
    </>
  );
}
