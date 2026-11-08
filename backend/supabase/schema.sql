-- =============================================================================
-- VISION AI — Esquema PostgreSQL + Supabase Auth + Row Level Security (RLS)
-- Ejecuta este script completo en el SQL Editor de tu proyecto de Supabase.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLA DE PERFILES DE USUARIO (Vinculada a auth.users de Supabase)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'operator' check (role in ('admin', 'supervisor', 'operator', 'auditor')),
  created_at timestamptz not null default now()
);

-- Función auxiliar para obtener el rol del usuario autenticado en políticas RLS
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Alta de cuentas SOLO por invitación de un administrador (ver también migracion_usuarios.sql)
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


-- -----------------------------------------------------------------------------
-- 2. TABLAS DEL DOMINIO VISION AI
-- -----------------------------------------------------------------------------

-- Escenarios de análisis (las 4 situaciones reales)
create table if not exists public.scenarios (
  id text primary key,
  name text not null,
  sector text not null,
  description text not null,
  expected_results text not null,
  tags jsonb not null default '[]'::jsonb,
  zones jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Clases de objetos detectables
create table if not exists public.vision_classes (
  id text primary key,
  name text not null,
  color text not null,
  description text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Reglas de negocio y patrones
create table if not exists public.rules (
  id text primary key,
  name text not null,
  description text not null,
  condition jsonb not null,
  threshold numeric(4,3) not null default 0.65,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Configuración global del sistema (incluye canales de alerta móvil Telegram / ntfy)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  default_threshold numeric(4,3) not null default 0.50,
  random_demo boolean not null default false,
  simulate_next_failure boolean not null default false,
  max_upload_mb int not null default 8,
  notifications_enabled boolean not null default false,
  telegram_bot_token text not null default '',
  telegram_chat_id text not null default '',
  ntfy_topic text not null default 'vision-ai-senati-alertas',
  updated_at timestamptz not null default now()
);

-- Registro de análisis (por imagen, cámara o monitoreo en vivo)
create table if not exists public.analyses (
  id text primary key,
  created_at timestamptz not null default now(),
  created_by text not null,
  created_by_uid uuid references auth.users(id) on delete set null,
  source_name text not null,
  source_kind text not null check (source_kind in ('scenario', 'upload', 'live')),
  scenario_id text not null references public.scenarios(id) on delete restrict,
  mode text not null check (mode in ('detection', 'segmentation', 'patterns', 'combined')),
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  engine text not null check (engine in ('DEMO', 'REAL')),
  threshold numeric(4,3) not null default 0.50,
  duration_ms int not null default 0,
  average_confidence numeric(5,4) not null default 0,
  detections jsonb not null default '[]'::jsonb,
  masks jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  observations text,
  observations_by text,
  seed boolean not null default false,
  frame_t numeric(10,2),
  live jsonb
);

create index if not exists idx_analyses_created_at on public.analyses (created_at desc);
create index if not exists idx_analyses_scenario_id on public.analyses (scenario_id);

-- Alertas generadas por reglas o patrones
create table if not exists public.alerts (
  id text primary key,
  analysis_id text not null references public.analyses(id) on delete cascade,
  scenario_id text not null references public.scenarios(id) on delete restrict,
  rule_id text not null,
  rule_name text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null,
  evidence text not null,
  status text not null default 'new' check (status in ('new', 'reviewed', 'closed')),
  created_at timestamptz not null default now(),
  assignee text,
  reviewed_by text,
  reviewed_at timestamptz,
  note text,
  frame_t numeric(10,2),
  frame_index int,
  snapshot_url text
);

create index if not exists idx_alerts_created_at on public.alerts (created_at desc);
create index if not exists idx_alerts_status on public.alerts (status);

-- Registro inmutable de auditoría de eventos
create table if not exists public.audit_events (
  id text primary key,
  at timestamptz not null default now(),
  "user" text not null,
  user_uid uuid references auth.users(id) on delete set null,
  type text not null,
  level text not null check (level in ('info', 'success', 'warning', 'error')),
  message text not null,
  ref text
);

create index if not exists idx_audit_events_at on public.audit_events (at desc);

-- -----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) — Reglas de Seguridad por Rol en Base de Datos
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.vision_classes enable row level security;
alter table public.rules enable row level security;
alter table public.settings enable row level security;
alter table public.analyses enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_events enable row level security;

-- PROFILES: cualquier usuario autenticado lee perfiles; solo el dueño o admin edita; solo admin cambia roles.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated
  using (true);

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin')
  with check (id = auth.uid() or public.current_user_role() = 'admin');

-- SCENARIOS: lectura para autenticados; escritura exclusiva para ADMIN
drop policy if exists "scenarios_select_authenticated" on public.scenarios;
create policy "scenarios_select_authenticated" on public.scenarios
  for select to authenticated
  using (true);

drop policy if exists "scenarios_admin_write" on public.scenarios;
create policy "scenarios_admin_write" on public.scenarios
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- VISION_CLASSES: lectura para autenticados; escritura exclusiva para ADMIN
drop policy if exists "classes_select_authenticated" on public.vision_classes;
create policy "classes_select_authenticated" on public.vision_classes
  for select to authenticated
  using (true);

drop policy if exists "classes_admin_write" on public.vision_classes;
create policy "classes_admin_write" on public.vision_classes
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- RULES: lectura para autenticados; creación/edición/borrado exclusiva para ADMIN
drop policy if exists "rules_select_authenticated" on public.rules;
create policy "rules_select_authenticated" on public.rules
  for select to authenticated
  using (true);

drop policy if exists "rules_admin_write" on public.rules;
create policy "rules_admin_write" on public.rules
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- SETTINGS: lectura para autenticados; modificación exclusiva para ADMIN
drop policy if exists "settings_select_authenticated" on public.settings;
create policy "settings_select_authenticated" on public.settings
  for select to authenticated
  using (true);

drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings
  for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ANALYSES:
-- - SELECT: todos los roles autenticados (incluyendo auditor).
-- - INSERT/UPDATE: solo admin, supervisor y operator (el rol auditor es de solo lectura).
-- - DELETE: solo admin.
drop policy if exists "analyses_select_authenticated" on public.analyses;
create policy "analyses_select_authenticated" on public.analyses
  for select to authenticated
  using (true);

drop policy if exists "analyses_insert_operational" on public.analyses;
create policy "analyses_insert_operational" on public.analyses
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'supervisor', 'operator'));

