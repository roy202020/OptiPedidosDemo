-- OptiPedidos · Migración 0004 · Importes de venta y metas mensuales
-- Sin pérdida de datos: agrega columnas con valores por defecto, una tabla nueva y funciones.
--
-- Regla de negocio (decidida con la óptica):
--   * Importes en soles (PEN) con IGV incluido, 2 decimales.
--   * Venta = importe neto de la orden (precio − descuento).
--   * Cuenta en el mes (hora de Lima) en que la orden se confirma: cuando sale de "venta iniciada"
--     (borrador → enviada). Si vuelve a borrador deja de contar hasta que se confirme otra vez.
--   * Las órdenes anuladas no cuentan (la anulación equivale a una devolución).
--   * Los importes solo se editan en borrador (lo garantiza f_orden_controlar).

-- 1 ----------------------------------------------------------------------------
alter table public.ordenes
  add column precio        numeric(10,2) not null default 0 check (precio >= 0),
  add column descuento     numeric(10,2) not null default 0 check (descuento >= 0),
  add column confirmada_en timestamptz,
  add constraint ordenes_descuento_menor_precio check (descuento <= precio);

comment on column public.ordenes.precio is 'Precio total de la venta en PEN, IGV incluido.';
comment on column public.ordenes.descuento is 'Descuento en PEN sobre el precio.';
comment on column public.ordenes.confirmada_en is 'Momento en que la venta se confirmó (salió de borrador). Lo asigna el servidor.';

create index ordenes_confirmadas on public.ordenes (optica_id, confirmada_en) where confirmada_en is not null;

-- 2 ----------------------------------------------------------------------------
-- Misma lógica que la migración 0002 más el control de confirmada_en.
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
     (to_jsonb(new) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

-- Órdenes que ya salieron de borrador antes de esta migración: se toma la última confirmación
-- registrada en el historial (o la creación si no hay historial). Se desactivan los triggers
-- de control y de fecha de actualización solo para este relleno.
alter table public.ordenes disable trigger t_orden_controlar;
alter table public.ordenes disable trigger t_actualizado;
update public.ordenes o set confirmada_en = coalesce(
  (select max(h.creado_en) from public.orden_historial_estados h
   where h.orden_id = o.id and h.desde = 'borrador' and h.hasta <> 'anulada'),
  o.creado_en)
where o.estado <> 'borrador' and o.confirmada_en is null;
alter table public.ordenes enable trigger t_actualizado;
alter table public.ordenes enable trigger t_orden_controlar;

-- 3 ----------------------------------------------------------------------------
-- crear_orden y actualizar_orden_borrador ganan los importes. Se reemplazan (no se sobrecargan)
-- para que la API no tenga dos versiones ambiguas.
drop function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text);
drop function public.actualizar_orden_borrador(uuid, uuid, text, text, text, date, text, jsonb);

create function public.crear_orden(
  p_paciente            uuid,
  p_receta              uuid,
  p_laboratorio         uuid,
  p_tipo_trabajo        text default 'lentes_completos',
  p_montura_descripcion text default null,
  p_montura_origen      text default null,
  p_fecha_entrega       date default null,
  p_prioridad           text default 'normal',
  p_ojos                jsonb default '{}',
  p_observacion         text default null,
  p_precio              numeric default 0,
  p_descuento           numeric default 0
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_optica uuid;
  v_orden  uuid;
begin
  select optica_id into v_optica from public.pacientes where id = p_paciente and archivado_en is null;
  if v_optica is null then
    raise exception 'El paciente no existe o está archivado';
  end if;
  if not exists (select 1 from public.laboratorios where id = p_laboratorio and optica_id = v_optica and activo) then
    raise exception 'El laboratorio no existe o está inactivo';
  end if;
  if p_fecha_entrega is not null and p_fecha_entrega < current_date then
    raise exception 'La fecha prometida no puede estar en el pasado';
  end if;

  insert into public.ordenes (optica_id, paciente_id, receta_id, laboratorio_id, tipo_trabajo,
                              montura_descripcion, montura_origen, fecha_entrega_prometida, prioridad,
                              precio, descuento)
  values (v_optica, p_paciente, p_receta, p_laboratorio, p_tipo_trabajo,
          nullif(trim(p_montura_descripcion), ''), nullif(p_montura_origen, ''), p_fecha_entrega, p_prioridad,
          coalesce(p_precio, 0), coalesce(p_descuento, 0))
  returning id into v_orden;

  perform public.insertar_orden_ojo(v_orden, 'OD', coalesce(p_ojos -> 'OD', '{}'));
  perform public.insertar_orden_ojo(v_orden, 'OI', coalesce(p_ojos -> 'OI', '{}'));

  if length(trim(coalesce(p_observacion, ''))) > 0 then
    insert into public.orden_observaciones (optica_id, orden_id, texto) values (v_optica, v_orden, trim(p_observacion));
  end if;

  return v_orden;
end $$;

create function public.actualizar_orden_borrador(
  p_orden               uuid,
  p_laboratorio         uuid,
  p_tipo_trabajo        text,
  p_montura_descripcion text,
  p_montura_origen      text,
  p_fecha_entrega       date,
  p_prioridad           text,
  p_ojos                jsonb default '{}',
  p_precio              numeric default null,
  p_descuento           numeric default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_optica uuid;
  v_ojo    public.ojo;
  v_specs  jsonb;
begin
  select optica_id into v_optica from public.ordenes where id = p_orden;
  if v_optica is null then
    raise exception 'La orden no existe';
  end if;
  if not exists (select 1 from public.laboratorios where id = p_laboratorio and optica_id = v_optica and activo) then
    raise exception 'El laboratorio no existe o está inactivo';
  end if;
  if p_fecha_entrega is not null and p_fecha_entrega < current_date then
    raise exception 'La fecha prometida no puede estar en el pasado';
  end if;

  update public.ordenes set
    laboratorio_id          = p_laboratorio,
    tipo_trabajo            = p_tipo_trabajo,
    montura_descripcion     = nullif(trim(p_montura_descripcion), ''),
    montura_origen          = nullif(p_montura_origen, ''),
    fecha_entrega_prometida = p_fecha_entrega,
    prioridad               = p_prioridad,
    precio                  = coalesce(p_precio, precio),
    descuento               = coalesce(p_descuento, descuento)
  where id = p_orden;

  foreach v_ojo in array array['OD', 'OI']::public.ojo[] loop
    v_specs := coalesce(p_ojos -> v_ojo::text, '{}');
    update public.orden_ojos set
      material      = nullif(v_specs ->> 'material', ''),
      indice        = nullif(v_specs ->> 'indice', '')::numeric,
      diseno        = nullif(v_specs ->> 'diseno', ''),
      tratamientos  = coalesce(array(select jsonb_array_elements_text(coalesce(v_specs -> 'tratamientos', '[]'))), '{}'),
      tinte         = nullif(v_specs ->> 'tinte', ''),
      diametro_mm   = nullif(v_specs ->> 'diametro_mm', '')::smallint,
      observaciones = nullif(v_specs ->> 'observaciones', '')
    where orden_id = p_orden and ojo = v_ojo;
  end loop;
end $$;

revoke execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text, numeric, numeric) from public, anon;
revoke execute on function public.actualizar_orden_borrador(uuid, uuid, text, text, text, date, text, jsonb, numeric, numeric) from public, anon;
grant execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text, numeric, numeric) to authenticated;
grant execute on function public.actualizar_orden_borrador(uuid, uuid, text, text, text, date, text, jsonb, numeric, numeric) to authenticated;

