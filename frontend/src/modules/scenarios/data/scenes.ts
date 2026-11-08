// Catálogo de las 4 situaciones reales del proyecto con previsualizaciones SVG 2D calibradas (sin 3D).
import type { Detection, PatternResult, Scenario, SegmentationResult } from "@/core/domain/entities";
import { liveFrame, restrictedLanePolygon } from "./liveScenes";

export interface ScenarioSeed {
  detections: Detection[];
  masks: SegmentationResult[];
  patterns: PatternResult[];
}

/** Genera una imagen SVG limpia (data URL) alineada con las coordenadas 0..1 de cada escenario. */
export function sceneImage(id: string, _t = 0): string {
  const f = liveFrame(id, 0);
  const bgMap: Record<string, [string, string, string]> = {
    "industrial-safety": ["#0f172a", "#1e293b", "SEGURIDAD INDUSTRIAL · CONTROL DE EPP (CASCO Y CHALECO)"],
    "quality-control": ["#0b2239", "#133b5c", "CONTROL DE CALIDAD · BOTELLA SANA VS. BOTELLA MALOGRADA"],
    "retail-store": ["#111827", "#1f2937", "CONTROL DE AFORO Y OCUPACIÓN EN TIEMPO REAL"],
    "public-traffic": ["#091e2c", "#163247", "MONITOREO VIAL EN VIVO · CÁMARAS PÚBLICAS"],
    "abandoned-objects": ["#1c1033", "#2e1a47", "OBJETOS ABANDONADOS · MOCHILAS, BOLSOS Y MALETAS SIN DUEÑO"],
  };
  const [c1, c2, title] = bgMap[id] ?? ["#0f172a", "#1e293b", id.toUpperCase()];

  const rects = f.detections
    .filter((d) => d.confidence >= 0.5)
    .map((d) => {
      const x = Math.round(d.box.x * 800);
      const y = Math.round(d.box.y * 500);
      const w = Math.round(d.box.width * 800);
      const h = Math.round(d.box.height * 500);
      const stroke =
        d.classId === "defect"
          ? "#e34948"
          : d.classId === "helmet"
            ? "#eda100"
            : d.classId === "vest"
              ? "#eb6834"
              : d.classId === "product"
                ? "#1baf7a"
                : d.classId === "bag"
                  ? d.label.includes("ABANDONADO")
                    ? "#e34948"
                    : "#c026d3"
                  : "#38bdf8";
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${stroke}" fill-opacity="0.16" stroke="${stroke}" stroke-width="2" />`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="800" height="500" fill="url(#bg)" />
    <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="1">
      <line x1="0" y1="125" x2="800" y2="125" />
      <line x1="0" y1="250" x2="800" y2="250" />
      <line x1="0" y1="375" x2="800" y2="375" />
      <line x1="200" y1="0" x2="200" y2="500" />
      <line x1="400" y1="0" x2="400" y2="500" />
      <line x1="600" y1="0" x2="600" y2="500" />
    </g>
    ${rects}
    <rect x="24" y="20" width="752" height="36" rx="6" fill="#000000" fill-opacity="0.45" />
    <text x="40" y="43" fill="#e2e8f0" font-family="system-ui, sans-serif" font-size="13" font-weight="600" letter-spacing="0.06em">${title}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Autoría y licencia de las fotos de portada (public/scenarios/<id>.webp). */
const COVER_CREDITS: Record<string, NonNullable<Scenario["coverCredit"]>> = {
  "industrial-safety": { author: "John Green (vlogbrothers)", license: "CC BY 3.0", url: "https://commons.wikimedia.org/wiki/File:Construction_of_Maternal_Center_of_Excellence_Sierra_Leone_03.png" },
  "retail-store": { author: "ProjectManhattan", license: "CC BY-SA 3.0", url: "https://commons.wikimedia.org/wiki/File:Crowd_inside_nex_shopping_center.jpg" },
  "public-traffic": { author: "Ingolfson", license: "Public domain", url: "https://commons.wikimedia.org/wiki/File:Intersection_Almost_Jammed_Up.jpg" },
  "abandoned-objects": { author: "Linda Bailey", license: "CC BY-SA 2.0", url: "https://commons.wikimedia.org/wiki/File:Suitcase_on_Old_Mangotsfield_Station_-_geograph.org.uk_-_218160.jpg" },
  "quality-control": { author: "Equipo VISION AI", license: "Propia", url: "" },
};

function scenario(s: Omit<Scenario, "asset">): Scenario {
  return {
    cover: `/scenarios/${s.id}.webp`,
    coverCredit: COVER_CREDITS[s.id],
    ...s,
    get asset() {
      return sceneImage(s.id, 0);
    },
  };
}

/** Escenarios base del proyecto (instalados por defecto). */
const BASE_SCENARIOS: Scenario[] = [
  scenario({
    id: "industrial-safety",
    name: "Seguridad industrial (EPP)",
    sector: "Seguridad y prevención",
    description: "Inspección de operarios en tiempo real mediante cámara para verificar el uso obligatorio de casco de protección y chaleco reflectivo.",
    expectedResults: "Persona, casco, chaleco; alerta de EPP incompleto si falta alguno.",
    tags: ["EPP", "casco", "chaleco", "seguridad"],
    zones: [],
  }),
  scenario({
    id: "quality-control",
    name: "Control de calidad (Botellas)",
    sector: "Manufactura",
    description: "Comparación e inspección visual de botellas sanas frente a botellas malogradas (sin tapa, aplastadas/deformadas o sin etiqueta) usando OpenCV y CNN.",
    expectedResults: "Botella/envase, tapa, etiqueta, defecto; clasificación conforme vs. malograda.",
    tags: ["botellas", "defectos", "CNN", "OpenCV"],
    zones: [],
  }),
  scenario({
    id: "retail-store",
    name: "Control de aforo y ocupación",
    sector: "Retail y espacios interiores",
    description: "Conteo en tiempo real de personas en el salón o establecimiento y disparo de alerta cuando se supera el aforo máximo permitido.",
    expectedResults: "Conteo de personas en escena; alerta de aforo máximo excedido.",
    tags: ["aforo", "personas", "conteo", "ocupación"],
    zones: [],
  }),
  scenario({
    id: "public-traffic",
    name: "Monitoreo vial (Cámaras públicas)",
    sector: "Transporte y seguridad vial",
    description: "Análisis de cámaras públicas de tráfico en vivo: detección de autos, buses, camiones y motos, flujo vehicular e invasión de carril restringido.",
    expectedResults: "Auto, bus, camión, motocicleta; congestión vehicular e invasión de zona restringida.",
    tags: ["cámaras públicas", "tráfico", "vehículos", "zonas"],
    zones: [{ id: "zone-restricted", name: "Carril restringido", kind: "restricted", polygon: restrictedLanePolygon() }],
  }),
];

/** Escenarios nuevos preparados: quedan en «Escenarios disponibles» hasta que se agregan. */
const EXTRA_SCENARIOS: Scenario[] = [
  scenario({
    id: "abandoned-objects",
    name: "Objetos abandonados",
    sector: "Seguridad en espacios públicos",
    description:
      "Vigilancia de mochilas, bolsos y maletas: alerta cuando un bulto queda quieto y sin ninguna persona cerca durante varios segundos. Ideal para terminales, aeropuertos, colegios y centros comerciales.",
    expectedResults: "Persona, mochila, bolso, maleta; alerta de objeto abandonado sin dueño.",
    tags: ["objetos abandonados", "mochila", "maleta", "seguridad"],
    zones: [],
  }),
];

// ---------------------------------------------------------------------------
// Catálogo completo vs. escenarios INSTALADOS.
// - ALL_SCENARIOS: todos los escenarios que existen (instalados + disponibles para agregar).
// - SCENARIOS: solo los instalados; es lo que muestran los selectores de todo el sistema.
// Quitar un escenario NO lo borra: pasa a «Escenarios disponibles» con todos sus datos y el
// historial/alertas que generó se conservan (se siguen mostrando con su nombre).
// ---------------------------------------------------------------------------
export const ALL_SCENARIOS: Scenario[] = [...BASE_SCENARIOS, ...EXTRA_SCENARIOS];
const DEFAULT_INSTALLED = BASE_SCENARIOS.map((x) => x.id);
const INSTALLED_KEY = "visionai:installed-scenarios";

function readInstalled(): string[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(INSTALLED_KEY) : null;
    if (!raw) return DEFAULT_INSTALLED;
    const ids = JSON.parse(raw);
    const valid = Array.isArray(ids) ? ids.filter((id) => ALL_SCENARIOS.some((x) => x.id === id)) : [];
    return valid.length ? valid : DEFAULT_INSTALLED;
  } catch {
    return DEFAULT_INSTALLED;
  }
}

/** Escenarios instalados (se actualiza en el mismo arreglo para que todos los módulos lo vean). */
export const SCENARIOS: Scenario[] = [];
function applyInstalled(ids: string[]) {
  SCENARIOS.length = 0;
  SCENARIOS.push(...ALL_SCENARIOS.filter((x) => ids.includes(x.id)));
}
applyInstalled(readInstalled());

export const installedScenarioIds = () => SCENARIOS.map((x) => x.id);
/** Escenarios que se pueden agregar (los nuevos preparados y los que se quitaron). */
export const availableScenarios = () => ALL_SCENARIOS.filter((x) => !SCENARIOS.some((i) => i.id === x.id));
/** Busca en el catálogo completo: sirve también para registros de escenarios ya quitados. */
export const findScenario = (id: string) => ALL_SCENARIOS.find((x) => x.id === id);
export const scenarioName = (id: string) => findScenario(id)?.name ?? id;

const EVER_KEY = "visionai:scenarios-ever-installed";
/** ¿Estuvo instalado alguna vez? (los base siempre). Sirve para distinguir «nuevo» de «guardado». */
export function wasInstalledBefore(id: string) {
  if (DEFAULT_INSTALLED.includes(id)) return true;
  try {
    return (JSON.parse(window.localStorage.getItem(EVER_KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

export function setInstalledScenarios(ids: string[]) {
  const ordered = ALL_SCENARIOS.map((x) => x.id).filter((id) => ids.includes(id));
  applyInstalled(ordered);
  try {
    const ever = new Set<string>(JSON.parse(window.localStorage.getItem(EVER_KEY) ?? "[]"));
    ordered.forEach((id) => ever.add(id));
    window.localStorage.setItem(EVER_KEY, JSON.stringify([...ever]));
    window.localStorage.setItem(INSTALLED_KEY, JSON.stringify(ordered));
  } catch {
    /* modo privado: solo en memoria */
  }
}

export const SCENARIO_SEEDS: Record<string, ScenarioSeed> = Object.fromEntries(
  ALL_SCENARIOS.map((s) => {
    const f = liveFrame(s.id, 0);
    return [s.id, { detections: f.detections, masks: f.masks, patterns: f.patterns }];
  }),
);

export const scenarioCatalog = {
  list: () => SCENARIOS,
  get: (id: string) => findScenario(id),
};
