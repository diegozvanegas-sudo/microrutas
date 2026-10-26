-- Paso 8: lotes de la pre-ruta sin fotos. La cuadrilla avisa en el mensaje "sin fotos por orden público"
-- y el interventor ve el lote marcado 🚫📷 en todos sus celulares.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.rutas add column if not exists sin_fotos text;

-- paradas: [{"lote": "532", "fecha": "2026-10-21", "cargada": "...", "encurso": "...", "sinfotos": "Orden público"}, ...]
create or replace function public.guardar_ruta(cuadrilla text, paradas jsonb)
returns setof public.rutas
language plpgsql
set search_path = public, extensions
as $$
declare
  cuad text := regexp_replace(trim(guardar_ruta.cuadrilla), '^C\s*', '', 'i');
  yo uuid := auth.uid();
begin
  if yo is null then
    raise exception 'Inicie sesión para guardar la pre-ruta' using errcode = '42501';
  end if;
  delete from public.rutas r where r.cuadrilla = cuad and r.usuario = yo;
  insert into public.rutas (cuadrilla, lote, fecha_ejecucion, orden, cargada, en_curso, sin_fotos, usuario)
  select cuad, p.lote, nullif(p.fecha, '')::date, p.n::integer,
         coalesce(nullif(p.cargada, '')::timestamptz, now()), nullif(p.encurso, '')::timestamptz, nullif(trim(p.sinfotos), ''), yo
  from rows from (jsonb_to_recordset(coalesce(paradas, '[]')) as (lote text, fecha text, cargada text, encurso text, sinfotos text))
       with ordinality as p(lote, fecha, cargada, encurso, sinfotos, n)
  where coalesce(trim(p.lote), '') <> '';
  return query select * from public.rutas r where r.cuadrilla = cuad and r.usuario = yo order by r.orden;
end;
$$;
