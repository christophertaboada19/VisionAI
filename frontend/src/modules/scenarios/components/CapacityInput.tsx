import { useEffect, useState } from "react";
import { Input } from "@/shared/ui";
import { capacityFromTarget, capacityTarget } from "../data/seedCatalog";

/**
 * Aforo máximo del escenario "Control de aforo": número de personas permitidas.
 * Se guarda en alertTarget como "capacity:N" y el backend alerta cuando hay MÁS de N personas.
 */
export function CapacityInput({
  id,
  target,
  onChange,
  disabled,
}: {
  id: string;
  target?: string;
  onChange: (alertTarget: string) => void;
  disabled?: boolean;
}) {
  const current = capacityFromTarget(target);
  // Texto local: permite borrar el campo y escribir otro número sin que salte al valor anterior.
  const [text, setText] = useState(String(current));
  useEffect(() => setText(String(current)), [current]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={10000}
        step={1}
        value={text}
        disabled={disabled}
        className="w-28"
        onChange={(e) => {
          setText(e.target.value);
          const n = Math.round(Number(e.target.value));
          if (e.target.value !== "" && Number.isFinite(n) && n >= 1) onChange(capacityTarget(n));
        }}
        onBlur={() => setText(String(current))}
      />
      <span className="text-xs text-[var(--ink-2)]">
        personas permitidas · alerta desde {current + 1}
      </span>
    </div>
  );
}
