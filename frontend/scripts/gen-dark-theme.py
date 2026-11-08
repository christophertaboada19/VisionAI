"""
Genera src/styles/theme-dark.css: la versión OSCURA de las clases de color "claras" fijas que usa la app
(bg-white, bg-red-50, text-emerald-700, border-sky-200, border-[#efb9b9], etc.).

La mayor parte de la interfaz usa variables (--surface, --ink, --border...) que ya cambian solas con el
tema; este archivo cubre solo los colores escritos a mano. Volver a ejecutarlo si se añaden clases nuevas:
    python scripts/gen-dark-theme.py
"""

from __future__ import annotations

import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "src")
OUT = os.path.join(ROOT, "styles", "theme-dark.css")
SCOPE = ':root[data-theme="dark"]'

# Tonos "-500" de Tailwind para mezclar fondos/bordes de color en oscuro.
HUE_500 = {
    "red": "#ef4444", "rose": "#f43f5e", "orange": "#f97316", "amber": "#f59e0b", "yellow": "#eab308",
    "emerald": "#10b981", "green": "#22c55e", "teal": "#14b8a6", "cyan": "#06b6d4", "sky": "#0ea5e9",
    "blue": "#3b82f6", "indigo": "#6366f1", "violet": "#8b5cf6", "purple": "#a855f7", "pink": "#ec4899",
}
# Texto de color legible sobre fondo oscuro (tono -300).
HUE_300 = {
    "red": "#fca5a5", "rose": "#fda4af", "orange": "#fdba74", "amber": "#fcd34d", "yellow": "#fde047",
    "emerald": "#6ee7b7", "green": "#86efac", "teal": "#5eead4", "cyan": "#67e8f9", "sky": "#7dd3fc",
    "blue": "#93c5fd", "indigo": "#a5b4fc", "violet": "#c4b5fd", "purple": "#d8b4fe", "pink": "#f9a8d4",
}
NEUTRAL = ("slate", "gray", "zinc", "neutral", "stone")

TOKEN = re.compile(
    r"(?<![\w-])((?:hover:|focus:|disabled:|group-hover:)?)(bg|text|border|ring|divide)-"
    r"(white|black|(?:%s|%s)-(?:50|100|200|300|400|500|600|700|800|900|950)|\[#[0-9a-fA-F]{3,8}\])"
    r"(?:/(\d+))?(?![\w-])" % ("|".join(NEUTRAL), "|".join(HUE_500))
)


def esc(cls: str) -> str:
    return re.sub(r"([:/\[\]#.])", r"\\\1", cls)


def hex_lum(h: str) -> float:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def mapping(prop: str, color: str, alpha: str | None):
    """Devuelve el valor CSS oscuro, o None si la clase ya funciona bien en oscuro."""
    a = f" {alpha}%" if alpha else ""
    if color.startswith("["):
        hx = color[1:-1]
        if hx.lower() in ("#fff", "#ffffff"):  # blanco intencional y constante (placa del logo, interruptores)
            return None
        if hex_lum(hx) < 0.45:  # ya es un color oscuro (paneles de video, menú): se deja igual
            return None
        if prop == "bg":
            return f"color-mix(in srgb, {hx} 18%, var(--surface))"
        if prop in ("border", "ring", "divide"):
            return f"color-mix(in srgb, {hx} 35%, var(--border))"
        return None
    if color == "white":
        if prop == "bg":
            return f"color-mix(in srgb, var(--surface){a or ' 100%'}, transparent)" if alpha else "var(--surface)"
        return None  # text-white / border-white: se mantienen (texto sobre botones de color)
    if color == "black":
        return None
    name, tone = color.rsplit("-", 1)
    tone = int(tone)
    if name in NEUTRAL:
        if prop == "bg":
            if tone <= 50:
                return "var(--surface-2)" if not alpha else f"color-mix(in srgb, var(--surface-2) {alpha}%, transparent)"
            if tone <= 100:
                return "var(--surface-2)"
            if tone <= 300:
                return "#2a3a52"
            return None  # 400+ ya son oscuros/medios
        if prop == "text":
            if tone >= 800:
                return "var(--ink)"
            if tone >= 600:
                return "var(--ink-2)"
            return None
        if prop in ("border", "ring", "divide") and tone <= 300:
            return "var(--border)"
        return None
    base, light = HUE_500[name], HUE_300[name]
    if prop == "bg" and tone <= 200:
        return f"color-mix(in srgb, {base} {14 if tone <= 50 else 22}%, var(--surface))"
    if prop == "text" and tone >= 600:
        return light
    if prop in ("border", "ring", "divide") and tone <= 400:
        return f"color-mix(in srgb, {base} 45%, var(--border))"
    return None


PROP_CSS = {"bg": "background-color", "text": "color", "border": "border-color", "ring": "--tw-ring-color", "divide": "border-color"}

found: set[tuple[str, str, str, str | None]] = set()
for root, _, files in os.walk(ROOT):
    for f in files:
        if f.endswith((".tsx", ".ts")):
            for m in TOKEN.finditer(open(os.path.join(root, f), encoding="utf-8").read()):
                found.add((m.group(1), m.group(2), m.group(3), m.group(4)))

rules = []
for variant, prop, color, alpha in sorted(found, key=lambda t: tuple(x or "" for x in t)):
    val = mapping(prop, color, alpha)
    if not val:
        continue
    cls = f"{variant}{prop}-{color}" + (f"/{alpha}" if alpha else "")
    sel = f".{esc(cls)}"
    if variant == "hover:":
        sel += ":hover"
    elif variant == "focus:":
        sel += ":focus"
    elif variant == "disabled:":
        sel += ":disabled"
    elif variant == "group-hover:":
        sel = f".group:hover .{esc(cls)}"
    if prop == "divide":
        sel += " > :not(:last-child)"
    rules.append(f"{SCOPE} {sel} {{ {PROP_CSS[prop]}: {val}; }}")

header = "/* ARCHIVO GENERADO por scripts/gen-dark-theme.py — no editar a mano. */\n"
open(OUT, "w", encoding="utf-8").write(header + "\n".join(rules) + "\n")
print(f"{len(rules)} reglas de tema oscuro generadas en {os.path.relpath(OUT)}")
