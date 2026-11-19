-- Paso 27: descuentos de área (💸 Descuentos, menú Zonas verdes).
-- Cuando la interventoría verifica que parte de un lote no se puede intervenir (cerramiento, predio privado, obra, zona
-- dura, área inaccesible…), arma el documento de descuento con el área dibujada sobre el mapa. Aquí queda cada documento:
-- su tipo, la fecha, los textos y una fila por lote (área base, área a descontar, el dibujo del área), para saber qué se
-- descontó, a qué lote y cuánto, y sumarlo en la factura. Las fotos y las imágenes no se guardan aquí (son pesadas): las
-- imágenes del mapa se vuelven a armar con el dibujo.
-- Mientras esta tabla no exista, la página guarda los descuentos solo en el equipo donde se hicieron.
-- Todo el equipo los ve y los corrige; borrar, quien lo hizo o el administrador.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.descuentos (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'cerramiento',      -- cerramiento | predio_privado | obra | zona_dura | inaccesible
  fecha           date,                                      -- fecha de la verificación
  sector          text not null default '',                  -- «el corregimiento San Antonio de Prado»
  campos          jsonb not null default '{}'::jsonb,         -- huecos del tipo: { "causa": …, "lugar": … }
  textos          jsonb not null default '{}'::jsonb,         -- { titulo, intro, conclusion, localizacion, sitio } como quedaron
  filas           jsonb not null default '[]'::jsonb,         -- [{ mr, lote, cuad, areaBase, areaDescontar, manual, dibujo: [[lat, lon], …] }]
  area_descontar  numeric not null default 0,                -- suma de las filas (m²), para los totales
  estado          text not null default 'borrador',          -- borrador | emitido
  usuario         uuid references auth.users (id) on delete set null default auth.uid(),
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);

create index if not exists descuentos_fecha on public.descuentos (fecha desc);

alter table public.descuentos enable row level security;

drop policy if exists "ver descuentos" on public.descuentos;
create policy "ver descuentos" on public.descuentos for select to authenticated using (true);
drop policy if exists "crear descuento" on public.descuentos;
create policy "crear descuento" on public.descuentos for insert to authenticated with check (true);
drop policy if exists "corregir descuento" on public.descuentos;
create policy "corregir descuento" on public.descuentos for update to authenticated using (true) with check (true);
drop policy if exists "borrar descuento" on public.descuentos;
create policy "borrar descuento" on public.descuentos for delete to authenticated
  using (usuario = auth.uid() or public.es_admin());

grant select, insert, update, delete on public.descuentos to authenticated;
