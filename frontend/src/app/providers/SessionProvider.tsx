import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Role, User } from "@/core/domain/entities";
import { isSupabaseConfigured, supabase } from "@/infrastructure/supabase/client";
import { repository } from "./container";

interface SessionCtx {
  user: User | null;
  loading: boolean;
  supabaseEnabled: boolean;
  /** Inicio de sesión por ID de perfil (respaldo local o acceso directo). */
  /** Inicio de sesión real con correo y contraseña contra Supabase Auth + RLS. */
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);
const KEY = "visionai:session";

function readLocalSession(): User | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) return JSON.parse(raw) as User;
    return null;
  } catch {
    return null;
  }
}

function saveLocalSession(u: User | null) {
  try {
    if (u) window.sessionStorage.setItem(KEY, JSON.stringify(u));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignorado */
  }
}

async function fetchProfileFromSupabase(uid: string, email: string, meta?: Record<string, unknown>): Promise<User> {
  if (supabase) {
    const { data } = await supabase.from("profiles").select("id, name, email, role").eq("id", uid).maybeSingle();
    if (data) {
      return {
        id: String(data.id),
        name: String(data.name || email.split("@")[0]),
        email: String(data.email || email),
        role: (data.role as Role) ?? "operator",
      };
    }
  }
  // Sin perfil en la base de datos: se entra con el rol de menor privilegio (nunca se confía en el navegador).
  return { id: uid, name: String(meta?.name ?? email.split("@")[0]), email, role: "operator" };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readLocalSession);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session?.user) {
        const su = data.session.user;
        const profile = await fetchProfileFromSupabase(su.id, su.email ?? "", su.user_metadata);
        if (mounted) {
          setUser(profile);
          saveLocalSession(profile);
          void repository.syncFromRemote();
        }
      }
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        const su = session.user;
        const profile = await fetchProfileFromSupabase(su.id, su.email ?? "", su.user_metadata);
        if (mounted) {
          setUser(profile);
          saveLocalSession(profile);
          void repository.syncFromRemote();
        }
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!supabase) {
      throw new Error("Supabase no está configurado: agregue VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (error || !data.user) {
      throw new Error(error?.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : (error?.message ?? "No se pudo iniciar sesión en Supabase."));
    }
    const profile = await fetchProfileFromSupabase(data.user.id, data.user.email ?? cleanEmail, data.user.user_metadata);
    setUser(profile);
    saveLocalSession(profile);
    await repository.syncFromRemote();
    repository.addEvent({
      id: `EV-${Date.now()}`,
      at: new Date().toISOString(),
      user: profile.name,
      type: "session",
      level: "info",
      message: `Sesión autenticada con Supabase Auth + RLS (${profile.role}).`,
    });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    saveLocalSession(null);
    if (supabase) {
      void supabase.auth.signOut();
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, supabaseEnabled: isSupabaseConfigured, loginWithPassword, logout }),
    [user, loading, loginWithPassword, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession fuera de SessionProvider");
  return c;
}

/** Usuario autenticado (las rutas protegidas garantizan que existe). */
export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error("Sesión requerida");
  return user;
}
