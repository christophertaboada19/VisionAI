// Gestión de usuarios por el ADMINISTRADOR (Supabase Auth + public.profiles + public.user_invites).
// Flujo seguro: 1) se crea la invitación con el rol (solo admin, por RLS) y 2) se registra la cuenta.
// La base de datos asigna el rol desde la invitación y rechaza cualquier registro sin invitación.
import type { Role, User } from "@/core/domain/entities";
import { createIsolatedAuthClient, supabase } from "./client";

export interface PendingInvite {
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado (frontend/.env).");
  return supabase;
}

/** Traduce los errores de Supabase/PostgreSQL a mensajes claros. */
function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("duplicate")) return "Ese correo ya tiene una cuenta.";
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) return "La contraseña es muy corta o débil (mínimo 8 caracteres, use letras y números).";
  if (m.includes("row-level security") || m.includes("42501") || m.includes("permission")) return "No autorizado: solo un administrador puede crear usuarios.";
  if (m.includes("registro no autorizado")) return "La base de datos rechazó el registro: falta ejecutar backend/supabase/migracion_usuarios.sql o la invitación no se creó.";
  if (m.includes("database error saving new user")) return "Supabase rechazó la cuenta. Verifique que ejecutó backend/supabase/migracion_usuarios.sql.";
  if (m.includes("invalid") && m.includes("email")) return "El correo no es válido.";
  if (m.includes("rate limit")) return "Supabase limitó temporalmente los registros. Espere un minuto e intente de nuevo.";
  return msg;
}

export async function listUsers(): Promise<User[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("profiles").select("id, name, email, role").order("created_at", { ascending: true });
  if (error) throw new Error(friendly(error.message));
  return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), role: (r.role as Role) ?? "operator" }));
}

export async function listInvites(): Promise<PendingInvite[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("user_invites").select("email, name, role, created_at").order("created_at", { ascending: false });
  if (error) return []; // tabla aún no creada (migración pendiente)
  return (data ?? []).map((r) => ({ email: String(r.email), name: String(r.name), role: r.role as Role, createdAt: String(r.created_at) }));
}

export async function cancelInvite(email: string) {
  const sb = requireSupabase();
  const { error } = await sb.from("user_invites").delete().eq("email", email);
  if (error) throw new Error(friendly(error.message));
}

export async function changeUserRole(userId: string, role: Role) {
  const sb = requireSupabase();
  const { error } = await sb.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(friendly(error.message));
}

/**
 * Crea un usuario nuevo. Devuelve `needsEmailConfirmation = true` si el proyecto de Supabase exige
 * confirmar el correo (el usuario debe abrir el enlace que le llega antes de poder entrar).
 */
export async function createUser(input: { name: string; email: string; password: string; role: Role }, invitedBy?: string) {
  const sb = requireSupabase();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new Error("Escriba el nombre completo.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El correo no es válido.");
  if (input.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  // 1) Invitación con el rol (RLS: solo admin)
  const inv = await sb.from("user_invites").upsert({ email, name, role: input.role, invited_by: invitedBy ?? null });
  if (inv.error) {
    if (inv.error.message.includes("user_invites") && inv.error.message.toLowerCase().includes("does not exist")) {
      throw new Error("Falta ejecutar backend/supabase/migracion_usuarios.sql en Supabase (SQL Editor).");
    }
    throw new Error(friendly(inv.error.message));
  }

  // 2) Alta de la cuenta con un cliente aislado (no cierra la sesión del administrador)
  const iso = createIsolatedAuthClient();
  if (!iso) throw new Error("Supabase no está configurado.");
  const { data, error } = await iso.auth.signUp({ email, password: input.password, options: { data: { name } } });
  if (error || !data.user) {
    await sb.from("user_invites").delete().eq("email", email);
    throw new Error(friendly(error?.message ?? "No se pudo crear la cuenta."));
  }
  // Supabase devuelve un usuario "ficticio" sin identidades si el correo ya existía (protección anti-enumeración).
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    await sb.from("user_invites").delete().eq("email", email);
    throw new Error("Ese correo ya tiene una cuenta.");
  }
  void iso.auth.signOut();
  return { userId: data.user.id, needsEmailConfirmation: !data.session };
}
