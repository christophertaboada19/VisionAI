import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Database, Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useSession } from "@/app/providers/SessionProvider";
import { Button, cx, Field, Input, Notice } from "@/shared/ui";
import { LogoMark, ThemeToggle } from "@/shared/ui/Brand";

/** Traduce los errores de Supabase Auth al español. */
function loginError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Su correo aún no está confirmado: abra el enlace que le llegó por correo.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espere un minuto e intente de nuevo.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión con el servidor de autenticación. Revise su internet.";
  return msg;
}

export function LoginPage() {
  const { user, supabaseEnabled, loginWithPassword } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await loginWithPassword(email, password);
      nav((loc.state as { from?: string } | null)?.from ?? "/", { replace: true });
    } catch (err) {
      setError(loginError((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.08fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[var(--nav)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark size={52} />
          <span className="text-xl font-bold tracking-wide">
            VISION <span className="text-[var(--accent-bright)]">AI</span>
          </span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">Plataforma inteligente de análisis visual</h1>
          <p className="mt-4 text-[var(--nav-ink)]">
            Monitoreo en tiempo real con OpenCV + Deep Learning (YOLO y CNN) conectado a PostgreSQL en Supabase con políticas de seguridad por fila (Row Level Security).
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Seguridad Industrial (EPP)", "Detección de casco y chaleco reflectivo"],
              ["Control de Calidad", "Botella sana vs. botella malograda (CNN)"],
              ["Objetos abandonados", "Mochilas y maletas sin dueño"],
              ["Monitoreo Vial", "Cámaras públicas y zonas restringidas"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="font-semibold text-[var(--accent-bright)]">{t}</p>
                <p className="mt-1 text-xs text-[var(--nav-ink)]">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-[#7f97b2]">
          <Database className="h-4 w-4 text-[var(--accent-bright)]" />
          <span>{supabaseEnabled ? "Conectado a Supabase Auth + PostgreSQL RLS" : "Supabase no configurado (frontend/.env)"}</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center px-4 py-8 sm:px-8">
        <ThemeToggle className="absolute right-3 top-3" />
        <div className="anim-fade-in w-full max-w-md">
          {/* Logo completo (en celular el panel azul de la izquierda no se muestra) */}
          <div className="mb-6 flex justify-center lg:hidden">
            <span className="rounded-2xl bg-[#fff] px-5 py-3 shadow-sm ring-1 ring-black/5">
              <img src="/logo-full.webp" alt="VISION AI" className="h-24 w-auto" draggable={false} />
            </span>
          </div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">Iniciar sesión</h2>
            <span
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                supabaseEnabled ? "bg-[var(--good-soft)] text-[var(--good-ink)]" : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
              )}
            >
              <Database className="h-3.5 w-3.5" />
              {supabaseEnabled ? "Conexión segura" : "Sin Supabase"}
            </span>
          </div>
          <p className="mb-6 text-sm text-[var(--ink-3)]">Ingrese con la cuenta que le entregó el administrador del sistema.</p>

          {!supabaseEnabled && (
            <div className="mb-4">
              <Notice tone="warning" title="Falta conectar Supabase">
                Configure VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env para iniciar sesión.
              </Notice>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Field label="Correo electrónico" htmlFor="email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden />
                <Input id="email" type="email" autoComplete="username" required className="w-full pl-9" placeholder="usuario@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" aria-hidden />
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--ink-3)] hover:text-[var(--ink)]"
                  aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" variant="primary" size="lg" loading={busy} icon={ArrowRight} className="w-full" disabled={!supabaseEnabled}>
              Ingresar al sistema
            </Button>
          </form>

          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--ink-3)]">
            <p className="flex items-start gap-2">
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span>¿No tiene cuenta? Solicítela a un administrador: las cuentas se crean en <strong className="text-[var(--ink-2)]">Administración › Usuarios</strong>.</span>
            </p>
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span>Las reglas Row Level Security (RLS) de PostgreSQL en Supabase validan su sesión en cada lectura y escritura.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
