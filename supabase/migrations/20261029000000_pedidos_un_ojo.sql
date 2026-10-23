-- Selección opcional de ojos en la creación atómica. Sin _ojos mantiene el comportamiento anterior.
-- No cambia firmas, permisos, RLS, graduaciones ni pedidos existentes.
create or replace function public.crear_orden(
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
  p_descuento           numeric default 0,
  p_sede                uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_optica uuid;
  v_orden  uuid;
  v_elegidos jsonb := p_ojos -> '_ojos';
begin
  if p_ojos ? '_ojos' then
    if jsonb_typeof(v_elegidos) is distinct from 'array' then
      raise exception 'Selecciona uno o dos ojos válidos';
    end if;
    if jsonb_array_length(v_elegidos) not between 1 and 2
       or exists (select 1 from jsonb_array_elements_text(v_elegidos) e where e not in ('OD','OI'))
       or (select count(distinct e) from jsonb_array_elements_text(v_elegidos) e) <> jsonb_array_length(v_elegidos) then
      raise exception 'Selecciona uno o dos ojos válidos';
    end if;
  end if;
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

  -- La sede la valida t_0_sede (acceso del usuario y sede activa).
  insert into public.ordenes (optica_id, sede_id, paciente_id, receta_id, laboratorio_id, tipo_trabajo,
                              montura_descripcion, montura_origen, fecha_entrega_prometida, prioridad,
                              precio, descuento)
  values (v_optica, p_sede, p_paciente, p_receta, p_laboratorio, p_tipo_trabajo,
          nullif(trim(p_montura_descripcion), ''), nullif(p_montura_origen, ''), p_fecha_entrega, p_prioridad,
          coalesce(p_precio, 0), coalesce(p_descuento, 0))
  returning id into v_orden;

  if v_elegidos is null or v_elegidos ? 'OD' then
    perform public.insertar_orden_ojo(v_orden, 'OD', coalesce(p_ojos -> 'OD', '{}'));
  end if;
  if v_elegidos is null or v_elegidos ? 'OI' then
    perform public.insertar_orden_ojo(v_orden, 'OI', coalesce(p_ojos -> 'OI', '{}'));
  end if;
  if v_elegidos is not null and (select count(*) from public.orden_ojos where orden_id = v_orden) <> jsonb_array_length(v_elegidos) then
    raise exception 'La receta no tiene graduación para el ojo seleccionado';
  end if;

  if length(trim(coalesce(p_observacion, ''))) > 0 then
    insert into public.orden_observaciones (optica_id, orden_id, texto) values (v_optica, v_orden, trim(p_observacion));
  end if;

  return v_orden;
end $$;
