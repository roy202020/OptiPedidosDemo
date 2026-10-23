-- Corrige el alias ambiguo al copiar costos y protege toda modificación de precio o descuento.
-- Incluye quitar un descuento previamente autorizado. Conserva versiones, RLS e historial.
create or replace function public.actualizar_cotizacion_lunas(p_cotizacion uuid, p_precio_manual numeric default null, p_descuento numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.cotizaciones_lunas; v public.cotizaciones_lunas_versiones; l public.cotizaciones_lunas_lineas;
  costo numeric; v_nuevo uuid; v_linea uuid; v_subtotal numeric; v_precio numeric; v_estado text;
begin
  select * into c from public.cotizaciones_lunas where id = p_cotizacion and optica_id in (select public.mis_opticas()) for update;
  if c.id is null then raise exception 'La cotización no existe'; end if;
  if c.sede_id not in (select public.mis_sedes()) then raise exception 'No tienes acceso a la sede de la cotización' using errcode = '42501'; end if;
  if c.estado not in ('pendiente_manual','cotizada') then raise exception 'La cotización ya no puede modificarse'; end if;
  select * into v from public.cotizaciones_lunas_versiones where cotizacion_id = c.id and numero = c.version_actual;
  select * into l from public.cotizaciones_lunas_lineas where version_id = v.id;
  v_precio := coalesce(p_precio_manual, v.precio_venta_unitario);
  if l.modalidad = 'cotizacion_manual' and p_precio_manual is null then raise exception 'Indica el precio manual'; end if;
  if p_precio_manual is not null and l.modalidad <> 'cotizacion_manual' then raise exception 'El precio manual solo aplica a esa modalidad'; end if;
  if not public.tiene_rol(c.optica_id, array['propietario','administrador']::public.rol_miembro[]) then
    raise exception 'Solo propietario o administrador pueden fijar precios manuales o autorizar descuentos' using errcode = '42501';
  end if;
  if p_descuento < 0 then raise exception 'Descuento inválido'; end if;
  v_subtotal := case when v.unidad_precio = 'por_par' then v_precio else v_precio * v.cantidad_lunas end;
  if p_descuento > v_subtotal then raise exception 'El descuento supera el subtotal'; end if;
  v_estado := case when l.modalidad = 'cotizacion_manual' or v.estado = 'pendiente_manual' then 'cotizada' else v.estado end;
  insert into public.cotizaciones_lunas_versiones (optica_id,cotizacion_id,numero,modalidad,unidad_precio,
    precio_base,precio_venta_unitario,cantidad_lunas,subtotal,descuento,total,estado,descuento_autorizado_por)
  values (c.optica_id,c.id,c.version_actual+1,v.modalidad,v.unidad_precio,
    coalesce(v.precio_base,p_precio_manual),v_precio,v.cantidad_lunas,v_subtotal,p_descuento,v_subtotal-p_descuento,
    v_estado,case when p_descuento > 0 then auth.uid() else null end) returning id into v_nuevo;
  select costo_unitario_snapshot into costo from public.cotizaciones_lunas_costos costos_snapshot
    join public.cotizaciones_lunas_lineas x on x.id = costos_snapshot.linea_id where x.version_id = v.id;
  insert into public.cotizaciones_lunas_lineas (optica_id,version_id,regla_id,producto_id,variante_od_id,variante_oi_id,
    producto_nombre,tipo,material,indice,tratamiento,color_tratamiento,superficie,vision,modalidad)
  values (l.optica_id,v_nuevo,l.regla_id,l.producto_id,l.variante_od_id,l.variante_oi_id,
    l.producto_nombre,l.tipo,l.material,l.indice,l.tratamiento,l.color_tratamiento,l.superficie,l.vision,l.modalidad) returning id into v_linea;
  insert into public.cotizaciones_lunas_costos (linea_id,optica_id,costo_unitario_snapshot) values (v_linea,c.optica_id,costo);
  update public.cotizaciones_lunas set version_actual = version_actual + 1, estado = v_estado where id = c.id;
  insert into public.cotizaciones_lunas_eventos (optica_id,cotizacion_id,version_id,tipo,detalle)
    values (c.optica_id,c.id,v_nuevo,case when p_descuento > 0 then 'descuento_autorizado' when p_precio_manual is not null then 'precio_manual' else 'creada' end,
      case when p_descuento > 0 then 'Descuento autorizado' when p_precio_manual is not null then 'Precio manual registrado' else 'Nueva versión de cotización' end);
  return v_nuevo;
end $$;
