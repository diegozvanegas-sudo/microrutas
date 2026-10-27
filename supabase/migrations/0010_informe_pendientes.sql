-- Paso 10: Informe diario (informe.html) y Pendientes (pendientes.html).
-- informes: lo que se hizo en el día, una fila por usuario y fecha; se copia a WhatsApp como "Reporte diario de actividades".
-- pendientes: lo que queda por hacer, con día y momento (mañana / tarde). Al marcarlo hecho, el informe de ese día lo sugiere.
-- Cada quien ve y cambia solo los suyos; el administrador ve todos. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.informes (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  actividades  jsonb not null default '[]',       -- ["Se realizaron visitas de posoperación…", …]
  usuario      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  unique (usuario, fecha)
);

create table if not exists public.pendientes (
  id           uuid primary key default gen_random_uuid(),
  texto        text not null,
  fecha        date,                               -- nulo = sin día
  momento      text not null default '' check (momento in ('', 'manana', 'tarde')),
  hecho        boolean not null default false,
  hecho_en     date,                               -- día en que se marcó hecho (para el informe de ese día)
  usuario      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado       timestamptz not null default now()
);
create index if not exists pendientes_usuario_idx on public.pendientes (usuario, hecho, fecha);

alter table public.informes enable row level security;
alter table public.pendientes enable row level security;

drop policy if exists "ver informes propios" on public.informes;
create policy "ver informes propios" on public.informes for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear informe" on public.informes;
create policy "crear informe" on public.informes for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar informes propios" on public.informes;
create policy "cambiar informes propios" on public.informes for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists "eliminar informes propios" on public.informes;
create policy "eliminar informes propios" on public.informes for delete to authenticated
  using (usuario = auth.uid());

drop policy if exists "ver pendientes propios" on public.pendientes;
create policy "ver pendientes propios" on public.pendientes for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear pendiente" on public.pendientes;
create policy "crear pendiente" on public.pendientes for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar pendientes propios" on public.pendientes;
create policy "cambiar pendientes propios" on public.pendientes for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists "eliminar pendientes propios" on public.pendientes;
create policy "eliminar pendientes propios" on public.pendientes for delete to authenticated
  using (usuario = auth.uid());

revoke all on public.informes, public.pendientes from anon;
grant select, insert, update, delete on public.informes, public.pendientes to authenticated;
