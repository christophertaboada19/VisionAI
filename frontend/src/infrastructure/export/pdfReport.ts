// Reporte PDF detallado generado en el navegador con jsPDF + jspdf-autotable.
// Se carga bajo demanda (import dinámico) para no aumentar el peso inicial de la app.
import type { jsPDF as JsPDF } from "jspdf";
import { triggerDownload } from "./excelReport";
import { reportFileName, SECTION_LABEL, SEVERITY_COLOR, type ReportData, type ReportOptions } from "./report";

const BRAND: [number, number, number] = [14, 116, 144];
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const SOFT: [number, number, number] = [230, 244, 247];
const MAX_PDF_DETECTIONS = 600;

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "").padEnd(6, "0");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Las fuentes estándar de PDF solo cubren Latin-1: se reemplazan símbolos fuera de ese rango (emojis, etc.). */
const safe = (v: unknown): string =>
  String(v ?? "")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[✓✔]/g, "OK")
    .replace(/×/g, "x")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-ÿ]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

function loadImageSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadPdfReport(data: ReportData, opts: Pick<ReportOptions, "orientation" | "includePhotos" | "maxPhotos">) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc: JsPDF = new jsPDF({ orientation: opts.orientation, unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = 0;
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (needed: number) => {
    if (y + needed > H - 16) {
      doc.addPage();
      y = M + 4;
    }
  };
  // El título nunca queda solo al pie: exige espacio para el título + el inicio del contenido.
  const sectionTitle = (text: string, minContent = 30) => {
    ensure(14 + minContent);
    doc.setFillColor(...BRAND);
    doc.rect(M, y, 3, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(safe(text), M + 6, y + 5.5);
    y += 11;
  };
  const tableStyles = {
    theme: "grid" as const,
    margin: { left: M, right: M },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: INK, lineColor: [217, 225, 234] as [number, number, number], lineWidth: 0.1, overflow: "linebreak" as const },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, halign: "center" as const },
    alternateRowStyles: { fillColor: [247, 249, 251] as [number, number, number] },
  };

  // ---------------- Portada / encabezado ----------------
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(safe(data.meta.title), M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("VISION AI - Plataforma de análisis visual con OpenCV + YOLOv8 + CNN", M, 21);
  doc.text(safe(`Generado: ${data.meta.generatedAt}  |  Por: ${data.meta.generatedBy}`), M, 26);
  y = 37;

  const meta: [string, string][] = [
    ["Alcance", data.meta.scope],
    ["Periodo", data.meta.range],
    ["Escenario", data.meta.scenario],
    ["Motor", data.meta.engine],
    ["Filtros", data.meta.filters.join("  |  ")],
  ];
  doc.setFontSize(9.5);
  for (const [k, v] of meta) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(`${k}:`, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(safe(v), W - M * 2 - 26);
    doc.text(lines, M + 24, y);
    y += 5 * lines.length;
  }
  y += 3;

  // ---------------- Indicadores ----------------
  if (data.sections.includes("summary")) {
    sectionTitle(SECTION_LABEL.summary);
    const cols = opts.orientation === "landscape" ? 6 : 3;
    const gap = 3;
    const bw = (W - M * 2 - gap * (cols - 1)) / cols;
    const bh = 22;
    data.kpis.forEach((k, i) => {
      const cx = M + (i % cols) * (bw + gap);
      const cy = y + Math.floor(i / cols) * (bh + gap);
      doc.setFillColor(...SOFT);
      doc.roundedRect(cx, cy, bw, bh, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(safe(k.label), cx + 3, cy + 5.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...INK);
      doc.text(safe(k.value), cx + 3, cy + 13.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(safe(k.hint ?? ""), bw - 6).slice(0, 1), cx + 3, cy + 19);
    });
    y += Math.ceil(data.kpis.length / cols) * (bh + gap) + 4;
  }

  // ---------------- Por cámara ----------------
  if (data.sections.includes("perCamera")) {
    sectionTitle(SECTION_LABEL.perCamera);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [["Cámara", "Estado", "Escenario", "Análisis", "Objetos", "Alertas", "Abiertas", "Críticas"].map(safe)],
      body: data.perCamera.map((r) => [r.camera, r.status, r.scenario, r.analyses, r.objects, r.alerts, r.openAlerts, r.critical].map(safe)),
      foot: data.perCamera.length
        ? [["TOTAL", "", "", ...(["analyses", "objects", "alerts", "openAlerts", "critical"] as const).map((k) => String(data.perCamera.reduce((s, r) => s + r[k], 0)))]]
        : undefined,
      footStyles: { fillColor: SOFT, textColor: INK, fontStyle: "bold" },
      didParseCell: (hook) => {
        if (hook.section === "foot" && hook.column.index >= 3) hook.cell.styles.halign = "right";
      },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    });
    y = lastY() + 8;
  }

  // ---------------- Por clase (gráfico de barras) ----------------
  if (data.sections.includes("classes")) {
    sectionTitle(SECTION_LABEL.classes, Math.min(60, data.classes.length * 7 + 4));
    if (!data.classes.length) {
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text("Sin detecciones en el alcance elegido.", M, y);
      y += 8;
    } else {
      const max = Math.max(...data.classes.map((c) => c.count));
      const labelW = 38;
      const barMax = W - M * 2 - labelW - 30;
      for (const c of data.classes.slice(0, 14)) {
        ensure(7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(...INK);
        doc.text(safe(c.name), M, y + 4);
        const bw = Math.max(1.5, (c.count / max) * barMax);
        doc.setFillColor(...hexToRgb(c.color));
        doc.roundedRect(M + labelW, y, bw, 5, 1, 1, "F");
        doc.setTextColor(...MUTED);
        doc.text(`${c.count}  (${c.pct}%)`, M + labelW + bw + 2, y + 4);
        y += 7;
      }
      y += 4;
    }
  }

  // ---------------- Análisis ----------------
  if (data.sections.includes("analyses")) {
    sectionTitle(`${SECTION_LABEL.analyses} (${data.analyses.length})`);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [["ID", "Fecha", "Cámara", "Escenario", "Perfil", "Estado", "Objetos", "Conf. media", "Dur. (s)", "Fotog.", "Alertas"].map(safe)],
      body: data.analyses.map((a) =>
        [a.id, a.date, a.camera, a.scenario, a.mode, a.status, a.objects, `${a.avgConfidencePct}%`, a.durationS, a.frames, a.alerts].map(safe),
      ),
      columnStyles: { 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" } },
    });
    y = lastY() + 8;
  }

  // ---------------- Detecciones ----------------
  if (data.sections.includes("detections")) {
    const rows = data.detections.slice(0, MAX_PDF_DETECTIONS);
    sectionTitle(`${SECTION_LABEL.detections} (${data.detections.length})`);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [["Análisis", "Fecha", "Cámara", "Etiqueta", "Clase", "Confianza", "Sobre umbral", "x", "y", "Ancho", "Alto"].map(safe)],
      body: rows.map((d) => [d.analysisId, d.date, d.camera, d.label, d.className, `${d.confidencePct}%`, d.aboveThreshold ? "Sí" : "No", d.x, d.y, d.w, d.h].map(safe)),
      styles: { ...tableStyles.styles, fontSize: 7 },
    });
    y = lastY() + 4;
    if (data.detections.length > rows.length) {
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(safe(`Se muestran ${rows.length} de ${data.detections.length} detecciones. El Excel incluye todas.`), M, y + 3);
      y += 6;
    }
    y += 4;
  }

  // ---------------- Alertas ----------------
  if (data.sections.includes("alerts")) {
    sectionTitle(`${SECTION_LABEL.alerts} (${data.alerts.length})`);
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [["Fecha", "Cámara", "Regla", "Severidad", "Mensaje", "Estado", "Responsable"].map(safe)],
      body: data.alerts.map((a) => [a.date, a.camera, a.rule, a.severityLabel, a.message, a.status, a.assignee || "-"].map(safe)),
      columnStyles: { 4: { cellWidth: opts.orientation === "landscape" ? 90 : 55 }, 3: { halign: "center", fontStyle: "bold" } },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.column.index === 3) {
          const sev = data.alerts[hook.row.index]?.severity;
          if (sev) {
            hook.cell.styles.fillColor = hexToRgb(SEVERITY_COLOR[sev]);
            hook.cell.styles.textColor = [255, 255, 255];
          }
        }
      },
    });
    y = lastY() + 8;

    // Galería de evidencias
    if (opts.includePhotos) {
      const withPhoto = data.alerts.filter((a) => a.snapshotUrl?.startsWith("data:image")).slice(0, Math.max(0, opts.maxPhotos));
      if (withPhoto.length) {
        sectionTitle(`Evidencias fotográficas (${withPhoto.length})`, 85);
        const perRow = opts.orientation === "landscape" ? 3 : 2;
        const gap = 4;
        const cw = (W - M * 2 - gap * (perRow - 1)) / perRow;
        let col = 0;
        let rowH = 0;
        for (const a of withPhoto) {
          const size = await loadImageSize(a.snapshotUrl!);
          if (!size) continue;
          const ih = Math.min(cw * (size.h / size.w), 70);
          const iw = ih * (size.w / size.h);
          const blockH = ih + 14;
          if (col === 0) ensure(blockH);
          const x = M + col * (cw + gap);
          try {
            const fmt = a.snapshotUrl!.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(a.snapshotUrl!, fmt, x, y, iw, ih, undefined, "FAST");
          } catch {
            /* imagen inválida: se omite */
          }
          doc.setDrawColor(...hexToRgb(SEVERITY_COLOR[a.severity]));
          doc.setLineWidth(0.6);
          doc.rect(x, y, iw, ih);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...INK);
          doc.text(doc.splitTextToSize(safe(`${a.severityLabel.toUpperCase()} - ${a.rule}`), cw).slice(0, 1), x, y + ih + 4);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...MUTED);
          doc.text(doc.splitTextToSize(safe(`${a.camera} - ${a.date}`), cw).slice(0, 1), x, y + ih + 8);
          doc.text(doc.splitTextToSize(safe(a.message), cw).slice(0, 1), x, y + ih + 11.5);
          rowH = Math.max(rowH, blockH);
          col++;
          if (col === perRow) {
            col = 0;
            y += rowH + 4;
            rowH = 0;
          }
        }
        if (col !== 0) y += rowH + 4;
      }
    }
  }

  // ---------------- Pie de página en todas las hojas ----------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(217, 225, 234);
    doc.setLineWidth(0.2);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(safe(`${data.meta.title} - ${data.meta.scope}`), M, H - 5.5);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 5.5, { align: "right" });
  }

  triggerDownload(doc.output("blob"), reportFileName(data, "pdf"));
}
