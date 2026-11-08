import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Archive, MapPin, Play, Plus, Radio, Sparkles, Tag, Trash2, X } from "lucide-react";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import type { Scenario } from "@/core/domain/entities";
import { can } from "@/core/domain/permissions";
import { useAnalyses, useCameras, useClasses, useEvents } from "@/shared/hooks/useRepository";
import { Button, Card, ClassDot, cx, PageHeader } from "@/shared/ui";
import { availableScenarios, SCENARIOS, SCENARIO_SEEDS, wasInstalledBefore } from "../data/scenes";
import { camerasUsingScenario, installScenario, removeScenario } from "../scenarioManager";

/** Crédito de la foto (autor · licencia), requerido por las licencias Creative Commons. */
function CoverCredit({ s }: { s: Scenario }) {
  const c = s.coverCredit;
  if (!c || !s.cover) return null;
  const text = `Foto: ${c.author} · ${c.license}`;
  return c.url ? (
    <a href={c.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="absolute bottom-1.5 right-1.5 max-w-[70%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white/90 hover:text-white">
      {text}
    </a>
  ) : (
    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white/90">{text}</span>
  );
}

/** Ventana modal simple (pantallita) con fondo oscuro, cierre con Esc o clic fuera. */
function Modal({ title, kicker, onClose, children, wide }: { title: string; kicker?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div className="anim-fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "anim-pop-in relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
          <div className="min-w-0">
            {kicker && <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-ink)]">{kicker}</p>}
            <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-white hover:text-[var(--ink)]" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ScenarioGalleryPage({ admin }: { admin?: boolean }) {
  const user = useUser();
  const toast = useToast();
  const analyses = useAnalyses();
  const classes = useClasses();
  const cameras = useCameras();
  useEvents(); // re-renderiza al agregar/quitar escenarios (cada cambio registra un evento)
  const [showAdd, setShowAdd] = useState(false);
  const [toRemove, setToRemove] = useState<Scenario | null>(null);
  const isAdmin = admin && can(user.role, "admin.manage");
  const available = availableScenarios();

  const add = (s: Scenario) => {
    try {
      installScenario(s.id, user);
      toast({ kind: "success", title: `Escenario agregado: ${s.name}`, description: "Ya puede asignarlo a una cámara en Monitoreo por cámara o usarlo en Nuevo análisis." });
      if (availableScenarios().length === 0) setShowAdd(false);
    } catch (e) {
      toast({ kind: "error", title: "No se pudo agregar", description: (e as Error).message });
    }
  };
  const remove = (s: Scenario) => {
    try {
      removeScenario(s.id, user);
      toast({ kind: "info", title: `Escenario quitado: ${s.name}`, description: "Quedó guardado en «Agregar escenario» por si desea volver a usarlo." });
      setToRemove(null);
    } catch (e) {
      toast({ kind: "error", title: "No se puede quitar todavía", description: (e as Error).message });
    }
  };

  const classChips = (s: Scenario) => {
    const ids = [...new Set((SCENARIO_SEEDS[s.id]?.detections ?? []).map((d) => d.classId))];
    return ids.map((id) => {
      const c = classes.find((x) => x.id === id);
      return (
        <span key={id} className="flex items-center gap-1">
          <ClassDot color={c?.color ?? (id === "bag" ? "#c026d3" : "#888")} />
          {c?.name ?? (id === "bag" ? "Mochila / Bolso / Maleta" : id)}
        </span>
      );
    });
  };

  return (
    <>
      <PageHeader
        title={admin ? "Gestión de escenarios" : "Galería de escenarios"}
        description={
          admin
            ? "Agregue escenarios nuevos desde «Escenarios disponibles» o quite los que no use: al quitarlos quedan guardados para volver a agregarlos cuando quiera."
            : "Escenas de demostración listas para analizar. Cada una tiene resultados semilla deterministas."
        }
        actions={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>
              Agregar escenario{available.length ? ` (${available.length} disponible${available.length === 1 ? "" : "s"})` : ""}
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {SCENARIOS.map((s, i) => {
          const seed = SCENARIO_SEEDS[s.id];
          const runs = analyses.filter((a) => a.scenarioId === s.id).length;
          const camCount = cameras.filter((c) => c.scenarioId === s.id).length;
          return (
            <Card key={s.id} delay={i * 60} className="overflow-hidden">
              <div className="relative">
                <img src={s.cover ?? s.asset} alt={`Escena ${s.name}: ${s.description}`} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                <CoverCredit s={s} />
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{s.name}</h2>
                    <p className="text-xs text-[var(--ink-3)]">
                      {s.sector} · {runs} análisis · {camCount} cámara{camCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {can(user.role, "analysis.run") && (
                      <>
                        <Link to={`/analisis/en-vivo?escenario=${s.id}`}><Button size="sm" icon={Radio}>En vivo</Button></Link>
                        <Link to={`/analisis?escenario=${s.id}`}><Button size="sm" variant="primary" icon={Play}>Analizar</Button></Link>
                      </>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setToRemove(s)} title="Quitar escenario (queda guardado en «Agregar escenario»)">
                        Quitar
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--ink-2)]">{s.description}</p>
                <p className="mt-2 text-sm"><span className="font-medium">Esperado:</span> <span className="text-[var(--ink-2)]">{s.expectedResults}</span></p>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-[var(--ink-2)]">{classChips(s)}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]"><Tag className="h-3 w-3" />{t}</span>)}
                  {s.zones.map((z) => <span key={z.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--critical-soft)] px-2 py-0.5 text-[11px] text-[var(--critical)]"><MapPin className="h-3 w-3" />{z.name}</span>)}
                </div>
                {admin && seed && (
                  <dl className="tabular mt-4 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-center text-xs">
                    <div><dt className="text-[var(--ink-3)]">Detecciones semilla</dt><dd className="text-base font-semibold">{seed.detections.length}</dd></div>
                    <div><dt className="text-[var(--ink-3)]">Máscaras</dt><dd className="text-base font-semibold">{seed.masks.length}</dd></div>
                    <div><dt className="text-[var(--ink-3)]">Patrones</dt><dd className="text-base font-semibold">{seed.patterns.length}</dd></div>
                  </dl>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {showAdd && (
        <Modal title="Escenarios disponibles" kicker="Agregar escenario" onClose={() => setShowAdd(false)} wide>
          {available.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-12 text-center text-sm text-[var(--ink-3)]">
              <Archive className="h-8 w-8" />
              <p>Todos los escenarios ya están en el sistema.</p>
              <p className="text-xs">Cuando quite un escenario, quedará guardado aquí para volver a agregarlo.</p>
            </div>
          ) : (
            <ul className="grid gap-3 p-4 sm:grid-cols-2">
              {available.map((s) => {
                const isNew = !wasInstalledBefore(s.id);
                return (
                  <li key={s.id} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)]">
                    <div className="relative">
                      <img src={s.cover ?? s.asset} alt={`Escena ${s.name}`} loading="lazy" className="aspect-[16/9] w-full object-cover" />
                      <CoverCredit s={s} />
                      <span
                        className={cx(
                          "absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white",
                          isNew ? "bg-[var(--accent)]" : "bg-slate-600",
                        )}
                      >
                        {isNew ? <Sparkles className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                        {isNew ? "Nuevo · preparado" : "Guardado (quitado antes)"}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-3.5">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-xs text-[var(--ink-3)]">{s.sector}</p>
                      <p className="mt-1.5 flex-1 text-xs text-[var(--ink-2)]">{s.description}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--ink-2)]">{classChips(s)}</div>
                      <Button className="mt-3" variant="primary" icon={Plus} onClick={() => add(s)}>
                        Agregar al sistema
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}

      {toRemove && (
        <Modal title={`¿Quitar «${toRemove.name}»?`} kicker="Quitar escenario" onClose={() => setToRemove(null)}>
          <div className="space-y-3 p-5 text-sm text-[var(--ink-2)]">
            <p>
              El escenario dejará de aparecer en los selectores del sistema, pero <strong className="text-[var(--ink)]">no se borra</strong>: queda guardado en
              «Agregar escenario» para volver a usarlo cuando quiera.
            </p>
            <p>Su historial y sus alertas se conservan y seguirán apareciendo en los reportes.</p>
            {camerasUsingScenario(toRemove.id).length > 0 && (
              <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning-ink)]">
                <p className="font-semibold">Primero cambie el escenario de estas cámaras:</p>
                <ul className="mt-1 list-disc pl-4">
                  {camerasUsingScenario(toRemove.id).map((c) => <li key={c.id}>{c.name}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setToRemove(null)}>Cancelar</Button>
              <Button variant="danger" icon={Trash2} disabled={camerasUsingScenario(toRemove.id).length > 0} onClick={() => remove(toRemove)}>
                Quitar escenario
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
