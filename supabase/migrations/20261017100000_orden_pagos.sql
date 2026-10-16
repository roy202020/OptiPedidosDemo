-- OptiPedidos · Migración 0008 · Pagos de las órdenes (adelantos y saldo)
-- Sin cambios destructivos: una tabla nueva, funciones y triggers.
--
-- Reglas (acordadas con la óptica):
--   * Importes en soles (PEN) con IGV incluido, 2 decimales, siempre mayores que cero.
--   * Un pago no se edita ni se borra: se anula con motivo y, si hace falta, se registra otro.
--   * La suma de pagos vigentes (no anulados) nunca supera el importe neto (precio − descuento).
--     Tampoco se puede bajar el importe de la orden por debajo de lo ya pagado.
--   * No se registran pagos en órdenes anuladas (sí se pueden anular los que tenga).
--   * La fecha del pago es la de Lima y no puede estar en el futuro.
--   * La meta de ventas no cambia: se sigue midiendo por venta neta confirmada, no por lo cobrado.

-- 1 ----------------------------------------------------------------------------
create table public.orden_pagos (
  id               uuid primary key default gen_random_uuid(),
  optica_id        uuid not null references public.opticas(id),
  orden_id         uuid not null,
  importe          numeric(10,2) not null check (importe > 0),
  medio            text not null check (medio in ('efectivo', 'tarjeta', 'transferencia', 'yape_plin')),
  fecha            date not null default (now() at time zone 'America/Lima')::date,
  creado_por       uuid not null default auth.uid(),
  creado_en        timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid,
  motivo_anulacion text,
  foreign key (orden_id, optica_id) references public.ordenes (id, optica_id),
  check (anulado_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
comment on table public.orden_pagos is 'Cobros de una orden (adelantos y saldo) en PEN, IGV incluido. Solo inserción y anulación con motivo.';
comment on column public.orden_pagos.fecha is 'Día del cobro (hora de Lima).';
create index orden_pagos_por_orden on public.orden_pagos (orden_id) where anulado_en is null;
create index orden_pagos_por_fecha on public.orden_pagos (optica_id, fecha);

-- 2 ----------------------------------------------------------------------------
-- Suma de pagos vigentes de una orden.
create function public.total_pagado(p_orden uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(importe), 0)::numeric(10,2) from public.orden_pagos where orden_id = p_orden and anulado_en is null;
$$;

-- Alta: valida contra el saldo con la orden bloqueada (dos cobros simultáneos no superan el neto).
-- Cambio: solo la anulación (motivo_anulacion), una sola vez; el servidor fija cuándo y quién.
create function public.f_pago_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o       public.ordenes;
  v_saldo numeric(10,2);
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.anulado_en := null;
    new.anulado_por := null;
    new.motivo_anulacion := null;

    -- Antes que el RLS (que se evalúa después de este trigger): no revelar saldos de otra óptica.
    if auth.uid() is not null and not public.es_miembro(new.optica_id) then
      raise exception 'No tienes permiso para registrar pagos en esta óptica' using errcode = '42501';
    end if;
    if new.fecha > (now() at time zone 'America/Lima')::date then
      raise exception 'La fecha del pago no puede estar en el futuro';
    end if;

    select * into o from public.ordenes where id = new.orden_id and optica_id = new.optica_id for update;
    if o.id is null then
      raise exception 'La orden no existe';
    end if;
    if o.estado = 'anulada' then
      raise exception 'No se registran pagos en una orden anulada';
    end if;

    v_saldo := o.precio - o.descuento - public.total_pagado(o.id);
    if new.importe > v_saldo then
      raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', new.importe, v_saldo;
    end if;
    return new;
  end if;

  if old.anulado_en is not null then
    raise exception 'El pago ya está anulado';
  end if;
  if (to_jsonb(new) - 'motivo_anulacion' - 'anulado_en' - 'anulado_por')
     is distinct from (to_jsonb(old) - 'motivo_anulacion' - 'anulado_en' - 'anulado_por') then
    raise exception 'Los pagos no se modifican: anúlalo y registra otro';
  end if;
  if length(trim(coalesce(new.motivo_anulacion, ''))) = 0 then
    raise exception 'Indica el motivo de la anulación del pago';
  end if;
  new.motivo_anulacion := trim(new.motivo_anulacion);
  new.anulado_en := now();
  new.anulado_por := auth.uid();
  return new;
end $$;

create trigger t_pago_controlar before insert or update on public.orden_pagos
  for each row execute function public.f_pago_controlar();
create trigger t_autor before insert or update on public.orden_pagos
  for each row execute function public.f_fijar_autor();
create trigger t_sin_delete before delete on public.orden_pagos
  for each row execute function public.f_bloquear_delete();
create trigger t_auditar after insert or update or delete on public.orden_pagos
  for each row execute function public.f_auditar();

-- El importe neto de la orden (editable en borrador) no puede quedar por debajo de lo pagado.
create function public.f_orden_importe_pagado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_pagado numeric(10,2);
begin
  v_pagado := public.total_pagado(new.id);
  if new.precio - new.descuento < v_pagado then
    raise exception 'El importe neto (S/ %) no puede ser menor que lo ya pagado (S/ %). Anula primero los pagos que sobren',
      (new.precio - new.descuento)::numeric(10,2), v_pagado;
  end if;
  return new;
end $$;

create trigger t_orden_importe_pagado before update of precio, descuento on public.ordenes
  for each row execute function public.f_orden_importe_pagado();

-- 3 ----------------------------------------------------------------------------
alter table public.orden_pagos enable row level security;
revoke all on public.orden_pagos from anon, authenticated;
grant select on public.orden_pagos to authenticated;
grant insert (optica_id, orden_id, importe, medio, fecha) on public.orden_pagos to authenticated;
grant update (motivo_anulacion) on public.orden_pagos to authenticated;

create policy pagos_select on public.orden_pagos for select to authenticated using (public.es_miembro(optica_id));
create policy pagos_insert on public.orden_pagos for insert to authenticated with check (public.es_miembro(optica_id));
create policy pagos_update on public.orden_pagos for update to authenticated
  using (public.es_miembro(optica_id)) with check (public.es_miembro(optica_id));

revoke execute on function public.f_pago_controlar(), public.f_orden_importe_pagado() from public, anon, authenticated;
revoke execute on function public.total_pagado(uuid) from public, anon, authenticated;
