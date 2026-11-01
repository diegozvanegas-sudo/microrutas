-- Paso 16: Revisión de LV, RyT y plan de choque (revision.html) y reporte de Despacho (despacho.html).
-- revisiones: una fila por cada revisión de una ruta; el checklist va por ruta (items) y por operario (operarios).
-- reportes_despacho: una fila por usuario y fecha, con lo escrito en cada sección y turno.
-- El id de revisiones lo pone el celular: así, lo guardado sin señal no se duplica al enviarlo.
-- Cada quien ve y cambia solo los suyos; el administrador ve todos. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.revisiones (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  turno        text not null default '' check (turno in ('', 'Mañana', 'Intermedio', 'Tarde', 'Noche')),
  tipo         text not null check (tipo in ('lv', 'ryt', 'plan')),
  ruta         text not null,                      -- código de la ruta, o el sector en un plan de choque
  zona         text not null default '',
  control      text not null default '',           -- RyT: control o vehículo
  items        jsonb not null default '{}',        -- {"r_ruta": "si" | "no" | "na", …}
  operarios    jsonb not null default '[]',        -- [{"nombre": "", "items": {…}, "novedad": "", "enlace": ""}, …]
  novedad      text not null default '',
  enlace       text not null default '',           -- enlace opcional a la evidencia
  usuario      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);
create index if not exists revisiones_usuario_fecha_idx on public.revisiones (usuario, fecha);

create table if not exists public.reportes_despacho (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  datos        jsonb not null default '{}',        -- {"asignacion": {"t1": "", "t2": ""}, …}
  usuario      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),
  unique (usuario, fecha)
);

alter table public.revisiones enable row level security;
alter table public.reportes_despacho enable row level security;

drop policy if exists "ver revisiones propias" on public.revisiones;
create policy "ver revisiones propias" on public.revisiones for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear revision" on public.revisiones;
create policy "crear revision" on public.revisiones for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar revisiones propias" on public.revisiones;
create policy "cambiar revisiones propias" on public.revisiones for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists "eliminar revisiones propias" on public.revisiones;
create policy "eliminar revisiones propias" on public.revisiones for delete to authenticated
  using (usuario = auth.uid());

drop policy if exists "ver despacho propio" on public.reportes_despacho;
create policy "ver despacho propio" on public.reportes_despacho for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear despacho" on public.reportes_despacho;
create policy "crear despacho" on public.reportes_despacho for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar despacho propio" on public.reportes_despacho;
create policy "cambiar despacho propio" on public.reportes_despacho for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());

revoke all on public.revisiones, public.reportes_despacho from anon;
grant select, insert, update, delete on public.revisiones to authenticated;
grant select, insert, update on public.reportes_despacho to authenticated;
