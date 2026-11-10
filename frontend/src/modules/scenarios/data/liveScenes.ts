// Datos de referencia y simulación 2D para las 4 situaciones reales del proyecto (sin motor 3D).
// Sirve como respaldo determinista y para las escenas de referencia cuando no hay cámara activa.
import type { BoundingBox, Detection, PatternResult, Point, SegmentationResult } from "@/core/domain/entities";
import { clamp01, polygonArea } from "@/core/domain/logic";

export interface LiveFrameData {
  detections: Detection[];
  masks: SegmentationResult[];
  patterns: PatternResult[];
}

const jit = (base: number, t: number, k: number) =>
  +Math.min(0.99, Math.max(0.05, base + 0.025 * Math.sin(t * 1.7 + k * 2.3) + 0.012 * Math.sin(t * 4.1 + k))).toFixed(3);

function boxToPoly(b: BoundingBox): Point[] {
  return [
    [+b.x.toFixed(4), +b.y.toFixed(4)],
    [+(b.x + b.width).toFixed(4), +b.y.toFixed(4)],
    [+(b.x + b.width).toFixed(4), +(b.y + b.height).toFixed(4)],
    [+b.x.toFixed(4), +(b.y + b.height).toFixed(4)],
  ];
}

export function qcKind(index: number): "ok" | "defect" | "tilt" {
  const m = ((index % 5) + 5) % 5;
  if (m === 2) return "defect";
  if (m === 4) return "tilt";
  return "ok";
}

/** Polígono normalizado del carril/zona restringida en el escenario de monitoreo vial. */
export function restrictedLanePolygon(): Point[] {
  return [
    [0.58, 0.48],
    [0.94, 0.48],
    [0.96, 0.88],
    [0.54, 0.88],
  ];
}

