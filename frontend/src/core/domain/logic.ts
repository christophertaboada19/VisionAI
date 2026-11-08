// Reglas de negocio puras (sin React, sin almacenamiento): umbral, geometría, reglas y KPI.
import type {
  Alert,
  Analysis,
  Detection,
  PatternResult,
  Point,
  Rule,
  Severity,
  Zone,
} from "./entities";

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const toPercent = (c: number, digits = 0) => `${(clamp01(c) * 100).toFixed(digits)} %`;

/** Separa detecciones según el umbral SIN borrar el registro bruto. */
export function splitByThreshold(detections: Detection[], threshold: number) {
  const visible: Detection[] = [];
  const low: Detection[] = [];
  for (const d of detections) (d.confidence >= threshold ? visible : low).push(d);
  return { visible, low };
}

export function averageConfidence(items: { confidence: number }[]): number {
  if (!items.length) return 0;
  return items.reduce((s, i) => s + i.confidence, 0) / items.length;
}

export const boxCenter = (d: Detection): Point => [d.box.x + d.box.width / 2, d.box.y + d.box.height / 2];

/** Punto de apoyo en el piso (centro inferior de la caja): adecuado para zonas de piso en perspectiva. */
export const footPoint = (d: Detection): Point => [d.box.x + d.box.width / 2, d.box.y + d.box.height];

/** Algoritmo ray casting: ¿el punto está dentro del polígono? */
export function pointInPolygon([px, py]: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Área de un polígono normalizado (fórmula del zapato) = fracción de la imagen. */
export function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

/** Intersección sobre unión de dos cajas normalizadas. */
export function iou(a: Detection["box"], b: Detection["box"]): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

/** Supresión de no máximos (NMS) por clase. */
export function nonMaxSuppression(dets: Detection[], iouThreshold = 0.5): Detection[] {
  const sorted = [...dets].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (!kept.some((k) => k.classId === d.classId && iou(k.box, d.box) > iouThreshold)) kept.push(d);
  }
  return kept;
}

export interface RuleHit {
  rule: Rule;
  /** Identifica el mismo evento entre fotogramas (regla + objeto) para antirrebote y enfriamiento. */
  key: string;
  confidence: number;
  message: string;
  evidence: string;
  pattern?: PatternResult;
}

/**
 * Evalúa las reglas habilitadas sobre un resultado.
 * - pattern: patrón del motor con confianza >= umbral de la regla.
 * - count: número de detecciones visibles de una clase >= mínimo.
 * - zone: detección visible de las clases indicadas cuyo punto de apoyo (centro inferior) cae en la zona.
 */
