-- Paso 14: resumen de los convenios con fundaciones (RyT y barrido, FUDEA y FUNTRAEV) y del PPSA.
-- El contenido NO está en el repositorio (es público): se carga desde datos/contrato/convenios.json con
-- scripts/cargar_convenios.mjs. Lo leen solo los administradores y quienes tengan perfiles.ver_contrato
-- (misma regla que contrato_secciones, 0007). Nadie lo escribe desde la página. Se puede correr varias veces.

set search_path = public, extensions;

create table if not exists public.convenio_secciones (
  documento   text not null,                   -- PPSA · RYT-FUDEA · LV-FUDEA · RYT-FUNTRAEV · LV-FUNTRAEV
  id          text not null,
  orden       int not null,
  icono       text not null default '',
  titulo      text not null,
  tipo        text not null default 'lista',   -- lista · cifras · tabla · alerta · meta
  items       jsonb not null default '[]',     -- [{ clave?, t, ref? }]
  actualizado timestamptz not null default now(),
  primary key (documento, id)
);

alter table public.convenio_secciones enable row level security;

drop policy if exists "leer convenios con permiso" on public.convenio_secciones;
create policy "leer convenios con permiso" on public.convenio_secciones for select to authenticated
  using (public.puede_ver_contrato());

revoke all on public.convenio_secciones from public, anon, authenticated;
grant select on public.convenio_secciones to authenticated;
