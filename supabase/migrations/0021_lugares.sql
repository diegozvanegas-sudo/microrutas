-- Paso 21: libreta de nombres que usa la gente (📍 Ubicar direcciones, en el menú Más).
-- «La Cañada», «segundo parqueadero de Villa Flora», «sector Convento»: nombres que no están en ninguna base. Cuando alguien
-- confirma a qué lote o punto corresponde uno, lo guarda aquí y desde ahí la herramienta (y el bot de WhatsApp) lo reconocen
-- en cualquier mensaje. La libreta es de todo el equipo: todos la ven y la alimentan; cada quien cambia o borra lo que
-- guardó, y el administrador todo.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.lugares (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(nombre) between 3 and 80),   -- como lo escribe la gente
  clave       text not null unique check (char_length(clave) >= 4),         -- sin tildes, minúsculas y sin «de la»: para comparar
  lote        text,                                                          -- número de lote (386)
  microrruta  text,                                                          -- o la microrruta (Z2CC0188) si el lote no tiene número
  lat         double precision,                                              -- punto confirmado (opcional)
  lon         double precision,
  nota        text not null default '',
  usuario     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado      timestamptz not null default now(),
  check (lote is not null or microrruta is not null or (lat is not null and lon is not null)),
  check ((lat is null) = (lon is null))
);

alter table public.lugares enable row level security;

drop policy if exists "ver lugares" on public.lugares;
create policy "ver lugares" on public.lugares for select to authenticated using (true);
drop policy if exists "guardar lugar" on public.lugares;
create policy "guardar lugar" on public.lugares for insert to authenticated with check (usuario = auth.uid());
drop policy if exists "cambiar lugar propio" on public.lugares;
create policy "cambiar lugar propio" on public.lugares for update to authenticated
  using (usuario = auth.uid() or public.es_admin()) with check (usuario = auth.uid() or public.es_admin());
drop policy if exists "borrar lugar propio" on public.lugares;
create policy "borrar lugar propio" on public.lugares for delete to authenticated
  using (usuario = auth.uid() or public.es_admin());

grant select, insert, update, delete on public.lugares to authenticated;
