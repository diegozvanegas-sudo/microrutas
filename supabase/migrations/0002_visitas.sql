-- Paso 2: visitas de interventoría (antes hojas Subsanaciones y Operación), ítems, recordatorios y pre-rutas.
-- Las reglas que hacía el Apps Script (ID, estado, ítems subsanados, fecha de subsanación, cantidad de novedades)
-- las hace aquí un trigger, así se cumplen sin importar desde dónde se guarde.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

-- En Supabase estos roles ya existen; en el PostGIS local se crean para que las políticas funcionen igual.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- ---------- Ítems a revisar (antes hojas "Items" e "Items Operación") ----------
create table if not exists public.items (
  id      serial primary key,
  tipo    text not null check (tipo in ('EJECUCION', 'OPERACION')),
  nombre  text not null,
  activo  boolean not null default true,   -- false = se oculta del formulario sin borrar lo registrado
  orden   integer not null default 0,
  unique (tipo, nombre)
);

insert into public.items (tipo, nombre, orden)
select 'EJECUCION', nombre, n from unnest(array[
  'LIMPIEZA PREVIA', 'AFECTACIÓN A ÁRBOLES', 'LIMPIEZA MANUAL ÁRBOLES', 'PLATEO',
  'CORTE DE CESPED: DISPAREJO/ALTURA', 'BORDEO', 'RECOLECCIÓN Y DISPOSICIÓN DE RESIDUOS',
  'BARRIDO: BARRIDO DEL LOTE Y LIMPIEZA DE ZONAS DURAS', 'SECTORES SIN INTERVENIR'
]) with ordinality as t(nombre, n)
on conflict (tipo, nombre) do nothing;

insert into public.items (tipo, nombre, orden)
select 'OPERACION', nombre, n from unnest(array[
  'IMPLEMENTACIÓN Y ESTADO DEL PMT', 'VALLA INFORMATIVA', 'MALLA(S) DE PROTECCIÓN', 'DEMARCACIÓN DEL ÁREA DE TRABAJO',
  'CARNET', 'ESTADO DE DOTACIÓN', 'EPP', 'HERRAMIENTAS', 'ROTULACIÓN DE RECIPIENTES', 'MANEJO DE COMBUSTIBLE'
]) with ordinality as t(nombre, n)
on conflict (tipo, nombre) do nothing;

-- ---------- Recordatorios de la visita de operación (solo se muestran en el formulario) ----------
create table if not exists public.recordatorios (
  id      serial primary key,
  texto   text not null unique,
  activo  boolean not null default true,
  orden   integer not null default 0
);

insert into public.recordatorios (texto, orden)
select texto, n from unnest(array[
  'Telas auxiliares, vallas y demás elementos de información del contrato: no deben figurar contratos viejos.',
  'Validar el estado de los elementos del equipo operativo (herramientas, dotación, EPP).',
  'Verificar que la cuadrilla delimite el área de trabajo y cuente con los elementos para hacerlo.',
  'Las evidencias de las novedades subsanadas se deben remitir oportunamente, al momento de subsanar (evitar solicitudes reiteradas).'
]) with ordinality as t(texto, n)
on conflict (texto) do nothing;

-- ---------- Visitas (antes hojas "Subsanaciones" = EJECUCION y "Operación" = OPERACION) ----------
create sequence if not exists public.visitas_sub_seq;
create sequence if not exists public.visitas_ope_seq;

create table if not exists public.visitas (
  id                       text primary key,               -- SUB-00001 / OPE-00001, lo pone el trigger
  tipo                     text not null check (tipo in ('EJECUCION', 'OPERACION')),
  microrruta               text,
  lote                     text,
  area_m2                  numeric,
  zona                     smallint,
  cuadrilla                text,
  fecha_ejecucion          date,                           -- solo EJECUCION
  fecha_visita             date,
  interventor              text,
  respuestas               jsonb not null default '{}',    -- {"PLATEO": "NO", "BORDEO": "SI", ...}  SI / NO / N/A
  observaciones            text,                           -- la nota del interventor, sin "PENDIENTE POR SUBSANAR"
  items_subsanados         text[] not null default '{}',   -- estuvieron en NO y ya pasaron a SI
  cantidad_novedades       integer not null default 0,
  estado                   text not null default 'SIN NOVEDAD'
                           check (estado in ('PENDIENTE', 'SUBSANADO', 'SIN NOVEDAD', 'CERRADO')),
  fecha_subsanacion        date,
  observacion_subsanacion  text,
  evidencia                text[] not null default '{}',   -- enlaces a las fotos
  registrado_por           text,
  creado                   timestamptz not null default now(),   -- FECHA DE REGISTRO
  actualizado              timestamptz not null default now()    -- ÚLTIMA MODIFICACIÓN
);

