-- Paso 29: dónde queda cada operación especial (⭐ Especiales del mapa rápido).
-- Las especiales salen del Excel de programación de cada mes (Caracol del Tránsito, Planta de Operaciones Emvarias…) y se
-- ubican solas por la dirección, pero muchas no se encuentran o quedan corridas. Cuando alguien pone el punto a mano, se
-- guarda aquí por el código de la ruta (sin tildes y en mayúsculas) y lo ven todos los equipos y los Excel siguientes.
-- Es de todo el equipo: cualquiera con sesión lo corrige (queda quién lo cambió por última vez) o lo quita.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.puntos_especiales (
  clave       text primary key check (char_length(clave) between 2 and 160),   -- código de ruta en mayúsculas («CARACOL DEL TRÁNSITO»)
  nombre      text not null default '' check (char_length(nombre) <= 200),     -- como viene en el Excel
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  usuario     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  actualizado timestamptz not null default now()
);

alter table public.puntos_especiales enable row level security;

drop policy if exists "ver puntos especiales" on public.puntos_especiales;
create policy "ver puntos especiales" on public.puntos_especiales for select to authenticated using (true);
drop policy if exists "poner punto especial" on public.puntos_especiales;
create policy "poner punto especial" on public.puntos_especiales for insert to authenticated with check (usuario = auth.uid());
drop policy if exists "corregir punto especial" on public.puntos_especiales;
create policy "corregir punto especial" on public.puntos_especiales for update to authenticated
  using (true) with check (usuario = auth.uid());
drop policy if exists "quitar punto especial" on public.puntos_especiales;
create policy "quitar punto especial" on public.puntos_especiales for delete to authenticated using (true);

grant select, insert, update, delete on public.puntos_especiales to authenticated;
