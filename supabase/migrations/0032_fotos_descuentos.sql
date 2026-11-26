-- Paso 32: fotos de los descuentos de área (💸 Descuentos). Hasta ahora el descuento se guardaba sin fotos (0027) y al
-- abrirlo otra vez había que volver a ponerlas. Aquí quedan las fotos de cada lote y las imágenes elegidas con «Usar otra»;
-- en la fila del descuento (public.descuentos.filas) solo va la ruta y el pie de cada una.
-- Carpeta: <id del descuento>/<microrruta>-<lote>/<archivo>.jpg
-- Almacenamiento PRIVADO (solo con sesión) y aparte de los demás. No se borra solo: se borra al quitar la foto (y guardar)
-- o al borrar el descuento. Igual que la tabla descuentos: todo el equipo las ve, las sube y las quita.
-- Solo imágenes, hasta 5 MB (la página las reduce a 1.600 px antes de subirlas). Se puede correr varias veces sin dañar nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-descuentos', 'fotos-descuentos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ver fotos de descuentos" on storage.objects;
create policy "ver fotos de descuentos" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-descuentos');
drop policy if exists "subir foto de descuento" on storage.objects;
create policy "subir foto de descuento" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-descuentos');
drop policy if exists "borrar foto de descuento" on storage.objects;
create policy "borrar foto de descuento" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-descuentos');
