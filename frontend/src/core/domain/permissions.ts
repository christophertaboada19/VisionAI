// Matriz de permisos por rol. En el prototipo controla la interfaz y los casos de uso;
// antes de producción debe replicarse en el backend.
import type { AlertStatus, Role } from "./entities";

export type Action =
  | "analysis.run"
  | "analysis.observe"
  | "alert.review"
  | "alert.close"
  | "alert.reopen"
  | "history.export"
  | "admin.manage";

const MATRIX: Record<Role, Action[]> = {
  admin: ["analysis.run", "analysis.observe", "alert.review", "alert.close", "alert.reopen", "history.export", "admin.manage"],
  supervisor: ["analysis.run", "analysis.observe", "alert.review", "alert.close", "alert.reopen", "history.export"],
  operator: ["analysis.run", "analysis.observe", "alert.review", "history.export"],
  auditor: ["history.export"],
};

export const can = (role: Role | undefined, action: Action) => !!role && MATRIX[role].includes(action);

/** Transiciones válidas del ciclo de vida de una alerta. */
export function allowedAlertTransitions(role: Role, from: AlertStatus): AlertStatus[] {
  const out: AlertStatus[] = [];
  if (from === "new" && can(role, "alert.review")) out.push("reviewed");
  if ((from === "new" || from === "reviewed") && can(role, "alert.close")) out.push("closed");
  if (from === "closed" && can(role, "alert.reopen")) out.push("reviewed");
  return out;
}
