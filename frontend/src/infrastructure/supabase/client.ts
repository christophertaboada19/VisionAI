// Cliente Supabase para autenticación (Supabase Auth) y persistencia con Row Level Security (RLS).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? "";

export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith("http"));

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Cliente AISLADO (sin guardar sesión) para que un administrador cree cuentas nuevas:
 * `signUp` con el cliente normal cerraría la sesión del admin e iniciaría la del usuario nuevo.
 */
export function createIsolatedAuthClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "visionai-admin-signup" },
  });
}