drop policy if exists "analyses_update_operational" on public.analyses;
create policy "analyses_update_operational" on public.analyses
  for update to authenticated
  using (public.current_user_role() in ('admin', 'supervisor', 'operator'))
  with check (public.current_user_role() in ('admin', 'supervisor', 'operator'));

drop policy if exists "analyses_delete_admin" on public.analyses;
create policy "analyses_delete_admin" on public.analyses
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ALERTS:
-- - SELECT: todos los roles autenticados.
-- - INSERT: admin, supervisor, operator.
-- - UPDATE:
--     * operator solo puede dejar la alerta en estado 'reviewed'.
--     * supervisor y admin pueden pasar a 'reviewed' o 'closed'.
--     * auditor NO puede modificar alertas.
drop policy if exists "alerts_select_authenticated" on public.alerts;
create policy "alerts_select_authenticated" on public.alerts
  for select to authenticated
  using (true);

drop policy if exists "alerts_insert_operational" on public.alerts;
create policy "alerts_insert_operational" on public.alerts
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'supervisor', 'operator'));

drop policy if exists "alerts_update_by_role" on public.alerts;
create policy "alerts_update_by_role" on public.alerts
  for update to authenticated
  using (public.current_user_role() in ('admin', 'supervisor', 'operator'))
  with check (
    public.current_user_role() in ('admin', 'supervisor')
    or (public.current_user_role() = 'operator' and status = 'reviewed')
  );

