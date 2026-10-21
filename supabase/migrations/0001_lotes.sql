-- Paso 1: lotes (polígonos de zonas verdes) y microrrutas, con PostGIS.
-- Se puede correr varias veces sin dañar nada.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
set search_path = public, extensions;

-- Una fila por microrruta de la programación (Z5CC0026, ...).
create table if not exists public.microrrutas (
  codigo       text primary key,
  zona         smallint generated always as (substring(codigo from '^Z(\d+)')::smallint) stored,
  lote         text,
  cuadrilla    text,
  area_m2      numeric,
  frecuencia   text,          -- Quincenal / Mensual
  direccion    text,
  descripcion  text,
  actualizado  timestamptz not null default now()
);

-- Un polígono por fila (fid del shapefile de QGIS). Varios polígonos pueden ser del mismo lote.
create table if not exists public.lotes (
  fid                 integer primary key,
  no_lote             text,
  microrruta          text references public.microrrutas (codigo) on update cascade,
  zona                smallint generated always as (substring(microrruta from '^Z(\d+)')::smallint) stored,
  cuadrilla           text,
  area_campo          text,
  area_m2             numeric,
  shape_leng          numeric,
  descripcion         text,
  direccion           text,
  comuna              text,
  direccion_respaldo  text,   -- sacada de la descripción o de las coordenadas cuando no hay microrruta
  geom                geometry(MultiPolygon, 4326),
  actualizado         timestamptz not null default now()
);

create index if not exists lotes_geom_idx       on public.lotes using gist (geom);
create index if not exists lotes_microrruta_idx on public.lotes (microrruta);
create index if not exists lotes_no_lote_idx    on public.lotes (no_lote);

-- Lote con los datos de su microrruta, para la ficha del mapa.
create or replace view public.lotes_info
with (security_invoker = true) as
select l.fid, l.no_lote, l.microrruta, l.zona, coalesce(l.cuadrilla, m.cuadrilla) as cuadrilla,
       l.area_m2, m.frecuencia, l.comuna,
       coalesce(m.direccion, l.direccion, l.direccion_respaldo) as direccion,
       coalesce(m.descripcion, l.descripcion) as descripcion,
       st_y(st_pointonsurface(l.geom)) as lat, st_x(st_pointonsurface(l.geom)) as lon
from public.lotes l
left join public.microrrutas m on m.codigo = l.microrruta;

-- ¿En qué lote cae este punto?  select * from lote_en_punto(6.2844, -75.5980);
create or replace function public.lote_en_punto(lat double precision, lon double precision)
returns setof public.lotes_info
language sql stable
set search_path = public, extensions
as $$
  select i.* from public.lotes l
  join public.lotes_info i on i.fid = l.fid
  -- Parámetros con nombre completo: lotes_info también tiene columnas lat y lon.
  where st_intersects(l.geom, st_setsrid(st_makepoint(lote_en_punto.lon, lote_en_punto.lat), 4326));
$$;

-- Los lotes más cercanos a un punto, con la distancia en metros.
create or replace function public.lotes_cercanos(
  lat double precision, lon double precision,
  limite integer default 3, max_metros double precision default 150)
returns table (fid integer, no_lote text, microrruta text, distancia_m double precision)
language sql stable
set search_path = public, extensions
as $$
  with p as (select st_setsrid(st_makepoint(lotes_cercanos.lon, lotes_cercanos.lat), 4326) as g)
  select l.fid, l.no_lote, l.microrruta, round(st_distance(l.geom::geography, p.g::geography)::numeric, 1)::double precision
  from public.lotes l, p
  where st_dwithin(l.geom::geography, p.g::geography, max_metros)
  order by l.geom::geography <-> p.g::geography
  limit limite;
$$;

-- Seguridad: cualquiera con la llave pública puede LEER; escribir solo con la service key o desde el panel.
alter table public.microrrutas enable row level security;
alter table public.lotes       enable row level security;

drop policy if exists "leer microrrutas" on public.microrrutas;
create policy "leer microrrutas" on public.microrrutas for select using (true);
drop policy if exists "leer lotes" on public.lotes;
create policy "leer lotes" on public.lotes for select using (true);
