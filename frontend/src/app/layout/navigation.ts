import {
  Activity, Bell, Boxes, Download, Eye, History, Layers, LayoutDashboard, ScanSearch, Settings, Shapes, SlidersHorizontal,
  Sparkles, Users, Workflow, Images, Radio, LayoutGrid, type LucideIcon,
} from "lucide-react";
import type { Role } from "@/core/domain/entities";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Resumen", icon: LayoutDashboard,
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/actividad", label: "Actividad reciente", icon: Activity },
    ],
  },
  {
    label: "Análisis visual", icon: ScanSearch,
    items: [
      { to: "/analisis", label: "Nuevo análisis", icon: ScanSearch, end: true },
      { to: "/analisis/en-vivo?vista=mosaico", label: "Monitoreo general", icon: LayoutGrid },
      { to: "/analisis/en-vivo", label: "Monitoreo por cámara", icon: Radio },
      { to: "/analisis/escenarios", label: "Galería de escenarios", icon: Images },
    ],
  },
  {
    label: "Visión IA", icon: Eye,
    items: [
      { to: "/vision/detecciones", label: "Detecciones", icon: Boxes },
      { to: "/vision/segmentacion", label: "Segmentación", icon: Layers },
      { to: "/vision/patrones", label: "Patrones", icon: Sparkles },
    ],
  },
  {
    label: "Operaciones", icon: Bell,
    items: [
      { to: "/operaciones/alertas", label: "Alertas", icon: Bell },
      { to: "/operaciones/historial", label: "Historial", icon: History },
      { to: "/operaciones/exportaciones", label: "Exportaciones", icon: Download },
    ],
  },
  {
    label: "Administración", icon: Settings, roles: ["admin"],
    items: [
      { to: "/admin/escenarios", label: "Escenarios", icon: Images },
      { to: "/admin/clases", label: "Clases", icon: Shapes },
      { to: "/admin/reglas", label: "Reglas", icon: Workflow },
      { to: "/admin/usuarios", label: "Usuarios", icon: Users },
      { to: "/admin/configuracion", label: "Configuración", icon: SlidersHorizontal },
    ],
  },
];

/** Breadcrumbs a partir de la ruta actual. */
export function breadcrumbsFor(pathname: string): { label: string; to?: string }[] {
  if (pathname === "/") return [{ label: "Resumen" }, { label: "Dashboard" }];
  const result = pathname.match(/^\/analisis\/(?!escenarios$|en-vivo$)([^/]+)$/);
  if (result) return [{ label: "Análisis visual" }, { label: "Historial", to: "/operaciones/historial" }, { label: decodeURIComponent(result[1]) }];
  for (const g of NAV) {
    const item = [...g.items].sort((a, b) => b.to.length - a.to.length).find((i) => i.to !== "/" && (pathname === i.to || pathname.startsWith(`${i.to}/`)));
    if (item) {
      const crumbs: { label: string; to?: string }[] = [{ label: g.label }, { label: item.label, to: item.to }];
      const rest = pathname.slice(item.to.length).replace(/^\//, "");
      if (rest) crumbs.push({ label: decodeURIComponent(rest) });
      return crumbs;
    }
  }
  if (pathname.startsWith("/analisis/")) return [{ label: "Análisis visual" }, { label: "Resultado", to: "/analisis" }, { label: pathname.split("/")[2] }];
  return [{ label: "VISION AI" }];
}
