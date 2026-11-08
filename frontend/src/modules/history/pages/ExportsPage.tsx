import { useState } from "react";
import { Bell, Boxes, Camera, Download, FileSpreadsheet, ScanSearch } from "lucide-react";
import { repository, visionEngine } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { can } from "@/core/domain/permissions";
import { alertsCsv, analysesCsv, detectionsCsv, downloadText } from "@/infrastructure/export/csv";
import { useAlerts, useAnalyses, useCameras } from "@/shared/hooks/useRepository";
import { SCENARIOS } from "@/modules/scenarios/data/scenes";
import { CameraFilterBar, cameraMatches, NO_CAMERA, selectionLabel, toggleCameraInFilter, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { Button, Card, CardHeader, cx, Field, Input, Notice, PageHeader } from "@/shared/ui";
import { ReportBuilder } from "../components/ReportBuilder";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 40);

export function ExportsPage() {
  const user = useUser();
  const toast = useToast();
  const analyses = useAnalyses();
  const alerts = useAlerts();
  const cameras = useCameras();
  const [camF, setCamF] = useCameraFilter();
  const cam = useCameraResolver();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return (!from || t >= new Date(`${from}T00:00:00`).getTime()) && (!to || t <= new Date(`${to}T23:59:59`).getTime());
  };
  const anRange = analyses.filter((a) => inRange(a.createdAt));
  const alRange = alerts.filter((a) => inRange(a.createdAt));
  // Solo los registros de la cámara elegida (o de todas).
  const an = anRange.filter((a) => cameraMatches(camF, cam.ofAnalysis(a)));
  const al = alRange.filter((a) => cameraMatches(camF, cam.ofAlert(a)));
  const allowed = can(user.role, "history.export");
  const scopeName = selectionLabel(camF, cam);
  const scopeSlug = camF.length === 0 ? "todas-las-camaras" : camF.length === 1 ? slug(cam.name(camF[0])) : `${camF.length}-camaras`;
  const camNameOfAnalysis = (a: (typeof analyses)[number]) => {
    const id = cam.ofAnalysis(a);
    return id === NO_CAMERA ? "Imagen subida" : cam.name(id);
  };
  const camNameOfAlert = (a: (typeof alerts)[number]) => {
    const id = cam.ofAlert(a);
    return id === NO_CAMERA ? "Imagen subida" : cam.name(id);
  };

  const go = (kind: string, name: string, csv: string, n: number) => {
    downloadText(`vision-ai_${name}_${scopeSlug}_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    repository.addEvent({
      id: `EV-${Date.now()}`,
      at: new Date().toISOString(),
      user: user.name,
      type: "export",
      level: "info",
      message: `Exportación "${kind}" de ${scopeName} (${n} registros${from || to ? `, ${from || "…"} a ${to || "…"}` : ""}).`,
    });
    toast({ kind: "success", title: "Exportación generada", description: `${kind} · ${scopeName}: ${n} registros.` });
  };

  const items = [
    { icon: Boxes, title: "Detecciones", desc: "Una fila por detección: id, fecha, cámara, escenario, clase, confianza, estado y coordenadas normalizadas.", n: an.length, run: () => go("Detecciones", "detecciones", detectionsCsv(an, SCENARIOS, camNameOfAnalysis), an.length) },
    { icon: ScanSearch, title: "Resumen de análisis", desc: "Una fila por análisis o sesión en vivo: cámara, perfil, estado, duración, confianza media, objetos, máscaras, patrones y alertas.", n: an.length, run: () => go("Análisis", "analisis", analysesCsv(an, SCENARIOS, alerts, camNameOfAnalysis), an.length) },
    { icon: Bell, title: "Alertas y trazabilidad", desc: "Cámara, severidad, regla, mensaje, estado, responsable, revisor, fecha de revisión y nota.", n: al.length, run: () => go("Alertas", "alertas", alertsCsv(al, SCENARIOS, camNameOfAlert, visionEngine.kind), al.length) },
  ];

  // Resumen por cámara dentro del rango de fechas (para comparar y elegir rápido).
  const perCamera = [
    ...cameras.map((c) => ({ id: c.id, name: c.name, enabled: c.enabled })),
    { id: NO_CAMERA, name: "Imágenes subidas (sin cámara)", enabled: true },
  ].map((c) => ({
    ...c,
    analyses: anRange.filter((a) => cam.ofAnalysis(a) === c.id).length,
    detections: anRange.filter((a) => cam.ofAnalysis(a) === c.id).reduce((n, a) => n + a.detections.length, 0),
    alerts: alRange.filter((a) => cam.ofAlert(a) === c.id).length,
  }));

  return (
    <>
      <PageHeader title="Exportaciones" description="Genere reportes personalizados en PDF y Excel, o CSV crudos, de una cámara o de todas. Toda exportación queda registrada en la auditoría." />
      {!allowed && <Notice tone="warning">Su perfil no puede exportar.</Notice>}

      <CameraFilterBar
        className="mb-4"
        label="Exportar datos de"
        count={(id) => anRange.filter((a) => cameraMatches(id, cam.ofAnalysis(a))).length + alRange.filter((a) => cameraMatches(id, cam.ofAlert(a))).length}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Desde" htmlFor="ef"><Input id="ef" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta" htmlFor="et"><Input id="et" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <p className="pb-2 text-xs text-[var(--ink-3)]">
            Sin fechas se exporta todo el historial. Alcance actual: <strong className="text-[var(--ink)]">{scopeName}</strong>.
          </p>
        </div>
      </Card>

      <ReportBuilder cameraIds={camF} from={from} to={to} allowed={allowed} />

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Exportaciones rápidas en CSV (datos crudos)</p>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((it, i) => (
          <Card key={it.title} delay={i * 60} className="flex flex-col p-5">
            <div className="flex items-center gap-2"><it.icon className="h-5 w-5 text-[var(--accent)]" aria-hidden /><h2 className="font-semibold">{it.title}</h2></div>
            <p className="mt-2 flex-1 text-sm text-[var(--ink-2)]">{it.desc}</p>
            <p className="tabular mt-3 text-xs text-[var(--ink-3)]"><FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />{it.n} registros · {scopeName}</p>
            <Button className="mt-3" variant="primary" icon={Download} disabled={!allowed || !it.n} onClick={it.run}>Descargar CSV</Button>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="Registros por cámara" subtitle="En el rango de fechas elegido · pulse «+ Incluir» en una o varias cámaras" icon={Camera} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Cámara</th>
                <th className="px-3 text-right">Análisis / sesiones</th>
                <th className="px-3 text-right">Detecciones</th>
                <th className="px-3 text-right">Alertas</th>
                <th className="px-4" />
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-[var(--border)]">
              {perCamera.map((c) => (
                <tr key={c.id} className={cx("hover:bg-[var(--surface-2)]", camF.includes(c.id) && "bg-[var(--accent-soft)]")}>
                  <td className="px-4 py-2.5 font-medium">
                    <span className="flex items-center gap-2">
                      <span className={cx("h-2 w-2 rounded-full", c.id === NO_CAMERA ? "bg-sky-400" : c.enabled ? "bg-emerald-500" : "bg-slate-400")} aria-hidden />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 text-right">{c.analyses}</td>
                  <td className="px-3 text-right">{c.detections}</td>
                  <td className="px-3 text-right">{c.alerts}</td>
                  <td className="px-4 text-right">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--accent-ink)] hover:underline"
                      onClick={() => toggleCameraInFilter(c.id)}
                    >
                      {camF.includes(c.id) ? "✓ Incluida (quitar)" : "+ Incluir"}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-[var(--surface-2)] font-semibold">
                <td className="px-4 py-2.5">Total (todas)</td>
                <td className="px-3 text-right">{anRange.length}</td>
                <td className="px-3 text-right">{anRange.reduce((n, a) => n + a.detections.length, 0)}</td>
                <td className="px-3 text-right">{alRange.length}</td>
                <td className="px-4 text-right">
                  <button type="button" className="text-xs font-semibold text-[var(--accent-ink)] hover:underline" onClick={() => setCamF([])}>
                    {camF.length === 0 ? "✓ Todas incluidas" : "Elegir todas"}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
