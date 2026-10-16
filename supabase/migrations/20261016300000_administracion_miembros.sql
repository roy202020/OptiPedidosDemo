-- OptiPedidos · Migración 0006 · Administración de miembros
-- Sin cambios destructivos: agrega un trigger de seguridad y una función.
--
-- Permisos (ya aplicados por RLS en la migración 0001):
--   * miembros: solo el propietario agrega, cambia roles o desactiva.
--   * opticas: propietario y administrador editan nombre, RUC, teléfono y dirección.

-- 1 ----------------------------------------------------------------------------
-- La óptica nunca se queda sin un propietario activo (evita bloquearse fuera por error).
create function public.f_miembros_conservar_propietario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.rol = 'propietario' and old.activo
     and (new.rol <> 'propietario' or not new.activo)
     and not exists (select 1 from public.miembros m
                     where m.optica_id = old.optica_id and m.usuario_id <> old.usuario_id
                       and m.rol = 'propietario' and m.activo) then
    raise exception 'La óptica debe conservar al menos un propietario activo';
  end if;
  if new.optica_id <> old.optica_id or new.usuario_id <> old.usuario_id then
    raise exception 'La óptica y el usuario de una membresía no cambian';
  end if;
  return new;
end $$;
create trigger t_conservar_propietario before update on public.miembros
  for each row execute function public.f_miembros_conservar_propietario();
revoke execute on function public.f_miembros_conservar_propietario() from public, anon, authenticated;

-- 2 ----------------------------------------------------------------------------
-- Agrega (o reactiva) a una persona que ya tiene cuenta, buscándola por correo.
-- Solo el propietario. auth.users no es legible desde la API, por eso es SECURITY DEFINER.
create function public.agregar_miembro(p_optica uuid, p_email text, p_rol public.rol_miembro default 'operador')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
begin
  if not public.tiene_rol(p_optica, array['propietario']::public.rol_miembro[]) then
    raise exception 'Solo el propietario puede agregar miembros' using errcode = '42501';
  end if;
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'No hay ninguna cuenta con ese correo. La persona debe crear su cuenta primero.';
  end if;
  insert into public.miembros (optica_id, usuario_id, rol, activo)
  values (p_optica, v_usuario, p_rol, true)
  on conflict (optica_id, usuario_id) do update set rol = excluded.rol, activo = true;
  return v_usuario;
end $$;
revoke execute on function public.agregar_miembro(uuid, text, public.rol_miembro) from public, anon;
grant execute on function public.agregar_miembro(uuid, text, public.rol_miembro) to authenticated;
