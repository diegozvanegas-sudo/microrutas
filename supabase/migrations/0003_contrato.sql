-- Resumen del contrato (especificaciones técnicas de corte de césped) para la página contrato.html.
-- El contenido NO está en el repositorio (es público): se carga desde datos/contrato/resumen.json con
-- scripts/cargar_contrato.mjs. Solo lo leen usuarios con sesión; nadie lo modifica desde la página.

create table if not exists public.contrato_secciones (
  id          text primary key,
  orden       int not null,
  icono       text not null default '',
  titulo      text not null,
  tipo        text not null default 'lista',   -- lista · cifras · tabla · alerta · meta
  items       jsonb not null default '[]',     -- [{ clave?, t, ref? }]
  actualizado timestamptz not null default now()
);

alter table public.contrato_secciones enable row level security;

drop policy if exists "leer contrato con sesión" on public.contrato_secciones;
create policy "leer contrato con sesión" on public.contrato_secciones for select to authenticated using (true);

revoke all on public.contrato_secciones from anon;
grant select on public.contrato_secciones to authenticated;
