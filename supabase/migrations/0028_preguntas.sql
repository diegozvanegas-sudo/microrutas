-- Paso 28: 🤖 Pregúntale a Claude (preguntar.html, menú General).
-- Cada pregunta queda en public.preguntas como «pendiente». El trabajador del PC (scripts/asistente/trabajador.mjs, lo
-- arranca el motor de Aplicaciones) la toma, arma una carpeta con los datos que ESE usuario puede ver (consulta con su
-- sesión: la base aplica las mismas reglas de siempre), se la pasa a Claude Code (plan del PC, solo lectura) y guarda
-- la respuesta. Desde el celular la pregunta espera en cola hasta que el PC esté prendido.
-- asistente_latido: el trabajador marca aquí cada 30 s que está prendido, para que la página lo diga.
-- Cada quien ve, crea y borra solo sus preguntas (el administrador ve todas). Responder solo lo hace el trabajador.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.preguntas (
  id          uuid primary key default gen_random_uuid(),
  hilo        uuid not null default gen_random_uuid(),   -- las preguntas de una misma conversación comparten hilo
  texto       text not null check (char_length(texto) between 1 and 4000),
  modelo      text not null default 'rapido' check (modelo in ('rapido', 'fondo')),
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'respondiendo', 'lista', 'error')),
  respuesta   text not null default '',
  error       text not null default '',
  usuario     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado      timestamptz not null default now(),
  tomado      timestamptz,
  respondido  timestamptz
);
create index if not exists preguntas_usuario_creado on public.preguntas (usuario, creado desc);
create index if not exists preguntas_pendientes on public.preguntas (creado) where estado = 'pendiente';

create table if not exists public.asistente_latido (
  id     text primary key,
  visto  timestamptz not null default now(),
  info   jsonb not null default '{}'::jsonb
);

alter table public.preguntas enable row level security;
alter table public.asistente_latido enable row level security;

drop policy if exists "ver preguntas propias" on public.preguntas;
create policy "ver preguntas propias" on public.preguntas for select to authenticated
  using ((usuario = auth.uid() and public.entra_microrutas()) or public.es_admin());
drop policy if exists "crear pregunta" on public.preguntas;
create policy "crear pregunta" on public.preguntas for insert to authenticated
  with check (usuario = auth.uid() and estado = 'pendiente' and respuesta = '' and error = '' and public.entra_microrutas());
drop policy if exists "borrar preguntas propias" on public.preguntas;
create policy "borrar preguntas propias" on public.preguntas for delete to authenticated
  using (usuario = auth.uid() or public.es_admin());

drop policy if exists "ver latido" on public.asistente_latido;
create policy "ver latido" on public.asistente_latido for select to authenticated using (public.entra_microrutas());

grant select, insert, delete on public.preguntas to authenticated;
grant select on public.asistente_latido to authenticated;
