-- Cotización automática de lunas. Las reglas y cotizaciones son por óptica;
-- la disponibilidad de producto terminado y la conversión se validan por sede.

create table public.lunas_reglas_cotizacion (
  id uuid primary key default gen_random_uuid(),
  optica_id uuid not null references public.opticas(id),
  producto_id uuid not null,
  modalidad text not null check (modalidad in ('terminada', 'fabricacion_especial', 'cotizacion_manual')),
  esfera_min numeric(5,2) not null,
  esfera_max numeric(5,2) not null,
  cilindro_min numeric(5,2) not null,
  cilindro_max numeric(5,2) not null,
  adicion_min numeric(4,2),
  adicion_max numeric(4,2),
  unidad_precio text not null check (unidad_precio in ('por_luna', 'por_par')),
  precio_base numeric(10,2) check (precio_base is null or precio_base >= 0),
  precio_venta numeric(10,2) check (precio_venta is null or precio_venta >= 0),
  activo boolean not null default true,
  creado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (id, optica_id),
  foreign key (producto_id, optica_id) references public.lunas_productos(id, optica_id),
  check (esfera_min <= esfera_max and esfera_min between -20 and 20 and esfera_max between -20 and 20),
  check (cilindro_min <= cilindro_max and cilindro_min between -10 and 0 and cilindro_max between -10 and 0),
  check ((adicion_min is null and adicion_max is null) or
         (adicion_min is not null and adicion_max is not null and adicion_min <= adicion_max and adicion_min between 0.25 and 4 and adicion_max between 0.25 and 4)),
  check (modalidad = 'cotizacion_manual' or (precio_base is not null and precio_venta is not null))
);
comment on table public.lunas_reglas_cotizacion is 'Reglas comerciales de rangos oftálmicos por producto. Se requiere regla activa para ofrecerlo.';

-- El costo queda separado de los campos que consultan vendedores.
create table public.lunas_reglas_cotizacion_costos (
  regla_id uuid primary key,
  optica_id uuid not null,
  costo_unitario numeric(10,2) check (costo_unitario is null or costo_unitario >= 0),
  actualizado_por uuid not null default auth.uid(),
  actualizado_en timestamptz not null default now(),
  foreign key (regla_id, optica_id) references public.lunas_reglas_cotizacion(id, optica_id)
);

create table public.cotizaciones_lunas (
  id uuid primary key default gen_random_uuid(),
  optica_id uuid not null references public.opticas(id),
  paciente_id uuid not null,
  receta_id uuid not null,
  sede_id uuid not null,
  estado text not null default 'cotizada'
    check (estado in ('pendiente_manual', 'cotizada', 'aceptada', 'vencida', 'convertida', 'anulada')),
  version_actual integer not null default 1 check (version_actual > 0),
  vence_el date,
  creado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (id, optica_id),
  foreign key (paciente_id, optica_id) references public.pacientes(id, optica_id),
  foreign key (receta_id, optica_id) references public.recetas(id, optica_id),
  foreign key (sede_id, optica_id) references public.sedes(id, optica_id)
);
create index cotizaciones_lunas_lista on public.cotizaciones_lunas(optica_id, creado_en desc);
create index cotizaciones_lunas_paciente on public.cotizaciones_lunas(optica_id, paciente_id, creado_en desc);

