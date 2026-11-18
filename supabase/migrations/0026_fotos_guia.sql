-- Paso 26: fotos de campo de la Guía de campo (📜 Contrato → 🧭 Guía de campo → 📷 Fotos en cada punto de «Lote ejecutado»
-- y «Durante la operación»). Fotos reales marcadas como ✅ bien o ❌ mal, para mostrar cómo se ve cada ítem.
-- Carpeta por punto: <sección>/<punto>/<archivo>.jpg y su miniatura en <sección>/<punto>/min/<archivo>.jpg.
-- Almacenamiento PRIVADO y aparte de «anexos-visitas» (aquel se borra al mes; este no se borra solo).
-- Ver y subir: quien puede ver el contrato (public.puede_ver_contrato()). Borrar: quien la subió o el administrador.
-- Solo imágenes, hasta 5 MB (la página las reduce antes de subirlas). Se puede correr varias veces sin dañar nada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-guia', 'fotos-guia', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ver fotos de la guia" on storage.objects;
create policy "ver fotos de la guia" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-guia' and public.puede_ver_contrato());
drop policy if exists "subir foto de la guia" on storage.objects;
create policy "subir foto de la guia" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-guia' and public.puede_ver_contrato());
drop policy if exists "borrar foto de la guia" on storage.objects;
create policy "borrar foto de la guia" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-guia' and (owner = auth.uid() or public.es_admin()));
