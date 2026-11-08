// Marca VISION AI (logo oficial) y botón de tema claro/oscuro.
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/providers/theme";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Ícono del logo sobre una placa blanca: se ve igual en tema claro, oscuro y sobre el menú azul. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-xl bg-[#fff] shadow-sm ring-1 ring-black/5", className)}
      style={{ width: size, height: size }}
    >
      <img src="/logo-mark.webp" alt="" aria-hidden width={size - 6} height={size - 6} style={{ width: size - 6, height: size - 6 }} draggable={false} />
    </span>
  );
}

/** Logo + nombre para el menú lateral (fondo azul oscuro). */
export function BrandLockup({ subtitle = "Análisis visual" }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={38} />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-wide text-white">
          VISION <span className="text-[var(--accent-bright)]">AI</span>
        </p>
        <p className="text-[11px] text-[var(--nav-ink)]">{subtitle}</p>
      </div>
    </div>
  );
}

/** Botón sol/luna para cambiar entre tema claro y oscuro. */
export function ThemeToggle({ className, onDark }: { className?: string; onDark?: boolean }) {
  const [, resolved, setTheme] = useTheme();
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
      className={cx(
        "grid h-9 w-9 place-items-center rounded-lg transition-colors",
        onDark ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
        className,
      )}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