export function evaluateRules(params: {
  rules: Rule[];
  detections: Detection[];
  patterns: PatternResult[];
  zones: Zone[];
  threshold: number;
}): RuleHit[] {
  const { rules, patterns, zones, threshold } = params;
  const { visible } = splitByThreshold(params.detections, threshold);
  const hits: RuleHit[] = [];

  for (const rule of rules.filter((r) => r.enabled)) {
    const c = rule.condition;
    if (c.kind === "pattern") {
      for (const p of patterns.filter((p) => p.type === c.patternType && p.confidence >= rule.threshold)) {
        hits.push({ rule, key: `${rule.id}:${p.relatedDetectionIds?.[0] ?? p.id}`, confidence: p.confidence, message: p.label.toLowerCase().startsWith(rule.name.toLowerCase()) ? p.label : `${rule.name}: ${p.label}`, evidence: p.evidence });
      }
    } else if (c.kind === "count") {
      const matches = visible.filter((d) => d.classId === c.classId && d.confidence >= rule.threshold);
      if (matches.length >= c.min) {
        const conf = averageConfidence(matches);
        const subjects = matches.map((m) => (m.trackId && !m.label.includes(m.trackId) ? `${m.label} [${m.trackId}]` : m.label)).join(", ");
        const evidence = `${matches.length} sujetos identificados (${subjects}) superando el mínimo de ${c.min}; confianza media ${toPercent(conf)}.`;
        hits.push({
          rule,
          key: rule.id,
          confidence: conf,
          message: `${rule.name}: ${matches.length} detectadas (${subjects})`,
          evidence,
          pattern: {
            id: `rule-${rule.id}`,
            type: `count:${c.classId}`,
            label: `${rule.name} (${matches.length})`,
            confidence: conf,
            evidence,
            source: "rule",
            relatedDetectionIds: matches.map((m) => m.id),
          },
        });
      }
    } else if (c.kind === "zone") {
      const zone = zones.find((z) => z.id === c.zoneId);
      const handledDetIds = new Set<string>();
      if (zone) {
        const inside = visible.filter(
          (d) => c.classIds.includes(d.classId) && d.confidence >= rule.threshold && pointInPolygon(footPoint(d), zone.polygon),
        );
        for (const d of inside) {
          handledDetIds.add(d.id);
          const subjName = d.trackId && !d.label.includes(d.trackId) ? `${d.label} [${d.trackId}]` : d.label;
          const evidence = `Sujeto identificado: "${subjName}" (${toPercent(d.confidence)}) con punto de apoyo [x=${Math.round(d.box.x * 100)}%, y=${Math.round(d.box.y * 100)}%] dentro de la zona "${zone.name}".`;
          hits.push({
            rule,
            key: `${rule.id}:${d.trackId ?? d.id}`,
            confidence: d.confidence,
            message: `${rule.name}: ${subjName} en ${zone.name}`,
            evidence,
            pattern: {
              id: `rule-${rule.id}-${d.id}`,
              type: "zone_intrusion",
              label: `${subjName} en zona restringida`,
              confidence: d.confidence,
              evidence,
              source: "rule",
              relatedDetectionIds: [d.id],
            },
          });
        }
      }
      // También activar la regla cuando el motor IA real detecta incumplimiento de ruta / desvío de corredor (zone_intrusion)
      for (const p of patterns.filter((p) => p.type === "zone_intrusion" && p.confidence >= rule.threshold)) {
        const relId = p.relatedDetectionIds?.[0];
        if (relId && handledDetIds.has(relId)) continue;
        if (relId) handledDetIds.add(relId);
        hits.push({
          rule,
          key: `${rule.id}:${relId ?? p.id}`,
          confidence: p.confidence,
          message: p.label,
          evidence: p.evidence,
        });
      }
    }
  }
  return hits;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
export const bySeverity = (a: { severity: Severity }, b: { severity: Severity }) =>
  SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];

export interface Kpis {
  analyses: number;
  completed: number;
  failed: number;
  objects: number;
  openAlerts: number;
  totalAlerts: number;
  averageConfidence: number;
  averageDurationMs: number;
}

/** KPI derivados SIEMPRE de los datos almacenados (no números decorativos). */
export function computeKpis(analyses: Analysis[], alerts: Alert[]): Kpis {
  const completed = analyses.filter((a) => a.status === "completed");
  const objects = completed.reduce(
    (s, a) => s + a.detections.filter((d) => d.confidence >= a.threshold).length,
    0,
  );
  const withConf = completed.filter((a) => a.averageConfidence > 0);
  return {
    analyses: analyses.length,
    completed: completed.length,
    failed: analyses.filter((a) => a.status === "failed").length,
    objects,
    openAlerts: alerts.filter((a) => a.status !== "closed").length,
    totalAlerts: alerts.length,
    averageConfidence: averageConfidence(withConf.map((a) => ({ confidence: a.averageConfidence }))),
    averageDurationMs: completed.length ? completed.reduce((s, a) => s + a.durationMs, 0) / completed.length : 0,
  };
}

/** Serie diaria de análisis y alertas para los últimos N días. */
export function dailySeries(analyses: Analysis[], alerts: Alert[], days: number, now = new Date()) {
  const out: { date: string; label: string; analyses: number; alerts: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
      analyses: 0,
      alerts: 0,
    });
  }
  const idx = new Map(out.map((o, i) => [o.date, i]));
  const keyOf = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };
  for (const a of analyses) {
    const i = idx.get(keyOf(a.createdAt));
    if (i !== undefined) out[i].analyses++;
  }
  for (const a of alerts) {
    const i = idx.get(keyOf(a.createdAt));
    if (i !== undefined) out[i].alerts++;
  }
  return out;
}

/** Conteo de objetos (sobre el umbral) por clase. */
export function countByClass(analyses: Analysis[]) {
  const m = new Map<string, number>();
  for (const a of analyses.filter((x) => x.status === "completed")) {
    for (const d of a.detections) if (d.confidence >= a.threshold) m.set(d.classId, (m.get(d.classId) ?? 0) + 1);
  }
  return [...m.entries()].map(([classId, count]) => ({ classId, count })).sort((a, b) => b.count - a.count);
}
