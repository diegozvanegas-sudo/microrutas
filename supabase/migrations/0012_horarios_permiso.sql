-- Paso 12: además de los administradores, pueden cargar los horarios de rutas los usuarios con perfiles.cargar_horarios.
-- A quién se le da no va aquí (el repositorio es público): se marca en la base, por ejemplo
--   update public.perfiles set cargar_horarios = true where id = (select id from auth.users where email = '…');
-- Va después de 0011. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.perfiles add column if not exists cargar_horarios boolean not null default false;

create or replace function public.puede_cargar_horarios()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and (rol = 'admin' or cargar_horarios));
$$;

-- Lo que puede hacer el usuario de la sesión (encabezado de las páginas); antes en 0007, ahora con 'horarios'
create or replace function public.mis_permisos()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('admin', public.es_admin(), 'contrato', public.puede_ver_contrato(), 'horarios', public.puede_cargar_horarios());
$$;

revoke all on function public.puede_cargar_horarios(), public.mis_permisos() from public, anon;
grant execute on function public.puede_cargar_horarios(), public.mis_permisos() to authenticated;

-- cargar_horarios (0011) con el permiso nuevo en lugar de solo administradores
create or replace function public.cargar_horarios(filas jsonb, archivo text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not public.puede_cargar_horarios() then
    raise exception 'No tiene permiso para cargar los horarios de rutas';
  end if;
  if jsonb_typeof(filas) <> 'array' or jsonb_array_length(filas) = 0 then
    raise exception 'El archivo no trae rutas';
  end if;
  if jsonb_array_length(filas) > 5000 then
    raise exception 'Demasiadas filas (% rutas)', jsonb_array_length(filas);
  end if;

  delete from public.horarios_rutas where true;
  insert into public.horarios_rutas (ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver, archivo, cargado_por)
  select distinct on (trim(f->>'ruta'))
         left(trim(f->>'ruta'), 40),
         left(coalesce(f->>'zona', ''), 80),
         left(coalesce(f->>'macro', ''), 200),
         coalesce(array(select d::smallint from jsonb_array_elements_text(f->'dias') d where d ~ '^[1-7]$'), '{}'),
         coalesce(array(select h::int from jsonb_array_elements_text(f->'horas') h where h ~ '^\d{1,4}$' and h::int < 1440), '{}'),
         case when jsonb_typeof(f->'por_dia') = 'object' then f->'por_dia' else '{}' end,
         left(coalesce(f->>'turno', ''), 20),
         left(coalesce(f->>'obs', ''), 500),
         left(coalesce(f->>'horario_ver', ''), 80),
         left(coalesce(cargar_horarios.archivo, ''), 200),
         auth.uid()
  from jsonb_array_elements(filas) with ordinality as x(f, i)
  where coalesce(trim(f->>'ruta'), '') <> ''
  order by trim(f->>'ruta'), i desc;   -- si una ruta viene dos veces, queda la última

  select count(*) into n from public.horarios_rutas;
  return n;
end;
$$;

revoke all on function public.cargar_horarios(jsonb, text) from public, anon;
grant execute on function public.cargar_horarios(jsonb, text) to authenticated;
