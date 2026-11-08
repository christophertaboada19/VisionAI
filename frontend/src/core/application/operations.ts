// Casos de uso de operación: alertas, observaciones, historial, reglas, configuración.
import type { Alert, AlertStatus, Analysis, AnalysisMode, AnalysisStatus, Rule, Settings, User, VisionClass } from "../domain/entities";
import { ALERT_STATUS_LABEL } from "../domain/entities";
import { allowedAlertTransitions, can } from "../domain/permissions";
import type { AnalysisRepository } from "../ports";
import { newId } from "./analysis";

export class ManageAlerts {
  constructor(private readonly repo: AnalysisRepository) {}

  updateStatus(alertId: string, to: AlertStatus, user: User, note?: string): Alert {
    const alert = this.repo.listAlerts().find((a) => a.id === alertId);
    if (!alert) throw new Error("La alerta no existe.");
    if (!allowedAlertTransitions(user.role, alert.status).includes(to)) {
      throw new Error(`Su perfil no puede cambiar la alerta de "${ALERT_STATUS_LABEL[alert.status]}" a "${ALERT_STATUS_LABEL[to]}".`);
    }
    const updated: Alert = {
      ...alert,
      status: to,
      reviewedBy: user.name,
      reviewedAt: new Date().toISOString(),
      assignee: alert.assignee ?? user.name,
      note: note?.trim() ? note.trim() : alert.note,
    };
    this.repo.saveAlert(updated);
    this.repo.addEvent({
      id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "alert.updated", level: "info", ref: alert.id,
      message: `Alerta ${alert.id} → ${ALERT_STATUS_LABEL[to]}${updated.note ? ` · Nota: ${updated.note}` : ""}`,
    });
    return updated;
  }

  assign(alertId: string, assignee: string, user: User) {
    const alert = this.repo.listAlerts().find((a) => a.id === alertId);
    if (!alert) throw new Error("La alerta no existe.");
    if (!can(user.role, "alert.close")) throw new Error("Solo supervisión o administración puede asignar responsables.");
    this.repo.saveAlert({ ...alert, assignee });
    this.repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "alert.updated", level: "info", ref: alert.id, message: `Alerta ${alert.id} asignada a ${assignee}.` });
  }
}

export function saveObservation(repo: AnalysisRepository, analysisId: string, text: string, user: User) {
  if (!can(user.role, "analysis.observe")) throw new Error("Su perfil no puede registrar observaciones.");
  const a = repo.getAnalysis(analysisId);
  if (!a) throw new Error("El análisis no existe.");
  repo.saveAnalysis({ ...a, observations: text.trim(), observationsBy: user.name });
  repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "observation", level: "info", ref: a.id, message: `Observación registrada en ${a.id}.` });
}

export interface HistoryFilters {
  text?: string;
  scenarioId?: string;
  cameraId?: string;
  mode?: AnalysisMode | "";
  status?: AnalysisStatus | "";
  classId?: string;
  minConfidence?: number;
  from?: string;
  to?: string;
  withAlerts?: boolean;
}

/** SearchHistory: filtrado puro del historial por escenario, cámara, clase y confianza. */
export function searchHistory(analyses: Analysis[], alerts: Alert[], f: HistoryFilters): Analysis[] {
  const text = f.text?.trim().toLowerCase();
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : -Infinity;
  const to = f.to ? new Date(`${f.to}T23:59:59`).getTime() : Infinity;
  return analyses
    .filter((a) => {
      const t = new Date(a.createdAt).getTime();
      if (t < from || t > to) return false;
      if (f.scenarioId && a.scenarioId !== f.scenarioId) return false;
      if (f.cameraId) {
        if (f.cameraId === "__manual__") {
          if (a.cameraId) return false;
        } else if (a.cameraId !== f.cameraId && !a.sourceName.includes(f.cameraId)) {
          return false;
        }
      }
      if (f.mode && a.mode !== f.mode) return false;
      if (f.status && a.status !== f.status) return false;
      if (f.classId && !a.detections.some((d) => d.classId === f.classId && d.confidence >= a.threshold)) return false;
      if (f.minConfidence && a.averageConfidence < f.minConfidence) return false;
      if (f.withAlerts && !alerts.some((x) => x.analysisId === a.id)) return false;
      if (text && ![a.id, a.sourceName, a.cameraName ?? "", a.createdBy, a.observations ?? ""].some((s) => s.toLowerCase().includes(text))) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class ManageRules {
  constructor(private readonly repo: AnalysisRepository) {}
  private guard(user: User) {
    if (!can(user.role, "admin.manage")) throw new Error("Solo un administrador puede modificar reglas.");
  }
  save(rule: Rule, user: User) {
    this.guard(user);
    if (!rule.name.trim()) throw new Error("La regla necesita un nombre.");
    if (!(rule.threshold >= 0 && rule.threshold <= 1)) throw new Error("El umbral debe estar entre 0 y 100 %.");
    if (rule.condition.kind === "count" && rule.condition.min < 1) throw new Error("El conteo mínimo debe ser al menos 1.");
    const existed = this.repo.listRules().some((r) => r.id === rule.id);
    this.repo.saveRule(rule);
    this.repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "rule.changed", level: "info", ref: rule.id, message: `Regla "${rule.name}" ${existed ? "actualizada" : "creada"} (${rule.enabled ? "activa" : "inactiva"}, umbral ${(rule.threshold * 100).toFixed(0)} %).` });
  }
  remove(id: string, user: User) {
    this.guard(user);
    const r = this.repo.listRules().find((x) => x.id === id);
    this.repo.deleteRule(id);
    this.repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "rule.changed", level: "warning", ref: id, message: `Regla "${r?.name ?? id}" eliminada.` });
  }
}

export function saveClass(repo: AnalysisRepository, c: VisionClass, user: User) {
  if (!can(user.role, "admin.manage")) throw new Error("Solo un administrador puede modificar clases.");
  repo.saveClass(c);
  repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "class.changed", level: "info", ref: c.id, message: `Clase "${c.name}" ${c.enabled ? "habilitada" : "deshabilitada"}.` });
}

export function saveSettings(repo: AnalysisRepository, s: Settings, user: User) {
  if (!can(user.role, "admin.manage")) throw new Error("Solo un administrador puede cambiar la configuración.");
  repo.saveSettings(s);
  repo.addEvent({ id: newId("EV"), at: new Date().toISOString(), user: user.name, type: "settings.changed", level: "info", message: `Configuración actualizada: umbral por defecto ${(s.defaultThreshold * 100).toFixed(0)} %, modo aleatorio ${s.randomDemo ? "activo" : "inactivo"}.` });
}
