-- Nadie elige su propio rol: el dato "rol" del registro lo escribe quien se registra, así que ya no se tiene en cuenta.
-- Todo usuario nuevo queda de interventor; solo un administrador lo cambia (admin_crear_usuario, admin_editar_usuario).
-- Se puede correr varias veces sin dañar nada.

set search_path = public, extensions;

create or replace function public.perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)), 'interventor')
  on conflict (id) do nothing;
  return new;
end;
$$;
