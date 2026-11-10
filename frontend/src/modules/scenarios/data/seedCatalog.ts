// Catálogo de clases, reglas, usuarios y ajustes por defecto para las 4 situaciones reales.
import type { CameraConfig, Rule, Settings, VisionClass } from "@/core/domain/entities";

// Paleta categórica de alto contraste validada para accesibilidad visual.
export const DEFAULT_CLASSES: VisionClass[] = [
  { id: "person", name: "Persona", color: "#2a78d6", description: "Persona u operario detectado en escena.", enabled: true },
  { id: "helmet", name: "Casco", color: "#eda100", description: "Casco de protección industrial.", enabled: true },
  { id: "vest", name: "Chaleco", color: "#eb6834", description: "Chaleco reflectivo de alta visibilidad.", enabled: true },
  { id: "product", name: "Botella / Envase", color: "#1baf7a", description: "Botella o envase en inspección de calidad.", enabled: true },
  { id: "cap", name: "Tapa", color: "#0ea5e9", description: "Tapa superior del envase o botella.", enabled: true },
  { id: "label", name: "Etiqueta", color: "#6250d6", description: "Etiqueta frontal del envase.", enabled: true },
  { id: "defect", name: "Defecto / Malograda", color: "#e34948", description: "Envase malogrado: aplastado, deformado, sin tapa o con daño superficial.", enabled: true },
  { id: "car", name: "Auto", color: "#0284c7", description: "Automóvil ligero en vía pública.", enabled: true },
  { id: "bus", name: "Bus", color: "#7c3aed", description: "Autobús o transporte público.", enabled: true },
  { id: "truck", name: "Camión", color: "#d97706", description: "Camión o vehículo de carga pesada.", enabled: true },
  { id: "motorcycle", name: "Motocicleta", color: "#10b981", description: "Motocicleta o vehículo menor.", enabled: true },
  { id: "zone", name: "Zona restringida", color: "#e34948", description: "Polígono de carril o área restringida.", enabled: true },
];

/** Clase y regla propias del escenario «Objetos abandonados» (se añaden al agregar el escenario). */
export const ABANDONED_CLASS: VisionClass = {
  id: "bag",
  name: "Mochila / Bolso / Maleta",
  color: "#c026d3",
  description: "Bulto vigilado en el escenario de objetos abandonados.",
  enabled: true,
};
export const ABANDONED_RULE: Rule = {
  id: "rule-abandoned",
  name: "Objeto abandonado (sin dueño)",
  description: "Mochila, bolso o maleta quieta y sin ninguna persona cerca durante el tiempo configurado.",
  condition: { kind: "pattern", patternType: "abandoned_object" },
  threshold: 0.5,
  severity: "high",
  enabled: true,
};

export const DEFAULT_RULES: Rule[] = [
  {
    id: "rule-ppe",
    name: "EPP incompleto (Casco / Chaleco)",
    description: "Persona detectada sin casco de seguridad y/o sin chaleco reflectivo.",
    condition: { kind: "pattern", patternType: "ppe_missing" },
    threshold: 0.65,
    severity: "high",
    enabled: true,
  },
  {
    id: "rule-defect",
    name: "Botella malograda / No conforme",
    description: "Envase deformado, aplastado, sin tapa o con defecto estructural detectado por CNN + OpenCV.",
    condition: { kind: "pattern", patternType: "surface_defect" },
    threshold: 0.65,
    severity: "critical",
    enabled: true,
  },
  {
    id: "rule-label",
    name: "Etiqueta ausente o torcida",
    description: "Botella sin etiqueta o con etiqueta desalineada respecto al eje del envase.",
    condition: { kind: "pattern", patternType: "label_misaligned" },
    threshold: 0.6,
    severity: "medium",
    enabled: true,
  },
  {
    id: "rule-occupancy",
    name: "Aforo máximo excedido",
    description: "Más personas que el aforo máximo configurado para la cámara o el análisis (por defecto 3).",
    condition: { kind: "pattern", patternType: "crowding" },
    threshold: 0.55,
    severity: "medium",
    enabled: true,
  },
  {
    id: "rule-zone",
    name: "Invasión de zona / carril restringido",
    description: "Vehículo o peatón dentro del polígono de zona restringida en la vía.",
    condition: { kind: "zone", classIds: ["car", "truck", "bus", "motorcycle", "person"], zoneId: "zone-restricted" },
    threshold: 0.55,
    severity: "high",
    enabled: true,
  },
  {
    id: "rule-traffic",
    name: "Congestión vehicular alta",
    description: "Alta densidad de vehículos detectados simultáneamente en cámara pública.",
    condition: { kind: "pattern", patternType: "traffic_congestion" },
    threshold: 0.65,
    severity: "medium",
    enabled: true,
  },
];

/** Aforo por defecto (personas permitidas). Se alerta cuando hay MÁS personas que este número. */
export const DEFAULT_MAX_OCCUPANCY = 3;

