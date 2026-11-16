-- Paso 25: a qué aplicación entra cada cuenta. Microrrutas y Rutina comparten este proyecto de Supabase y la misma lista
-- de cuentas (auth.users); hasta ahora toda cuenta nueva quedaba de interventor de Microrrutas y podía leer sus tablas.
-- Desde aquí:
--   · public.accesos dice a qué app entra cada cuenta ('microrutas', 'rutina'). Lo maneja el administrador de
--     Microrrutas en 👥 Usuarios (admin_apps), que es donde se crean las cuentas.
--   · Las tablas de Microrrutas (y sus archivos en Storage) solo responden a quien tiene acceso: una regla RESTRICTIVA
--     por tabla que se suma a las de siempre (no las reemplaza). Los administradores de Microrrutas siempre entran.
--   · Una cuenta creada en el panel de Supabase ya no entra sola: hay que darle acceso. Las creadas desde 👥 Usuarios
--     entran a Microrrutas (y el formulario puede cambiarlo).
--   · Rutina revisa public.tiene_app('rutina') en sus funciones (rutina/supabase/esquema.sql, se corre después de esto).
-- Lo de las tablas públicas del mapa (items, lotes, microrrutas, recordatorios) no cambia: el mapa no pide sesión.
-- Va después de 0024. Se puede correr varias veces: los accesos de partida solo se ponen si la tabla está vacía.

set search_path = public, extensions;

create table if not exists public.accesos (
  usuario uuid not null references auth.users (id) on delete cascade,
  app     text not null check (app in ('microrutas', 'rutina')),
  dado    timestamptz not null default now(),
  primary key (usuario, app)
);
alter table public.accesos enable row level security;
-- Sin reglas: nadie la lee directo; se consulta con las funciones de abajo
revoke all on public.accesos from public, anon, authenticated;

-- ¿La cuenta de la sesión entra a esta app?
create or replace function public.tiene_app(app text)
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.accesos a where a.usuario = auth.uid() and a.app = tiene_app.app);
$$;

-- Microrrutas: con acceso, o administrador (así el administrador nunca queda por fuera)
create or replace function public.entra_microrutas()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select public.tiene_app('microrutas') or public.es_admin();
$$;

-- ---------- Accesos de partida (solo la primera vez) ----------
-- Microrrutas: los administradores, quien ya tiene datos aquí y las cuentas que no son de Rutina.
-- Rutina: quien ya entró a Rutina (tiene perfil o datos allá). Quedan por fuera de Microrrutas las cuentas que solo
-- usan Rutina (clientes y entrenadores).
do $$
declare
  hay_rutina boolean := to_regclass('rutina.perfiles') is not null;
begin
  if exists (select 1 from public.accesos) then return; end if;
  execute format($q$
    insert into public.accesos (usuario, app)
    select u.id, 'microrutas' from auth.users u
    where exists (select 1 from public.perfiles p where p.id = u.id and p.rol = 'admin')
       or exists (select 1 from public.visitas v where v.creado_por = u.id or v.subsanado_por_id = u.id)
       or exists (select 1 from public.pqrs x where x.usuario = u.id)
       or exists (select 1 from public.informes x where x.usuario = u.id)
       or exists (select 1 from public.revisiones x where x.usuario = u.id)
       or exists (select 1 from public.pendientes x where x.usuario = u.id)
       or exists (select 1 from public.reportes_despacho x where x.usuario = u.id)
       or exists (select 1 from public.reportes_ejecucion x where x.usuario = u.id)
       or exists (select 1 from public.lugares x where x.usuario = u.id)
       or exists (select 1 from public.auditorias_zv x where x.usuario = u.id)
       or exists (select 1 from public.rutas x where x.usuario = u.id)
       or %s
    on conflict do nothing
  $q$, case when hay_rutina then 'not exists (select 1 from rutina.perfiles r where r.usuario = u.id)' else 'true' end);
  if hay_rutina then
    insert into public.accesos (usuario, app)
    select u.id, 'rutina' from auth.users u
    where exists (select 1 from rutina.perfiles r where r.usuario = u.id)
       or exists (select 1 from rutina.estado e where e.usuario = u.id)
    on conflict do nothing;
  end if;
end;
$$;

