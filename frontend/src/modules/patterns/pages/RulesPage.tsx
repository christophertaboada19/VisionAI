import { useState } from "react";
import { Plus, Save, Trash2, Workflow, X } from "lucide-react";
import { manageRules } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import type { Rule, RuleCondition, Severity } from "@/core/domain/entities";
import { SEVERITY_LABEL } from "@/core/domain/entities";
import { useClasses, useRules } from "@/shared/hooks/useRepository";
import { SCENARIOS } from "@/modules/scenarios/data/scenes";
import { Button, Card, CardHeader, cx, Field, Input, PageHeader, Select, SeverityBadge, Toggle } from "@/shared/ui";

const PATTERN_TYPES = [
  ["ppe_missing", "EPP incompleto"],
  ["surface_defect", "Defecto superficial"],
  ["label_misaligned", "Etiqueta desalineada"],
  ["shelf_gap", "Hueco en estantería"],
  ["rack_occupancy", "Ocupación de rack"],
  ["crowding", "Aforo máximo excedido (según aforo configurado)"],
  ["zone_intrusion", "Invasión de zona / carril"],
  ["traffic_congestion", "Congestión vehicular"],
  ["abandoned_object", "Objeto abandonado"],
] as const;

function describe(c: RuleCondition, className: (id: string) => string): string {
  if (c.kind === "pattern") return `Patrón del motor = "${PATTERN_TYPES.find((p) => p[0] === c.patternType)?.[1] ?? c.patternType}"`;
  if (c.kind === "count") return `Conteo de "${className(c.classId)}" ≥ ${c.min}`;
  const z = SCENARIOS.flatMap((s) => s.zones).find((x) => x.id === c.zoneId);
  return `Centro de [${c.classIds.map(className).join(", ")}] dentro de "${z?.name ?? c.zoneId}"`;
}

const blank = (): Rule => ({ id: `rule-${Date.now().toString(36)}`, name: "", description: "", condition: { kind: "count", classId: "person", min: 3 }, threshold: 0.6, severity: "medium", enabled: true });

