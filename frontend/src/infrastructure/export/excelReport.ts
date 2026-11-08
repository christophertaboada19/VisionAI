// Reporte Excel (.xlsx) detallado y con formato, generado en el navegador con ExcelJS.
// Se carga bajo demanda (import dinámico) para no aumentar el peso inicial de la app.
import type { Worksheet } from "exceljs";
import { reportFileName, SECTION_LABEL, SEVERITY_COLOR, type ReportData } from "./report";

const BRAND = "0E7490"; // azul petróleo de la interfaz
const BRAND_SOFT = "E6F4F7";
const BORDER = "D9E1EA";

interface Col {
  header: string;
  key: string;
  width: number;
  numFmt?: string;
}

function styleHeader(ws: Worksheet, rowNumber: number, ncols: number) {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  for (let c = 1; c <= ncols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: `FF${BORDER}` } } };
  }
}

/** Escribe una tabla con encabezado de color, bandas alternas, filtros y primera fila fija. */
function writeTable(ws: Worksheet, cols: Col[], rows: Record<string, unknown>[], startRow = 1) {
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  const header = ws.getRow(startRow);
  cols.forEach((c, i) => (header.getCell(i + 1).value = c.header));
  styleHeader(ws, startRow, cols.length);
  rows.forEach((r, i) => {
    const row = ws.getRow(startRow + 1 + i);
    cols.forEach((c, j) => {
      const cell = row.getCell(j + 1);
      cell.value = (r[c.key] ?? "") as never;
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: `FF${BORDER}` } } };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FB" } };
    });
  });
  ws.views = [{ state: "frozen", ySplit: startRow }];
  if (rows.length) ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow + rows.length, column: cols.length } };
}

function emptyNote(ws: Worksheet, text: string) {
  ws.getCell("A1").value = text;
  ws.getCell("A1").font = { italic: true, color: { argb: "FF6B7280" } };
  ws.getColumn(1).width = 60;
}

