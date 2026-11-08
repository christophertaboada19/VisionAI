// Agregar / quitar escenarios del sistema.
// - Agregar: el escenario pasa de «Escenarios disponibles» a los instalados, con su clase y regla
//   propias (si las tiene) y se registra en Supabase para que sus análisis y alertas se guarden.
// - Quitar: el escenario vuelve a «Escenarios disponibles» (no se borra nada: su historial y
//   alertas se conservan). No se puede quitar si alguna cámara lo usa o si es el último.
import { repository } from "@/app/providers/container";
import type { Scenario, User } from "@/core/domain/entities";
import { supabase } from "@/infrastructure/supabase/client";
import { ABANDONED_CLASS, ABANDONED_RULE } from "./data/seedCatalog";
import { findScenario, installedScenarioIds, setInstalledScenarios } from "./data/scenes";

const newEventId = () => `EV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Clases y reglas que necesita cada escenario adicional para funcionar. */
const REQUIREMENTS: Record<string, { classes: typeof ABANDONED_CLASS[]; rules: typeof ABANDONED_RULE[] }> = {
  "abandoned-objects": { classes: [ABANDONED_CLASS], rules: [ABANDONED_RULE] },
};

async function registerInSupabase(s: Scenario) {
  if (!supabase) return;
  try {
    await supabase.from("scenarios").upsert({
      id: s.id,
      name: s.name,
      sector: s.sector,
      description: s.description,
      expected_results: s.expectedResults,
      tags: s.tags,
      zones: s.zones,
    });
  } catch {
    /* sin conexión: el escenario funciona igual en este navegador */
  }
}

export function camerasUsingScenario(id: string) {
  return repository.listCameras().filter((c) => c.scenarioId === id);
}

export function installScenario(id: string, user: User): Scenario {
  const s = findScenario(id);
  if (!s) throw new Error("Escenario no encontrado en el catálogo.");
  if (!installedScenarioIds().includes(id)) setInstalledScenarios([...installedScenarioIds(), id]);

  const req = REQUIREMENTS[id];
  if (req) {
    const classes = repository.listClasses();
    for (const c of req.classes) if (!classes.some((x) => x.id === c.id)) repository.saveClass(c);
    const rules = repository.listRules();
    for (const r of req.rules) {
      const existing = rules.find((x) => x.id === r.id);
      if (!existing) repository.saveRule(r);
      else if (!existing.enabled) repository.saveRule({ ...existing, enabled: true });
    }
  }
  void registerInSupabase(s);
  // El evento también refresca todas las pantallas (selectores de escenario, galería, etc.).
  repository.addEvent({
    id: newEventId(),
    at: new Date().toISOString(),
    user: user.name,
    type: "scenario.changed",
    level: "success",
    ref: id,
    message: `Escenario "${s.name}" agregado al sistema.`,
  });
  return s;
}

export function removeScenario(id: string, user: User): Scenario {
  const s = findScenario(id);
  if (!s) throw new Error("Escenario no encontrado.");
  const installed = installedScenarioIds();
  if (!installed.includes(id)) return s;
  if (installed.length <= 1) throw new Error("Debe quedar al menos un escenario en el sistema.");
  const using = camerasUsingScenario(id);
  if (using.length) {
    throw new Error(`Lo usan ${using.length} cámara(s): ${using.map((c) => c.name).join(", ")}. Cámbieles el escenario antes de quitarlo.`);
  }
  setInstalledScenarios(installed.filter((x) => x !== id));
  repository.addEvent({
    id: newEventId(),
    at: new Date().toISOString(),
    user: user.name,
    type: "scenario.changed",
    level: "warning",
    ref: id,
    message: `Escenario "${s.name}" quitado del sistema (queda guardado en «Escenarios disponibles»).`,
  });
  return s;
}