create index if not exists visitas_lote_idx       on public.visitas (lote, fecha_visita desc);
create index if not exists visitas_microrruta_idx on public.visitas (microrruta);
create index if not exists visitas_estado_idx     on public.visitas (tipo, estado);
create index if not exists visitas_creado_idx     on public.visitas (creado desc);

create or replace function public.visitas_calcular()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  k text;
  v text;
  limpias jsonb := '{}';
  en_no text[];
  hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;          -- el ID y el tipo no se cambian
    new.tipo := old.tipo;
    new.creado := old.creado;
  elsif new.id is null then
    new.id := case new.tipo
      when 'OPERACION' then 'OPE-' || lpad(nextval('public.visitas_ope_seq')::text, 5, '0')
      else 'SUB-' || lpad(nextval('public.visitas_sub_seq')::text, 5, '0') end;
  end if;

  -- Respuestas: solo ítems que existan para el tipo, y valores SI / NO / N/A (vacío = sin responder)
  for k, v in select key, upper(trim(value #>> '{}')) from jsonb_each(coalesce(new.respuestas, '{}')) loop
    if not exists (select 1 from public.items i where i.tipo = new.tipo and i.nombre = k) then
      raise exception 'Ítem desconocido para %: "%"', new.tipo, k;
    end if;
    v := case when v in ('NA', 'N.A', 'N.A.', 'NO APLICA') then 'N/A' else v end;
    continue when v is null or v = '';
    if v not in ('SI', 'NO', 'N/A') then
      raise exception 'Valor no válido en "%": "%" (use SI, NO o N/A)', k, v;
    end if;
    limpias := limpias || jsonb_build_object(k, v);
  end loop;
  new.respuestas := limpias;

  select coalesce(array_agg(key order by key), '{}') into en_no
  from jsonb_each_text(new.respuestas) where value = 'NO';

  -- Lo que estaba en NO y ahora está en SI queda anotado como subsanado;
  -- un ítem que vuelve a quedar en NO deja de contar como subsanado.
  new.items_subsanados := coalesce(new.items_subsanados, '{}');
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key), '{}') into new.items_subsanados from (
      select unnest(new.items_subsanados) as key
      union
      select key from jsonb_each_text(old.respuestas) o
      where o.value = 'NO' and new.respuestas ->> o.key = 'SI'
    ) s;
  end if;
  select coalesce(array_agg(s order by s), '{}') into new.items_subsanados
  from unnest(new.items_subsanados) s where s <> all (en_no);

  new.cantidad_novedades := cardinality(en_no) + cardinality(new.items_subsanados);

  -- Estado: algún NO = PENDIENTE; "LOTE CERRADO" = CERRADO; todo bien después de un NO = SUBSANADO
  new.estado := case
    when cardinality(en_no) > 0 then 'PENDIENTE'
    when new.observaciones ~* 'LOTE CERRADO' then 'CERRADO'
    when cardinality(new.items_subsanados) > 0
      or (tg_op = 'UPDATE' and old.estado in ('PENDIENTE', 'SUBSANADO')) then 'SUBSANADO'
    else 'SIN NOVEDAD'
  end;

  if new.estado = 'SUBSANADO' and new.fecha_subsanacion is null then
    new.fecha_subsanacion := hoy;
  end if;

  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists visitas_calcular on public.visitas;
create trigger visitas_calcular before insert or update on public.visitas
for each row execute function public.visitas_calcular();

