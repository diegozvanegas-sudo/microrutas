-- Paso 22: reportes de microrrutas ejecutadas (📊 Cruce programado / realizado, menú Zonas verdes).
-- Cada tarde los supervisores mandan por WhatsApp «REPORTE MICRORRUTAS EJECUTADAS» con la fecha, la cuadrilla y las
-- microrrutas que hicieron. La página los lee al pegarlos y los guarda aquí, uno por fecha y cuadrilla, para cruzarlos con
-- la programación del mes desde el computador o el celular. Mientras esta tabla no exista, la página los guarda solo en el
-- equipo donde se pegaron.
-- Todo el equipo los ve y los corrige (si el supervisor manda el reporte corregido, reemplaza al anterior); borrar, quien lo
-- cargó o el administrador.
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create table if not exists public.reportes_ejecucion (
  fecha        date not null,
  cuadrilla    text not null,
  items        jsonb not null default '[]'::jsonb,      -- [{ "mr": "Z1CC0125", "lote": "98" }, …]
  texto        text not null default '',                -- el mensaje como llegó (hasta 1.500 letras), por si hay que revisarlo
  usuario      uuid references auth.users (id) on delete set null default auth.uid(),
  actualizado  timestamptz not null default now(),
  primary key (fecha, cuadrilla)
);

alter table public.reportes_ejecucion enable row level security;

drop policy if exists "ver reportes de ejecucion" on public.reportes_ejecucion;
create policy "ver reportes de ejecucion" on public.reportes_ejecucion for select to authenticated using (true);
drop policy if exists "cargar reporte de ejecucion" on public.reportes_ejecucion;
create policy "cargar reporte de ejecucion" on public.reportes_ejecucion for insert to authenticated with check (true);
drop policy if exists "corregir reporte de ejecucion" on public.reportes_ejecucion;
create policy "corregir reporte de ejecucion" on public.reportes_ejecucion for update to authenticated using (true) with check (true);
drop policy if exists "borrar reporte de ejecucion" on public.reportes_ejecucion;
create policy "borrar reporte de ejecucion" on public.reportes_ejecucion for delete to authenticated
  using (usuario = auth.uid() or public.es_admin());

grant select, insert, update, delete on public.reportes_ejecucion to authenticated;
