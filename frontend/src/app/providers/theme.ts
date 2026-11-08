// Tema claro / oscuro / según el sistema. Se guarda en el navegador y se aplica en <html data-theme>.
// Todos los colores de la interfaz salen de variables CSS, así que cambiar el tema cambia toda la página.
import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "visionai:theme";
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

let choice: ThemeChoice = typeof window === "undefined" ? "light" : readChoice();
const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;

export const resolvedTheme = (c: ThemeChoice = choice): "light" | "dark" => (c === "system" ? (media?.matches ? "dark" : "light") : c);

function apply(animate: boolean) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  }
  const t = resolvedTheme();
  root.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#070f1c" : "#0b2a4a");
  listeners.forEach((l) => l());
}

export function setTheme(c: ThemeChoice) {
  choice = c;
  try {
    window.localStorage.setItem(KEY, c);
  } catch {
    /* modo privado */
  }
  apply(true);
}

media?.addEventListener?.("change", () => choice === "system" && apply(true));
if (typeof document !== "undefined") apply(false);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** [elección, tema efectivo, setter] */
export function useTheme(): [ThemeChoice, "light" | "dark", (c: ThemeChoice) => void] {
  const c = useSyncExternalStore(subscribe, () => choice, () => "light" as ThemeChoice);
  const resolved = useSyncExternalStore(subscribe, () => resolvedTheme(), () => "light" as const);
  return [c, resolved, setTheme];
}