create table public.cotizaciones_lunas_versiones (
  id uuid primary key default gen_random_uuid(),
  optica_id uuid not null,
  cotizacion_id uuid not null,
  numero integer not null check (numero > 0),
  modalidad text not null check (modalidad in ('terminada', 'fabricacion_especial', 'cotizacion_manual')),
  unidad_precio text not null check (unidad_precio in ('por_luna', 'por_par')),
  precio_base numeric(10,2),
  precio_venta_unitario numeric(10,2),
  cantidad_lunas smallint not null default 2 check (cantidad_lunas in (1, 2)),
  subtotal numeric(10,2),
  descuento numeric(10,2) not null default 0 check (descuento >= 0),
  total numeric(10,2),
  estado text not null check (estado in ('pendiente_manual', 'cotizada', 'aceptada', 'convertida', 'anulada')),
  descuento_autorizado_por uuid,
  creado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now(),
  unique (cotizacion_id, numero),
  unique (id, optica_id),
  foreign key (cotizacion_id, optica_id) references public.cotizaciones_lunas(id, optica_id),
  check ((subtotal is null and total is null) or (subtotal is not null and total = subtotal - descuento and descuento <= subtotal))
);

create table public.cotizaciones_lunas_lineas (
  id uuid primary key default gen_random_uuid(),
  optica_id uuid not null,
  version_id uuid not null,
  regla_id uuid not null,
  producto_id uuid not null,
  variante_od_id uuid,
  variante_oi_id uuid,
  producto_nombre text not null,
  tipo text not null,
  material text,
  indice numeric(3,2),
  tratamiento text,
  color_tratamiento text,
  superficie text,
  vision text not null,
  modalidad text not null check (modalidad in ('terminada', 'fabricacion_especial', 'cotizacion_manual')),
  creado_en timestamptz not null default now(),
  unique (version_id),
  unique (id, optica_id),
  foreign key (version_id, optica_id) references public.cotizaciones_lunas_versiones(id, optica_id),
  foreign key (regla_id, optica_id) references public.lunas_reglas_cotizacion(id, optica_id),
  foreign key (producto_id, optica_id) references public.lunas_productos(id, optica_id),
  foreign key (variante_od_id, optica_id) references public.lunas_variantes(id, optica_id),
  foreign key (variante_oi_id, optica_id) references public.lunas_variantes(id, optica_id)
);

create table public.cotizaciones_lunas_costos (
  linea_id uuid primary key references public.cotizaciones_lunas_lineas(id),
  optica_id uuid not null references public.opticas(id),
  costo_unitario_snapshot numeric(10,2) check (costo_unitario_snapshot is null or costo_unitario_snapshot >= 0)
);

create table public.cotizaciones_lunas_eventos (
  id bigint generated always as identity primary key,
  optica_id uuid not null,
  cotizacion_id uuid not null,
  version_id uuid,
  tipo text not null check (tipo in ('creada', 'precio_manual', 'descuento_autorizado', 'aceptada', 'vencida', 'convertida', 'anulada')),
  detalle text,
  creado_por uuid not null default auth.uid(),
  creado_en timestamptz not null default now(),
  foreign key (cotizacion_id, optica_id) references public.cotizaciones_lunas(id, optica_id),
  foreign key (version_id, optica_id) references public.cotizaciones_lunas_versiones(id, optica_id)
);
create index cotizaciones_lunas_eventos_historial on public.cotizaciones_lunas_eventos(optica_id, cotizacion_id, creado_en);

-- El vínculo preserva el precio cotizado al convertir la versión aceptada en una orden.
alter table public.ordenes add column cotizacion_version_id uuid;
alter table public.ordenes add constraint ordenes_cotizacion_version_fk
  foreign key (cotizacion_version_id, optica_id) references public.cotizaciones_lunas_versiones(id, optica_id);
create unique index ordenes_cotizacion_version_unica on public.ordenes(cotizacion_version_id) where cotizacion_version_id is not null;

-- Los rangos para diseños multifocales deben existir; los monofocales no admiten adición.
create function public.f_luna_regla_cotizacion_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_vision text;
begin
  select vision into v_vision from public.lunas_productos where id = new.producto_id and optica_id = new.optica_id;
  if v_vision is null then raise exception 'Producto de lunas inválido para esta óptica'; end if;
  if v_vision = 'monofocal' and new.adicion_min is not null then raise exception 'Un producto monofocal no admite rango de adición'; end if;
  if v_vision <> 'monofocal' and new.adicion_min is null then raise exception 'Configura el rango de adición para este diseño'; end if;
  if new.modalidad <> 'cotizacion_manual' and (new.precio_base is null or new.precio_venta is null) then
    raise exception 'Configura precio base y precio de venta';
  end if;
  return new;
