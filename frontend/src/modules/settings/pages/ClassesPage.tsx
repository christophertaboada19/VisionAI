import { repository } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { saveClass } from "@/core/application/operations";
import { useAnalyses, useClasses } from "@/shared/hooks/useRepository";
import { Card, ClassDot, Notice, PageHeader, Toggle } from "@/shared/ui";

export function ClassesPage() {
  const user = useUser();
  const toast = useToast();
  const classes = useClasses();
  const analyses = useAnalyses();
  const count = (id: string) => analyses.reduce((s, a) => s + a.detections.filter((d) => d.classId === id).length + a.masks.filter((m) => m.classId === id).length, 0);
  return (
    <>
      <PageHeader title="Clases" description="Catálogo de clases que el sistema puede reconocer. El color sigue a la clase en todo el sistema (visor, leyendas y gráficos)." />
      <div className="mb-4"><Notice tone="info">Una clase deshabilitada se omite en los próximos análisis (se informa como advertencia). Los análisis ya guardados no se modifican.</Notice></div>
      <Card>
        <ul className="divide-y divide-[var(--border)]">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-5 py-3">
              <Toggle checked={c.enabled} label={`Habilitar ${c.name}`} onChange={(v) => { saveClass(repository, { ...c, enabled: v }, user); toast({ kind: "info", title: `Clase ${c.name} ${v ? "habilitada" : "deshabilitada"}` }); }} />
              <ClassDot color={c.color} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.name} <span className="font-mono text-xs font-normal text-[var(--ink-3)]">{c.id}</span></p>
                <p className="text-xs text-[var(--ink-3)]">{c.description}</p>
              </div>
              <span className="font-mono text-xs text-[var(--ink-3)]">{c.color}</span>
              <span className="tabular w-28 text-right text-xs text-[var(--ink-2)]">{count(c.id)} resultados</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
