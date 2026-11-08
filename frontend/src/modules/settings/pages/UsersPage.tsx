// Administración de usuarios: solo el ADMINISTRADOR crea cuentas y asigna roles (no hay registro libre
// ni usuarios de prueba). Cada alta pasa por una invitación con el rol que valida la base de datos.
import { useCallback, useEffect, useState } from "react";
import { Check, Clock, Database, Eye, EyeOff, Minus, RefreshCw, Shield, UserPlus, X } from "lucide-react";
import { useUser } from "@/app/providers/SessionProvider";
import { useToast } from "@/app/providers/ToastProvider";
import { ROLE_LABEL, type Role, type User } from "@/core/domain/entities";
import { can, type Action } from "@/core/domain/permissions";
import { isSupabaseConfigured } from "@/infrastructure/supabase/client";
import { cancelInvite, changeUserRole, createUser, listInvites, listUsers, type PendingInvite } from "@/infrastructure/supabase/userAdmin";
import { Button, Card, CardHeader, Field, Input, Notice, PageHeader, Select } from "@/shared/ui";

const ACTIONS: [Action, string][] = [
  ["analysis.run", "Ejecutar análisis (INSERT analyses)"],
  ["analysis.observe", "Registrar observaciones (UPDATE analyses)"],
  ["alert.review", "Marcar alertas revisadas (UPDATE alerts -> reviewed)"],
  ["alert.close", "Cerrar / asignar alertas (UPDATE alerts -> closed)"],
  ["alert.reopen", "Reabrir alertas"],
  ["history.export", "Exportar reportes (SELECT)"],
  ["admin.manage", "Administración: usuarios, reglas, clases, escenarios y ajustes"],
];
const ROLES: Role[] = ["admin", "supervisor", "operator", "auditor"];
const ROLE_HINT: Record<Role, string> = {
  admin: "Control total, incluida la gestión de usuarios",
  supervisor: "Analiza, revisa, cierra y reabre alertas",
  operator: "Analiza y marca alertas como revisadas",
  auditor: "Solo lectura y exportación",
};

