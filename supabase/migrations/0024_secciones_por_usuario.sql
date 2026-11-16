-- Paso 24: qué secciones y herramientas ve cada usuario (👥 Usuarios → Editar → Secciones).
-- Se guarda lo que el administrador le APAGÓ a cada uno (perfiles.ocultas). Vacío = ve todo lo que ve hoy, así nadie pierde
-- nada al aplicar esto. Las claves son las de web/src/secciones.js (subsanaciones, pqr, horas, fotos, …).
-- Los administradores siempre ven todo. Contrato, Guía de campo y Requerimientos además siguen pidiendo «Puede ver el
-- contrato» (0007), que es lo que protege esos datos en la base.
-- Lo aplica la página (menú y aviso «No tiene acceso» al abrir el enlace directo); los datos de cada tabla siguen con sus
-- reglas de siempre.
-- Va después de 0012. Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

alter table public.perfiles add column if not exists ocultas text[] not null default '{}';

-- Lo que puede hacer el usuario de la sesión (encabezado de las páginas); antes en 0012, ahora con 'ocultas'
create or replace function public.mis_permisos()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'admin', public.es_admin(),
    'contrato', public.puede_ver_contrato(),
    'horarios', public.puede_cargar_horarios(),
    'ocultas', case when public.es_admin() then '[]'::jsonb
                    else coalesce((select to_jsonb(p.ocultas) from public.perfiles p where p.id = auth.uid()), '[]'::jsonb) end);
$$;

-- La lista de usuarios ahora trae lo que cada uno tiene apagado
drop function if exists public.admin_usuarios();
create function public.admin_usuarios()
returns table (id uuid, correo text, nombre text, rol text, activo boolean, creado timestamptz,
               ultimo_ingreso timestamptz, visitas integer, subsanadas integer, ver_contrato boolean, ocultas text[])
language plpgsql stable
security definer
set search_path = public, extensions
as $$
begin
  perform public.exigir_admin();
  return query
  select u.id, u.email::text, p.nombre, coalesce(p.rol, 'interventor'),
         u.banned_until is null or u.banned_until < now(), u.created_at, u.last_sign_in_at,
         (select count(*)::int from public.visitas v where v.creado_por = u.id),
         (select count(*)::int from public.visitas v where v.subsanado_por_id = u.id),
         p.rol = 'admin' or coalesce(p.ver_contrato, false),
         coalesce(p.ocultas, '{}')
  from auth.users u left join public.perfiles p on p.id = u.id
  order by p.rol, lower(coalesce(p.nombre, u.email));
end;
$$;

-- Guarda lo que se le apaga a un usuario (la lista completa: lo que no venga queda encendido)
create or replace function public.admin_secciones(usuario uuid, ocultas text[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  limpias text[];
begin
  perform public.exigir_admin();
  if not exists (select 1 from public.perfiles p where p.id = usuario) then
    raise exception 'No existe el usuario';
  end if;
  if coalesce(array_length(ocultas, 1), 0) > 100 then
    raise exception 'Demasiadas secciones (%)', array_length(ocultas, 1);
  end if;
  if exists (select 1 from unnest(coalesce(ocultas, '{}')) c where c !~ '^[a-z][a-z0-9_]{1,29}$') then
    raise exception 'Hay una sección con un nombre no válido';
  end if;
  select coalesce(array_agg(distinct c order by c), '{}') into limpias from unnest(coalesce(ocultas, '{}')) c;
  update public.perfiles p set ocultas = limpias where p.id = usuario;
end;
$$;

revoke all on function public.mis_permisos(), public.admin_usuarios(), public.admin_secciones(uuid, text[]) from public, anon;
grant execute on function public.mis_permisos(), public.admin_usuarios(), public.admin_secciones(uuid, text[]) to authenticated;
