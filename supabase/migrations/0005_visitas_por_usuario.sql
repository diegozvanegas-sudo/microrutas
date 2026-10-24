-- Paso 6: cada interventor ve y cambia solo sus visitas; el administrador ve todas.
-- La dueña de la visita es creado_por (lo pone el trigger visitas_usuario de 0004 con la sesión).
-- Visitas sin creado_por (registradas antes del paso 5 con iniciales) solo las ve el administrador.
-- Las pre-rutas (rutas) siguen compartidas: las arma la interventoría para todas las cuadrillas.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

drop policy if exists "interventores visitas" on public.visitas;

drop policy if exists "ver visitas propias" on public.visitas;
create policy "ver visitas propias" on public.visitas for select to authenticated
  using (creado_por = auth.uid() or public.es_admin());

drop policy if exists "registrar visitas" on public.visitas;
create policy "registrar visitas" on public.visitas for insert to authenticated
  with check (true);   -- el trigger la deja a nombre de quien la registra

drop policy if exists "cambiar visitas propias" on public.visitas;
create policy "cambiar visitas propias" on public.visitas for update to authenticated
  using (creado_por = auth.uid() or public.es_admin())
  with check (true);

drop policy if exists "eliminar visitas propias" on public.visitas;
create policy "eliminar visitas propias" on public.visitas for delete to authenticated
  using (creado_por = auth.uid() or public.es_admin());