/** Genera una contraseña segura de 12 caracteres (letras, números y símbolo). */
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const arr = new Uint32Array(11);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => chars[n % chars.length]).join("") + "!";
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function UsersPage() {
  const me = useUser();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: generatePassword(), role: "operator" as Role });
  const [showPass, setShowPass] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string; needsConfirm: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const [u, i] = await Promise.all([listUsers(), listInvites()]);
      setUsers(u);
      setInvites(i);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const admins = users.filter((u) => u.role === "admin");

  const changeRole = async (u: User, newRole: Role) => {
    if (u.role === "admin" && newRole !== "admin" && admins.length <= 1) {
      toast({ kind: "warning", title: "Debe quedar al menos un administrador", description: "Cree otro administrador antes de cambiar este rol." });
      return;
    }
    const prev = users;
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role: newRole } : x)));
    try {
      await changeUserRole(u.id, newRole);
      toast({ kind: "success", title: "Rol actualizado", description: `${u.name} ahora es ${ROLE_LABEL[newRole]}.` });
    } catch (e) {
      setUsers(prev);
      toast({ kind: "error", title: "No se pudo cambiar el rol", description: (e as Error).message });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await createUser(form, me.id);
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password, needsConfirm: r.needsEmailConfirmation });
      toast({ kind: "success", title: `Usuario creado: ${form.name}`, description: `${ROLE_LABEL[form.role]} · ${form.email}` });
      setForm({ name: "", email: "", password: generatePassword(), role: "operator" });
      setShowForm(false);
      await reload();
    } catch (err) {
      toast({ kind: "error", title: "No se pudo crear el usuario", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description="Solo un administrador puede crear cuentas y asignar roles. No existe registro libre ni usuarios de prueba."
        actions={
          isSupabaseConfigured && (
            <div className="flex flex-wrap gap-2">
              <Button icon={RefreshCw} onClick={() => void reload()}>
                Actualizar
              </Button>
              <Button variant="primary" icon={showForm ? X : UserPlus} onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Cerrar formulario" : "Agregar usuario"}
              </Button>
            </div>
          )
        }
      />

      {!isSupabaseConfigured && (
        <div className="mb-4">
          <Notice tone="warning" icon={Database} title="Supabase no está configurado">
            Configure VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en frontend/.env para administrar usuarios.
          </Notice>
        </div>
      )}
      {loadError && (
        <div className="mb-4">
          <Notice tone="error" title="No se pudieron cargar los usuarios">{loadError}</Notice>
        </div>
      )}

      {created && (
        <div className="mb-4">
          <Notice tone="success" title={`Cuenta creada para ${created.email}`}>
            <p>
              Entregue estos datos a la persona (la contraseña no se vuelve a mostrar): <strong>Correo:</strong> {created.email} · <strong>Contraseña:</strong>{" "}
              <code className="rounded bg-[var(--surface)] px-1.5 py-0.5">{created.password}</code>
            </p>
            {created.needsConfirm && (
              <p className="mt-1">
                Su proyecto de Supabase exige confirmar el correo: la persona debe abrir el enlace que le llegó antes de poder entrar (o desactive «Confirm email» en Supabase).
              </p>
            )}
            <button type="button" className="mt-1 text-xs font-semibold underline" onClick={() => setCreated(null)}>
              Ocultar
            </button>
          </Notice>
        </div>
      )}

      {showForm && (
        <Card className="mb-4 border-[var(--accent)]">
          <CardHeader title="Agregar usuario" subtitle="La cuenta queda lista para iniciar sesión con el rol elegido." icon={UserPlus} />
          <form onSubmit={submit} className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nombre completo" htmlFor="nu-name">
                <Input id="nu-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Ana Pérez" className="w-full" />
              </Field>
              <Field label="Correo electrónico" htmlFor="nu-email">
                <Input id="nu-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ana@empresa.com" className="w-full" />
              </Field>
              <Field label="Contraseña inicial (mín. 8 caracteres)" htmlFor="nu-pass">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="nu-pass"
                      type={showPass ? "text" : "password"}
                      required
                      minLength={8}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full pr-9 font-mono"
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ink-3)]" aria-label={showPass ? "Ocultar" : "Mostrar"}>
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" icon={RefreshCw} onClick={() => setForm({ ...form, password: generatePassword() })} title="Generar otra contraseña segura">
                    Generar
                  </Button>
                </div>
              </Field>
              <Field label="Rol" htmlFor="nu-role">
                <Select id="nu-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className="w-full">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]} — {ROLE_HINT[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" icon={UserPlus} loading={saving}>
                Crear usuario
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Usuarios (${users.length})`} subtitle={`${admins.length} administrador${admins.length === 1 ? "" : "es"}`} icon={Shield} />
          {loading ? (
            <p className="p-5 text-sm text-[var(--ink-3)]">Cargando usuarios…</p>
          ) : users.length === 0 ? (
            <p className="p-5 text-sm text-[var(--ink-3)]">No hay usuarios registrados.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--nav)] text-xs font-semibold text-white" aria-hidden>
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {u.name} {u.id === me.id && <span className="text-xs font-normal text-[var(--accent-ink)]">(usted)</span>}
                    </p>
                    <p className="truncate text-xs text-[var(--ink-3)]">{u.email}</p>
                  </div>
                  <Select aria-label={`Rol de ${u.name}`} value={u.role} onChange={(e) => void changeRole(u, e.target.value as Role)} className="h-8 w-40 text-xs">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          )}
          {invites.length > 0 && (
            <div className="border-t border-[var(--border)]">
              <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Invitaciones sin completar</p>
              <ul className="divide-y divide-[var(--border)]">
                {invites.map((i) => (
                  <li key={i.email} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <Clock className="h-4 w-4 text-[var(--warning)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {i.name} · {i.email} · {ROLE_LABEL[i.role]}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={X}
                      onClick={async () => {
                        await cancelInvite(i.email).catch(() => {});
                        void reload();
                      }}
                    >
                      Cancelar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Qué puede hacer cada rol" subtitle="Aplicado en la interfaz y en las políticas RLS de PostgreSQL" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                  <th className="px-4 py-2 text-left">Acción</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-2 text-center">
                      {ROLE_LABEL[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {ACTIONS.map(([a, l]) => (
                  <tr key={a}>
                    <td className="px-4 py-2">{l}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center">
                        {can(r, a) ? (
                          <Check className="mx-auto h-4 w-4 text-[var(--good-ink)]" aria-label="Permitido" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-[var(--ink-3)]" aria-label="No permitido" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
