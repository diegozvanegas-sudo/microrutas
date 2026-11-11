-- Paso 20: envíos de WhatsApp programados (⏰ Programar en Informe, Despacho, Subsanaciones y 🗓️ Envíos programados).
-- La página guarda el mensaje (y su archivo en el almacenamiento privado «whatsapp-programados»); cada 5 minutos una tarea
-- de la base (pg_cron) llama a la función «whatsapp» con la acción enviarProgramados, que manda por Evolution API los que
-- ya tocan, aunque el celular y el computador estén apagados. La tarea se activa aparte, con scripts/activar_programados.mjs
-- (necesita la dirección del proyecto y un secreto). Cada quien ve y cancela los suyos; el administrador ve todos.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.whatsapp_programados (
  id              uuid primary key default gen_random_uuid(),
  para            text not null,                     -- celular (3001234567) o ID de grupo (…@g.us)
  para_nombre     text not null default '',          -- nombre del grupo o de la persona, para mostrarlo
  texto           text not null default '',
  archivo_ruta    text,                              -- ruta en el almacenamiento «whatsapp-programados» (<usuario>/<id>/<nombre>)
  archivo_nombre  text,
  archivo_mime    text,
  enviar_en       timestamptz not null,
  origen          text not null default '',          -- Informe diario · Despacho · Subsanaciones · Envíos programados
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'cancelado')),
  intentos        integer not null default 0,
  error           text not null default '',
  enviado_en      timestamptz,
  tomado          timestamptz,                       -- cuándo lo tomó la función para enviarlo
  usuario        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  creado          timestamptz not null default now(),
  check (texto <> '' or archivo_ruta is not null)
);
create index if not exists whatsapp_programados_por_enviar_idx on public.whatsapp_programados (enviar_en) where estado = 'pendiente';
create index if not exists whatsapp_programados_usuario_idx on public.whatsapp_programados (usuario, enviar_en desc);

alter table public.whatsapp_programados enable row level security;

drop policy if exists "ver envios propios" on public.whatsapp_programados;
create policy "ver envios propios" on public.whatsapp_programados for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
-- Se crea siempre pendiente; el envío lo hace la función con la llave de servicio
drop policy if exists "programar envio" on public.whatsapp_programados;
create policy "programar envio" on public.whatsapp_programados for insert to authenticated
  with check (usuario = auth.uid() and estado = 'pendiente' and intentos = 0 and enviado_en is null and tomado is null);
-- Mientras esté pendiente se puede cambiar o cancelar (no se puede marcar como enviado a mano)
drop policy if exists "cambiar envio pendiente" on public.whatsapp_programados;
create policy "cambiar envio pendiente" on public.whatsapp_programados for update to authenticated
  using (usuario = auth.uid() and estado = 'pendiente')
  with check (usuario = auth.uid() and estado in ('pendiente', 'cancelado') and enviado_en is null and tomado is null);
drop policy if exists "eliminar envios propios" on public.whatsapp_programados;
create policy "eliminar envios propios" on public.whatsapp_programados for delete to authenticated
  using (usuario = auth.uid() and estado <> 'enviando');

-- Archivos de los envíos: privados, cada quien en su carpeta (<usuario>/…). Hasta 20 MB (lo que deja pasar WhatsApp en documentos es más,
-- pero el puente los manda en base64)
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-programados', 'whatsapp-programados', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "subir archivo de envio" on storage.objects;
create policy "subir archivo de envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp-programados' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "ver archivo de envio" on storage.objects;
create policy "ver archivo de envio" on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp-programados' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "borrar archivo de envio" on storage.objects;
create policy "borrar archivo de envio" on storage.objects for delete to authenticated
  using (bucket_id = 'whatsapp-programados' and (storage.foldername(name))[1] = auth.uid()::text);

-- La tarea programada se identifica con un secreto guardado en Vault (lo crea scripts/activar_programados.mjs).
-- Solo la función (llave de servicio) puede preguntar si el secreto es el correcto.
create or replace function public.whatsapp_cron_ok(secreto text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from vault.decrypted_secrets s where s.name = 'whatsapp_cron' and s.decrypted_secret = secreto and coalesce(secreto, '') <> '');
$$;
revoke all on function public.whatsapp_cron_ok(text) from public, anon, authenticated;
grant execute on function public.whatsapp_cron_ok(text) to service_role;

-- Toma los que ya tocan (máximo «cuantos») y los marca «enviando» de una vez, para que dos llamadas seguidas no los manden dos veces.
-- Los que quedaron «enviando» más de 15 minutos (la función se cayó a mitad) vuelven a intentarse.
create or replace function public.whatsapp_tomar_pendientes(cuantos integer default 20)
returns setof public.whatsapp_programados
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.whatsapp_programados set estado = 'pendiente'
  where estado = 'enviando' and tomado < now() - interval '15 minutes';
  return query
  update public.whatsapp_programados w set estado = 'enviando', intentos = w.intentos + 1, tomado = now()
  where w.id in (select id from public.whatsapp_programados
                 where estado = 'pendiente' and enviar_en <= now()
                 order by enviar_en limit greatest(1, least(cuantos, 50))
                 for update skip locked)
  returning w.*;
end;
$$;
revoke all on function public.whatsapp_tomar_pendientes(integer) from public, anon, authenticated;
grant execute on function public.whatsapp_tomar_pendientes(integer) to service_role;

-- La tarea cada 5 minutos usa pg_cron y pg_net (extensiones de Supabase)
create extension if not exists pg_cron;
create extension if not exists pg_net;
