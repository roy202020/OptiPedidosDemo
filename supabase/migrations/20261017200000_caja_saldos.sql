-- OptiPedidos · Migración 0009 · Saldo de cada orden y caja del día
-- Sin cambios destructivos: solo funciones nuevas.
--
-- Reglas:
--   * Saldo = (precio − descuento) − pagos vigentes (no anulados). Nunca negativo.
--   * Caja del día = pagos vigentes con fecha de hoy (hora de Lima), por medio de pago.
--     Es lo cobrado, no la venta: la meta de ventas sigue midiéndose por venta neta confirmada.
--   * Saldo pendiente de la óptica = suma de saldos de las órdenes no anuladas.

-- 1 ----------------------------------------------------------------------------
-- Columna calculada de PostgREST: se puede pedir y filtrar como `saldo` en /ordenes.
-- security invoker: el RLS de orden_pagos limita la suma a los pagos que el usuario puede ver,
-- que son los de su óptica (los mismos de la orden).
create function public.saldo(o public.ordenes) returns numeric
language sql stable security invoker set search_path = '' as $$
  select greatest(0, o.precio - o.descuento - coalesce(
    (select sum(p.importe) from public.orden_pagos p where p.orden_id = o.id and p.anulado_en is null), 0))::numeric(10,2);
$$;
comment on function public.saldo(public.ordenes) is 'Saldo pendiente de la orden: importe neto menos pagos vigentes.';

revoke execute on function public.saldo(public.ordenes) from public, anon;
grant execute on function public.saldo(public.ordenes) to authenticated;

-- 2 ----------------------------------------------------------------------------
-- Caja del día. Solo propietario y administrador, igual que ventas_del_dia.
-- por_medio trae siempre los cuatro medios (0 si no hubo cobros con ese medio).
create function public.caja_del_dia(p_optica uuid)
returns table (cobrado numeric, pagos integer, por_medio jsonb, saldo_pendiente numeric, ordenes_con_saldo integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'No tienes permiso para ver la caja' using errcode = '42501';
  end if;
  return query
    with hoy as (
      select p.medio, sum(p.importe) as total, count(*)::integer as cantidad
      from public.orden_pagos p
      where p.optica_id = p_optica and p.anulado_en is null
        and p.fecha = (now() at time zone 'America/Lima')::date
      group by p.medio
    ), saldos as (
      select greatest(0, o.precio - o.descuento - coalesce(
               (select sum(p.importe) from public.orden_pagos p where p.orden_id = o.id and p.anulado_en is null), 0)) as saldo
      from public.ordenes o
      where o.optica_id = p_optica and o.estado <> 'anulada'
    )
    select
      coalesce((select sum(h.total) from hoy h), 0)::numeric(12,2),
      coalesce((select sum(h.cantidad) from hoy h), 0)::integer,
      (select jsonb_object_agg(m.medio, coalesce(h.total, 0)::numeric(12,2))
         from unnest(array['efectivo', 'tarjeta', 'transferencia', 'yape_plin']) as m(medio)
         left join hoy h on h.medio = m.medio),
      coalesce((select sum(s.saldo) from saldos s), 0)::numeric(12,2),
      (select count(*)::integer from saldos s where s.saldo > 0);
end $$;

revoke execute on function public.caja_del_dia(uuid) from public, anon;
grant execute on function public.caja_del_dia(uuid) to authenticated;