export function RulesPage() {
  const user = useUser();
  const toast = useToast();
  const rules = useRules();
  const classes = useClasses();
  const [draft, setDraft] = useState<Rule | null>(null);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? id;
  const zones = SCENARIOS.flatMap((s) => s.zones);

  const save = (r: Rule, msg = "Regla guardada") => {
    try {
      manageRules.save(r, user);
      toast({ kind: "success", title: msg, description: "Se aplica a los próximos análisis. Cambio registrado en auditoría." });
      return true;
    } catch (e) {
      toast({ kind: "error", title: "No se pudo guardar", description: (e as Error).message });
      return false;
    }
  };

  const setKind = (kind: RuleCondition["kind"]) => {
    if (!draft) return;
    const condition: RuleCondition = kind === "pattern" ? { kind, patternType: "ppe_missing" } : kind === "count" ? { kind, classId: "person", min: 3 } : { kind, classIds: ["box"], zoneId: zones[0]?.id ?? "" };
    setDraft({ ...draft, condition });
  };

  return (
    <>
      <PageHeader title="Reglas de alerta" description="Las reglas convierten patrones y detecciones en alertas revisables. Se evalúan en los perfiles Patrones y Combinado." actions={<Button variant="primary" icon={Plus} onClick={() => setDraft(blank())}>Nueva regla</Button>} />

      {draft && (
        <Card className="mb-4">
          <CardHeader title={rules.some((r) => r.id === draft.id) ? "Editar regla" : "Nueva regla"} icon={Workflow} actions={<Button size="sm" variant="ghost" icon={X} onClick={() => setDraft(null)}>Cancelar</Button>} />
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Nombre" htmlFor="rn"><Input id="rn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} /></Field>
            <div className="md:col-span-1 xl:col-span-3"><Field label="Descripción" htmlFor="rd"><Input id="rd" className="w-full" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={160} /></Field></div>
            <Field label="Tipo de condición" htmlFor="rk">
              <Select id="rk" value={draft.condition.kind} onChange={(e) => setKind(e.target.value as RuleCondition["kind"])}>
                <option value="pattern">Patrón del motor</option><option value="count">Conteo por clase</option><option value="zone">Objeto en zona</option>
              </Select>
            </Field>
            {draft.condition.kind === "pattern" && (
              <Field label="Patrón" htmlFor="rp">
                <Select id="rp" value={draft.condition.patternType} onChange={(e) => setDraft({ ...draft, condition: { kind: "pattern", patternType: e.target.value } })}>
                  {PATTERN_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            )}
            {draft.condition.kind === "count" && (
              <>
                <Field label="Clase" htmlFor="rc"><Select id="rc" value={draft.condition.classId} onChange={(e) => setDraft({ ...draft, condition: { ...(draft.condition as Extract<RuleCondition, { kind: "count" }>), classId: e.target.value } })}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="Mínimo" htmlFor="rm"><Input id="rm" type="number" min={1} max={99} value={draft.condition.min} onChange={(e) => setDraft({ ...draft, condition: { ...(draft.condition as Extract<RuleCondition, { kind: "count" }>), min: +e.target.value } })} /></Field>
              </>
            )}
            {draft.condition.kind === "zone" && (
              <>
                <Field label="Zona" htmlFor="rz"><Select id="rz" value={draft.condition.zoneId} onChange={(e) => setDraft({ ...draft, condition: { ...(draft.condition as Extract<RuleCondition, { kind: "zone" }>), zoneId: e.target.value } })}>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
                <Field label="Clases vigiladas" hint="Pulse para marcar o desmarcar">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Clases vigiladas">
                    {classes.map((c) => {
                      const zc = draft.condition as Extract<RuleCondition, { kind: "zone" }>;
                      const on = zc.classIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setDraft({ ...draft, condition: { ...zc, classIds: on ? zc.classIds.filter((x) => x !== c.id) : [...zc.classIds, c.id] } })
                          }
                          className={cx(
                            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                            on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
                          )}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                          {c.name}
                          {on && <span aria-hidden>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </>
            )}
            <Field label={`Confianza mínima · ${(draft.threshold * 100).toFixed(0)} %`} htmlFor="rt"><input id="rt" type="range" min={0.1} max={0.95} step={0.05} value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: +e.target.value })} className="h-9 accent-[var(--accent)]" /></Field>
            <Field label="Severidad" htmlFor="rs"><Select id="rs" value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}>{(["low", "medium", "high", "critical"] as const).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}</Select></Field>
            <div className="flex items-end md:col-span-2 xl:col-span-4 xl:justify-end">
              <Button variant="primary" icon={Save} onClick={() => save(draft) && setDraft(null)}>Guardar regla</Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Activa</th><th className="px-3">Regla</th><th className="px-3">Condición</th><th className="px-3">Confianza mín.</th><th className="px-3">Severidad</th><th className="px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rules.map((r) => (
                <tr key={r.id} className={r.enabled ? "" : "opacity-60"}>
                  <td className="px-4 py-3"><Toggle checked={r.enabled} label={`Activar ${r.name}`} onChange={(v) => save({ ...r, enabled: v }, v ? "Regla activada" : "Regla desactivada")} /></td>
                  <td className="px-3"><p className="font-medium">{r.name}</p><p className="text-xs text-[var(--ink-3)]">{r.description}</p></td>
                  <td className="px-3 text-xs text-[var(--ink-2)]">{describe(r.condition, className)}</td>
                  <td className="tabular px-3">{(r.threshold * 100).toFixed(0)} %</td>
                  <td className="px-3"><SeverityBadge severity={r.severity} /></td>
                  <td className="px-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDraft(r)}>Editar</Button>
                      <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Eliminar ${r.name}`} onClick={() => { if (window.confirm(`¿Eliminar la regla "${r.name}"?`)) { manageRules.remove(r.id, user); toast({ kind: "info", title: "Regla eliminada" }); } }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