export async function downloadExcelReport(data: ReportData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "VISION AI";
  wb.created = new Date();
  wb.title = data.meta.title;

  // ---------------- Hoja 1: Resumen ----------------
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 22 }, { width: 46 }];
  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = data.meta.title;
  ws.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
  ws.getCell("A1").alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 34;
  ws.mergeCells("A2:C2");
  ws.getCell("A2").value = "VISION AI · Plataforma de análisis visual con OpenCV + YOLOv8 + CNN";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF4B5563" } };

  const meta: [string, string][] = [
    ["Alcance (cámaras)", data.meta.scope],
    ["Periodo", data.meta.range],
    ["Escenario", data.meta.scenario],
    ["Filtros aplicados", data.meta.filters.join(" · ")],
    ["Generado el", data.meta.generatedAt],
    ["Generado por", data.meta.generatedBy],
    ["Motor de visión", data.meta.engine],
  ];
  meta.forEach(([k, v], i) => {
    const r = ws.getRow(4 + i);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
    ws.mergeCells(4 + i, 2, 4 + i, 3);
    r.getCell(2).value = v;
    r.getCell(2).alignment = { wrapText: true };
  });

  let row = 4 + meta.length + 1;
  if (data.sections.includes("summary")) {
    ws.getRow(row).getCell(1).value = "Indicadores";
    ws.getRow(row).getCell(1).font = { bold: true, size: 13, color: { argb: `FF${BRAND}` } };
    row++;
    ["Indicador", "Valor", "Detalle"].forEach((h, i) => (ws.getRow(row).getCell(i + 1).value = h));
    styleHeader(ws, row, 3);
    row++;
    for (const k of data.kpis) {
      const r = ws.getRow(row++);
      r.getCell(1).value = k.label;
      r.getCell(2).value = k.value;
      r.getCell(2).font = { bold: true, size: 12 };
      r.getCell(2).alignment = { horizontal: "center" };
      r.getCell(3).value = k.hint ?? "";
      for (let c = 1; c <= 3; c++) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_SOFT}` } };
    }
    row++;
  }
  ws.getRow(row).getCell(1).value = "Hojas incluidas en este libro";
  ws.getRow(row).getCell(1).font = { bold: true, color: { argb: `FF${BRAND}` } };
  for (const s of data.sections.filter((x) => x !== "summary")) ws.getRow(++row).getCell(1).value = `• ${SECTION_LABEL[s]}`;

  // ---------------- Hojas de detalle ----------------
  if (data.sections.includes("perCamera")) {
    const s = wb.addWorksheet("Por cámara");
    writeTable(
      s,
      [
        { header: "Cámara", key: "camera", width: 40 },
        { header: "Estado", key: "status", width: 13 },
        { header: "Escenario", key: "scenario", width: 30 },
        { header: "Análisis / sesiones", key: "analyses", width: 14, numFmt: "0" },
        { header: "Objetos detectados", key: "objects", width: 14, numFmt: "#,##0" },
        { header: "Alertas", key: "alerts", width: 11, numFmt: "0" },
        { header: "Alertas abiertas", key: "openAlerts", width: 13, numFmt: "0" },
        { header: "Alertas críticas", key: "critical", width: 13, numFmt: "0" },
      ],
      data.perCamera,
    );
    const n = data.perCamera.length;
    if (n) {
      const t = s.getRow(n + 2);
      t.getCell(1).value = "TOTAL";
      ["D", "E", "F", "G", "H"].forEach((col, i) => {
        t.getCell(4 + i).value = { formula: `SUM(${col}2:${col}${n + 1})` } as never;
      });
      t.eachCell((c) => {
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND_SOFT}` } };
      });
    }
  }

  if (data.sections.includes("classes")) {
    const s = wb.addWorksheet("Por clase");
    writeTable(
      s,
      [
        { header: "Clase", key: "name", width: 28 },
        { header: "Objetos", key: "count", width: 12, numFmt: "#,##0" },
        { header: "% del total", key: "pct", width: 12, numFmt: '0.0"%"' },
      ],
      data.classes,
    );
    data.classes.forEach((c, i) => {
      const cell = s.getRow(i + 2).getCell(1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${c.color.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6)}` } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    if (data.classes.length) {
      s.addConditionalFormatting({
        ref: `B2:B${data.classes.length + 1}`,
        rules: [{ type: "dataBar", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: { argb: `FF${BRAND}` } } as never],
      });
    }
  }

  if (data.sections.includes("analyses")) {
    const s = wb.addWorksheet("Análisis");
    if (!data.analyses.length) emptyNote(s, "Sin análisis en el periodo y cámara elegidos.");
    else
      writeTable(
        s,
        [
          { header: "ID", key: "id", width: 20 },
          { header: "Fecha", key: "date", width: 18 },
          { header: "Cámara", key: "camera", width: 34 },
          { header: "Escenario", key: "scenario", width: 26 },
          { header: "Fuente", key: "source", width: 34 },
          { header: "Perfil", key: "mode", width: 13 },
          { header: "Estado", key: "status", width: 12 },
          { header: "Objetos", key: "objects", width: 10, numFmt: "0" },
          { header: "Confianza media", key: "avgConfidencePct", width: 12, numFmt: '0.0"%"' },
          { header: "Duración (s)", key: "durationS", width: 11, numFmt: "0.00" },
          { header: "Fotogramas", key: "frames", width: 11 },
          { header: "Alertas", key: "alerts", width: 9, numFmt: "0" },
          { header: "Usuario", key: "user", width: 20 },
        ],
        data.analyses,
      );
  }

  if (data.sections.includes("detections")) {
    const s = wb.addWorksheet("Detecciones");
    if (!data.detections.length) emptyNote(s, "Sin detecciones en el periodo y cámara elegidos.");
    else
      writeTable(
        s,
        [
          { header: "Análisis", key: "analysisId", width: 20 },
          { header: "Fecha", key: "date", width: 18 },
          { header: "Cámara", key: "camera", width: 32 },
          { header: "Escenario", key: "scenario", width: 24 },
          { header: "Etiqueta", key: "label", width: 36 },
          { header: "Clase", key: "className", width: 16 },
          { header: "Confianza", key: "confidencePct", width: 11, numFmt: '0.0"%"' },
          { header: "Sobre umbral", key: "aboveThresholdTxt", width: 12 },
          { header: "x", key: "x", width: 8, numFmt: "0.000" },
          { header: "y", key: "y", width: 8, numFmt: "0.000" },
          { header: "Ancho", key: "w", width: 8, numFmt: "0.000" },
          { header: "Alto", key: "h", width: 8, numFmt: "0.000" },
        ],
        data.detections.map((d) => ({ ...d, aboveThresholdTxt: d.aboveThreshold ? "Sí" : "No (baja)" })),
      );
  }

  if (data.sections.includes("alerts")) {
    const s = wb.addWorksheet("Alertas");
    if (!data.alerts.length) emptyNote(s, "Sin alertas con los filtros elegidos.");
    else {
      writeTable(
        s,
        [
          { header: "ID", key: "id", width: 20 },
          { header: "Fecha", key: "date", width: 18 },
          { header: "Cámara", key: "camera", width: 32 },
          { header: "Escenario", key: "scenario", width: 24 },
          { header: "Regla", key: "rule", width: 28 },
          { header: "Severidad", key: "severityLabel", width: 11 },
          { header: "Mensaje", key: "message", width: 50 },
          { header: "Evidencia", key: "evidence", width: 50 },
          { header: "Estado", key: "status", width: 12 },
          { header: "Responsable", key: "assignee", width: 18 },
          { header: "Revisado por", key: "reviewedBy", width: 18 },
          { header: "Nota", key: "note", width: 30 },
        ],
        data.alerts,
      );
      data.alerts.forEach((a, i) => {
        const cell = s.getRow(i + 2).getCell(6);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${SEVERITY_COLOR[a.severity]}` } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center", vertical: "top" };
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, reportFileName(data, "xlsx"));
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
