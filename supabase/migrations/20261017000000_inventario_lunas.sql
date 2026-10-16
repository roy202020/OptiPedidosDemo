-- OptiPedidos · Migración 0007 · Inventario de lunas por medida exacta
-- Sin cambios destructivos: solo tablas, tipos, funciones y triggers nuevos.
--
-- Decisiones (acordadas con la óptica):
--   * Unidad: luna suelta. La interfaz muestra además el equivalente en pares.
--   * Cada combinación exacta (producto + esfera + cilindro + eje + adición + lado) es una variante
--     con su propio stock. Un movimiento solo afecta a su variante.
--   * Stock en convención de cilindro negativo (cilindro <= 0). La app transpone recetas en
--     cilindro positivo (misma luna óptica) antes de buscar.
--   * El stock solo cambia mediante movimientos (registro inmutable). Nunca negativo, salvo
--     autorización explícita de propietario o administrador.
--   * Órdenes: se reserva al asignar stock (venta iniciada), se descuenta al enviar al laboratorio,
--     se libera si se anula antes, y se repone con una devolución si vuelve a venta iniciada.
--   * Compras y salidas: cualquier miembro. Ajustes, inventario físico y stock negativo:
--     propietario o administrador.

-- 1 ----------------------------------------------------------------------------
create table public.lunas_productos (
  id                   uuid primary key default gen_random_uuid(),
  optica_id            uuid not null references public.opticas(id),
  nombre               text not null check (length(trim(nombre)) > 0),
  tipo                 text not null default 'resina'
                       check (tipo in ('resina', 'policarbonato', 'alto_indice', 'fotocromatica', 'trivex', 'cristal', 'otro')),
  material             text,
  indice               numeric(3,2) check (indice is null or indice between 1.4 and 2.0),
  tratamiento          text,          -- antirreflejo, Blue Cut, Fotoblue…
  color_tratamiento    text,          -- color del reflejo del AR: azul, verde…
  vision               text not null default 'monofocal'
                       check (vision in ('monofocal', 'bifocal', 'progresivo', 'ocupacional')),
  superficie           text check (superficie is null or superficie in ('esferica', 'asferica')),
  por_lado             boolean not null default false,  -- el stock distingue OD y OI
  proveedor            text,
  costo_referencial    numeric(10,2) check (costo_referencial is null or costo_referencial >= 0),
  stock_minimo_defecto integer not null default 0 check (stock_minimo_defecto >= 0),
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  unique (optica_id, nombre),
  unique (id, optica_id)
);
comment on table public.lunas_productos is 'Tipo de luna sin medida. Las medidas y el stock están en lunas_variantes.';

create table public.lunas_variantes (
  id             uuid primary key default gen_random_uuid(),
  optica_id      uuid not null references public.opticas(id),
  producto_id    uuid not null,
  esfera         public.d_esfera not null,
  cilindro       public.d_cilindro not null default 0 check (cilindro <= 0),
  eje            public.d_eje,
  adicion        public.d_adicion,
  lado           public.ojo,
  stock          integer not null default 0,
  reservado      integer not null default 0 check (reservado >= 0),
  stock_minimo   integer not null default 0 check (stock_minimo >= 0),
  ubicacion      text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (producto_id, optica_id) references public.lunas_productos (id, optica_id),
  constraint lunas_variantes_medida_unica unique nulls not distinct (producto_id, esfera, cilindro, eje, adicion, lado),
  unique (id, optica_id),
  check (cilindro <> 0 or eje is null)
);
comment on table public.lunas_variantes is 'Una fila por combinación exacta de medida. stock y reservado solo los cambian movimientos y reservas.';
create index lunas_variantes_busqueda on public.lunas_variantes (optica_id, esfera, cilindro);
create index lunas_variantes_por_producto on public.lunas_variantes (producto_id, esfera, cilindro);

create table public.inventario_operaciones (
  id         uuid primary key default gen_random_uuid(),
  optica_id  uuid not null references public.opticas(id),
  tipo       text not null check (tipo in ('compra', 'conteo', 'ajuste', 'salida')),
  proveedor  text,
  documento  text,
  fecha      date not null default current_date,
  notas      text,
  creado_por uuid not null default auth.uid(),
  creado_en  timestamptz not null default now(),
  unique (id, optica_id)
);
comment on table public.inventario_operaciones is 'Cabecera de una compra, inventario físico o ajuste que agrupa varios movimientos.';