-- ---------- Las tablas de Microrrutas, solo con acceso ----------
-- RESTRICTIVA: se exige además de las reglas de cada tabla (ver lo propio, el administrador todo, etc.)
do $$
declare t text;
begin
  foreach t in array array['auditorias_zv', 'contrato_secciones', 'convenio_secciones', 'horarios_rutas', 'informes', 'lugares',
                           'pendientes', 'perfiles', 'pqrs', 'reportes_despacho', 'reportes_ejecucion', 'revisiones', 'rutas',
                           'visitas', 'whatsapp_programados'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "solo con acceso a microrrutas" on public.%I', t);
    execute format('create policy "solo con acceso a microrrutas" on public.%I as restrictive for all to authenticated '
                   'using ((select public.entra_microrutas())) with check ((select public.entra_microrutas()))', t);
  end loop;
end;
$$;

-- Archivos de Microrrutas en Storage (anexos de visitas y envíos de WhatsApp); los demás buckets no cambian
drop policy if exists "solo con acceso a microrrutas" on storage.objects;
create policy "solo con acceso a microrrutas" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('anexos-visitas', 'whatsapp-programados') or (select public.entra_microrutas()))
  with check (bucket_id not in ('anexos-visitas', 'whatsapp-programados') or (select public.entra_microrutas()));

-- Contrato y horarios: además de su permiso, entrar a Microrrutas (cargar_horarios salta las reglas de la tabla)
create or replace function public.puede_ver_contrato()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select public.entra_microrutas() and exists (select 1 from public.perfiles where id = auth.uid() and (rol = 'admin' or ver_contrato));
$$;
create or replace function public.puede_cargar_horarios()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select public.entra_microrutas() and exists (select 1 from public.perfiles where id = auth.uid() and (rol = 'admin' or cargar_horarios));
$$;

-- Cuenta nueva: perfil de siempre; entra a Microrrutas solo si la crea un administrador desde 👥 Usuarios
create or replace function public.perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)), 'interventor')
  on conflict (id) do nothing;
  if public.es_admin() then
    insert into public.accesos (usuario, app) values (new.id, 'microrutas') on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Lo que puede hacer el usuario de la sesión; antes en 0024, ahora con 'microrutas' (false: la página le dice que no entra)
create or replace function public.mis_permisos()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'microrutas', public.entra_microrutas(),
    'admin', public.es_admin(),
    'contrato', public.puede_ver_contrato(),
    'horarios', public.puede_cargar_horarios(),
    'ocultas', case when public.es_admin() then '[]'::jsonb
                    else coalesce((select to_jsonb(p.ocultas) from public.perfiles p where p.id = auth.uid()), '[]'::jsonb) end);
$$;

-- La lista de usuarios ahora trae a qué apps entra cada uno
drop function if exists public.admin_usuarios();
create function public.admin_usuarios()
returns table (id uuid, correo text, nombre text, rol text, activo boolean, creado timestamptz,
               ultimo_ingreso timestamptz, visitas integer, subsanadas integer, ver_contrato boolean, ocultas text[], apps text[])
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
         (select count(*)::int from public.visitas v where v.subsanado_por_id = u.id),
         p.rol = 'admin' or coalesce(p.ver_contrato, false),
         coalesce(p.ocultas, '{}'),
         array(select x.app from (select a.app from public.accesos a where a.usuario = u.id
                                  union select 'microrutas' where p.rol = 'admin') x order by x.app)
  from auth.users u left join public.perfiles p on p.id = u.id
  order by p.rol, lower(coalesce(p.nombre, u.email));
end;
$$;

-- Guarda a qué apps entra un usuario (la lista completa: la que no venga se le quita). Un administrador siempre entra
-- a Microrrutas. Quitar una app no borra sus datos ni cierra sus sesiones (son de la cuenta, compartidas por las dos apps)
create or replace function public.admin_apps(usuario uuid, apps text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  limpias text[];
begin
  perform public.exigir_admin();
  if not exists (select 1 from auth.users u where u.id = admin_apps.usuario) then
    raise exception 'No existe el usuario';
  end if;
  if exists (select 1 from unnest(coalesce(apps, '{}')) a where a not in ('microrutas', 'rutina')) then
    raise exception 'Aplicación no válida';
  end if;
  select coalesce(array_agg(distinct a), '{}') into limpias from unnest(coalesce(apps, '{}')) a;
  if exists (select 1 from public.perfiles p where p.id = admin_apps.usuario and p.rol = 'admin') and not ('microrutas' = any (limpias)) then
    raise exception 'Un administrador siempre entra a Microrrutas';
  end if;
  delete from public.accesos a where a.usuario = admin_apps.usuario and not (a.app = any (limpias));
  insert into public.accesos (usuario, app) select admin_apps.usuario, x from unnest(limpias) x on conflict do nothing;
end;
$$;

revoke all on function public.tiene_app(text), public.entra_microrutas(), public.mis_permisos(), public.admin_usuarios(),
  public.admin_apps(uuid, text[]), public.puede_ver_contrato(), public.puede_cargar_horarios() from public, anon;
grant execute on function public.tiene_app(text), public.entra_microrutas(), public.mis_permisos(), public.admin_usuarios(),
  public.admin_apps(uuid, text[]), public.puede_ver_contrato(), public.puede_cargar_horarios() to authenticated;

notify pgrst, 'reload schema';
