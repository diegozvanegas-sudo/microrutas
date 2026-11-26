-- Paso 31: qué secciones existen en ESTA instalación (👥 Usuarios → ⚙️ Esta instalación).
-- La misma app se puede montar en otro proyecto de Supabase (p. ej. una versión de prueba solo con Subsanaciones y Mapa):
-- el administrador apaga aquí lo que no va, y queda apagado para TODOS, administradores incluidos. Encima de esto siguen
-- las secciones por usuario (0024, perfiles.ocultas).
-- Se guarda solo lo apagado, con las claves de web/src/secciones.js. Vacío = todo encendido, así la app de siempre queda igual.
-- La lee cualquiera, también sin sesión (el mapa rápido no pide sesión): dice qué está apagado, no trae datos.
-- Va después de 0025. Se puede correr varias veces sin dañar nada.
set search_path = public, extensions;

create table if not exists public.instalacion (
  id             int primary key default 1 check (id = 1),     -- una sola fila
  apagadas       text[] not null default '{}',
  actualizado    timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null
);
alter table public.instalacion enable row level security;
-- Sin reglas: nadie la lee ni la cambia directo; se usa con las funciones de abajo
revoke all on public.instalacion from public, anon, authenticated;
insert into public.instalacion (id) values (1) on conflict (id) do nothing;

-- Lo apagado en la instalación (para el menú, el aviso «No disponible» y el mapa sin sesión)
create or replace function public.config_instalacion()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('apagadas', coalesce((select to_jsonb(i.apagadas) from public.instalacion i where i.id = 1), '[]'::jsonb));
$$;

-- Solo el administrador la cambia
create or replace function public.admin_instalacion(apagadas text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  limpias text[];
begin
  perform public.exigir_admin();
  if coalesce(array_length(apagadas, 1), 0) > 100 then
    raise exception 'Demasiadas secciones (%)', array_length(apagadas, 1);
  end if;
  if exists (select 1 from unnest(coalesce(apagadas, '{}')) c where c !~ '^[a-z][a-z0-9_]{1,29}$') then
    raise exception 'Hay una sección con un nombre no válido';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into limpias from unnest(coalesce(apagadas, '{}')) c;
  insert into public.instalacion (id, apagadas, actualizado, actualizado_por) values (1, limpias, now(), auth.uid())
    on conflict (id) do update set apagadas = excluded.apagadas, actualizado = now(), actualizado_por = auth.uid();
end;
$$;

-- Los permisos de la sesión ahora traen también lo apagado en la instalación (igual que 0025, más 'instalacion')
create or replace function public.mis_permisos()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'microrutas', public.entra_microrutas(),
    'admin', public.es_admin(),
    'contrato', public.puede_ver_contrato(),
    'horarios', public.puede_cargar_horarios(),
    'ocultas', case when public.es_admin() then '[]'::jsonb
                    else coalesce((select to_jsonb(p.ocultas) from public.perfiles p where p.id = auth.uid()), '[]'::jsonb) end,
    'instalacion', public.config_instalacion() -> 'apagadas');
$$;

revoke all on function public.config_instalacion(), public.admin_instalacion(text[]) from public, anon;
grant execute on function public.config_instalacion() to anon, authenticated;
grant execute on function public.admin_instalacion(text[]) to authenticated;
revoke all on function public.mis_permisos() from public, anon;
grant execute on function public.mis_permisos() to authenticated;
