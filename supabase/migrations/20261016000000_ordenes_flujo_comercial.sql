-- OptiPedidos · Migración 0003 · Flujo comercial de órdenes
-- Sin cambios destructivos: solo agrega transiciones, funciones e índices.
-- No modifica el tipo estado_orden ni los registros existentes.
--
-- Estados comerciales (lo que ve el usuario) ↔ estados internos (estado_orden):
--   venta_iniciada  ← borrador
--   en_laboratorio  ← enviada, recibida_lab, en_proceso, lista
--   listo_entrega   ← recibida_optica   (aquí se avisa al paciente)
--   entregado       ← entregada
--   anulado         ← anulada
-- Los subestados de laboratorio se conservan para quien quiera registrarlos con detalle.

-- 1 ----------------------------------------------------------------------------
-- Atajos: la óptica puede marcar "listo para entrega" desde cualquier subestado de laboratorio
-- (no siempre se sabe cuándo el laboratorio recibió o procesó el trabajo).
insert into public.transiciones_estado (desde, hasta) values
  ('enviada', 'recibida_optica'),
  ('recibida_lab', 'recibida_optica'),
  ('en_proceso', 'recibida_optica')
on conflict do nothing;

-- 2 ----------------------------------------------------------------------------
create function public.estado_comercial(p_estado public.estado_orden) returns text
language sql immutable set search_path = '' as $$
  select case p_estado
    when 'borrador'        then 'venta_iniciada'
    when 'enviada'         then 'en_laboratorio'
    when 'recibida_lab'    then 'en_laboratorio'
    when 'en_proceso'      then 'en_laboratorio'
    when 'lista'           then 'en_laboratorio'
    when 'recibida_optica' then 'listo_entrega'
    when 'entregada'       then 'entregado'
    when 'anulada'         then 'anulado'
  end
$$;

-- 3 ----------------------------------------------------------------------------
-- Inserta las especificaciones de un ojo copiando la graduación de la receta de la orden (snapshot)
-- y los datos del lente enviados por la óptica. Solo si la receta tiene valores para ese ojo.
-- La receta se toma de la propia orden: no se puede mezclar con otra receta.
create function public.insertar_orden_ojo(p_orden uuid, p_ojo public.ojo, p_specs jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  r public.recetas;
  v_optica uuid;
begin
  select r2.* into r from public.recetas r2 join public.ordenes o on o.receta_id = r2.id where o.id = p_orden;
  select optica_id into v_optica from public.ordenes where id = p_orden;

  if p_ojo = 'OD' and num_nonnulls(r.od_esfera, r.od_cilindro) > 0 then
    insert into public.orden_ojos (optica_id, orden_id, ojo, esfera, cilindro, eje, adicion, dnp, altura, prisma, base_prisma,
                                   material, indice, diseno, tratamientos, tinte, diametro_mm, observaciones)
    values (v_optica, p_orden, 'OD', r.od_esfera, r.od_cilindro, r.od_eje, r.od_adicion, r.od_dnp, r.od_altura, r.od_prisma, r.od_base_prisma,
            nullif(p_specs ->> 'material', ''), nullif(p_specs ->> 'indice', '')::numeric, nullif(p_specs ->> 'diseno', ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(p_specs -> 'tratamientos', '[]'))), '{}'),
            nullif(p_specs ->> 'tinte', ''), nullif(p_specs ->> 'diametro_mm', '')::smallint, nullif(p_specs ->> 'observaciones', ''));
  elsif p_ojo = 'OI' and num_nonnulls(r.oi_esfera, r.oi_cilindro) > 0 then
    insert into public.orden_ojos (optica_id, orden_id, ojo, esfera, cilindro, eje, adicion, dnp, altura, prisma, base_prisma,
                                   material, indice, diseno, tratamientos, tinte, diametro_mm, observaciones)
    values (v_optica, p_orden, 'OI', r.oi_esfera, r.oi_cilindro, r.oi_eje, r.oi_adicion, r.oi_dnp, r.oi_altura, r.oi_prisma, r.oi_base_prisma,
            nullif(p_specs ->> 'material', ''), nullif(p_specs ->> 'indice', '')::numeric, nullif(p_specs ->> 'diseno', ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(p_specs -> 'tratamientos', '[]'))), '{}'),
            nullif(p_specs ->> 'tinte', ''), nullif(p_specs ->> 'diametro_mm', '')::smallint, nullif(p_specs ->> 'observaciones', ''));
  end if;
