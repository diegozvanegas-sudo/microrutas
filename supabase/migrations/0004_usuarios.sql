-- Paso 5: usuarios con rol (admin / interventor) y visitas a nombre de quien inició sesión.
-- - perfiles: nombre y rol de cada usuario de Supabase Auth (se crea solo al crear el usuario).
-- - admin_*: crear, editar, desactivar y eliminar usuarios desde la página usuarios.html. Solo para admin;
--   corren como dueño de la base (security definer) porque tocan auth.users, y lo primero que hacen es revisar el rol.
-- - visitas: quién la registró, quién la subsanó y quién la cambió por última vez, tomado de la sesión (no se escribe a mano).
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

-- ---------- Perfiles ----------
create table if not exists public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  nombre  text,
  rol     text not null default 'interventor' check (rol in ('admin', 'interventor')),
  creado  timestamptz not null default now()
);

-- Cada usuario nuevo de Auth (desde la página, el panel o scripts/crear_usuario.mjs) queda con perfil de interventor
create or replace function public.perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
          case when new.raw_user_meta_data ->> 'rol' = 'admin' then 'admin' else 'interventor' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists perfil_nuevo on auth.users;
create trigger perfil_nuevo after insert on auth.users
for each row execute function public.perfil_nuevo();

insert into public.perfiles (id, nombre)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.es_admin()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Nombre con el que firma el usuario de la sesión (su nombre o, si no tiene, el correo)
create or replace function public.nombre_usuario(uid uuid default auth.uid())
returns text
language sql stable
security definer
set search_path = public, extensions
as $$
  select coalesce(nullif(trim(p.nombre), ''), u.email)
  from auth.users u left join public.perfiles p on p.id = u.id
  where u.id = uid;
$$;

alter table public.perfiles enable row level security;
drop policy if exists "leer perfiles" on public.perfiles;
create policy "leer perfiles" on public.perfiles for select to authenticated using (true);
-- Nadie los cambia directo: solo con las funciones admin_*
grant select on public.perfiles to authenticated;

-- ---------- Administración (solo admin) ----------
create or replace function public.exigir_admin()
returns void
language plpgsql stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede manejar usuarios' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_usuarios()
returns table (id uuid, correo text, nombre text, rol text, activo boolean, creado timestamptz,
               ultimo_ingreso timestamptz, visitas integer, subsanadas integer)
language plpgsql stable
security definer
set search_path = public, extensions
as $$
begin
  perform public.exigir_admin();
  return query
  select u.id, u.email::text, p.nombre, coalesce(p.rol, 'interventor'),
         u.banned_until is null or u.banned_until < now(), u.created_at, u.last_sign_in_at,
         (select count(*)::int from public.visitas v where v.creado_por = u.id),
         (select count(*)::int from public.visitas v where v.subsanado_por_id = u.id)
  from auth.users u left join public.perfiles p on p.id = u.id
  order by p.rol, lower(coalesce(p.nombre, u.email));
end;
$$;

create or replace function public.validar_usuario(correo text, clave text, rol text)
returns void
language plpgsql immutable
as $$
begin
  if correo is not null and correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo "%" no es válido', correo;
  end if;
  if clave is not null and length(clave) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres';
  end if;
  if rol is not null and rol not in ('admin', 'interventor') then
    raise exception 'Rol no válido: %', rol;
  end if;
end;
$$;

-- Mismas filas que deja Supabase Auth al crear un usuario con correo confirmado
create or replace function public.admin_crear_usuario(correo text, clave text, nombre text default null, rol text default 'interventor')
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  nuevo uuid := gen_random_uuid();
  v_correo text := lower(trim(correo));
begin
  perform public.exigir_admin();
  perform public.validar_usuario(v_correo, clave, rol);
  if exists (select 1 from auth.users u where u.email = v_correo) then
    raise exception 'Ya existe un usuario con el correo %', v_correo;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', nuevo, 'authenticated', 'authenticated', v_correo,
          crypt(clave, gen_salt('bf')), now(),
          '{"provider": "email", "providers": ["email"]}',
          jsonb_build_object('email_verified', true, 'nombre', nullif(trim(nombre), ''), 'rol', rol),
          now(), now(), '', '', '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), nuevo, nuevo::text, 'email',
          jsonb_build_object('sub', nuevo::text, 'email', v_correo, 'email_verified', true, 'phone_verified', false),
          null, now(), now());

  -- El trigger perfil_nuevo ya lo creó; aquí quedan el nombre y el rol pedidos
  update public.perfiles p set nombre = coalesce(nullif(trim(admin_crear_usuario.nombre), ''), split_part(v_correo, '@', 1)),
                               rol = admin_crear_usuario.rol
  where p.id = nuevo;
  return nuevo;
end;
$$;

