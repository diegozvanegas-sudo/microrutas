-- Paso 7: pre-rutas por usuario. Cada quien (también el administrador) ve y arma solo las suyas;
-- dos interventores pueden tener pre-ruta para la misma cuadrilla sin pisarse.
-- El mapa rápido las toma de la copia de subsanaciones del equipo, que ya es de un solo usuario.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.rutas add column if not exists usuario uuid references auth.users (id) on delete cascade default auth.uid();
create index if not exists rutas_usuario_idx on public.rutas (usuario, cuadrilla, orden);

drop policy if exists "interventores rutas" on public.rutas;
drop policy if exists "pre-rutas propias" on public.rutas;
create policy "pre-rutas propias" on public.rutas for all to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());

-- Reemplaza los lotes de una cuadrilla en la pre-ruta del usuario de la sesión (vacía = quitar la cuadrilla).
-- paradas: [{"lote": "532", "fecha": "2026-10-21", "cargada": "...", "encurso": "..."}, ...]
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
  insert into public.rutas (cuadrilla, lote, fecha_ejecucion, orden, cargada, en_curso, usuario)
  select cuad, p.lote, nullif(p.fecha, '')::date, p.n::integer,
         coalesce(nullif(p.cargada, '')::timestamptz, now()), nullif(p.encurso, '')::timestamptz, yo
  from rows from (jsonb_to_recordset(coalesce(paradas, '[]')) as (lote text, fecha text, cargada text, encurso text))
       with ordinality as p(lote, fecha, cargada, encurso, n)
  where coalesce(trim(p.lote), '') <> '';
  return query select * from public.rutas r where r.cuadrilla = cuad and r.usuario = yo order by r.orden;
end;
$$;
