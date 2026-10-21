-- OptiPedidos · Migración 0015 · Saldos de los clientes: cobros completos, caja, entrega con saldo e informes
-- Sin cambios destructivos: columnas nuevas, una restricción ampliada, funciones y triggers.
-- Reutiliza orden_pagos (cobros), saldo() (columna calculada) y cajas (caja de la sede, migración 0013).
--
-- Reglas (acordadas con la óptica):
--   * Total a pagar = precio − descuento; pagado = cobros vigentes; saldo = calculado (nunca se escribe).
--   * Cobros: fecha, monto, medio (efectivo, Yape, Plin, tarjeta, transferencia), n.º de operación, usuario y sede.
--     "Yape / Plin" (yape_plin) sigue siendo válido en la base (cobros ya registrados); la app ofrece Yape y Plin
--     por separado. En la caja del día, Yape y Plin se suman en "Yape / Plin" como hasta ahora.
--   * Un cobro en efectivo entra a la caja abierta de su sede; sin caja abierta no se cobra en efectivo.
--     El vendedor puede abrir la caja de su sede; cerrarla sigue siendo de propietario o administrador.
--   * No se cobra más que el saldo (regla de la 0008). Los cobros no se borran: se anulan con motivo,
--     y ahora solo propietario o administrador de la sede.
--   * No se entrega una orden con saldo, salvo que propietario o administrador lo autorice con motivo
--     (entregar_con_saldo); queda en la orden y en la auditoría.

-- 1 ----------------------------------------------------------------------------
alter table public.orden_pagos
  add column numero_operacion text check (numero_operacion is null or length(numero_operacion) <= 60),
  add column caja_id uuid references public.cajas(id);
comment on column public.orden_pagos.caja_id is 'Caja de la sede donde entró el cobro en efectivo.';
create index orden_pagos_por_caja on public.orden_pagos (caja_id) where caja_id is not null;

alter table public.orden_pagos drop constraint orden_pagos_medio_check;
alter table public.orden_pagos add constraint orden_pagos_medio_check
  check (medio in ('efectivo', 'tarjeta', 'transferencia', 'yape', 'plin', 'yape_plin'));
grant insert (numero_operacion) on public.orden_pagos to authenticated;

