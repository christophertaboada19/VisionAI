// Panel "Reporte personalizado": el usuario elige qué incluir y descarga un PDF o un Excel detallado.
import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Settings2 } from "lucide-react";
import { repository, visionEngine } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import type { AlertStatus, Severity } from "@/core/domain/entities";
import { ALERT_STATUS_LABEL, SEVERITY_LABEL } from "@/core/domain/entities";
import { buildReport, DEFAULT_REPORT_OPTIONS, SECTION_LABEL, type ReportOptions, type ReportSection } from "@/infrastructure/export/report";
import { SCENARIOS } from "@/modules/scenarios/data/scenes";
import { useCameraResolver } from "@/shared/camera/cameraFilter";
import { useAlerts, useAnalyses, useCameras, useClasses } from "@/shared/hooks/useRepository";
import { Button, Card, CardHeader, cx, Field, Input, MultiSelect, Select, Toggle } from "@/shared/ui";

const SECTIONS: ReportSection[] = ["summary", "perCamera", "classes", "analyses", "detections", "alerts"];

export function ReportBuilder({ cameraIds, from, to, allowed }: { cameraIds: readonly string[]; from: string; to: string; allowed: boolean }) {
  const user = useUser();
  const toast = useToast();
  const analyses = useAnalyses();
  const alerts = useAlerts();
  const cameras = useCameras();
  const classes = useClasses();
  const resolver = useCameraResolver();
  const [opts, setOpts] = useState<Omit<ReportOptions, "cameraIds" | "from" | "to">>(() => {
    const { cameraIds: _c, from: _f, to: _t, ...rest } = DEFAULT_REPORT_OPTIONS;
    return rest;
  });
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const set = (patch: Partial<typeof opts>) => setOpts((o) => ({ ...o, ...patch }));
  const fullOptions: ReportOptions = { ...opts, cameraIds: [...cameraIds], from, to };

  const data = useMemo(
    () =>
      buildReport({
        analyses,
        alerts,
        cameras,
        scenarios: SCENARIOS,
        classes,
        resolver,
        options: fullOptions,
        generatedBy: user.name,
        engine: visionEngine.kind,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyses, alerts, cameras, classes, resolver, JSON.stringify(fullOptions), user.name],
  );

  const toggleSection = (s: ReportSection) =>
    set({ sections: opts.sections.includes(s) ? opts.sections.filter((x) => x !== s) : SECTIONS.filter((x) => x === s || opts.sections.includes(x)) });

  const generate = async (kind: "pdf" | "xlsx") => {
    if (!opts.sections.length) {
      toast({ kind: "warning", title: "Elija al menos una sección para el reporte" });
      return;
    }
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const { downloadPdfReport } = await import("@/infrastructure/export/pdfReport");
        await downloadPdfReport(data, opts);
      } else {
        const { downloadExcelReport } = await import("@/infrastructure/export/excelReport");
        await downloadExcelReport(data);
      }
      repository.addEvent({
        id: `EV-${Date.now()}`,
        at: new Date().toISOString(),
        user: user.name,
        type: "export",
        level: "info",
        message: `Reporte ${kind === "pdf" ? "PDF" : "Excel"} "${data.meta.title}" de ${data.meta.scope} (${data.analyses.length} análisis, ${data.alerts.length} alertas).`,
      });
      toast({ kind: "success", title: `Reporte ${kind === "pdf" ? "PDF" : "Excel"} descargado`, description: `${data.meta.scope} · ${data.meta.range}` });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo generar el reporte", description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const chip = (on: boolean) =>
    cx(
      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
      on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
    );

  return (
    <Card className="mb-4">
      <CardHeader
        title="Reporte · PDF y Excel"
        subtitle={`Alcance: ${data.meta.scope} · ${data.meta.range}. Elija qué incluir y descargue un reporte detallado.`}
        icon={Settings2}
      />
      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Título del reporte" htmlFor="rp-title">
            <Input id="rp-title" value={opts.title} onChange={(e) => set({ title: e.target.value })} className="w-full" />
          </Field>
          <Field label="Escenarios" htmlFor="rp-sc">
            <MultiSelect id="rp-sc" values={opts.scenarioIds} onChange={(v) => set({ scenarioIds: v })} allLabel="Todos los escenarios" className="w-full">
              {SCENARIOS.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </MultiSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado de alertas" htmlFor="rp-st">
              <MultiSelect id="rp-st" values={opts.alertStatuses} onChange={(v) => set({ alertStatuses: v as AlertStatus[] })} allLabel="Todos" className="w-full">
                {(["new", "reviewed", "closed"] as AlertStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {ALERT_STATUS_LABEL[st]}
                  </option>
                ))}
              </MultiSelect>
            </Field>
            <Field label="Severidades" htmlFor="rp-sev">
              <MultiSelect id="rp-sev" values={opts.severities} onChange={(v) => set({ severities: v as Severity[] })} allLabel="Todas" className="w-full">
                {(["critical", "high", "medium", "low"] as Severity[]).map((sv) => (
                  <option key={sv} value={sv}>
                    {SEVERITY_LABEL[sv]}
                  </option>
                ))}
              </MultiSelect>
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Secciones a incluir</p>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <button key={s} type="button" aria-pressed={opts.sections.includes(s)} className={chip(opts.sections.includes(s))} onClick={() => toggleSection(s)}>
                {opts.sections.includes(s) ? "✓" : "+"} {SECTION_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-xl bg-[var(--surface-2)] p-3 md:grid-cols-3">
          <label className="flex items-center gap-2.5 text-sm">
            <Toggle checked={opts.onlyAboveThreshold} onChange={(v) => set({ onlyAboveThreshold: v })} label="Solo detecciones sobre el umbral" />
            <span>
              Solo detecciones sobre el umbral
              <span className="block text-[11px] text-[var(--ink-3)]">Desactívelo para incluir las de baja confianza</span>
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Orientación del PDF</span>
            <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5" role="group" aria-label="Orientación del PDF">
              {(["landscape", "portrait"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  aria-pressed={opts.orientation === o}
                  onClick={() => set({ orientation: o })}
                  className={cx("flex-1 rounded-md px-3 py-1.5 text-xs font-semibold", opts.orientation === o ? "bg-[var(--accent)] text-white" : "text-[var(--ink-2)]")}
                >
                  {o === "landscape" ? "Horizontal" : "Vertical"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2.5 text-sm">
              <Toggle checked={opts.includePhotos} onChange={(v) => set({ includePhotos: v })} label="Incluir fotos de evidencia en el PDF" />
              <span>Fotos de evidencia (PDF)</span>
            </label>
            <Select
              aria-label="Cantidad de fotos de evidencia"
              value={String(opts.maxPhotos)}
              disabled={!opts.includePhotos}
              onChange={(e) => set({ maxPhotos: +e.target.value })}
              className="w-28"
            >
              {[4, 8, 12, 20].map((n) => (
                <option key={n} value={String(n)}>
                  {n} fotos
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <p className="tabular text-xs text-[var(--ink-3)]">
            El reporte incluirá <strong className="text-[var(--ink)]">{data.analyses.length}</strong> análisis,{" "}
            <strong className="text-[var(--ink)]">{data.detections.length}</strong> detecciones y{" "}
            <strong className="text-[var(--ink)]">{data.alerts.length}</strong> alertas
            {opts.includePhotos ? ` (${Math.min(opts.maxPhotos, data.alerts.filter((a) => a.snapshotUrl).length)} con foto en el PDF)` : ""}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={busy === "xlsx" ? Loader2 : FileSpreadsheet}
              disabled={!allowed || busy !== null}
              onClick={() => void generate("xlsx")}
            >
              {busy === "xlsx" ? "Generando Excel…" : "Descargar Excel (.xlsx)"}
            </Button>
            <Button variant="primary" icon={busy === "pdf" ? Loader2 : FileText} disabled={!allowed || busy !== null} onClick={() => void generate("pdf")}>
              {busy === "pdf" ? "Generando PDF…" : "Descargar PDF"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
