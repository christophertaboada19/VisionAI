// Selector con "pantallita para elegir": reemplaza al <select> nativo (que se abre como una lista
// del sistema) por un botón con el valor actual que abre una ventana modal con las opciones.
// Mantiene la misma API que <select> (value, onChange(e.target.value), <option> como hijos, id,
// disabled, aria-label, className), así que funciona en todos los módulos sin cambiar su código.
import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface Opt {
  value: string;
  label: string;
  disabled?: boolean;
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/** Extrae las <option> de los hijos (admite fragmentos, arrays y condicionales). */
function collectOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === "option") {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: el.props.disabled });
    } else if (el.props.children) {
      collectOptions(el.props.children, out);
    }
  });
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "multiple"> & {
  value?: string | number | readonly string[];
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
};

export function PickerSelect({ value, onChange, children, className, disabled, id, title, ...rest }: Props) {
  const options = useMemo(() => collectOptions(children), [children]);
  const current = value === undefined || value === null ? "" : String(value);
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const ariaLabel = rest["aria-label"];

  // Título de la ventana: el <label for=id> asociado o el aria-label.
  const [heading, setHeading] = useState<string>("");
  const showSearch = options.length > 7;
  const visible = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  const openPicker = () => {
    if (disabled) return;
    let h = ariaLabel ?? "";
    if (!h && id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      h = lbl?.textContent?.trim() ?? "";
    }
    if (!h) {
      // Etiqueta del <Field> contenedor (div > label + control).
      let node: HTMLElement | null = triggerRef.current?.parentElement ?? null;
      for (let i = 0; node && i < 4 && !h; i++, node = node.parentElement) {
        const lbl = node.querySelector(":scope > label");
        if (lbl?.textContent) h = lbl.textContent.trim();
      }
    }
    setHeading(h);
    setQuery("");
    setCursor(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (o.value !== current) {
      const target = { value: o.value, id } as unknown as HTMLSelectElement;
      onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLSelectElement>);
    }
    close();
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => (showSearch ? searchRef.current : listRef.current)?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, showSearch]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(visible.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = visible[cursor];
      if (o) choose(o);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title ?? selected?.label}
        disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={cx(
          "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-left text-sm text-[var(--ink)] outline-none transition-colors",
          "hover:border-[var(--accent)] focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/20",
          "disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-3)] disabled:hover:border-[var(--border)]",
          className,
        )}
      >
        <span className={cx("min-w-0 flex-1 truncate", !selected && "text-[var(--ink-3)]")}>{selected?.label ?? "Elegir…"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" onKeyDown={onKey}>
            <div className="anim-fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={close} aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={heading ? `Elegir ${heading}` : "Elegir una opción"}
              className="anim-pop-in relative flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-ink)]">Elegir</p>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{heading || "Seleccione una opción"}</p>
                </div>
                <button type="button" onClick={close} className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-white hover:text-[var(--ink)]" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {showSearch && (
                <div className="border-b border-[var(--border)] px-4 py-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setCursor(0);
                      }}
                      placeholder="Buscar…"
                      aria-label="Buscar opción"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              )}

              <ul ref={listRef} tabIndex={-1} role="listbox" className="flex-1 space-y-1 overflow-y-auto p-2 outline-none">
                {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--ink-3)]">Sin coincidencias.</li>}
                {visible.map((o, i) => {
                  const isSel = o.value === current;
                  const isCur = i === cursor;
                  return (
                    <li key={`${o.value}-${i}`} data-idx={i} role="option" aria-selected={isSel}>
                      <button
                        type="button"
                        disabled={o.disabled}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => choose(o)}
                        className={cx(
                          "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          isSel
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]"
                            : isCur
                              ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)]"
                              : "border-transparent text-[var(--ink-2)]",
                        )}
                      >
                        <span
                          className={cx(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                            isSel ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white",
                          )}
                          aria-hidden
                        >
                          {isSel && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">{o.label || "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Selector MÚLTIPLE con pantallita: permite elegir 1, 2, 3 o más opciones.
// values = [] significa "todas" (sin filtrar). Las <option value=""> se ignoran:
// la opción "Todas" la dibuja el propio componente.
// ---------------------------------------------------------------------------
export function MultiSelect({
  values,
  onChange,
  children,
  allLabel = "Todas",
  label,
  className,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  children: ReactNode;
  /** Texto cuando no hay nada elegido (p. ej. "Todas las cámaras"). */
  allLabel?: string;
  /** Título de la pantallita (si no, se toma de aria-label o del <label> del Field). */
  label?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const options = useMemo(() => collectOptions(children).filter((o) => o.value !== ""), [children]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [heading, setHeading] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedSet = new Set(values);
  const chosen = options.filter((o) => selectedSet.has(o.value));
  const showSearch = options.length > 7;
  const visible = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(o.label).includes(q)) : options;
  }, [options, query]);

  const summary = chosen.length === 0 ? allLabel : chosen.length === 1 ? chosen[0].label : `${chosen[0].label} +${chosen.length - 1}`;

  const openPicker = () => {
    if (disabled) return;
    let h = label ?? ariaLabel ?? "";
    if (!h && id) h = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() ?? "";
    if (!h) {
      let node: HTMLElement | null = triggerRef.current?.parentElement ?? null;
      for (let i = 0; node && i < 4 && !h; i++, node = node.parentElement) {
        const lbl = node.querySelector(":scope > label");
        if (lbl?.textContent) h = lbl.textContent.trim();
      }
    }
    setHeading(h);
    setQuery("");
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const toggle = (v: string) => {
    const next = selectedSet.has(v) ? values.filter((x) => x !== v) : [...values, v];
    // Se mantiene el orden de las opciones; marcar todas equivale a "todas" (sin filtro).
    const ordered = options.map((o) => o.value).filter((x) => next.includes(x));
    onChange(ordered.length === options.length ? [] : ordered);
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open]);

  const box = (on: boolean) =>
    cx("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--border)] bg-white");
  const row = (on: boolean) =>
    cx(
      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-40",
      on ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]" : "border-transparent text-[var(--ink-2)] hover:bg-[var(--surface-2)]",
    );

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={chosen.map((o) => o.label).join(", ") || allLabel}
        disabled={disabled}
        onClick={openPicker}
        className={cx(
          "inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm outline-none transition-colors",
          chosen.length ? "border-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--border)] text-[var(--ink)]",
          "hover:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/20 disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-3)]",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {chosen.length > 1 && <span className="tabular shrink-0 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">{chosen.length}</span>}
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <div className="anim-fade-in absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={close} aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={heading ? `Elegir ${heading}` : "Elegir opciones"}
              className="anim-pop-in relative flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-ink)]">Elegir una o varias</p>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{heading || "Seleccione opciones"}</p>
                </div>
                <button type="button" onClick={close} className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-white hover:text-[var(--ink)]" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {showSearch && (
                <div className="border-b border-[var(--border)] px-4 py-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar…"
                      aria-label="Buscar opción"
                      className="h-9 w-full rounded-lg border border-[var(--border)] bg-white pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              )}

              <ul role="listbox" aria-multiselectable="true" className="flex-1 space-y-1 overflow-y-auto p-2">
                <li>
                  <button type="button" onClick={() => onChange([])} className={row(values.length === 0)}>
                    <span className={box(values.length === 0)} aria-hidden>
                      {values.length === 0 && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1">{allLabel}</span>
                  </button>
                </li>
                <li className="mx-3 my-1 border-t border-[var(--border)]" aria-hidden />
                {visible.length === 0 && <li className="px-3 py-6 text-center text-sm text-[var(--ink-3)]">Sin coincidencias.</li>}
                {visible.map((o) => {
                  const on = selectedSet.has(o.value);
                  return (
                    <li key={o.value} role="option" aria-selected={on}>
                      <button type="button" disabled={o.disabled} onClick={() => toggle(o.value)} className={row(on)}>
                        <span className={box(on)} aria-hidden>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">{o.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <span className="tabular text-xs text-[var(--ink-3)]">
                  {values.length === 0 ? "Sin filtro: se incluyen todas" : `${values.length} seleccionada${values.length === 1 ? "" : "s"}`}
                </span>
                <div className="flex gap-2">
                  {values.length > 0 && (
                    <button type="button" onClick={() => onChange([])} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] hover:bg-white">
                      Limpiar
                    </button>
                  )}
                  <button type="button" onClick={close} className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]">
                    Listo
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
