import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { useSession, useUser } from "@/app/providers/SessionProvider";
import { ROLE_LABEL } from "@/core/domain/entities";
import { useAlerts, useCameras, useEvents } from "@/shared/hooks/useRepository";
import { cameraMatches, NO_CAMERA, useCameraFilter, useCameraResolver } from "@/shared/camera/cameraFilter";
import { cx, DemoBadge, fmtRelative, MultiSelect } from "@/shared/ui";
import { visionEngine } from "@/app/providers/container";
import { NAV, breadcrumbsFor } from "./navigation";
import { BrandLockup, ThemeToggle } from "@/shared/ui/Brand";
import { BackendWakeBanner } from "@/shared/ui/BackendWakeBanner";

function Logo() {
  return <BrandLockup />;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useUser();
  const loc = useLocation();
  const isMosaic = loc.pathname === "/analisis/en-vivo" && new URLSearchParams(loc.search).get("vista") === "mosaico";
  // "Monitoreo general" y "Monitoreo por cámara" comparten ruta: se distinguen por ?vista=mosaico.
  const activeFor = (to: string, isActive: boolean) =>
    to === "/analisis/en-vivo?vista=mosaico" ? isMosaic : to === "/analisis/en-vivo" ? isActive && !isMosaic : isActive;
  const alerts = useAlerts();
  const open = alerts.filter((a) => a.status === "new").length;
  return (
    <nav className="flex h-full flex-col bg-[var(--nav)] text-[var(--nav-ink)]" aria-label="Navegación principal">
      <div className="px-5 py-5"><Logo /></div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.filter((g) => !g.roles || g.roles.includes(user.role)).map((g) => (
          <div key={g.label}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#7f97b2]">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => (
                <li key={i.to}>
                  <NavLink
                    to={i.to}
                    end={i.end}
                    onClick={onNavigate}
                    className={({ isActive: rawActive }) => {
                      const isActive = activeFor(i.to, rawActive);
                      return cx(
                        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive ? "bg-[var(--nav-2)] font-medium text-white shadow-[inset_3px_0_0_var(--accent-bright)]" : "hover:bg-[var(--nav-2)]/60 hover:text-white",
                      );
                    }}
                  >
                    {({ isActive: rawActive }) => (
                      <>
                        <i.icon className={cx("h-4 w-4", activeFor(i.to, rawActive) ? "text-[var(--accent-bright)]" : "text-[#7f97b2] group-hover:text-[var(--nav-ink)]")} aria-hidden />
                        <span className="flex-1">{i.label}</span>
                        {i.to === "/operaciones/alertas" && open > 0 && (
                          <span className="rounded-full bg-[var(--critical)] px-1.5 text-[11px] font-semibold text-white" aria-label={`${open} alertas nuevas`}>{open}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-[#7f97b2]">
        Motor: <span className="font-semibold text-[var(--nav-ink)]">{visionEngine.kind === "DEMO" ? "DemoVisionAdapter (simulado)" : "API de visión real"}</span>
      </div>
    </nav>
  );
}

function NotificationsMenu() {
  const allEvents = useEvents();
  const cameras = useCameras();
  const [camF, setCamF] = useCameraFilter();
  const cam = useCameraResolver();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  // Las notificaciones respetan la cámara elegida (filtro global compartido con todos los módulos).
  const events = allEvents.filter((e) => cameraMatches(camF, cam.ofEvent(e)));
  const unread = events.filter((e) => new Date(e.at).getTime() > seenAt && e.type !== "session").length;
  useEffect(() => {
    // No cerrar si el clic ocurre dentro de una pantallita para elegir (se dibuja fuera del menú).
    const h = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element)?.closest?.('[aria-modal="true"]') && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const dot = { info: "bg-[var(--accent)]", success: "bg-[var(--good)]", warning: "bg-[var(--warning)]", error: "bg-[var(--critical)]" };
  return (
    <div className="relative" ref={ref}>
      <button
        className="relative rounded-lg p-2 text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
        aria-label={`Notificaciones${unread ? `, ${unread} nuevas` : ""}`}
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setSeenAt(Date.now()); }}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="anim-pulse absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-[var(--critical)]" />}
      </button>
      {open && (
        <div className="anim-pop-in absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            <Link to="/actividad" className="text-xs font-medium text-[var(--accent-ink)] hover:underline" onClick={() => setOpen(false)}>Ver todo</Link>
          </div>
          <div className="border-b border-[var(--border)] px-4 py-2">
            <MultiSelect values={camF} onChange={setCamF} aria-label="Cámaras de las notificaciones" allLabel="Todas las cámaras" className="w-full text-xs">
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.notifyMobile === false ? " (celular silenciado)" : ""}</option>
              ))}
              <option value={NO_CAMERA}>Imágenes subidas</option>
            </MultiSelect>
          </div>
          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
            {events.length === 0 && <li className="px-4 py-6 text-center text-xs text-[var(--ink-3)]">Sin notificaciones para esta cámara.</li>}
            {events.slice(0, 8).map((e) => {
              const c = cam.ofEvent(e);
              return (
              <li key={e.id} className="flex gap-2.5 px-4 py-2.5">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[e.level])} aria-hidden />
                <div className="min-w-0">
                  {c && (
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent-ink)]">
                      {c === NO_CAMERA ? "🖼️ Imagen subida" : `📹 ${cam.name(c)}`}
                    </p>
                  )}
                  <p className="text-[13px] text-[var(--ink)]">{e.message}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">{e.user} · {fmtRelative(e.at)}</p>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  const { logout } = useSession();
  const user = useUser();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { search } = useLocation();
  const isMosaicView = pathname === "/analisis/en-vivo" && new URLSearchParams(search).get("vista") === "mosaico";
  const crumbs = isMosaicView ? [{ label: "Análisis visual" }, { label: "Monitoreo general" }] : breadcrumbsFor(pathname);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block"><Sidebar /></aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="anim-slide-up absolute inset-y-0 left-0 w-72"><Sidebar onNavigate={() => setMobileOpen(false)} /></div>
          <button className="absolute right-3 top-3 rounded-lg bg-white p-2" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border)] bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-[var(--ink-2)] hover:bg-[var(--surface-2)] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Ruta de navegación" className="hidden min-w-0 flex-1 sm:block">
            <ol className="flex items-center gap-1.5 text-sm text-[var(--ink-3)]">
              {crumbs.map((c, i) => (
                <li key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  {c.to && i < crumbs.length - 1 ? (
                    <Link to={c.to} className="truncate hover:text-[var(--ink)]">{c.label}</Link>
                  ) : (
                    <span className={cx("truncate", i === crumbs.length - 1 && "font-medium text-[var(--ink)]")}>{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex-1 sm:hidden" />
          {visionEngine.kind === "DEMO" ? <DemoBadge /> : <span className="rounded-md bg-[var(--good-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--good-ink)]">MODO REAL</span>}
          <ThemeToggle />
          <NotificationsMenu />
          <div className="flex items-center gap-2 border-l border-[var(--border)] pl-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--nav)] text-xs font-semibold text-white" aria-hidden>
              {user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
            <div className="hidden leading-tight md:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-[11px] text-[var(--ink-3)]">{ROLE_LABEL[user.role]}</p>
            </div>
            <button className="rounded-lg p-2 text-[var(--ink-3)] hover:bg-[var(--surface-2)]" onClick={() => { logout(); nav("/login"); }} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <BackendWakeBanner />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
