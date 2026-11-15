-- Paso 23: anexos de las visitas (📨 Requerimientos → «Listos para requerimiento»).
-- El pantallazo de cuando se le envió la novedad al contratista (y la captura del reporte de la cuadrilla) se guarda aquí,
-- en una carpeta por visita (<ID de la visita>/<archivo>), para que 8 días hábiles después, si no se corrigió, entre solo
-- como evidencia del requerimiento. Es un almacenamiento PRIVADO: solo con sesión. Todo el equipo ve y agrega anexos;
-- borrar, quien lo subió o el administrador. Solo imágenes, hasta 5 MB (la página las reduce antes de subirlas).
-- Se puede correr varias veces sin dañar nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos-visitas', 'anexos-visitas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ver anexos de visitas" on storage.objects;
create policy "ver anexos de visitas" on storage.objects for select to authenticated
  using (bucket_id = 'anexos-visitas');
drop policy if exists "subir anexo de visita" on storage.objects;
create policy "subir anexo de visita" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos-visitas');
drop policy if exists "borrar anexo de visita" on storage.objects;
create policy "borrar anexo de visita" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos-visitas' and (owner = auth.uid() or public.es_admin()));