create type public.tipo_movimiento as enum ('compra', 'venta', 'consumo', 'devolucion', 'perdida', 'ajuste');

create table public.inventario_movimientos (
  id                bigint generated always as identity primary key,
  optica_id         uuid not null references public.opticas(id),
  variante_id       uuid not null,
  operacion_id      uuid,
  orden_id          uuid,
  reserva_id        uuid,
  tipo              public.tipo_movimiento not null,
  cantidad          integer not null check (cantidad <> 0),
  stock_anterior    integer not null default 0,
  stock_resultante  integer not null default 0,
  motivo            text,
  lote              text,
  costo_unitario    numeric(10,2) check (costo_unitario is null or costo_unitario >= 0),
  autoriza_negativo boolean not null default false,
  creado_por        uuid not null default auth.uid(),
  creado_en         timestamptz not null default now(),
  foreign key (variante_id, optica_id) references public.lunas_variantes (id, optica_id),
  foreign key (operacion_id, optica_id) references public.inventario_operaciones (id, optica_id),
  foreign key (orden_id, optica_id) references public.ordenes (id, optica_id),
  check ((tipo in ('compra', 'devolucion') and cantidad > 0)
      or (tipo in ('venta', 'consumo', 'perdida') and cantidad < 0)
      or  tipo = 'ajuste'),
  check (tipo not in ('ajuste', 'perdida') or length(trim(coalesce(motivo, ''))) > 0)
);
comment on table public.inventario_movimientos is 'Registro inmutable de entradas (+) y salidas (−) en lunas sueltas.';
create index inventario_movimientos_por_variante on public.inventario_movimientos (variante_id, id desc);
create index inventario_movimientos_por_optica on public.inventario_movimientos (optica_id, creado_en desc);

create table public.inventario_reservas (
  id          uuid primary key default gen_random_uuid(),
  optica_id   uuid not null references public.opticas(id),
  variante_id uuid not null,
  orden_id    uuid not null,
  ojo         public.ojo not null,
  cantidad    integer not null default 1 check (cantidad > 0),
  estado      text not null default 'activa' check (estado in ('activa', 'consumida', 'liberada')),
  creado_por  uuid not null default auth.uid(),
  creado_en   timestamptz not null default now(),
  cerrada_en  timestamptz,
  foreign key (variante_id, optica_id) references public.lunas_variantes (id, optica_id),
  foreign key (orden_id, optica_id) references public.ordenes (id, optica_id)
);
-- Una sola reserva vigente (activa o ya consumida) por orden y ojo.
create unique index inventario_reservas_vigente on public.inventario_reservas (orden_id, ojo) where estado <> 'liberada';

alter table public.inventario_movimientos
  add constraint inventario_movimientos_reserva_fkey foreign key (reserva_id) references public.inventario_reservas (id);

-- 2 ----------------------------------------------------------------------------
-- Reglas de las variantes: coherencia con el producto y stock inicial en cero.
create function public.f_variante_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.lunas_productos;
begin
  select * into p from public.lunas_productos where id = new.producto_id;
  if p.vision = 'monofocal' and new.adicion is not null then
    raise exception 'Un producto monofocal no lleva adición';
  end if;
  if p.vision <> 'monofocal' and new.adicion is null then
    raise exception 'Un producto % requiere la adición', p.vision;
  end if;
  if p.por_lado and new.lado is null then
    raise exception 'Este producto distingue OD y OI: indica el lado';
  end if;
  if not p.por_lado and new.lado is not null then
    raise exception 'Este producto no distingue lado: deja el lado vacío';
  end if;

  if tg_op = 'INSERT' then
    new.stock := 0;
    new.reservado := 0;
    if coalesce(new.stock_minimo, 0) = 0 then new.stock_minimo := p.stock_minimo_defecto; end if;
  elsif (new.producto_id, new.esfera, new.cilindro, new.eje, new.adicion, new.lado)
        is distinct from (old.producto_id, old.esfera, old.cilindro, old.eje, old.adicion, old.lado) then
    raise exception 'La medida de una variante no cambia: registra otra variante';
  end if;
  return new;