end $$;

-- Crea una orden completa en una sola transacción. SECURITY INVOKER: todas las escrituras
-- pasan por RLS con la identidad del usuario, así que solo puede usar pacientes, recetas
-- y laboratorios de su propia óptica.
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
  p_observacion         text default null
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

  -- numero y estado los asigna el trigger t_orden_controlar
  insert into public.ordenes (optica_id, paciente_id, receta_id, laboratorio_id, tipo_trabajo,
                              montura_descripcion, montura_origen, fecha_entrega_prometida, prioridad)
  values (v_optica, p_paciente, p_receta, p_laboratorio, p_tipo_trabajo,
          nullif(trim(p_montura_descripcion), ''), nullif(p_montura_origen, ''), p_fecha_entrega, p_prioridad)
  returning id into v_orden;

  perform public.insertar_orden_ojo(v_orden, 'OD', coalesce(p_ojos -> 'OD', '{}'));
  perform public.insertar_orden_ojo(v_orden, 'OI', coalesce(p_ojos -> 'OI', '{}'));

  if length(trim(coalesce(p_observacion, ''))) > 0 then
    insert into public.orden_observaciones (optica_id, orden_id, texto) values (v_optica, v_orden, trim(p_observacion));
  end if;

  return v_orden;
end $$;

-- Edita una orden en borrador (cabecera y datos del lente). La graduación no se edita:
-- si la receta cambió, se anula la orden y se crea otra con la receta corregida.
-- Los triggers existentes impiden editar órdenes que ya no están en borrador.
create function public.actualizar_orden_borrador(
  p_orden               uuid,
  p_laboratorio         uuid,
  p_tipo_trabajo        text,
  p_montura_descripcion text,
  p_montura_origen      text,
  p_fecha_entrega       date,
  p_prioridad           text,
  p_ojos                jsonb default '{}'
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
    prioridad               = p_prioridad
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

revoke execute on function public.insertar_orden_ojo(uuid, public.ojo, jsonb) from public, anon, authenticated;
revoke execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text) from public, anon;
revoke execute on function public.actualizar_orden_borrador(uuid, uuid, text, text, text, date, text, jsonb) from public, anon;
grant execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text) to authenticated;
grant execute on function public.actualizar_orden_borrador(uuid, uuid, text, text, text, date, text, jsonb) to authenticated;
-- crear_orden es SECURITY INVOKER y llama a insertar_orden_ojo, así que authenticated necesita
-- ejecutarla. Invocada directamente solo puede reinsertar un ojo de una orden propia en borrador
-- (RLS, trigger de borrador y unique(orden_id, ojo) lo limitan).
grant execute on function public.insertar_orden_ojo(uuid, public.ojo, jsonb) to authenticated;

-- 4 ----------------------------------------------------------------------------
-- Miembros de una óptica con su correo (auth.users no es legible desde la API).
-- Solo responde a miembros activos de esa misma óptica.
create function public.miembros_optica(p_optica uuid)
returns table (usuario_id uuid, email text, rol public.rol_miembro, activo boolean, creado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.usuario_id, u.email::text, m.rol, m.activo, m.creado_en
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  where m.optica_id = p_optica and public.es_miembro(p_optica)
  order by m.creado_en
$$;
revoke execute on function public.miembros_optica(uuid) from public, anon;
grant execute on function public.miembros_optica(uuid) to authenticated;

-- 5 ----------------------------------------------------------------------------
-- Órdenes pendientes por fecha prometida (indicador de atrasadas) y filtro por laboratorio.
create index ordenes_pendientes_por_fecha on public.ordenes (optica_id, fecha_entrega_prometida)
  where estado in ('borrador', 'enviada', 'recibida_lab', 'en_proceso', 'lista');
create index ordenes_por_laboratorio on public.ordenes (optica_id, laboratorio_id, estado);