end $$;
create trigger t_luna_regla_cotizacion_controlar before insert or update on public.lunas_reglas_cotizacion
  for each row execute function public.f_luna_regla_cotizacion_controlar();

create function public.f_luna_regla_cotizacion_sin_solapes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.activo and exists (
    select 1 from public.lunas_reglas_cotizacion r
     where r.optica_id = new.optica_id and r.producto_id = new.producto_id
       and r.modalidad = new.modalidad and r.activo and r.id <> new.id
       and r.esfera_min <= new.esfera_max and r.esfera_max >= new.esfera_min
       and r.cilindro_min <= new.cilindro_max and r.cilindro_max >= new.cilindro_min
       and ((r.adicion_min is null and new.adicion_min is null)
         or (r.adicion_min is not null and new.adicion_min is not null
             and r.adicion_min <= new.adicion_max and r.adicion_max >= new.adicion_min))
  ) then raise exception 'Ya hay una regla activa de este producto y modalidad que se solapa'; end if;
  return new;
end $$;
create trigger t_luna_regla_cotizacion_sin_solapes before insert or update on public.lunas_reglas_cotizacion
  for each row execute function public.f_luna_regla_cotizacion_sin_solapes();

create trigger t_luna_regla_cotizacion_actualizado before update on public.lunas_reglas_cotizacion
  for each row execute function public.f_actualizado();
create trigger t_cotizacion_lunas_actualizado before update on public.cotizaciones_lunas
  for each row execute function public.f_actualizado();

-- El historial y las versiones son append-only.
create function public.f_cotizacion_version_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las versiones de cotización no se eliminan'; end if;
  if (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
    raise exception 'Los precios pactados de una versión son inmutables';
  end if;
  return new;
end $$;
create trigger t_version_cotizacion_controlar before update or delete on public.cotizaciones_lunas_versiones
  for each row execute function public.f_cotizacion_version_controlar();
create function public.f_cotizacion_lunas_inmutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin raise exception 'El historial de cotización es inmutable'; end $$;
create trigger t_linea_cotizacion_inmutable before update or delete on public.cotizaciones_lunas_lineas
  for each row execute function public.f_cotizacion_lunas_inmutable();
create trigger t_evento_cotizacion_inmutable before update or delete on public.cotizaciones_lunas_eventos
  for each row execute function public.f_cotizacion_lunas_inmutable();

alter table public.lunas_reglas_cotizacion enable row level security;
alter table public.lunas_reglas_cotizacion_costos enable row level security;
alter table public.cotizaciones_lunas enable row level security;
alter table public.cotizaciones_lunas_versiones enable row level security;
alter table public.cotizaciones_lunas_lineas enable row level security;
alter table public.cotizaciones_lunas_costos enable row level security;
alter table public.cotizaciones_lunas_eventos enable row level security;

revoke all on public.lunas_reglas_cotizacion, public.lunas_reglas_cotizacion_costos,
  public.cotizaciones_lunas, public.cotizaciones_lunas_versiones, public.cotizaciones_lunas_lineas,
  public.cotizaciones_lunas_costos, public.cotizaciones_lunas_eventos from anon, authenticated;
grant select on public.lunas_reglas_cotizacion to authenticated;
grant insert (optica_id, producto_id, modalidad, esfera_min, esfera_max, cilindro_min, cilindro_max,
  adicion_min, adicion_max, unidad_precio, precio_base, precio_venta, activo) on public.lunas_reglas_cotizacion to authenticated;
grant update (modalidad, esfera_min, esfera_max, cilindro_min, cilindro_max, adicion_min, adicion_max,
  unidad_precio, precio_base, precio_venta, activo) on public.lunas_reglas_cotizacion to authenticated;
grant select, insert, update on public.lunas_reglas_cotizacion_costos to authenticated;
grant select on public.cotizaciones_lunas, public.cotizaciones_lunas_versiones, public.cotizaciones_lunas_lineas,
  public.cotizaciones_lunas_eventos to authenticated;
grant select, insert on public.cotizaciones_lunas_costos to authenticated;
grant usage, select on sequence public.cotizaciones_lunas_eventos_id_seq to authenticated;

create policy luna_reglas_select on public.lunas_reglas_cotizacion for select to authenticated
  using (optica_id in (select public.mis_opticas()));
create policy luna_reglas_insert on public.lunas_reglas_cotizacion for insert to authenticated
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create policy luna_reglas_update on public.lunas_reglas_cotizacion for update to authenticated
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])))
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create policy luna_reglas_costos_admin on public.lunas_reglas_cotizacion_costos for all to authenticated
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])))
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create policy cotizaciones_lunas_select on public.cotizaciones_lunas for select to authenticated
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
create policy cotizaciones_lunas_insert on public.cotizaciones_lunas for insert to authenticated
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
create policy cotizaciones_lunas_update on public.cotizaciones_lunas for update to authenticated
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()))
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
create policy cotizaciones_version_select on public.cotizaciones_lunas_versiones for select to authenticated
  using (optica_id in (select public.mis_opticas()) and exists (
    select 1 from public.cotizaciones_lunas c where c.id = cotizacion_id and c.sede_id in (select public.mis_sedes())));