end $$;
create trigger t_variante_controlar before insert or update on public.lunas_variantes
  for each row execute function public.f_variante_controlar();

-- Aplica un movimiento: bloquea la variante, valida y actualiza su stock.
-- Es la única forma en que cambia lunas_variantes.stock.
create function public.f_movimiento_aplicar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v public.lunas_variantes;
  v_nuevo integer;
  v_jefe boolean;
begin
  new.creado_por := coalesce(auth.uid(), new.creado_por);
  new.creado_en := now();

  select * into v from public.lunas_variantes where id = new.variante_id for update;
  if v.id is null or v.optica_id <> new.optica_id then
    raise exception 'La variante no existe en esta óptica';
  end if;

  -- Sin usuario (procesos internos) o movimiento ligado a una reserva (solo lo crean los triggers de
  -- órdenes: reserva_id no es escribible desde la API) cuentan como autorizados.
  v_jefe := auth.uid() is null or new.reserva_id is not null
            or public.tiene_rol(new.optica_id, array['propietario', 'administrador']::public.rol_miembro[]);
  if new.tipo = 'ajuste' and not v_jefe then
    raise exception 'Solo propietario o administrador registran ajustes de inventario' using errcode = '42501';
  end if;
  if new.autoriza_negativo and not v_jefe then
    raise exception 'Solo propietario o administrador autorizan stock negativo' using errcode = '42501';
  end if;

  v_nuevo := v.stock + new.cantidad;
  -- Las salidas no pueden dejar sin respaldo las lunas reservadas para órdenes.
  if new.cantidad < 0 and v_nuevo < v.reservado and not new.autoriza_negativo then
    if v.reservado > 0 then
      raise exception 'Stock insuficiente: hay % disponibles (% reservadas para órdenes)', greatest(v.stock - v.reservado, 0), v.reservado;
    end if;
    raise exception 'Stock insuficiente: hay % disponibles', greatest(v.stock, 0);
  end if;

  new.stock_anterior := v.stock;
  new.stock_resultante := v_nuevo;
  update public.lunas_variantes set stock = v_nuevo where id = v.id;
  return new;
end $$;
create trigger t_movimiento_aplicar before insert on public.inventario_movimientos
  for each row execute function public.f_movimiento_aplicar();

-- Registro inmutable
create trigger t_sin_update before update on public.inventario_movimientos for each row execute function public.f_solo_insertar();
create trigger t_sin_update before update on public.inventario_operaciones for each row execute function public.f_solo_insertar();
do $$
declare t text;
begin
  foreach t in array array['lunas_productos', 'lunas_variantes', 'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas'] loop
    execute format('create trigger t_sin_delete before delete on public.%I for each row execute function public.f_bloquear_delete()', t);
  end loop;
  foreach t in array array['lunas_productos', 'lunas_variantes'] loop
    execute format('create trigger t_actualizado before update on public.%I for each row execute function public.f_actualizado()', t);
  end loop;
end $$;
create trigger t_autor before insert on public.inventario_operaciones for each row execute function public.f_fijar_autor();
create trigger t_auditar after insert or update on public.lunas_productos for each row execute function public.f_auditar();

