-- Paso 19: la pre-ruta queda igual en todos los equipos del mismo usuario. Antes la marca «Para después» de un lote
-- y el orden «por llegada» de la cuadrilla solo vivían en el celular o PC donde se tocaron.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.rutas add column if not exists despues boolean not null default false;
alter table public.rutas add column if not exists por_llegada boolean not null default false;

-- paradas: [{"lote": "532", "fecha": "2026-10-21", "cargada": "...", "encurso": "...", "sinfotos": "", "despues": true, "llegada": false}, ...]
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
  insert into public.rutas (cuadrilla, lote, fecha_ejecucion, orden, cargada, en_curso, sin_fotos, despues, por_llegada, usuario)
  select cuad, p.lote, nullif(p.fecha, '')::date, p.n::integer,
         coalesce(nullif(p.cargada, '')::timestamptz, now()), nullif(p.encurso, '')::timestamptz, nullif(trim(p.sinfotos), ''),
         coalesce(p.despues, false), coalesce(p.llegada, false), yo
  from rows from (jsonb_to_recordset(coalesce(paradas, '[]'))
         as (lote text, fecha text, cargada text, encurso text, sinfotos text, despues boolean, llegada boolean))
       with ordinality as p(lote, fecha, cargada, encurso, sinfotos, despues, llegada, n)
  where coalesce(trim(p.lote), '') <> '';
  return query select * from public.rutas r where r.cuadrilla = cuad and r.usuario = yo order by r.orden;
end;
$$;
