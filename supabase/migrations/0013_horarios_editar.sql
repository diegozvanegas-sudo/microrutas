-- Paso 13: revisar y corregir los horarios de rutas una a una en horarios.html (además de cargar el Excel completo).
-- guardar_horario() crea o cambia una ruta y borrar_horario() la quita; las dos con el mismo permiso de cargar_horarios()
-- (administradores y perfiles.cargar_horarios, 0012). Lo editado a mano queda marcado en editado / editado_por;
-- al cargar otro Excel con cargar_horarios() se reemplaza todo, también lo editado.
-- Va después de 0012. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.horarios_rutas add column if not exists editado timestamptz;
alter table public.horarios_rutas add column if not exists editado_por uuid references auth.users (id) on delete set null;

-- Crea o cambia una ruta. fila: { ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver };
-- anterior: el código que tenía si se le cambió (null o el mismo si es nueva o no cambia). Devuelve el código guardado.
create or replace function public.guardar_horario(fila jsonb, anterior text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r text := left(trim(coalesce(fila->>'ruta', '')), 40);
  previo public.horarios_rutas;
begin
  if not public.puede_cargar_horarios() then
    raise exception 'No tiene permiso para cambiar los horarios de rutas';
  end if;
  if r = '' then
    raise exception 'Falta el código de la ruta';
  end if;
  if anterior is not null and trim(anterior) <> r and exists (select 1 from public.horarios_rutas where ruta = r) then
    raise exception 'La ruta % ya está en los horarios', r;
  end if;

  select * into previo from public.horarios_rutas where ruta = coalesce(nullif(trim(anterior), ''), r);
  delete from public.horarios_rutas where ruta = coalesce(nullif(trim(anterior), ''), r);
  insert into public.horarios_rutas (ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver, archivo, cargado_por, actualizado, editado, editado_por)
  values (
    r,
    left(coalesce(fila->>'zona', ''), 80),
    left(coalesce(fila->>'macro', ''), 200),
    coalesce(array(select d::smallint from jsonb_array_elements_text(fila->'dias') d where d ~ '^[1-7]$'), '{}'),
    coalesce(array(select h::int from jsonb_array_elements_text(fila->'horas') h where h ~ '^\d{1,4}$' and h::int < 1440), '{}'),
    case when jsonb_typeof(fila->'por_dia') = 'object' then fila->'por_dia' else '{}' end,
    left(coalesce(fila->>'turno', ''), 20),
    left(coalesce(fila->>'obs', ''), 500),
    left(coalesce(fila->>'horario_ver', ''), 80),
    coalesce(previo.archivo, ''),                -- una ruta nueva no viene de ningún Excel
    coalesce(previo.cargado_por, auth.uid()),
    coalesce(previo.actualizado, now()),
    now(),
    auth.uid()
  );
  return r;
end;
$$;

-- Quita una ruta de los horarios. Devuelve si estaba.
create or replace function public.borrar_horario(ruta text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not public.puede_cargar_horarios() then
    raise exception 'No tiene permiso para cambiar los horarios de rutas';
  end if;
  delete from public.horarios_rutas h where h.ruta = trim(borrar_horario.ruta);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.guardar_horario(jsonb, text), public.borrar_horario(text) from public, anon;
grant execute on function public.guardar_horario(jsonb, text), public.borrar_horario(text) to authenticated;