-- 3 ----------------------------------------------------------------------------
-- Compra de muchas medidas en una sola operación atómica. Crea las variantes que falten.
-- p_lineas: [{producto_id, esfera, cilindro, eje, adicion, lado, cantidad, costo_unitario, lote}]
create function public.registrar_compra(
  p_optica uuid, p_proveedor text, p_documento text, p_fecha date, p_notas text, p_lineas jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion uuid;
  l jsonb;
  v_variante uuid;
  v_cantidad integer;
begin
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La compra no tiene líneas';
  end if;
  if jsonb_array_length(p_lineas) > 2000 then
    raise exception 'Máximo 2000 medidas por compra';
  end if;

  insert into public.inventario_operaciones (optica_id, tipo, proveedor, documento, fecha, notas)
  values (p_optica, 'compra', nullif(trim(p_proveedor), ''), nullif(trim(p_documento), ''), coalesce(p_fecha, current_date), nullif(trim(p_notas), ''))
  returning id into v_operacion;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (l ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada línea de compra necesita una cantidad mayor que cero';
    end if;

    insert into public.lunas_variantes (optica_id, producto_id, esfera, cilindro, eje, adicion, lado)
    values (p_optica, (l ->> 'producto_id')::uuid, (l ->> 'esfera')::numeric, coalesce((l ->> 'cilindro')::numeric, 0),
            (l ->> 'eje')::smallint, (l ->> 'adicion')::numeric, (l ->> 'lado')::public.ojo)
    on conflict on constraint lunas_variantes_medida_unica do nothing;

    select id into v_variante from public.lunas_variantes
     where producto_id = (l ->> 'producto_id')::uuid
       and esfera = (l ->> 'esfera')::numeric
       and cilindro = coalesce((l ->> 'cilindro')::numeric, 0)
       and eje is not distinct from (l ->> 'eje')::smallint
       and adicion is not distinct from (l ->> 'adicion')::numeric
       and lado is not distinct from (l ->> 'lado')::public.ojo;

    insert into public.inventario_movimientos (optica_id, variante_id, operacion_id, tipo, cantidad, costo_unitario, lote)
    values (p_optica, v_variante, v_operacion, 'compra', v_cantidad,
            nullif(l ->> 'costo_unitario', '')::numeric, nullif(trim(l ->> 'lote'), ''));
  end loop;

  return v_operacion;
end $$;

-- Inventario físico: registra lo contado y genera un ajuste por cada diferencia.
-- p_lineas: [{variante_id, contado}]. Solo propietario o administrador.
create function public.registrar_conteo(p_optica uuid, p_notas text, p_lineas jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion uuid;
  l jsonb;
  v_actual integer;
  v_contado integer;
begin
  if not public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'Solo propietario o administrador registran inventarios físicos' using errcode = '42501';
  end if;
  insert into public.inventario_operaciones (optica_id, tipo, notas)
  values (p_optica, 'conteo', nullif(trim(p_notas), '')) returning id into v_operacion;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_contado := (l ->> 'contado')::integer;
    if v_contado is null or v_contado < 0 then
      raise exception 'Las cantidades contadas deben ser cero o más';
    end if;
    select stock into v_actual from public.lunas_variantes
     where id = (l ->> 'variante_id')::uuid and optica_id = p_optica;
    if v_actual is null then
      raise exception 'Variante no encontrada';
    end if;
    if v_contado <> v_actual then
      -- Lo contado es la realidad física: se registra aunque deje reservas sin respaldo.
      insert into public.inventario_movimientos (optica_id, variante_id, operacion_id, tipo, cantidad, motivo, autoriza_negativo)
      values (p_optica, (l ->> 'variante_id')::uuid, v_operacion, 'ajuste', v_contado - v_actual,
              'Inventario físico' || coalesce(': ' || nullif(trim(p_notas), ''), ''), true);
    end if;
  end loop;
  return v_operacion;
end $$;

-- 4 ----------------------------------------------------------------------------
-- Reservas de órdenes (solo en venta iniciada). Reemplaza la reserva vigente del ojo.
create function public.reservar_luna(p_orden uuid, p_ojo public.ojo, p_variante uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.ordenes;
  v public.lunas_variantes;
  v_reserva uuid;
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null or not public.es_miembro(o.optica_id) then
    raise exception 'La orden no existe';
  end if;
  if o.estado <> 'borrador' then
    raise exception 'Solo se asigna stock a órdenes en venta iniciada';
  end if;
  select * into v from public.lunas_variantes where id = p_variante and optica_id = o.optica_id for update;
  if v.id is null or not v.activo then
    raise exception 'La medida no existe o está inactiva';
  end if;
  if v.lado is not null and v.lado <> p_ojo then
    raise exception 'Esa luna es para el ojo %', v.lado;
  end if;

  perform public.liberar_luna(p_orden, p_ojo);
  select * into v from public.lunas_variantes where id = p_variante for update;  -- tras liberar
  if v.stock - v.reservado < 1 then
    raise exception 'Sin stock disponible de esa medida (stock %, reservadas %)', v.stock, v.reservado;
  end if;

  insert into public.inventario_reservas (optica_id, variante_id, orden_id, ojo, creado_por)
  values (o.optica_id, p_variante, p_orden, p_ojo, coalesce(auth.uid(), o.creado_por))
  returning id into v_reserva;
  update public.lunas_variantes set reservado = reservado + 1 where id = p_variante;
  return v_reserva;
end $$;

-- Libera la reserva activa de un ojo (si existe). Solo en venta iniciada.
create function public.liberar_luna(p_orden uuid, p_ojo public.ojo) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.ordenes;
  r public.inventario_reservas;
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null or not public.es_miembro(o.optica_id) then
    raise exception 'La orden no existe';
  end if;
  if o.estado <> 'borrador' then
    raise exception 'Solo se cambia el stock asignado en venta iniciada';
  end if;
  select * into r from public.inventario_reservas where orden_id = p_orden and ojo = p_ojo and estado = 'activa' for update;
  if r.id is not null then
    update public.inventario_reservas set estado = 'liberada', cerrada_en = now() where id = r.id;
    update public.lunas_variantes set reservado = reservado - r.cantidad where id = r.variante_id;
  end if;
end $$;

-- Movimientos automáticos según el estado de la orden.
create function public.f_orden_inventario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.inventario_reservas;
begin
  if new.estado is not distinct from old.estado then
    return null;
  end if;

  -- Sale de venta iniciada hacia el laboratorio: se descuenta lo reservado.
  if old.estado = 'borrador' and new.estado <> 'anulada' then
    for r in select * from public.inventario_reservas where orden_id = new.id and estado = 'activa' for update loop
      update public.lunas_variantes set reservado = reservado - r.cantidad where id = r.variante_id;
      update public.inventario_reservas set estado = 'consumida', cerrada_en = now() where id = r.id;
      insert into public.inventario_movimientos (optica_id, variante_id, orden_id, reserva_id, tipo, cantidad, motivo, autoriza_negativo)
      values (new.optica_id, r.variante_id, new.id, r.id, 'consumo', -r.cantidad,
              'Orden enviada al laboratorio', true);
    end loop;

  -- Vuelve a venta iniciada: se repone el stock con una devolución y la reserva vuelve a estar activa.
  elsif new.estado = 'borrador' then
    for r in select * from public.inventario_reservas where orden_id = new.id and estado = 'consumida' for update loop
      insert into public.inventario_movimientos (optica_id, variante_id, orden_id, reserva_id, tipo, cantidad, motivo)
      values (new.optica_id, r.variante_id, new.id, r.id, 'devolucion', r.cantidad, 'Orden devuelta a venta iniciada');
      update public.inventario_reservas set estado = 'activa', cerrada_en = null where id = r.id;
      update public.lunas_variantes set reservado = reservado + r.cantidad where id = r.variante_id;
    end loop;

  -- Anulada en venta iniciada: se libera lo reservado (las lunas no salieron).
  elsif new.estado = 'anulada' and old.estado = 'borrador' then
    for r in select * from public.inventario_reservas where orden_id = new.id and estado = 'activa' for update loop
      update public.inventario_reservas set estado = 'liberada', cerrada_en = now() where id = r.id;
      update public.lunas_variantes set reservado = reservado - r.cantidad where id = r.variante_id;
    end loop;
  end if;
  -- Anulada después de enviarse: las lunas ya salieron (pueden estar cortadas). Si vuelven,
  -- se registra una devolución manual.
  return null;
end $$;
create trigger t_orden_inventario after update of estado on public.ordenes
  for each row execute function public.f_orden_inventario();

-- 5 ----------------------------------------------------------------------------
alter table public.lunas_productos        enable row level security;
alter table public.lunas_variantes        enable row level security;
alter table public.inventario_operaciones enable row level security;
alter table public.inventario_movimientos enable row level security;
alter table public.inventario_reservas    enable row level security;

revoke all on public.lunas_productos, public.lunas_variantes, public.inventario_operaciones,
              public.inventario_movimientos, public.inventario_reservas from anon, authenticated;
revoke all on sequence public.inventario_movimientos_id_seq from anon, authenticated;

grant select, insert, update on public.lunas_productos to authenticated;
grant select on public.lunas_variantes to authenticated;
grant insert (optica_id, producto_id, esfera, cilindro, eje, adicion, lado, stock_minimo, ubicacion) on public.lunas_variantes to authenticated;
grant update (stock_minimo, ubicacion, activo) on public.lunas_variantes to authenticated;
grant select, insert on public.inventario_operaciones to authenticated;
grant select on public.inventario_movimientos to authenticated;
grant insert (optica_id, variante_id, operacion_id, tipo, cantidad, motivo, lote, costo_unitario, autoriza_negativo)
  on public.inventario_movimientos to authenticated;
grant select on public.inventario_reservas to authenticated;

create policy productos_select on public.lunas_productos for select to authenticated using (public.es_miembro(optica_id));
create policy productos_insert on public.lunas_productos for insert to authenticated with check (public.es_miembro(optica_id));
create policy productos_update on public.lunas_productos for update to authenticated
  using (public.es_miembro(optica_id)) with check (public.es_miembro(optica_id));

create policy variantes_select on public.lunas_variantes for select to authenticated using (public.es_miembro(optica_id));
create policy variantes_insert on public.lunas_variantes for insert to authenticated with check (public.es_miembro(optica_id));
create policy variantes_update on public.lunas_variantes for update to authenticated
  using (public.es_miembro(optica_id)) with check (public.es_miembro(optica_id));

create policy operaciones_select on public.inventario_operaciones for select to authenticated using (public.es_miembro(optica_id));
create policy operaciones_insert on public.inventario_operaciones for insert to authenticated
  with check (public.es_miembro(optica_id)
              and (tipo in ('compra', 'salida')
                   or public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[])));

create policy movimientos_select on public.inventario_movimientos for select to authenticated using (public.es_miembro(optica_id));
create policy movimientos_insert on public.inventario_movimientos for insert to authenticated with check (public.es_miembro(optica_id));

create policy reservas_select on public.inventario_reservas for select to authenticated using (public.es_miembro(optica_id));

revoke execute on function public.f_variante_controlar(), public.f_movimiento_aplicar(), public.f_orden_inventario()
  from public, anon, authenticated;
revoke execute on function public.registrar_compra(uuid, text, text, date, text, jsonb),
                           public.registrar_conteo(uuid, text, jsonb),
                           public.reservar_luna(uuid, public.ojo, uuid),
                           public.liberar_luna(uuid, public.ojo) from public, anon;
grant execute on function public.registrar_compra(uuid, text, text, date, text, jsonb),
                          public.registrar_conteo(uuid, text, jsonb),
                          public.reservar_luna(uuid, public.ojo, uuid),
                          public.liberar_luna(uuid, public.ojo) to authenticated;

-- 6 ----------------------------------------------------------------------------
-- Existencias con disponible y estado calculados (para buscar, filtrar y exportar).
-- security_invoker: respeta el RLS de quien consulta.
create view public.lunas_existencias with (security_invoker = true) as
select v.id, v.optica_id, v.producto_id,
       p.nombre as producto, p.tipo, p.material, p.indice, p.tratamiento, p.color_tratamiento,
       p.vision, p.superficie, p.proveedor, p.por_lado,
       v.esfera, v.cilindro, v.eje, v.adicion, v.lado,
       v.stock, v.reservado, v.stock - v.reservado as disponible, v.stock_minimo, v.ubicacion,
       v.activo and p.activo as activo,
       case when v.stock - v.reservado <= 0 then 'agotado'
            when v.stock_minimo > 0 and v.stock - v.reservado <= v.stock_minimo then 'bajo'
            else 'ok' end as estado_stock,
       v.actualizado_en
from public.lunas_variantes v
join public.lunas_productos p on p.id = v.producto_id;
comment on view public.lunas_existencias is 'Existencias por medida exacta. estado_stock: agotado (disponible <= 0), bajo (<= mínimo), ok.';
revoke all on public.lunas_existencias from anon, authenticated;
grant select on public.lunas_existencias to authenticated;

-- 7 ----------------------------------------------------------------------------
-- Con medidas registradas, visión y lado del producto no cambian (cambiarían el sentido del stock).
create function public.f_producto_estructura() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.vision is distinct from old.vision or new.por_lado is distinct from old.por_lado)
     and exists (select 1 from public.lunas_variantes v where v.producto_id = old.id) then
    raise exception 'El producto ya tiene medidas registradas: no se puede cambiar la visión ni el control por lado';
  end if;
  if new.optica_id <> old.optica_id then
    raise exception 'La óptica de un producto no cambia';
  end if;
  return new;
end $$;
create trigger t_producto_estructura before update on public.lunas_productos
  for each row execute function public.f_producto_estructura();
revoke execute on function public.f_producto_estructura() from public, anon, authenticated;
