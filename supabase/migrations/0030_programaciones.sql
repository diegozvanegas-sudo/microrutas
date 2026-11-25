-- Paso 30: la programación del mes en la base (antes quedaba solo en cada equipo: había que subir el Excel en cada
-- computador y en cada celular).
-- Una fila por mes con el Excel ya leído (datos: Q1, Q2, especiales y SIF, como lo deja leerProgramacion) y, aparte, lo
-- hecho en corto (hechos: [[microrruta, lote, quincena, fecha], …]) para la 🔮 predicción, que lee todos los meses sin
-- bajar los Excel completos. La usan Programación del día, Cruce, Espartillos, Programación por cercanía, Requerimientos
-- y los ⭐ Especiales del mapa.
-- Es de todo el equipo: cualquiera con sesión la lee y la sube (queda quién la cambió por última vez). No se borra desde
-- la app. version sube en cada cambio: si dos equipos editan el mismo mes, el segundo no pisa al primero (la app lo avisa).
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.programaciones (
  mes         text primary key check (mes ~ '^\d{4}-\d{2}$'),                  -- aaaa-mm
  archivo     text not null default '' check (char_length(archivo) <= 200),    -- nombre del Excel
  datos       jsonb not null,                                                  -- { mes, q1, q2, especiales, sif }
  hechos      jsonb not null default '[]'::jsonb,                              -- [[mr, lote, q, aaaa-mm-dd], …]
  lotes       integer not null default 0 check (lotes >= 0),
  version     integer not null default 1 check (version >= 1),
  usuario     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  actualizado timestamptz not null default now()
);

alter table public.programaciones enable row level security;

drop policy if exists "ver programaciones" on public.programaciones;
create policy "ver programaciones" on public.programaciones for select to authenticated using (true);
drop policy if exists "subir programacion" on public.programaciones;
create policy "subir programacion" on public.programaciones for insert to authenticated with check (usuario = auth.uid());
drop policy if exists "cambiar programacion" on public.programaciones;
create policy "cambiar programacion" on public.programaciones for update to authenticated
  using (true) with check (usuario = auth.uid());

grant select, insert, update on public.programaciones to authenticated;