-- Lo que llegue en null no se cambia. activo = false bloquea el ingreso sin borrar al usuario ni sus visitas.
create or replace function public.admin_editar_usuario(usuario uuid, correo text default null, nombre text default null,
                                                       rol text default null, clave text default null, activo boolean default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_correo text := lower(trim(correo));
begin
  perform public.exigir_admin();
  perform public.validar_usuario(v_correo, nullif(clave, ''), rol);
  if not exists (select 1 from auth.users u where u.id = usuario) then
    raise exception 'No existe el usuario';
  end if;
  if usuario = auth.uid() and (rol = 'interventor' or activo = false) then
    raise exception 'No puede quitarse a sí mismo el rol de administrador ni desactivarse';
  end if;
  if v_correo is not null and exists (select 1 from auth.users u where u.email = v_correo and u.id <> usuario) then
    raise exception 'Ya existe otro usuario con el correo %', v_correo;
  end if;

  update auth.users u set
    email = coalesce(v_correo, u.email),
    encrypted_password = case when nullif(clave, '') is null then u.encrypted_password else crypt(clave, gen_salt('bf')) end,
    banned_until = case when activo is null then u.banned_until when activo then null else 'infinity'::timestamptz end,
    updated_at = now()
  where u.id = usuario;
  if v_correo is not null then
    update auth.identities i set identity_data = i.identity_data || jsonb_build_object('email', v_correo), updated_at = now()
    where i.user_id = usuario and i.provider = 'email';
  end if;
  -- Desactivado: se cierran sus sesiones abiertas
  if activo = false then
    delete from auth.sessions s where s.user_id = usuario;
  end if;

  update public.perfiles p set
    nombre = coalesce(nullif(trim(admin_editar_usuario.nombre), ''), p.nombre),
    rol = coalesce(admin_editar_usuario.rol, p.rol)
  where p.id = usuario;
end;
$$;

-- Sus visitas se conservan: quedan con el nombre con que se registraron (creado_por pasa a null)
create or replace function public.admin_eliminar_usuario(usuario uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.exigir_admin();
  if usuario = auth.uid() then
    raise exception 'No puede eliminar su propio usuario';
  end if;
  delete from auth.users u where u.id = usuario;
  if not found then raise exception 'No existe el usuario'; end if;
end;
$$;

revoke all on function public.admin_usuarios(), public.admin_crear_usuario(text, text, text, text),
  public.admin_editar_usuario(uuid, text, text, text, text, boolean), public.admin_eliminar_usuario(uuid),
  public.exigir_admin(), public.nombre_usuario(uuid), public.perfil_nuevo() from public, anon;
grant execute on function public.admin_usuarios(), public.admin_crear_usuario(text, text, text, text),
  public.admin_editar_usuario(uuid, text, text, text, text, boolean), public.admin_eliminar_usuario(uuid),
  public.es_admin(), public.nombre_usuario(uuid) to authenticated;

-- ---------- Visitas a nombre del usuario de la sesión ----------
alter table public.visitas add column if not exists creado_por uuid references auth.users (id) on delete set null;
alter table public.visitas add column if not exists subsanado_por_id uuid references auth.users (id) on delete set null;
alter table public.visitas add column if not exists subsanado_por text;   -- nombre de quien la pasó a SUBSANADO
alter table public.visitas add column if not exists modificado_por text;  -- nombre de quien la cambió por última vez

-- Corre después de visitas_calcular (los triggers van en orden alfabético), cuando el estado ya está calculado.
-- Sin sesión (scripts con la conexión directa) deja lo que venga.
create or replace function public.visitas_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  nombre text := public.nombre_usuario(uid);
begin
  -- Quién registró y quién subsanó no se cambian; los id solo quedan en null cuando se elimina ese usuario
  -- (on delete set null corre después de borrarlo, así que ya no está en auth.users)
  if tg_op = 'UPDATE' then
    new.creado_por := case when new.creado_por is null and not exists (select 1 from auth.users u where u.id = old.creado_por)
                           then null else old.creado_por end;
    new.registrado_por := old.registrado_por;
    new.subsanado_por_id := case when new.subsanado_por_id is null and not exists (select 1 from auth.users u where u.id = old.subsanado_por_id)
                                 then null else old.subsanado_por_id end;
    new.subsanado_por := old.subsanado_por;
  end if;
  if uid is null then return new; end if;

  if tg_op = 'INSERT' then
    new.creado_por := uid;
    new.registrado_por := nombre;
  else
    new.modificado_por := nombre;
  end if;
  if new.estado = 'SUBSANADO' and (tg_op = 'INSERT' or old.estado is distinct from 'SUBSANADO') then
    new.subsanado_por_id := uid;
    new.subsanado_por := nombre;
  end if;
  return new;
end;
$$;

drop trigger if exists visitas_usuario on public.visitas;
create trigger visitas_usuario before insert or update on public.visitas
for each row execute function public.visitas_usuario();

-- Visitas viejas registradas con el correo: quedan amarradas a ese usuario (sin triggers: no cambia nada más)
alter table public.visitas disable trigger user;
update public.visitas v set creado_por = u.id
from auth.users u
where v.creado_por is null and lower(v.registrado_por) = u.email;
alter table public.visitas enable trigger user;

create index if not exists visitas_creado_por_idx on public.visitas (creado_por);
