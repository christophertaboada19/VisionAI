-- =============================================================================
-- VISION AI — Migración de USUARIOS (ejecutar UNA vez en Supabase > SQL Editor)
--
-- Qué cambia:
--   1. Ya no hay registro libre: solo se puede crear una cuenta si un ADMINISTRADOR la invitó
--      (tabla public.user_invites). El rol lo decide la invitación, nunca el navegador.
--   2. Nadie puede cambiarse su propio rol: solo un administrador cambia roles.
--   3. (Paso final, opcional) Borrar los 4 usuarios de prueba (admin@visionai.pe, etc.).
--
-- Es seguro ejecutarlo varias veces.
-- =============================================================================

-- 1) Invitaciones: el administrador registra aquí el correo, nombre y rol del nuevo usuario.
create table if not exists public.user_invites (
  email text primary key,
  name text not null,
  role text not null check (role in ('admin', 'supervisor', 'operator', 'auditor')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.user_invites enable row level security;

drop policy if exists "user_invites_admin_all" on public.user_invites;
create policy "user_invites_admin_all" on public.user_invites
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 2) Alta de cuentas: solo con invitación; el rol sale de la invitación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.user_invites%rowtype;
begin
  select * into inv from public.user_invites where lower(email) = lower(coalesce(new.email, ''));
  if not found then
    raise exception 'Registro no autorizado: solo un administrador de VISION AI puede crear cuentas (invite primero el correo %).', new.email
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, name, role)
  values (new.id, coalesce(new.email, ''), inv.name, inv.role)
  on conflict (id) do update set email = excluded.email, name = excluded.name, role = excluded.role;

  delete from public.user_invites where email = inv.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) Solo un administrador puede cambiar roles (un usuario sí puede editar su propio nombre).
--    Desde el SQL Editor (sin usuario de la app) también se permite, para poder crear el primer admin.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and coalesce(public.current_user_role(), '') <> 'admin' then
    raise exception 'Solo un administrador puede cambiar roles.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- =============================================================================
-- PASO FINAL (OPCIONAL) — Ejecutar SOLO DESPUÉS de haber entrado con TU administrador.
-- Borra los 4 usuarios de prueba. Sus análisis y alertas se conservan.
-- Quite los guiones "--" de las 3 líneas siguientes y ejecútelas:
--
-- delete from auth.users
-- where email in ('admin@visionai.pe', 'operador@visionai.pe', 'supervisor@visionai.pe', 'auditor@visionai.pe');
-- select email, role from public.profiles order by created_at;   -- comprobar quiénes quedan
-- =============================================================================