drop policy if exists "alerts_delete_admin" on public.alerts;
create policy "alerts_delete_admin" on public.alerts
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- AUDIT_EVENTS:
-- - SELECT: todos los autenticados.
-- - INSERT: cualquier usuario autenticado puede registrar eventos de auditoría.
-- - DELETE: solo admin (para reinicio de datos demo).
drop policy if exists "audit_select_authenticated" on public.audit_events;
create policy "audit_select_authenticated" on public.audit_events
  for select to authenticated
  using (true);

drop policy if exists "audit_insert_authenticated" on public.audit_events;
create policy "audit_insert_authenticated" on public.audit_events
  for insert to authenticated
  with check (auth.uid() is not null);

drop policy if exists "audit_delete_admin" on public.audit_events;
create policy "audit_delete_admin" on public.audit_events
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- -----------------------------------------------------------------------------
-- 4. DATOS INICIALES (SEED DE ESCENARIOS, CLASES, REGLAS Y AJUSTES)
-- -----------------------------------------------------------------------------

insert into public.scenarios (id, name, sector, description, expected_results, tags, zones)
values
  (
    'industrial-safety',
    'Seguridad industrial (EPP)',
    'Seguridad y prevención',
    'Inspección de operarios en tiempo real mediante cámara para verificar el uso obligatorio de casco de protección y chaleco reflectivo.',
    'Persona, casco, chaleco; alerta de EPP incompleto si falta alguno.',
    '["EPP", "casco", "chaleco", "seguridad"]'::jsonb,
    '[]'::jsonb
  ),
  (
    'quality-control',
    'Control de calidad (Botellas)',
    'Manufactura',
    'Comparación e inspección visual de botellas sanas frente a botellas malogradas (sin tapa, aplastadas/deformadas o sin etiqueta) usando OpenCV y CNN.',
    'Botella/envase, tapa, etiqueta, defecto; clasificación conforme vs. malograda.',
    '["botellas", "defectos", "CNN", "OpenCV"]'::jsonb,
    '[]'::jsonb
  ),
  (
    'retail-store',
    'Control de aforo y ocupación',
    'Retail y espacios interiores',
    'Conteo en tiempo real de personas en el salón o establecimiento y disparo de alerta cuando se supera el aforo máximo permitido.',
    'Conteo de personas en escena; alerta de aforo máximo excedido.',
    '["aforo", "personas", "conteo", "ocupación"]'::jsonb,
    '[]'::jsonb
  ),
  (
    'public-traffic',
    'Monitoreo vial (Cámaras públicas)',
    'Transporte y seguridad vial',
    'Análisis de cámaras públicas de tráfico en vivo: detección de autos, buses, camiones y motos, flujo vehicular e invasión de carril restringido.',
    'Auto, bus, camión, motocicleta; congestión vehicular e invasión de zona restringida.',
    '["cámaras públicas", "tráfico", "vehículos", "zonas"]'::jsonb,
    '[{"id": "zone-restricted", "name": "Carril restringido", "kind": "restricted", "polygon": [[0.58, 0.48], [0.94, 0.48], [0.96, 0.88], [0.54, 0.88]]}]'::jsonb
  ),
  (
    'abandoned-objects',
    'Objetos abandonados',
    'Seguridad en espacios públicos',
    'Vigilancia de mochilas, bolsos y maletas: alerta cuando un bulto queda quieto y sin ninguna persona cerca durante varios segundos (terminales, aeropuertos, colegios y centros comerciales).',
    'Persona, mochila, bolso, maleta; alerta de objeto abandonado sin dueño.',
    '["objetos abandonados", "mochila", "maleta", "seguridad"]'::jsonb,
    '[]'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  sector = excluded.sector,
  description = excluded.description,
  expected_results = excluded.expected_results,
  tags = excluded.tags,
  zones = excluded.zones;

insert into public.vision_classes (id, name, color, description, enabled)
values
  ('person', 'Persona', '#2a78d6', 'Persona u operario detectado en escena.', true),
  ('helmet', 'Casco', '#eda100', 'Casco de protección industrial.', true),
  ('vest', 'Chaleco', '#eb6834', 'Chaleco reflectivo de alta visibilidad.', true),
  ('product', 'Botella / Envase', '#1baf7a', 'Botella o envase en inspección de calidad.', true),
  ('cap', 'Tapa', '#0ea5e9', 'Tapa superior del envase o botella.', true),
  ('label', 'Etiqueta', '#6250d6', 'Etiqueta frontal del envase.', true),
  ('defect', 'Defecto / Malograda', '#e34948', 'Envase malogrado: aplastado, deformado, sin tapa o con daño superficial.', true),
  ('car', 'Auto', '#0284c7', 'Automóvil ligero en vía pública.', true),
  ('bus', 'Bus', '#7c3aed', 'Autobús o transporte público.', true),
  ('truck', 'Camión', '#d97706', 'Camión o vehículo de carga pesada.', true),
  ('motorcycle', 'Motocicleta', '#10b981', 'Motocicleta o vehículo menor.', true),
  ('zone', 'Zona restringida', '#e34948', 'Polígono de carril o área restringida.', true),
  ('bag', 'Mochila / Bolso / Maleta', '#c026d3', 'Bulto vigilado en el escenario de objetos abandonados.', true)
on conflict (id) do update set
  name = excluded.name,
  color = excluded.color,
  description = excluded.description;

insert into public.rules (id, name, description, condition, threshold, severity, enabled)
values
  (
    'rule-ppe',
    'EPP incompleto (Casco / Chaleco)',
    'Persona detectada sin casco de seguridad y/o sin chaleco reflectivo.',
    '{"kind": "pattern", "patternType": "ppe_missing"}'::jsonb,
    0.65,
    'high',
    true
  ),
  (
    'rule-defect',
    'Botella malograda / No conforme',
    'Envase deformado, aplastado, sin tapa o con defecto estructural detectado por CNN + OpenCV.',
    '{"kind": "pattern", "patternType": "surface_defect"}'::jsonb,
    0.65,
    'critical',
    true
  ),
  (
    'rule-label',
    'Etiqueta ausente o torcida',
    'Botella sin etiqueta o con etiqueta desalineada respecto al eje del envase.',
    '{"kind": "pattern", "patternType": "label_misaligned"}'::jsonb,
    0.60,
    'medium',
    true
  ),
  (
    'rule-occupancy',
    'Aforo máximo excedido',
    'Cuatro o más personas simultáneas detectadas en el salón o área monitoreada.',
    '{"kind": "count", "classId": "person", "min": 4}'::jsonb,
    0.55,
    'medium',
    true
  ),
  (
    'rule-zone',
    'Invasión de zona / carril restringido',
    'Vehículo o peatón dentro del polígono de zona restringida en la vía.',
    '{"kind": "zone", "classIds": ["car", "truck", "bus", "motorcycle", "person"], "zoneId": "zone-restricted"}'::jsonb,
    0.55,
    'high',
    true
  ),
  (
    'rule-traffic',
    'Congestión vehicular alta',
    'Alta densidad de vehículos detectados simultáneamente en cámara pública.',
    '{"kind": "pattern", "patternType": "traffic_congestion"}'::jsonb,
    0.65,
    'medium',
    true
  ),
  (
    'rule-abandoned',
    'Objeto abandonado (sin dueño)',
    'Mochila, bolso o maleta quieta y sin ninguna persona cerca durante el tiempo configurado.',
    '{"kind": "pattern", "patternType": "abandoned_object"}'::jsonb,
    0.5,
    'high',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  condition = excluded.condition,
  threshold = excluded.threshold,
  severity = excluded.severity;

insert into public.settings (id, default_threshold, random_demo, simulate_next_failure, max_upload_mb, notifications_enabled, ntfy_topic)
values (1, 0.50, false, false, 8, false, 'vision-ai-senati-alertas')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 5. PRIMER ADMINISTRADOR (sin usuarios de prueba)
-- Invite su correo como admin y luego créelo en Authentication > Users > Add user:
--   insert into public.user_invites (email, name, role) values ('su-correo@ejemplo.com', 'Su Nombre', 'admin');
-- Los demás usuarios se agregan desde la app: Administración > Usuarios > Agregar usuario.
-- -----------------------------------------------------------------------------
