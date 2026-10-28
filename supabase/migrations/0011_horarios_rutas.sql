-- Paso 11: Horarios de rutas de recolección (LV y RyT). Se cargan desde el Excel de horarios en horarios.html:
-- la página lee el archivo en el navegador y manda solo las filas a cargar_horarios(), que reemplaza todo de una vez.
-- El archivo no está en el repositorio (es público) ni se guarda en el navegador: solo aquí.
-- Leen los usuarios con sesión (Horas extras revisa la H.I y la H.F con ellos); carga solo el administrador.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.horarios_rutas (
  ruta         text primary key,                   -- código de la microrruta sin ceros a la izquierda: '415507'
  zona         text not null default '',           -- hoja del Excel: 'ZONA 4'
  macro        text not null default '',           -- macrorruta o tipo de servicio: 'Z4LJ'
  dias         smallint[] not null default '{}',   -- días de la frecuencia: 1 = lunes … 7 = domingo
  horas        int[] not null default '{}',        -- horas de salida en minutos del día (360 = 6:00); varias = cualquiera vale
  por_dia      jsonb not null default '{}',        -- otra hora algunos días, de la observación: { "4": 480 }
  turno        text not null default '',
  obs          text not null default '',
  horario_ver  text not null default '',           -- el HORARIO tal como viene en el Excel
  archivo      text not null default '',           -- nombre del Excel del que se cargó
  cargado_por  uuid references auth.users (id) on delete set null,
  actualizado  timestamptz not null default now()
);

alter table public.horarios_rutas enable row level security;

drop policy if exists "leer horarios con sesión" on public.horarios_rutas;
create policy "leer horarios con sesión" on public.horarios_rutas for select to authenticated using (true);
-- Sin políticas de insert/update/delete: solo se cambian con cargar_horarios()

revoke all on public.horarios_rutas from anon, authenticated;
grant select on public.horarios_rutas to authenticated;

-- Reemplaza todos los horarios por los del Excel. filas: [{ ruta, zona, macro, dias, horas, por_dia, turno, obs, horario_ver }].
-- Solo administradores. Devuelve cuántas rutas quedaron.
create or replace function public.cargar_horarios(filas jsonb, archivo text)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cargar los horarios de rutas';
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