-- 4 ----------------------------------------------------------------------------
create table public.metas_ventas (
  id               uuid primary key default gen_random_uuid(),
  optica_id        uuid not null references public.opticas(id),
  periodo          date not null check (periodo = date_trunc('month', periodo)::date),
  importe_objetivo numeric(12,2) not null check (importe_objetivo > 0),
  creado_por       uuid not null default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (optica_id, periodo)
);
comment on table public.metas_ventas is 'Meta mensual de ventas netas (PEN, IGV incluido). periodo = primer día del mes.';

create trigger t_actualizado before update on public.metas_ventas for each row execute function public.f_actualizado();
create trigger t_autor before insert or update on public.metas_ventas for each row execute function public.f_fijar_autor();
create trigger t_sin_delete before delete on public.metas_ventas for each row execute function public.f_bloquear_delete();
create trigger t_auditar after insert or update or delete on public.metas_ventas for each row execute function public.f_auditar();

alter table public.metas_ventas enable row level security;
revoke all on public.metas_ventas from anon, authenticated;
grant select, insert on public.metas_ventas to authenticated;
grant update (importe_objetivo) on public.metas_ventas to authenticated;

create policy metas_select on public.metas_ventas for select to authenticated
  using (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]));
create policy metas_insert on public.metas_ventas for insert to authenticated
  with check (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]));
create policy metas_update on public.metas_ventas for update to authenticated
  using (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]))
  with check (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]));

-- 5 ----------------------------------------------------------------------------
-- Ventas netas por mes con su meta. Solo propietario y administrador: los operadores ven el
-- precio de cada orden (lo necesitan para vender), pero no los totales de la óptica.
create function public.ventas_mensuales(p_optica uuid, p_meses integer default 12)
returns table (periodo date, ventas numeric, ordenes integer, meta numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'No tienes permiso para ver las ventas' using errcode = '42501';
  end if;
  return query
    with meses as (
      select (date_trunc('month', (now() at time zone 'America/Lima')) - make_interval(months => g))::date as periodo
      from generate_series(0, greatest(1, least(p_meses, 36)) - 1) g
    ), ventas as (
      select date_trunc('month', o.confirmada_en at time zone 'America/Lima')::date as periodo,
             sum(o.precio - o.descuento) as total, count(*)::integer as cantidad
      from public.ordenes o
      where o.optica_id = p_optica and o.confirmada_en is not null and o.estado <> 'anulada'
      group by 1
    )
    select m.periodo, coalesce(v.total, 0), coalesce(v.cantidad, 0), mv.importe_objetivo
    from meses m
    left join ventas v on v.periodo = m.periodo
    left join public.metas_ventas mv on mv.optica_id = p_optica and mv.periodo = m.periodo
    order by m.periodo desc;
end $$;

-- Ventas netas confirmadas hoy (hora de Lima).
create function public.ventas_del_dia(p_optica uuid)
returns table (ventas numeric, ordenes integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'No tienes permiso para ver las ventas' using errcode = '42501';
  end if;
  return query
    select coalesce(sum(o.precio - o.descuento), 0), count(*)::integer
    from public.ordenes o
    where o.optica_id = p_optica and o.estado <> 'anulada' and o.confirmada_en is not null
      and (o.confirmada_en at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date;
end $$;

revoke execute on function public.ventas_mensuales(uuid, integer), public.ventas_del_dia(uuid) from public, anon;
grant execute on function public.ventas_mensuales(uuid, integer), public.ventas_del_dia(uuid) to authenticated;
