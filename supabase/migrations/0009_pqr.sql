-- Paso 9: PQR (pqr.html). La queja (leída de la foto o pegada), lo que se encontró en la visita y la respuesta.
-- Traen nombre y teléfono del ciudadano: cada quien ve y cambia solo los suyos; el administrador ve todos.
-- La foto de la queja no se guarda (solo el texto leído). Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.pqrs (
  id           uuid primary key default gen_random_uuid(),
  radicado     text not null default '',          -- ID del PQR (441181)
  fecha_pqr    date,
  nombre       text not null default '',
  telefono     text not null default '',
  direccion    text not null default '',
  barrio       text not null default '',
  queja        text not null default '',
  visita       jsonb not null default '{}',       -- { resultado, fechaCorte, fechaVisita, fechaProxima, contacto, cobro, area, observacion }
  respuesta    text not null default '',
  estado       text not null default 'abierto',   -- abierto · respondido
  usuario      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists pqrs_usuario_idx on public.pqrs (usuario, creado desc);

alter table public.pqrs enable row level security;

drop policy if exists "ver pqr propios" on public.pqrs;
create policy "ver pqr propios" on public.pqrs for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear pqr" on public.pqrs;
create policy "crear pqr" on public.pqrs for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar pqr propios" on public.pqrs;
create policy "cambiar pqr propios" on public.pqrs for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists "eliminar pqr propios" on public.pqrs;
create policy "eliminar pqr propios" on public.pqrs for delete to authenticated
  using (usuario = auth.uid());

revoke all on public.pqrs from anon;
grant select, insert, update, delete on public.pqrs to authenticated;