export function liveFrame(scenarioId: string, t: number): LiveFrameData {
  const detections: Detection[] = [];
  const masks: SegmentationResult[] = [];
  const patterns: PatternResult[] = [];

  const addDet = (id: string, classId: string, label: string, trackId: string, confidence: number, raw: BoundingBox) => {
    const x = +clamp01(raw.x).toFixed(4);
    const y = +clamp01(raw.y).toFixed(4);
    const width = +clamp01(Math.min(1 - x, raw.width)).toFixed(4);
    const height = +clamp01(Math.min(1 - y, raw.height)).toFixed(4);
    if (width <= 0.01 || height <= 0.01) return null;
    const d: Detection = { id, classId, label, confidence, box: { x, y, width, height }, trackId };
    detections.push(d);
    return d;
  };

  const addMask = (id: string, classId: string, label: string, kind: "semantic" | "instance", poly: Point[], confidence: number) => {
    const areaRatio = +polygonArea(poly).toFixed(4);
    if (areaRatio > 0.0003) {
      masks.push({ id, classId, label, kind, polygon: poly, areaRatio, confidence });
    }
  };

  if (scenarioId === "industrial-safety") {
    const dx1 = 0.04 * Math.sin(t * 0.6);
    const dx2 = 0.03 * Math.cos(t * 0.5);
    const dx3 = 0.05 * Math.sin(t * 0.4 + 1);

    // Operario T1 (Con casco y chaleco)
    const p1 = addDet("person-T1", "person", "Operario T1 (EPP OK)", "T1", jit(0.94, t, 1), { x: 0.14 + dx1, y: 0.22, width: 0.16, height: 0.62 });
    if (p1) {
      addMask("m-person-T1", "person", "Operario T1 (EPP OK)", "instance", boxToPoly(p1.box), jit(0.92, t, 2));
      addDet("helmet-T1", "helmet", "Casco (T1)", "T1", jit(0.91, t, 3), { x: p1.box.x + 0.04, y: p1.box.y, width: 0.08, height: 0.11 });
      addDet("vest-T1", "vest", "Chaleco (T1)", "T1", jit(0.89, t, 4), { x: p1.box.x + 0.02, y: p1.box.y + 0.15, width: 0.12, height: 0.24 });
    }

    // Operario T2 (Con casco y chaleco)
    const p2 = addDet("person-T2", "person", "Operario T2 (EPP OK)", "T2", jit(0.92, t, 5), { x: 0.42 + dx2, y: 0.24, width: 0.16, height: 0.6 });
    if (p2) {
      addMask("m-person-T2", "person", "Operario T2 (EPP OK)", "instance", boxToPoly(p2.box), jit(0.9, t, 6));
      addDet("helmet-T2", "helmet", "Casco (T2)", "T2", jit(0.88, t, 7), { x: p2.box.x + 0.04, y: p2.box.y, width: 0.08, height: 0.11 });
      addDet("vest-T2", "vest", "Chaleco (T2)", "T2", jit(0.87, t, 8), { x: p2.box.x + 0.02, y: p2.box.y + 0.15, width: 0.12, height: 0.23 });
    }

    // Operario T3 (SIN casco ni chaleco -> dispara alerta EPP incompleto)
    const p3 = addDet("person-T3", "person", "Operario T3 (SIN CASCO NI CHALECO)", "T3", jit(0.91, t, 9), { x: 0.7 + dx3, y: 0.23, width: 0.16, height: 0.61 });
    if (p3) {
      addMask("m-person-T3", "person", "Operario T3 (SIN CASCO NI CHALECO)", "instance", boxToPoly(p3.box), jit(0.89, t, 10));
      patterns.push({
        id: "p-ppe-T3",
        type: "ppe_missing",
        label: "EPP incompleto: Operario T3 (sector derecho) SIN CASCO NI CHALECO",
        confidence: jit(0.88, t, 11),
        source: "model",
        evidence: "Persona identificada como Operario T3 (sector derecho) sin detección de casco protector ni chaleco reflectivo.",
        relatedDetectionIds: ["person-T3"],
      });
    }

    // Detección de baja confianza (falso positivo para auditar umbral)
    addDet("helmet-low", "helmet", "Casco", "FP1", 0.34, { x: 0.04, y: 0.76, width: 0.06, height: 0.08 });

    patterns.push({
      id: "p-ppe-ok",
      type: "ppe_ok",
      label: "EPP completo (2 operarios conformes)",
      confidence: jit(0.9, t, 12),
      source: "model",
      evidence: "Casco y chaleco reflectivo verificados sobre el ROI de T1 y T2.",
    });
  } else if (scenarioId === "quality-control") {
    // Línea de inspección: Botella sana vs Botella malograda
    const slot = Math.floor(t / 3.5);
    const phase = (t % 3.5) / 3.5;
    const bx = 0.18 + phase * 0.45;

    // Botella 1: Botella Sana (con tapa y etiqueta alineada)
    const b1 = addDet("product-B1", "product", `Botella B${slot * 2 + 1} (SANA)`, `B${slot * 2 + 1}`, jit(0.95, t, 1), {
      x: clamp01(bx - 0.12),
      y: 0.22,
      width: 0.16,
      height: 0.58,
    });
    if (b1) {
      addMask("m-product-B1", "product", `Botella B${slot * 2 + 1} (SANA)`, "instance", boxToPoly(b1.box), jit(0.93, t, 2));
      addDet("cap-B1", "cap", `Tapa (B${slot * 2 + 1})`, `B${slot * 2 + 1}`, jit(0.92, t, 3), {
        x: b1.box.x + 0.045,
        y: b1.box.y,
        width: 0.07,
        height: 0.08,
      });
      addDet("label-B1", "label", `Etiqueta (B${slot * 2 + 1})`, `B${slot * 2 + 1}`, jit(0.91, t, 4), {
        x: b1.box.x + 0.015,
        y: b1.box.y + 0.22,
        width: 0.13,
        height: 0.18,
      });
      patterns.push({
        id: `p-ok-B${slot * 2 + 1}`,
        type: "conforming",
        label: `Botella B${slot * 2 + 1} (sector izquierdo) SANA (Conforme)`,
        confidence: jit(0.94, t, 5),
        source: "model",
        evidence: "Tapa presente, etiqueta centrada y contorno simétrico sin abolladuras.",
        relatedDetectionIds: ["product-B1"],
      });
    }

    // Botella 2: Botella Malograda (deformada / sin tapa / defecto superficial)
    const b2 = addDet("product-B2", "product", `Botella B${slot * 2 + 2} (MALOGRADA)`, `B${slot * 2 + 2}`, jit(0.91, t, 6), {
      x: clamp01(bx + 0.22),
      y: 0.26,
      width: 0.17,
      height: 0.54,
    });
    if (b2) {
      addMask("m-product-B2", "product", `Botella B${slot * 2 + 2} (MALOGRADA)`, "instance", boxToPoly(b2.box), jit(0.89, t, 7));
      const def = addDet("defect-B2", "defect", `Defecto (B${slot * 2 + 2})`, `B${slot * 2 + 2}`, jit(0.87, t, 8), {
        x: b2.box.x + 0.02,
        y: b2.box.y + 0.14,
        width: 0.13,
        height: 0.24,
      });
      if (def) {
        addMask("m-defect-B2", "defect", "Zona deformada / sin tapa", "instance", boxToPoly(def.box), jit(0.85, t, 9));
      }
      patterns.push({
        id: `p-def-B${slot * 2 + 2}`,
        type: "surface_defect",
        label: `Botella B${slot * 2 + 2} (sector derecho) MALOGRADA: deformación y sin tapa`,
        confidence: jit(0.88, t, 10),
        source: "model",
        evidence: "Gradiente Sobel irregular en el cuerpo del envase y ausencia de tapa superior en el ROI.",
        relatedDetectionIds: ["product-B2", "defect-B2"],
      });
    }
  } else if (scenarioId === "retail-store") {
    // Control de aforo en salón / retail (sube y baja entre 3 y 6 personas)
    const baseCount = t === 0 ? 5 : 3 + Math.round(1.5 + 1.5 * Math.sin(t * 0.25));
    const positions = [
      [0.10, 0.26],
      [0.26, 0.24],
      [0.44, 0.28],
      [0.62, 0.25],
      [0.78, 0.27],
      [0.35, 0.34],
    ];
    for (let i = 0; i < baseCount; i++) {
      const [px, py] = positions[i % positions.length];
      const shift = 0.02 * Math.sin(t * 0.7 + i);
      const zoneLbl = px < 0.35 ? "sector izquierdo" : px > 0.65 ? "sector derecho" : "sector central";
      const d = addDet(`person-A${i + 1}`, "person", `Persona A${i + 1} (${zoneLbl})`, `A${i + 1}`, jit(0.89, t, i + 1), {
        x: px + shift,
        y: py,
        width: 0.13,
        height: 0.54,
      });
      if (d) {
        addMask(`m-person-A${i + 1}`, "person", `Persona A${i + 1} (${zoneLbl})`, "instance", boxToPoly(d.box), jit(0.87, t, i + 10));
      }
    }
    // Aforo por defecto (3): misma regla que el backend (patrón "crowding" cuando hay MÁS personas).
    if (baseCount > 3) {
      patterns.push({
        id: "p-retail-crowding",
        type: "crowding",
        label: `Aforo máximo excedido: ${baseCount} personas (máximo 3, exceso ${baseCount - 3})`,
        confidence: jit(0.86, t, 30),
        source: "model",
        evidence: `Se contabilizaron ${baseCount} personas en el salón superando el aforo máximo configurado (3).`,
        relatedDetectionIds: Array.from({ length: baseCount }, (_, i) => `person-A${i + 1}`),
      });
    }
  } else if (scenarioId === "public-traffic") {
    // Monitoreo vial en cámara pública: vehículos + carril restringido
    const zonePoly = restrictedLanePolygon();
    addMask("m-zone", "zone", "Carril restringido", "semantic", zonePoly, jit(0.95, t, 1));

    const shift = 0.04 * Math.sin(t * 0.8);
    const c1 = addDet("car-V1", "car", "Auto V1 (carril izquierdo)", "V1", jit(0.93, t, 2), { x: 0.12 + shift, y: 0.52, width: 0.18, height: 0.22 });
    if (c1) addMask("m-car-V1", "car", "Auto V1", "instance", boxToPoly(c1.box), jit(0.9, t, 3));

    const b1 = addDet("bus-V2", "bus", "Bus V2 (carril central)", "V2", jit(0.91, t, 4), { x: 0.33, y: 0.38, width: 0.2, height: 0.32 });
    if (b1) addMask("m-bus-V2", "bus", "Bus V2", "instance", boxToPoly(b1.box), jit(0.89, t, 5));

    // Camión / Auto dentro del carril restringido (punto inferior dentro de zonePoly)
    const inv = addDet("truck-V3", "truck", "Camión V3 (CARRIL RESTRINGIDO)", "V3", jit(0.89, t, 6), { x: 0.66, y: 0.46, width: 0.2, height: 0.32 });
    if (inv) addMask("m-truck-V3", "truck", "Camión V3 (CARRIL RESTRINGIDO)", "instance", boxToPoly(inv.box), jit(0.87, t, 7));

    addDet("moto-V4", "motorcycle", "Motocicleta V4 (carril izquierdo)", "V4", jit(0.84, t, 8), { x: 0.05, y: 0.64, width: 0.09, height: 0.18 });

    patterns.push({
      id: "p-traffic-congestion",
      type: "traffic_congestion",
      label: "Flujo vehicular denso en vía principal (Auto V1, Bus V2, Camión V3)",
      confidence: jit(0.82, t, 9),
      source: "model",
      evidence: "Vehículos identificados en escena: Auto V1, Bus V2, Camión V3 (CARRIL RESTRINGIDO), Motocicleta V4.",
      relatedDetectionIds: ["car-V1", "bus-V2", "truck-V3"],
    });
  } else if (scenarioId === "abandoned-objects") {
    // Terminal / hall: una persona con su mochila, otra que se aleja y una maleta abandonada.
    const walk = 0.05 * Math.sin(t * 0.5);
    const p1 = addDet("person-T1", "person", "Persona T1 (con su mochila)", "T1", jit(0.93, t, 1), { x: 0.12 + walk, y: 0.24, width: 0.15, height: 0.6 });
    if (p1) addMask("m-person-T1", "person", "Persona T1", "instance", boxToPoly(p1.box), jit(0.9, t, 2));
    addDet("bag-O1", "bag", "Mochila O1 (CON PERSONA CERCA)", "O1", jit(0.86, t, 3), { x: 0.19 + walk, y: 0.42, width: 0.07, height: 0.13 });
    addDet("person-T2", "person", "Persona T2 (sector derecho, alejándose)", "T2", jit(0.9, t, 4), { x: 0.8, y: 0.2, width: 0.13, height: 0.55 });
    const o2 = addDet("bag-O2", "bag", "Maleta O2 (ABANDONADO 14 s)", "O2", jit(0.88, t, 5), { x: 0.47, y: 0.6, width: 0.11, height: 0.22 });
    if (o2) {
      addMask("m-bag-O2", "bag", "Maleta O2", "instance", boxToPoly(o2.box), jit(0.86, t, 6));
      patterns.push({
        id: "p-abandoned-O2",
        type: "abandoned_object",
        label: "Maleta O2 sin persona cerca en el sector central (14 s)",
        confidence: jit(0.9, t, 7),
        source: "model",
        evidence: "Objeto: Maleta O2 en el sector central. Razón de la alerta: permanece quieta 14 s sin ninguna persona cerca (límite 10 s). Personas en escena: 2.",
        relatedDetectionIds: ["bag-O2"],
      });
    }
  }

  return { detections, masks, patterns };
}

export const LIVE_HINT: Record<string, string> = {
  "industrial-safety": "Enfoca a una persona con tu cámara: verifica si porta casco de seguridad y chaleco reflectivo.",
  "quality-control": "Coloca una botella sana o una botella malograda (sin tapa o deformada) frente a la cámara.",
  "retail-store": "Apunta la cámara al salón o grupo de personas para medir el aforo en tiempo real.",
  "public-traffic": "Conecta una cámara pública en vivo o stream vial para detectar vehículos, congestión e invasión de carril.",
  "abandoned-objects": "Deja una mochila, bolso o maleta frente a la cámara y aléjate: si queda sola el tiempo configurado se genera la alerta. Si vuelves o la mueves, el contador se reinicia.",
};