-- Visitas con la observación como en el Excel de interventoría y los días que lleva pendiente.
create or replace view public.visitas_detalle
with (security_invoker = true) as
select v.*,
  case
    when v.observaciones ~* 'LOTE (CERRADO|NO REALIZADO)' then trim(v.observaciones)
    when v.estado = 'PENDIENTE' then 'PENDIENTE POR SUBSANAR' || coalesce(' - ' || nullif(trim(v.observaciones), ''), '')
    when v.estado = 'SUBSANADO' then 'NOVEDAD SUBSANADA' || coalesce(' EL ' || to_char(v.fecha_subsanacion, 'DD/MM/YYYY'), '')
                                     || coalesce(' - ' || nullif(trim(v.observaciones), ''), '')
    else coalesce(nullif(trim(v.observaciones), ''), 'SIN NOVEDAD')
  end as observacion_excel,
  case when v.estado = 'PENDIENTE' and v.fecha_visita is not null
       then (now() at time zone 'America/Bogota')::date - v.fecha_visita end as dias_pendiente
from public.visitas v;

-- ---------- Pre-rutas (antes hoja "Rutas"): lotes que mandan a revisar, por cuadrilla ----------
create table if not exists public.rutas (
  id               bigserial primary key,
  cuadrilla        text not null,
  lote             text not null,
  fecha_ejecucion  date,
  orden            integer,
  cargada          timestamptz not null default now(),   -- cuándo llegó el lote
  en_curso         timestamptz                           -- desde cuándo la cuadrilla trabaja ahí
);

create index if not exists rutas_cuadrilla_idx on public.rutas (cuadrilla, orden);

-- "C4", "c 4" y "4" son la misma cuadrilla; los lotes en mayúscula.
create or replace function public.rutas_normalizar()
returns trigger language plpgsql as $$
begin
  new.cuadrilla := regexp_replace(trim(new.cuadrilla), '^C\s*', '', 'i');
  new.lote := upper(trim(new.lote));
  return new;
end;
$$;

drop trigger if exists rutas_normalizar on public.rutas;
create trigger rutas_normalizar before insert or update on public.rutas
for each row execute function public.rutas_normalizar();

-- Reemplaza todos los lotes de una cuadrilla por la lista recibida (vacía = quitar la cuadrilla).
-- paradas: [{"lote": "532", "fecha": "2026-10-21", "cargada": "...", "encurso": "..."}, ...]
create or replace function public.guardar_ruta(cuadrilla text, paradas jsonb)
returns setof public.rutas
language plpgsql
set search_path = public, extensions
as $$
declare
  cuad text := regexp_replace(trim(guardar_ruta.cuadrilla), '^C\s*', '', 'i');
begin
  delete from public.rutas r where r.cuadrilla = cuad;
  insert into public.rutas (cuadrilla, lote, fecha_ejecucion, orden, cargada, en_curso)
  select cuad, p.lote, nullif(p.fecha, '')::date, p.n::integer,
         coalesce(nullif(p.cargada, '')::timestamptz, now()), nullif(p.encurso, '')::timestamptz
  from rows from (jsonb_to_recordset(coalesce(paradas, '[]')) as (lote text, fecha text, cargada text, encurso text))
       with ordinality as p(lote, fecha, cargada, encurso, n)
  where coalesce(trim(p.lote), '') <> '';
  return query select * from public.rutas r where r.cuadrilla = cuad order by r.orden;
end;
$$;

-- ---------- Seguridad ----------
-- Ítems y recordatorios: los lee cualquiera; se cambian desde el panel de Supabase.
-- Visitas y rutas: solo usuarios que iniciaron sesión (el login se agrega en el paso 3).
alter table public.items         enable row level security;
alter table public.recordatorios enable row level security;
alter table public.visitas       enable row level security;
alter table public.rutas         enable row level security;

drop policy if exists "leer items" on public.items;
create policy "leer items" on public.items for select using (true);
drop policy if exists "leer recordatorios" on public.recordatorios;
create policy "leer recordatorios" on public.recordatorios for select using (true);

drop policy if exists "interventores visitas" on public.visitas;
create policy "interventores visitas" on public.visitas for all to authenticated using (true) with check (true);
drop policy if exists "interventores rutas" on public.rutas;
create policy "interventores rutas" on public.rutas for all to authenticated using (true) with check (true);
