-- Paso 33: puntos críticos de basura (🗑 capa «Puntos críticos» del mapa rápido).
-- Los puntos de siempre están en el archivo del mapa (data/rapido/capa_puntos_criticos.js). Aquí quedan los que se agregan
-- en los recorridos (origen 'campo', id 'c:…') y lo que se le corrige a cualquiera: nombre, dirección, zona y descripción
-- (un punto del archivo, origen 'fijo', se guarda con id 'f:' + sus coordenadas del archivo y no se mueve).
-- quitado = ya no es punto crítico (se deja de ver, pero queda el registro).
-- Es de todo el equipo, como los puntos especiales (0029): cualquiera con sesión agrega, corrige o quita; queda quién lo
-- cambió por última vez. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.puntos_criticos (
  id          text primary key check (char_length(id) between 3 and 60),
  nombre      text not null default '' check (char_length(nombre) <= 200),
  direccion   text not null default '' check (char_length(direccion) <= 300),
  zona        text not null default '' check (char_length(zona) <= 40),
  descripcion text not null default '' check (char_length(descripcion) <= 1000),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  origen      text not null default 'campo' check (origen in ('campo', 'fijo')),
  quitado     boolean not null default false,
  usuario     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

alter table public.puntos_criticos enable row level security;

drop policy if exists "ver puntos criticos" on public.puntos_criticos;
create policy "ver puntos criticos" on public.puntos_criticos for select to authenticated using (true);
drop policy if exists "agregar punto critico" on public.puntos_criticos;
create policy "agregar punto critico" on public.puntos_criticos for insert to authenticated with check (usuario = auth.uid());
drop policy if exists "corregir punto critico" on public.puntos_criticos;
create policy "corregir punto critico" on public.puntos_criticos for update to authenticated
  using (true) with check (usuario = auth.uid());

grant select, insert, update on public.puntos_criticos to authenticated;
