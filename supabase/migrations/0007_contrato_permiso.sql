-- Paso 8: el contrato (contrato_secciones) solo lo ven los administradores y los usuarios con perfiles.ver_contrato.
-- El administrador da o quita el permiso en usuarios.html. Va después de 0004 (columna ver_contrato).
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create or replace function public.puede_ver_contrato()
returns boolean
language sql stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and (rol = 'admin' or ver_contrato));
$$;

-- Lo que puede hacer el usuario de la sesión, en una sola consulta (encabezado de las páginas)
create or replace function public.mis_permisos()
returns jsonb
language sql stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('admin', public.es_admin(), 'contrato', public.puede_ver_contrato());
$$;

revoke all on function public.puede_ver_contrato(), public.mis_permisos() from public, anon;
grant execute on function public.puede_ver_contrato(), public.mis_permisos() to authenticated;

drop policy if exists "leer contrato con sesión" on public.contrato_secciones;
drop policy if exists "leer contrato con permiso" on public.contrato_secciones;
create policy "leer contrato con permiso" on public.contrato_secciones for select to authenticated
  using (public.puede_ver_contrato());
