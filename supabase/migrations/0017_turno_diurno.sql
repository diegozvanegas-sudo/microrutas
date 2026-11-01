-- Paso 17: las revisiones también pueden ser del turno Diurno. Ningún dato cambia.
-- Se puede correr varias veces sin dañar nada.

alter table public.revisiones drop constraint if exists revisiones_turno_check;
alter table public.revisiones add constraint revisiones_turno_check
  check (turno in ('', 'Mañana', 'Diurno', 'Intermedio', 'Tarde', 'Noche'));