create policy cotizaciones_lineas_select on public.cotizaciones_lunas_lineas for select to authenticated
  using (optica_id in (select public.mis_opticas()) and exists (
    select 1 from public.cotizaciones_lunas_versiones v join public.cotizaciones_lunas c on c.id = v.cotizacion_id
    where v.id = version_id and c.sede_id in (select public.mis_sedes())));
create policy cotizaciones_costos_admin on public.cotizaciones_lunas_costos for select to authenticated
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create policy cotizaciones_eventos_select on public.cotizaciones_lunas_eventos for select to authenticated
  using (optica_id in (select public.mis_opticas()) and exists (
    select 1 from public.cotizaciones_lunas c where c.id = cotizacion_id and c.sede_id in (select public.mis_sedes())));

-- Evita cambiar precios pactados por formularios directos: estados y versiones se escriben por RPC.
revoke insert, update, delete on public.cotizaciones_lunas_versiones, public.cotizaciones_lunas_lineas,
  public.cotizaciones_lunas_eventos, public.cotizaciones_lunas_costos from authenticated;

create function public.crear_regla_cotizacion_lunas(
  p_producto uuid, p_modalidad text, p_esfera_min numeric, p_esfera_max numeric,
  p_cilindro_min numeric, p_cilindro_max numeric, p_adicion_min numeric, p_adicion_max numeric,
  p_unidad_precio text, p_precio_base numeric, p_precio_venta numeric, p_costo numeric
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_optica uuid; v_id uuid;
begin
  select optica_id into v_optica from public.lunas_productos where id = p_producto and activo;
  if v_optica is null or not public.es_miembro(v_optica) then raise exception 'Producto inexistente o sin acceso'; end if;
  if not public.tiene_rol(v_optica, array['propietario','administrador']::public.rol_miembro[]) then
    raise exception 'Solo propietario o administrador configura el catálogo' using errcode = '42501';
  end if;
  insert into public.lunas_reglas_cotizacion (optica_id,producto_id,modalidad,esfera_min,esfera_max,
    cilindro_min,cilindro_max,adicion_min,adicion_max,unidad_precio,precio_base,precio_venta)
  values (v_optica,p_producto,p_modalidad,p_esfera_min,p_esfera_max,p_cilindro_min,p_cilindro_max,
    p_adicion_min,p_adicion_max,p_unidad_precio,p_precio_base,p_precio_venta) returning id into v_id;
  insert into public.lunas_reglas_cotizacion_costos (regla_id,optica_id,costo_unitario)
    values (v_id,v_optica,p_costo);
  return v_id;
end $$;
revoke execute on function public.crear_regla_cotizacion_lunas(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric) from public, anon;
grant execute on function public.crear_regla_cotizacion_lunas(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,numeric,numeric) to authenticated;

-- Alta de cotización: vuelve a leer receta, producto, regla y existencias; los precios del cliente no se aceptan.
create function public.crear_cotizacion_lunas(
  p_receta uuid, p_sede uuid, p_regla uuid, p_vence_el date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid; r public.recetas; regla public.lunas_reglas_cotizacion; producto public.lunas_productos;
  v_quote uuid; v_version uuid; v_linea uuid; v_od_var uuid; v_oi_var uuid;
  v_od_s numeric; v_od_c numeric; v_od_e integer; v_oi_s numeric; v_oi_c numeric; v_oi_e integer;
  v_cantidad integer := 0; v_precio numeric; v_base numeric; v_subtotal numeric; v_costo numeric;
  v_estado text; ojo record; v_esfera numeric; v_cilindro numeric; v_eje integer; v_adicion numeric; v_var uuid;
begin
  select optica_id into v_optica from public.recetas where id = p_receta and anulada_en is null;
  if v_optica is null or not public.es_miembro(v_optica) then raise exception 'La receta no existe, está anulada o no tienes acceso'; end if;
  if exists (select 1 from public.recetas x where x.reemplaza_a = p_receta and x.anulada_en is null) then
    raise exception 'La receta fue reemplazada; elige la receta vigente';
  end if;
  select * into r from public.recetas where id = p_receta and optica_id = v_optica for share;
  if r.id is null or not exists (select 1 from public.pacientes p where p.id = r.paciente_id and p.optica_id = v_optica and p.archivado_en is null) then
    raise exception 'El paciente de la receta no está disponible';
  end if;
  if not exists (select 1 from public.sedes s where s.id = p_sede and s.optica_id = v_optica and s.activa and public.tiene_sede(p_sede)) then
    raise exception 'La sede no está disponible para tu usuario';
  end if;
  select * into regla from public.lunas_reglas_cotizacion where id = p_regla and optica_id = v_optica and activo for share;
  if regla.id is null then raise exception 'La regla de catálogo no existe o está inactiva'; end if;
  select * into producto from public.lunas_productos where id = regla.producto_id and optica_id = v_optica and activo;
  if producto.id is null then raise exception 'El producto está inactivo'; end if;
  if p_vence_el is not null and p_vence_el < (now() at time zone 'America/Lima')::date then raise exception 'El vencimiento no puede estar en el pasado'; end if;

  -- Las cotizaciones automáticas requieren graduación para ambos ojos. No se infiere el precio de un ojo ausente.
  if num_nonnulls(r.od_esfera, r.od_cilindro) = 0 or num_nonnulls(r.oi_esfera, r.oi_cilindro) = 0 then
    raise exception 'La cotización automática requiere graduación OD y OI';
  end if;
  for ojo in select 'OD'::text as lado, r.od_esfera as esfera, r.od_cilindro as cilindro, r.od_eje as eje, r.od_adicion as adicion
              union all select 'OI', r.oi_esfera, r.oi_cilindro, r.oi_eje, r.oi_adicion loop
    v_esfera := coalesce(ojo.esfera, 0); v_cilindro := coalesce(ojo.cilindro, 0); v_eje := ojo.eje; v_adicion := ojo.adicion;
    if v_cilindro > 0 then
      v_esfera := v_esfera + v_cilindro;
      v_cilindro := -v_cilindro;
      v_eje := case when v_eje <= 90 then v_eje + 90 else v_eje - 90 end;
    end if;
    if v_esfera < regla.esfera_min or v_esfera > regla.esfera_max or v_cilindro < regla.cilindro_min or v_cilindro > regla.cilindro_max then
      raise exception 'La graduación % está fuera del rango configurado', ojo.lado;
    end if;
    if producto.vision = 'monofocal' then
      if v_adicion is not null then raise exception 'La receta % requiere adición y el producto es monofocal', ojo.lado; end if;
    elsif v_adicion is null or regla.adicion_min is null or v_adicion < regla.adicion_min or v_adicion > regla.adicion_max then
      raise exception 'La adición % no está cubierta por el rango configurado', ojo.lado;
    end if;
    v_var := null;
    if regla.modalidad = 'terminada' then
      select id into v_var from public.lunas_variantes v
       where v.optica_id = v_optica and v.sede_id = p_sede and v.producto_id = producto.id and v.activo
         and v.esfera = v_esfera and v.cilindro = v_cilindro and v.adicion is not distinct from (case when producto.vision = 'monofocal' then null else v_adicion end)
         and ((producto.por_lado and v.lado = ojo.lado::public.ojo) or (not producto.por_lado and v.lado is null))
         and ((v_cilindro = 0 and v.eje is null) or v.eje = v_eje)
         and v.stock - v.reservado > 0
       order by v.stock - v.reservado desc limit 1 for update;
      if v_var is null then raise exception 'No hay stock exacto disponible para % en la sede elegida', ojo.lado; end if;
      if ojo.lado = 'OD' then v_od_var := v_var; else v_oi_var := v_var; end if;
    end if;
  end loop;
  if regla.modalidad = 'terminada' and v_od_var = v_oi_var and
     (select stock - reservado from public.lunas_variantes where id = v_od_var and optica_id = v_optica) < 2 then
    raise exception 'Se requieren dos unidades disponibles cuando ambos ojos usan la misma medida';
  end if;

  if regla.modalidad = 'cotizacion_manual' then
    v_estado := 'pendiente_manual'; v_precio := null; v_base := null; v_subtotal := null;
  else
    v_estado := 'cotizada'; v_precio := regla.precio_venta; v_base := regla.precio_base;
    v_subtotal := case when regla.unidad_precio = 'por_par' then v_precio else v_precio * 2 end;
  end if;
  select costo_unitario into v_costo from public.lunas_reglas_cotizacion_costos where regla_id = regla.id and optica_id = v_optica;
  insert into public.cotizaciones_lunas (optica_id, paciente_id, receta_id, sede_id, estado, vence_el)
    values (v_optica, r.paciente_id, r.id, p_sede, v_estado, p_vence_el) returning id into v_quote;
  insert into public.cotizaciones_lunas_versiones (optica_id, cotizacion_id, numero, modalidad, unidad_precio,
      precio_base, precio_venta_unitario, cantidad_lunas, subtotal, descuento, total, estado)
    values (v_optica, v_quote, 1, regla.modalidad, regla.unidad_precio, v_base, v_precio, 2,
      v_subtotal, 0, v_subtotal, v_estado) returning id into v_version;
  insert into public.cotizaciones_lunas_lineas (optica_id, version_id, regla_id, producto_id,
      variante_od_id, variante_oi_id, producto_nombre, tipo, material, indice, tratamiento,
      color_tratamiento, superficie, vision, modalidad)
    values (v_optica, v_version, regla.id, producto.id, v_od_var, v_oi_var,
      producto.nombre, producto.tipo, producto.material, producto.indice, producto.tratamiento,
      producto.color_tratamiento, producto.superficie, producto.vision, regla.modalidad)
    returning id into v_linea;
  insert into public.cotizaciones_lunas_costos (linea_id, optica_id, costo_unitario_snapshot) values (v_linea, v_optica, v_costo);
  insert into public.cotizaciones_lunas_eventos (optica_id, cotizacion_id, version_id, tipo, detalle)
    values (v_optica, v_quote, v_version, 'creada', case when v_estado = 'pendiente_manual' then 'Pendiente de precio manual' else 'Cotización calculada desde regla de catálogo' end);
  return v_quote;
end $$;

-- Aceptación y autorización: cualquier descuento requiere propietario/administrador y crea versión nueva.
create function public.actualizar_cotizacion_lunas(p_cotizacion uuid, p_precio_manual numeric default null, p_descuento numeric default 0)
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
  if p_precio_manual is not null or p_descuento > 0 then
    if not public.tiene_rol(c.optica_id, array['propietario','administrador']::public.rol_miembro[]) then
      raise exception 'Solo propietario o administrador pueden fijar precios manuales o autorizar descuentos' using errcode = '42501';
    end if;
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
  select costo_unitario_snapshot into costo from public.cotizaciones_lunas_costos c
    join public.cotizaciones_lunas_lineas x on x.id = c.linea_id where x.version_id = v.id;
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

create function public.aceptar_cotizacion_lunas(p_cotizacion uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.cotizaciones_lunas; v public.cotizaciones_lunas_versiones;
begin
  select * into c from public.cotizaciones_lunas where id = p_cotizacion and optica_id in (select public.mis_opticas()) for update;
  if c.id is null then raise exception 'La cotización no existe'; end if;
  if c.sede_id not in (select public.mis_sedes()) then raise exception 'No tienes acceso a la sede de la cotización' using errcode = '42501'; end if;
  if c.estado <> 'cotizada' then raise exception 'Solo se aceptan cotizaciones con precio definido'; end if;
  if c.vence_el is not null and c.vence_el < (now() at time zone 'America/Lima')::date then
    update public.cotizaciones_lunas set estado = 'vencida' where id = c.id;
    raise exception 'La cotización venció';
  end if;
  update public.cotizaciones_lunas set estado = 'aceptada' where id = c.id;
  update public.cotizaciones_lunas_versiones set estado = 'aceptada'
    where cotizacion_id = c.id and numero = c.version_actual;
  insert into public.cotizaciones_lunas_eventos (optica_id,cotizacion_id,tipo,detalle) values (c.optica_id,c.id,'aceptada','Aceptada para venta');
end $$;

create function public.anular_cotizacion_lunas(p_cotizacion uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.cotizaciones_lunas;
begin
  select * into c from public.cotizaciones_lunas where id = p_cotizacion and optica_id in (select public.mis_opticas()) for update;
  if c.id is null then raise exception 'La cotización no existe'; end if;
  if c.sede_id not in (select public.mis_sedes()) then raise exception 'No tienes acceso a la sede de la cotización' using errcode = '42501'; end if;
  if c.estado in ('convertida','anulada') then raise exception 'La cotización ya está cerrada'; end if;
  update public.cotizaciones_lunas set estado = 'anulada' where id = c.id;
  update public.cotizaciones_lunas_versiones set estado = 'anulada'
    where cotizacion_id = c.id and numero = c.version_actual;
  insert into public.cotizaciones_lunas_eventos (optica_id,cotizacion_id,tipo,detalle) values (c.optica_id,c.id,'anulada','Cotización anulada');
end $$;

-- Conversión atómica a la orden existente: recarga receta y precio aceptado, crea orden, reserva stock terminado.
create function public.convertir_cotizacion_lunas(
  p_cotizacion uuid, p_laboratorio uuid, p_tipo_trabajo text, p_montura_descripcion text,
  p_montura_origen text, p_fecha_entrega date, p_prioridad text, p_observacion text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.cotizaciones_lunas; v public.cotizaciones_lunas_versiones; l public.cotizaciones_lunas_lineas;
  r public.recetas; v_ojos jsonb := '{}'::jsonb; v_orden uuid;
begin
  select * into c from public.cotizaciones_lunas where id = p_cotizacion and optica_id in (select public.mis_opticas()) for update;
  if c.id is null or c.sede_id not in (select public.mis_sedes()) then raise exception 'La cotización no existe o no tienes acceso a su sede'; end if;
  if c.estado <> 'aceptada' then raise exception 'La cotización debe estar aceptada antes de convertirla'; end if;
  if c.vence_el is not null and c.vence_el < (now() at time zone 'America/Lima')::date then raise exception 'La cotización venció'; end if;
  select * into v from public.cotizaciones_lunas_versiones where cotizacion_id = c.id and numero = c.version_actual for update;
  if v.estado <> 'aceptada' or v.total is null then raise exception 'La versión aceptada no tiene precio'; end if;
  select * into r from public.recetas where id = c.receta_id and optica_id = c.optica_id and anulada_en is null;
  if r.id is null or exists (select 1 from public.recetas x where x.reemplaza_a = r.id and x.anulada_en is null) then
    raise exception 'La receta ya no está vigente';
  end if;
  select * into l from public.cotizaciones_lunas_lineas where version_id = v.id;
  v_ojos := jsonb_build_object(
    'OD', jsonb_build_object('material',l.material,'indice',l.indice,'diseno',l.vision,'tratamientos',case when l.tratamiento is null then '[]'::jsonb else jsonb_build_array(l.tratamiento || case when l.color_tratamiento is null then '' else ' (' || l.color_tratamiento || ')' end) end),
    'OI', jsonb_build_object('material',l.material,'indice',l.indice,'diseno',l.vision,'tratamientos',case when l.tratamiento is null then '[]'::jsonb else jsonb_build_array(l.tratamiento || case when l.color_tratamiento is null then '' else ' (' || l.color_tratamiento || ')' end) end)
  );
  v_orden := public.crear_orden(c.paciente_id,c.receta_id,p_laboratorio,p_tipo_trabajo,p_montura_descripcion,p_montura_origen,
    p_fecha_entrega,p_prioridad,v_ojos,p_observacion,v.subtotal,v.descuento,c.sede_id);
  update public.ordenes set cotizacion_version_id = v.id where id = v_orden and optica_id = c.optica_id;
  if l.modalidad = 'terminada' then
    perform public.reservar_luna(v_orden,'OD',l.variante_od_id);
    perform public.reservar_luna(v_orden,'OI',l.variante_oi_id);
  end if;
  update public.cotizaciones_lunas set estado = 'convertida' where id = c.id;
  update public.cotizaciones_lunas_versiones set estado = 'convertida' where id = v.id;
  insert into public.cotizaciones_lunas_eventos (optica_id,cotizacion_id,version_id,tipo,detalle)
    values (c.optica_id,c.id,v.id,'convertida','Convertida a orden ' || v_orden::text);
  return v_orden;
end $$;

revoke execute on function public.f_luna_regla_cotizacion_controlar(), public.f_luna_regla_cotizacion_sin_solapes(),
  public.f_cotizacion_version_controlar(), public.f_cotizacion_lunas_inmutable() from public, anon, authenticated;
revoke execute on function public.crear_cotizacion_lunas(uuid,uuid,uuid,date),
  public.actualizar_cotizacion_lunas(uuid,numeric,numeric), public.aceptar_cotizacion_lunas(uuid),
  public.anular_cotizacion_lunas(uuid), public.convertir_cotizacion_lunas(uuid,uuid,text,text,text,date,text,text) from public, anon;
grant execute on function public.crear_cotizacion_lunas(uuid,uuid,uuid,date),
  public.actualizar_cotizacion_lunas(uuid,numeric,numeric), public.aceptar_cotizacion_lunas(uuid),
  public.anular_cotizacion_lunas(uuid), public.convertir_cotizacion_lunas(uuid,uuid,text,text,text,date,text,text) to authenticated;