export const ALERT_TARGET_OPTIONS: Record<string, { value: string; label: string; shortLabel: string }[]> = {
  "public-traffic": [
    { value: "all", label: "Todos los incidentes viales (Carril restringido, Distancia, Pesados y Congestión)", shortLabel: "Todos los incidentes viales" },
    { value: "heavy_vehicles", label: "Detectar Camiones y Buses (Control de transporte pesado)", shortLabel: "Camiones y Buses" },
    { value: "close_distance", label: "Distancia crítica entre vehículos (Riesgo de colisión / alcance)", shortLabel: "Distancia crítica" },
    { value: "off_route", label: "Desvío de ruta o invasión de carril restringido / berma", shortLabel: "Desvío de ruta / Carril restringido" },
    { value: "congestion", label: "Solo congestión vehicular alta (3+ vehículos en ruta)", shortLabel: "Congestión vehicular" },
    { value: "pedestrian_road", label: "Peatones o motocicletas en calzada vehicular", shortLabel: "Peatones / Motos en vía" },
  ],
  "industrial-safety": [
    { value: "all", label: "EPP Completo: Casco + Chaleco (Naranja, Verde o Plomo)", shortLabel: "Casco + Chaleco (Naranja/Verde/Plomo)" },
    { value: "helmet_only", label: "Solo alertar falta de Casco de seguridad", shortLabel: "Solo falta de Casco" },
    { value: "vest_only", label: "Solo alertar falta de Chaleco (Naranja, Verde o Plomo)", shortLabel: "Solo falta de Chaleco" },
  ],
  "quality-control": [
    { value: "all", label: "Botellas sin etiqueta + Botellas malogradas o sin tapa (Cielo y Comerciales)", shortLabel: "Sin etiqueta + Malogradas (Cielo)" },
    { value: "no_label", label: "Solo alertar botellas plásticas SIN ETIQUETA", shortLabel: "Solo botellas SIN ETIQUETA" },
    { value: "deformed", label: "Solo alertar botellas aplastadas / deformadas o sin tapa", shortLabel: "Solo botellas deformadas / sin tapa" },
  ],
  "retail-store": [
    { value: "all", label: `Exceso de aforo máximo en sala (más de ${DEFAULT_MAX_OCCUPANCY} personas)`, shortLabel: `Aforo máx. ${DEFAULT_MAX_OCCUPANCY} personas` },
  ],
  "abandoned-objects": [
    { value: "all", label: "Mochila, bolso o maleta sola más de 10 segundos", shortLabel: "Bulto solo > 10 s" },
    { value: "quick", label: "Alerta rápida: cualquier bulto solo más de 5 segundos", shortLabel: "Bulto solo > 5 s (rápida)" },
    { value: "suitcase_only", label: "Solo maletas abandonadas (más de 10 segundos)", shortLabel: "Solo maletas" },
    { value: "backpack_only", label: "Solo mochilas y bolsos abandonados (más de 10 segundos)", shortLabel: "Solo mochilas y bolsos" },
  ],
};

/** El aforo elegido viaja al backend dentro de alertTarget como "capacity:N". */
export function capacityTarget(n: number): string {
  const v = Math.max(1, Math.min(10000, Math.round(Number.isFinite(n) ? n : DEFAULT_MAX_OCCUPANCY)));
  return `capacity:${v}`;
}

export function capacityFromTarget(target?: string): number {
  const m = /^capacity:(d+)$/.exec(target ?? "");
  return m ? Math.max(1, Math.min(10000, Number(m[1]))) : DEFAULT_MAX_OCCUPANCY;
}

export function getAlertTargetLabel(scenarioId: string, target = "all", short = false): string {
  if (scenarioId === "retail-store") {
    const n = capacityFromTarget(target);
    return short ? `Aforo máx. ${n} personas` : `Exceso de aforo máximo en sala (más de ${n} personas)`;
  }
  const list = ALERT_TARGET_OPTIONS[scenarioId] ?? ALERT_TARGET_OPTIONS["public-traffic"];
  const found = list.find((o) => o.value === target) ?? list[0];
  return short ? found.shortLabel : found.label;
}

export const DEFAULT_CAMERAS: CameraConfig[] = [
  {
    id: "cam-seattle-barton",
    name: "Cámara 1 · Seattle 35th & Barton HD",
    sourceKind: "public-stream",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Barton_EW.stream/playlist.m3u8",
    scenarioId: "public-traffic",
    alertTarget: "all",
    mode: "combined",
    threshold: 0.5,
    enabled: true,
    location: "Seattle DOT · 35th Ave SW & Barton",
  },
  {
    id: "cam-seattle-market",
    name: "Cámara 2 · Seattle 24th & Market HD",
    sourceKind: "public-stream",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/24_NW_Market_EW.stream/playlist.m3u8",
    scenarioId: "public-traffic",
    alertTarget: "heavy_vehicles",
    mode: "combined",
    threshold: 0.5,
    enabled: true,
    location: "Seattle DOT · 24th Ave NW & Market",
  },
  {
    id: "cam-seattle-roxbury",
    name: "Cámara 3 · Seattle 35th & Roxbury HD",
    sourceKind: "public-stream",
    url: "https://61e0c5d388c2e.streamlock.net:443/live/35_SW_Roxbury_EW.stream/playlist.m3u8",
    scenarioId: "public-traffic",
    alertTarget: "close_distance",
    mode: "combined",
    threshold: 0.5,
    enabled: true,
    location: "Seattle DOT · 35th Ave SW & Roxbury",
  },
  {
    id: "cam-la-i5",
    name: "Cámara 4 · Autopista I-5 Meadowdale",
    sourceKind: "public-stream",
    url: "https://wzmedia.dot.ca.gov/D7/CCTV-25.stream/playlist.m3u8",
    scenarioId: "public-traffic",
    alertTarget: "off_route",
    mode: "combined",
    threshold: 0.5,
    enabled: true,
    location: "Los Ángeles DOT · Interestatal 5",
  },
  {
    id: "cam-local-webcam",
    name: "Cámara 5 · Webcam PC (Botellas Cielo / EPP)",
    sourceKind: "webcam",
    url: "",
    scenarioId: "quality-control",
    alertTarget: "all",
    mode: "combined",
    threshold: 0.5,
    enabled: true,
    location: "Dispositivo Local PC / Laptop",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  defaultThreshold: 0.5,
  randomDemo: false,
  simulateNextFailure: false,
  maxUploadMb: 8,
  notificationsEnabled: true,
  cameras: DEFAULT_CAMERAS,
};
