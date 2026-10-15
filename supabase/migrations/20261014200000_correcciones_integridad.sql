-- OptiPedidos · Migración 0002 · Correcciones de integridad
-- 1. Anular una receta ya no bloquea el avance de órdenes existentes.
-- 2. "reemplaza_a" solo puede apuntar a una receta de la misma óptica.
-- 3. "creado_por" lo fija el servidor: el cliente no puede suplantar al autor.

-- 1 ----------------------------------------------------------------------------
create or replace function public.f_orden_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- La receta solo se valida al crear la orden o al cambiarle receta/paciente.
  if (tg_op = 'INSERT'
      or new.receta_id is distinct from old.receta_id
      or new.paciente_id is distinct from old.paciente_id)
     and not exists (select 1 from public.recetas r
                     where r.id = new.receta_id and r.paciente_id = new.paciente_id
                       and r.anulada_en is null) then
    raise exception 'La receta no pertenece al paciente o está anulada';
  end if;

  if tg_op = 'INSERT' then
    new.numero := public.siguiente_numero_orden(new.optica_id);
    new.estado := 'borrador';
    new.anulada_en := null;
    return new;
  end if;

  if new.id <> old.id or new.optica_id <> old.optica_id or new.numero <> old.numero then
    raise exception 'id, óptica y número de la orden no pueden cambiar';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_estado t
                   where t.desde = old.estado and t.hasta = new.estado) then
      raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
    end if;
    if new.estado = 'anulada' then new.anulada_en := now(); end if;
    insert into public.orden_historial_estados (optica_id, orden_id, desde, hasta, usuario_id)
    values (new.optica_id, new.id, old.estado, new.estado, auth.uid());
  end if;

  if old.estado <> 'borrador' and
     (to_jsonb(new) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

-- 2 ----------------------------------------------------------------------------
alter table public.recetas drop constraint recetas_reemplaza_a_fkey;
alter table public.recetas
  add constraint recetas_reemplaza_a_fkey
  foreign key (reemplaza_a, optica_id) references public.recetas (id, optica_id);

-- 3 ----------------------------------------------------------------------------
create function public.f_fijar_autor() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := coalesce(auth.uid(), new.creado_por);
  else
    new.creado_por := old.creado_por;
  end if;
  return new;
end $$;

create trigger t_autor before insert or update on public.pacientes
  for each row execute function public.f_fijar_autor();
create trigger t_autor before insert or update on public.recetas
  for each row execute function public.f_fijar_autor();
create trigger t_autor before insert or update on public.ordenes
  for each row execute function public.f_fijar_autor();
create trigger t_autor before insert on public.orden_observaciones
  for each row execute function public.f_fijar_autor();

-- Las funciones nuevas no deben quedar invocables por la API.
revoke execute on function public.f_fijar_autor() from public, anon, authenticated;