-- Caja abierta de una sede (el vendedor no lee la tabla cajas, pero sí necesita saber si está abierta).
create function public.caja_abierta(p_sede uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.cajas c where c.sede_id = p_sede and c.cerrada_en is null and public.tiene_sede(p_sede)
$$;
revoke execute on function public.caja_abierta(uuid) from public, anon;
grant execute on function public.caja_abierta(uuid) to authenticated;

-- Alta del cobro: medio vigente y, si es efectivo, la caja abierta de la sede (después de t_0_sede).
create function public.f_pago_caja() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.numero_operacion := nullif(trim(new.numero_operacion), '');
  new.caja_id := null;
  if new.medio = 'efectivo' then
    select id into new.caja_id from public.cajas where sede_id = new.sede_id and cerrada_en is null;
    -- Los procesos internos (sin usuario) no dependen de la caja.
    if new.caja_id is null and auth.uid() is not null then
      raise exception 'No hay una caja abierta en esta sede: ábrela para cobrar en efectivo o elige otro medio';
    end if;
  end if;
  return new;
end $$;
create trigger t_1_caja before insert on public.orden_pagos for each row execute function public.f_pago_caja();

-- Anular un cobro: solo propietario o administrador de la sede.
create function public.f_pago_anular_rol() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.gestiona_sede(old.optica_id, old.sede_id) then
    raise exception 'Solo el propietario o un administrador anulan cobros' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_1_anular_rol before update on public.orden_pagos for each row execute function public.f_pago_anular_rol();

-- 2 ----------------------------------------------------------------------------
-- Caja: los cobros en efectivo se suman por caja_id (no por hora). El vendedor puede abrir la caja.
create or replace function public.caja_resumen(p_caja uuid)
returns table (monto_inicial numeric, cobros_efectivo numeric, egresos numeric, esperado numeric)
language plpgsql stable security definer set search_path = '' as $$
declare c public.cajas;
begin
  select * into c from public.cajas where id = p_caja;
  if c.id is null or not public.gestiona_sede(c.optica_id, c.sede_id) then
    raise exception 'No tienes permiso para ver esta caja' using errcode = '42501';
  end if;
  return query
    with cobros as (
      select coalesce(sum(p.importe), 0)::numeric(10,2) as total from public.orden_pagos p
      where p.caja_id = c.id and p.anulado_en is null
    ), salidas as (
      select coalesce(sum(m.monto), 0)::numeric(10,2) as total from public.caja_movimientos m
      where m.caja_id = c.id and m.tipo = 'egreso' and m.anulado_en is null
    )
    select c.monto_inicial, cobros.total, salidas.total, (c.monto_inicial + cobros.total - salidas.total)::numeric(10,2)
    from cobros, salidas;
end $$;

create or replace function public.abrir_caja(p_sede uuid, p_monto_inicial numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  v_id uuid;
begin
  select optica_id into v_optica from public.sedes where id = p_sede and activa;
  if v_optica is null or not public.es_miembro(v_optica) or not public.tiene_sede(p_sede) then
    raise exception 'No tienes acceso a la caja de esa sede' using errcode = '42501';
  end if;
  if exists (select 1 from public.cajas where sede_id = p_sede and cerrada_en is null) then
    raise exception 'Ya hay una caja abierta en esta sede';
  end if;
  insert into public.cajas (optica_id, sede_id, abierta_por, monto_inicial)
  values (v_optica, p_sede, auth.uid(), coalesce(p_monto_inicial, 0))
  returning id into v_id;
  return v_id;
end $$;

-- Caja del día (informe de ventas): Yape y Plin se suman en el total "Yape / Plin".
create or replace function public.caja_del_dia(p_optica uuid, p_sede uuid default null)
returns table (cobrado numeric, pagos integer, por_medio jsonb, saldo_pendiente numeric, ordenes_con_saldo integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver la caja' using errcode = '42501';
  end if;
  return query
    with hoy as (
      select case when p.medio in ('yape', 'plin') then 'yape_plin' else p.medio end as medio,
             sum(p.importe) as total, count(*)::integer as cantidad
      from public.orden_pagos p
      where p.optica_id = p_optica and p.anulado_en is null
        and (p.sede_id = p_sede or (p_sede is null and public.tiene_sede(p.sede_id)))
        and p.fecha = (now() at time zone 'America/Lima')::date
      group by 1
    ), saldos as (
      select greatest(0, o.precio - o.descuento - coalesce(
               (select sum(p.importe) from public.orden_pagos p where p.orden_id = o.id and p.anulado_en is null), 0)) as saldo
      from public.ordenes o
      where o.optica_id = p_optica and o.estado <> 'anulada'
        and (o.sede_id = p_sede or (p_sede is null and public.tiene_sede(o.sede_id)))
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


-- 3 ----------------------------------------------------------------------------
-- Entrega con saldo: solo con autorización (propietario o administrador) y motivo.
alter table public.ordenes
  add column entrega_con_saldo_monto  numeric(10,2),
  add column entrega_con_saldo_motivo text,
  add column entrega_con_saldo_por    uuid,
  add column entrega_con_saldo_en     timestamptz;
comment on column public.ordenes.entrega_con_saldo_motivo is 'Motivo por el que se entregó con saldo pendiente (lo autoriza propietario o administrador).';

-- La regla "solo editable en borrador" no cuenta los datos de la autorización (los fija entregar_con_saldo).
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
       - 'entrega_con_saldo_monto' - 'entrega_con_saldo_motivo' - 'entrega_con_saldo_por' - 'entrega_con_saldo_en')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en' - 'codigo_consulta'
       - 'entrega_con_saldo_monto' - 'entrega_con_saldo_motivo' - 'entrega_con_saldo_por' - 'entrega_con_saldo_en') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

create function public.f_orden_entrega_saldo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_autorizada boolean := coalesce(current_setting('optipedidos.entrega_con_saldo', true), '') = new.id::text;
  v_saldo numeric(10,2);
begin
  -- Los datos de la autorización solo los escribe entregar_con_saldo().
  if not v_autorizada then
    new.entrega_con_saldo_monto := old.entrega_con_saldo_monto;
    new.entrega_con_saldo_motivo := old.entrega_con_saldo_motivo;
    new.entrega_con_saldo_por := old.entrega_con_saldo_por;
    new.entrega_con_saldo_en := old.entrega_con_saldo_en;
  end if;
  if new.estado = 'entregada' and old.estado is distinct from 'entregada' and not v_autorizada and auth.uid() is not null then
    v_saldo := new.precio - new.descuento - public.total_pagado(new.id);
    if v_saldo > 0 then
      raise exception 'La orden tiene un saldo pendiente de S/ %: cobra el saldo o pide a un administrador que autorice la entrega con saldo', v_saldo;
    end if;
  end if;
  return new;
end $$;
create trigger t_1_entrega_saldo before update on public.ordenes for each row execute function public.f_orden_entrega_saldo();

create function public.entregar_con_saldo(p_orden uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.ordenes;
  v_saldo numeric(10,2);
begin
  select * into o from public.ordenes where id = p_orden for update;
  if o.id is null or not public.gestiona_sede(o.optica_id, o.sede_id) then
    raise exception 'Solo el propietario o un administrador autorizan una entrega con saldo' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Indica el motivo para entregar con saldo';
  end if;
  v_saldo := o.precio - o.descuento - public.total_pagado(o.id);
  if v_saldo <= 0 then
    raise exception 'La orden no tiene saldo pendiente: entrégala normalmente';
  end if;
  perform set_config('optipedidos.entrega_con_saldo', o.id::text, true);
  update public.ordenes
     set estado = 'entregada',
         entrega_con_saldo_monto = v_saldo,
         entrega_con_saldo_motivo = trim(p_motivo),
         entrega_con_saldo_por = auth.uid(),
         entrega_con_saldo_en = now()
   where id = o.id;
  perform set_config('optipedidos.entrega_con_saldo', '', true);
end $$;

-- 4 ----------------------------------------------------------------------------
-- Informes. Cada usuario ve solo las sedes que tiene asignadas (el propietario, todas).
create function public.saldos_pendientes(p_optica uuid, p_sede uuid default null, p_dias_min integer default null)
returns table (orden_id uuid, numero integer, paciente_id uuid, paciente text, telefono text, sede_id uuid, sede text,
               estado text, total numeric, pagado numeric, saldo numeric, creado_en timestamptz, dias integer)
language plpgsql stable security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  if not public.es_miembro(p_optica) or (p_sede is not null and not public.tiene_sede(p_sede)) then
    raise exception 'No tienes permiso para ver los saldos' using errcode = '42501';
  end if;
  return query
    select o.id, o.numero, pa.id, (pa.apellidos || ', ' || pa.nombres)::text, pa.telefono, s.id, s.nombre, o.estado::text,
           (o.precio - o.descuento)::numeric(10,2), x.pagado, (o.precio - o.descuento - x.pagado)::numeric(10,2),
           o.creado_en, (v_hoy - (o.creado_en at time zone 'America/Lima')::date)::integer
    from public.ordenes o
    join public.pacientes pa on pa.id = o.paciente_id
    join public.sedes s on s.id = o.sede_id
    cross join lateral (select public.total_pagado(o.id) as pagado) x
    where o.optica_id = p_optica and o.estado not in ('anulada', 'borrador')
      and o.precio - o.descuento - x.pagado > 0
      and (o.sede_id = p_sede or (p_sede is null and public.tiene_sede(o.sede_id)))
      and (p_dias_min is null or (v_hoy - (o.creado_en at time zone 'America/Lima')::date) >= p_dias_min)
    order by o.creado_en, o.numero;
end $$;

-- Panel del dueño: total por cobrar y lo que está en pedidos ya listos para entregar.
create function public.resumen_por_cobrar(p_optica uuid, p_sede uuid default null)
returns table (por_cobrar numeric, ordenes integer, en_listos numeric, ordenes_listas integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver los saldos' using errcode = '42501';
  end if;
  return query
    with s as (
      select o.estado, (o.precio - o.descuento - public.total_pagado(o.id)) as saldo
      from public.ordenes o
      where o.optica_id = p_optica and o.estado not in ('anulada', 'borrador')
        and (o.sede_id = p_sede or (p_sede is null and public.tiene_sede(o.sede_id)))
    )
    select coalesce(sum(saldo) filter (where saldo > 0), 0)::numeric(12,2),
           (count(*) filter (where saldo > 0))::integer,
           coalesce(sum(saldo) filter (where saldo > 0 and estado = 'recibida_optica'), 0)::numeric(12,2),
           (count(*) filter (where saldo > 0 and estado = 'recibida_optica'))::integer
    from s;
end $$;

-- 5 ----------------------------------------------------------------------------
revoke execute on function public.f_pago_caja(), public.f_pago_anular_rol(), public.f_orden_entrega_saldo() from public, anon, authenticated;
revoke execute on function public.entregar_con_saldo(uuid, text), public.saldos_pendientes(uuid, uuid, integer),
  public.resumen_por_cobrar(uuid, uuid) from public, anon;
grant execute on function public.entregar_con_saldo(uuid, text), public.saldos_pendientes(uuid, uuid, integer),
  public.resumen_por_cobrar(uuid, uuid) to authenticated;
