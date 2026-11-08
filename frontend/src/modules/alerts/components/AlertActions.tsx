import { useState } from "react";
import { CheckCheck, Eye, RotateCcw } from "lucide-react";
import { manageAlerts } from "@/app/providers/container";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import type { Alert, AlertStatus } from "@/core/domain/entities";
import { ALERT_STATUS_LABEL } from "@/core/domain/entities";
import { allowedAlertTransitions } from "@/core/domain/permissions";
import { Button, Input } from "@/shared/ui";

const ACTION: Record<string, { label: string; icon: typeof Eye; variant: "primary" | "secondary" }> = {
  "new>reviewed": { label: "Marcar revisada", icon: Eye, variant: "primary" },
  "new>closed": { label: "Cerrar", icon: CheckCheck, variant: "secondary" },
  "reviewed>closed": { label: "Cerrar", icon: CheckCheck, variant: "primary" },
  "closed>reviewed": { label: "Reabrir", icon: RotateCcw, variant: "secondary" },
};

export function AlertActions({ alert, compact }: { alert: Alert; compact?: boolean }) {
  const user = useUser();
  const toast = useToast();
  const [note, setNote] = useState("");
  const transitions = allowedAlertTransitions(user.role, alert.status);
  if (!transitions.length) {
    return <p className="text-xs text-[var(--ink-3)]">{user.role === "auditor" ? "Solo lectura (auditor)." : alert.status === "closed" ? "Cerrada." : "Sin acciones para su perfil."}</p>;
  }
  const run = (to: AlertStatus) => {
    try {
      manageAlerts.updateStatus(alert.id, to, user, note);
      setNote("");
      toast({ kind: "success", title: `Alerta ${ALERT_STATUS_LABEL[to].toLowerCase()}`, description: `${alert.id} · el cambio se refleja en dashboard e historial.` });
    } catch (e) {
      toast({ kind: "error", title: "No se pudo actualizar la alerta", description: (e as Error).message });
    }
  };
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2"}>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota u observación (opcional)"
        aria-label={`Nota para la alerta ${alert.id}`}
        className={compact ? "h-8 min-w-0 flex-1 text-xs" : "text-xs"}
        maxLength={240}
      />
      <div className="flex flex-wrap gap-2">
        {transitions.map((to) => {
          const a = ACTION[`${alert.status}>${to}`];
          return <Button key={to} size="sm" variant={a.variant} icon={a.icon} onClick={() => run(to)}>{a.label}</Button>;
        })}
      </div>
    </div>
  );
}
