-- Paso 18: resultados de la auditoría del ZIP de fotos (Subsanaciones → 🔍 Auditar ZIP).
-- La auditoría la hace el motor del PC (portal de Aplicaciones, con el plan de Claude Code); la página copia aquí una
-- fila por microrruta para verla desde el celular. Cada quien ve y cambia las suyas; el administrador ve todas.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.auditorias_zv (
  id             uuid primary key default gen_random_uuid(),
  quincena       text not null default '',          -- nombre de la quincena en el motor ("Q1 OCTUBRE 2026")
  fuente         text not null default '',          -- el ZIP (C2.zip)
  microrruta     text not null default '',
  lote           text not null default '',
  cuadrilla      text not null default '',
  novedad        text not null default '',          -- la del motor: SN, PENDIENTE o los textos oficiales separados por ;
  ac             text not null default '',          -- estado del AC (COMPLETO, NO VERIFICABLE…)
  observacion    text not null default '',          -- observación del informe de lotes ejecutados
  con_novedad    boolean not null default false,
  decision       text,                              -- APROBADA · DESCARTADA · CORREGIDA (la del revisor en el portal)
  novedad_final  text not null default '',
  comentario     text not null default '',
  usuario        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  actualizado    timestamptz not null default now(),
  unique (usuario, quincena, fuente, microrruta)
);
create index if not exists auditorias_zv_usuario_idx on public.auditorias_zv (usuario, quincena);

alter table public.auditorias_zv enable row level security;

drop policy if exists "ver auditorias propias" on public.auditorias_zv;
create policy "ver auditorias propias" on public.auditorias_zv for select to authenticated
  using (usuario = auth.uid() or public.es_admin());
drop policy if exists "crear auditoria" on public.auditorias_zv;
create policy "crear auditoria" on public.auditorias_zv for insert to authenticated
  with check (usuario = auth.uid());
drop policy if exists "cambiar auditorias propias" on public.auditorias_zv;
create policy "cambiar auditorias propias" on public.auditorias_zv for update to authenticated
  using (usuario = auth.uid()) with check (usuario = auth.uid());
drop policy if exists "eliminar auditorias propias" on public.auditorias_zv;
create policy "eliminar auditorias propias" on public.auditorias_zv for delete to authenticated
  using (usuario = auth.uid());

revoke all on public.auditorias_zv from anon;
grant select, insert, update, delete on public.auditorias_zv to authenticated;
