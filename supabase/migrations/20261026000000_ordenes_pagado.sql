-- OptiPedidos · Migración 0018 · Lo pagado de cada orden, guardado en la orden (auditoría de escalabilidad #2)
-- Sin cambios destructivos: una columna nueva con su restricción, triggers y un índice; saldo() lee la columna.
--
-- Problema: saldo(ordenes) sumaba orden_pagos por cada orden, y esa suma pasaba por la RLS de los pagos. El filtro
-- "con saldo" de /panel/ordenes tardaba 3,7 s en una óptica de 10 000 órdenes (aun con la RLS por conjunto de 0017).
--
-- Solución:
--   * ordenes.pagado = suma de los pagos vigentes (no anulados). La recalcula un trigger de orden_pagos al registrar
--     o anular un pago. Nadie más puede escribirla: un trigger la deja como estaba en cualquier otro cambio.
--   * saldo(o) = precio − descuento − pagado. Es SQL simple y sin SET, así que Postgres la incrusta en la consulta:
--     el filtro "saldo > 0" puede usar el índice parcial ordenes_con_saldo.
--   * Que cambie solo "pagado" no es una edición de la orden: no bloquea órdenes confirmadas, no mueve
--     actualizado_en ni genera otra fila de auditoría (el pago ya queda auditado).

-- 1 ----------------------------------------------------------------------------
alter table public.ordenes add column pagado numeric(10,2) not null default 0;

-- Carga inicial sin disparar los triggers de ordenes (la orden no cambia, solo se completa la columna nueva).
alter table public.ordenes disable trigger user;
update public.ordenes o
   set pagado = x.total
  from (select p.orden_id, sum(p.importe) as total from public.orden_pagos p where p.anulado_en is null group by p.orden_id) x
 where x.orden_id = o.id;
alter table public.ordenes enable trigger user;

alter table public.ordenes add constraint ordenes_pagado_valido check (pagado >= 0 and pagado <= precio - descuento);

-- 2 ----------------------------------------------------------------------------
-- Solo el trigger de los pagos escribe "pagado" (marca la orden en optipedidos.pagado_orden); en una orden nueva es 0.
create function public.f_orden_pagado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.pagado := 0;
  elsif new.pagado is distinct from old.pagado
        and coalesce(current_setting('optipedidos.pagado_orden', true), '') <> new.id::text then
    new.pagado := old.pagado;
  end if;
  return new;
end $$;

create trigger t_0_pagado before insert or update on public.ordenes
  for each row execute function public.f_orden_pagado();

-- Al registrar o anular un pago se vuelve a sumar lo vigente (no se acumula: siempre cuadra con orden_pagos).
create function public.f_pago_actualizar_orden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('optipedidos.pagado_orden', new.orden_id::text, true);
  update public.ordenes o
     set pagado = (select coalesce(sum(p.importe), 0) from public.orden_pagos p
                   where p.orden_id = new.orden_id and p.anulado_en is null)
   where o.id = new.orden_id;
  perform set_config('optipedidos.pagado_orden', '', true);
  return null;
end $$;

create trigger t_2_pagado_orden after insert or update on public.orden_pagos
  for each row execute function public.f_pago_actualizar_orden();

revoke execute on function public.f_orden_pagado(), public.f_pago_actualizar_orden() from public, anon, authenticated;

-- 3 ----------------------------------------------------------------------------
-- Un cambio que solo toca "pagado" no es una edición de la orden.
create or replace function public.f_orden_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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
    new.confirmada_en := null;
    return new;
  end if;

  -- confirmada_en solo lo cambia el servidor, nunca el cliente.
  new.confirmada_en := old.confirmada_en;

  if new.id <> old.id or new.optica_id <> old.optica_id or new.numero <> old.numero then
    raise exception 'id, óptica y número de la orden no pueden cambiar';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_estado t
                   where t.desde = old.estado and t.hasta = new.estado) then
      raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
    end if;
    if new.estado = 'anulada' then new.anulada_en := now(); end if;
    if old.estado = 'borrador' and new.estado <> 'anulada' then new.confirmada_en := now(); end if;
    if new.estado = 'borrador' then new.confirmada_en := null; end if;
    insert into public.orden_historial_estados (optica_id, orden_id, desde, hasta, usuario_id)
    values (new.optica_id, new.id, old.estado, new.estado, auth.uid());
  end if;

  if old.estado <> 'borrador' and
     (to_jsonb(new) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en' - 'codigo_consulta'
       - 'entrega_con_saldo_monto' - 'entrega_con_saldo_motivo' - 'entrega_con_saldo_por' - 'entrega_con_saldo_en' - 'pagado')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en' - 'codigo_consulta'
       - 'entrega_con_saldo_monto' - 'entrega_con_saldo_motivo' - 'entrega_con_saldo_por' - 'entrega_con_saldo_en' - 'pagado') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

-- Ni actualizado_en ni la auditoría de ordenes se mueven cuando lo único que cambia es "pagado".
drop trigger t_actualizado on public.ordenes;
create trigger t_actualizado before update on public.ordenes
  for each row
  when (old.pagado is not distinct from new.pagado or (to_jsonb(old) - 'pagado') is distinct from (to_jsonb(new) - 'pagado'))
  execute function public.f_actualizado();

drop trigger t_auditar on public.ordenes;
create trigger t_auditar after insert or delete on public.ordenes
  for each row execute function public.f_auditar();
create trigger t_auditar_cambios after update on public.ordenes
  for each row
  when (old.pagado is not distinct from new.pagado or (to_jsonb(old) - 'pagado') is distinct from (to_jsonb(new) - 'pagado'))
  execute function public.f_auditar();

-- 4 ----------------------------------------------------------------------------
-- saldo() lee la columna. Sin SECURITY DEFINER ni SET search_path a propósito: así Postgres la incrusta y el filtro
-- "saldo > 0" usa el índice parcial (solo referencia campos de su argumento, no hay nombres que resolver).
create or replace function public.saldo(o public.ordenes) returns numeric
language sql stable as $$
  select o.precio - o.descuento - o.pagado;
$$;

create index ordenes_con_saldo on public.ordenes (optica_id, creado_en desc)
  where estado <> 'anulada' and precio - descuento - pagado > 0;
