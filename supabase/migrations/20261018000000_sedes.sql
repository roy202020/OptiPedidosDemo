-- OptiPedidos · Migración 0010 · Varias sedes por óptica
-- Sin pérdida de datos: tablas nuevas, columnas nuevas rellenadas y funciones reemplazadas.
--
-- Jerarquía: óptica (empresa) → sedes → usuarios.
--   * Pacientes, recetas, laboratorios y catálogo de lunas son de TODA la óptica.
--   * Pedidos, stock de lunas, caja (pagos), metas y avisos pertenecen a UNA sede.
--   * El lente se recoge siempre en la sede donde se vendió: el aviso por WhatsApp sale del
--     número de esa sede (o del número global si la sede no tiene uno).
--   * Acceso (tiene_sede): el propietario ve todas las sedes de su óptica; administradores y
--     vendedores (rol operador) solo las que tienen asignadas en miembro_sedes.
--   * Solo el propietario crea sedes, las activa o desactiva y asigna usuarios. El administrador
--     edita los datos de contacto de sus sedes. Las sedes no se borran: se desactivan.
--   * Datos existentes: cada óptica recibe una "Sede principal" con todos sus registros y miembros.
--   * Si el usuario tiene una sola sede, la base la usa cuando no se indica (la app siempre la envía).

-- 1 ----------------------------------------------------------------------------
create table public.sedes (
  id                       uuid primary key default gen_random_uuid(),
  optica_id                uuid not null references public.opticas(id),
  nombre                   text not null check (length(trim(nombre)) between 1 and 80),
  direccion                text,
  telefono                 text,
  whatsapp_phone_number_id text check (whatsapp_phone_number_id is null or whatsapp_phone_number_id ~ '^[0-9]{5,30}$'),
  activa                   boolean not null default true,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  unique (id, optica_id)
);
comment on table public.sedes is 'Local de atención de una óptica. No se borra: se desactiva.';
comment on column public.sedes.whatsapp_phone_number_id is 'Id del número de WhatsApp Business (Meta) desde el que se avisa a los pacientes de esta sede.';
create unique index sedes_nombre_unico on public.sedes (optica_id, lower(trim(nombre)));

create table public.miembro_sedes (
  optica_id  uuid not null,
  usuario_id uuid not null,
  sede_id    uuid not null,
  creado_por uuid default auth.uid(),
  creado_en  timestamptz not null default now(),
  primary key (usuario_id, sede_id),
  foreign key (optica_id, usuario_id) references public.miembros (optica_id, usuario_id),
  foreign key (sede_id, optica_id) references public.sedes (id, optica_id)
);
comment on table public.miembro_sedes is 'Sedes asignadas a cada miembro. El propietario no las necesita: ve todas.';
create index miembro_sedes_por_sede on public.miembro_sedes (sede_id);

-- 2 ----------------------------------------------------------------------------
-- Columnas nuevas (se rellenan en el paso 4 y luego pasan a obligatorias).
alter table public.ordenes                add column sede_id uuid;
alter table public.orden_pagos            add column sede_id uuid;
alter table public.notificaciones         add column sede_id uuid;
alter table public.metas_ventas           add column sede_id uuid;
alter table public.lunas_variantes        add column sede_id uuid;
alter table public.inventario_operaciones add column sede_id uuid;
alter table public.inventario_movimientos add column sede_id uuid;
alter table public.inventario_reservas    add column sede_id uuid;
alter table public.auditoria              add column sede_id uuid;

-- 3 ----------------------------------------------------------------------------
-- ¿El usuario actual puede ver y registrar datos de esta sede?
create function public.tiene_sede(p_sede uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.sedes s
    join public.miembros m on m.optica_id = s.optica_id and m.usuario_id = auth.uid() and m.activo
    where s.id = p_sede
      and (m.rol = 'propietario'
           or exists (select 1 from public.miembro_sedes ms where ms.sede_id = s.id and ms.usuario_id = auth.uid()))
  );
$$;

-- ¿Puede ver el pedido? (para las tablas hijas del pedido, que no tienen sede propia)
create function public.tiene_sede_orden(p_orden uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.tiene_sede(o.sede_id) from public.ordenes o where o.id = p_orden), false);
$$;

-- Sede que se usa cuando no se indica: la única sede activa a la que el usuario tiene acceso
-- (o la única de la óptica en procesos internos sin usuario). Null si hay varias o ninguna.
create function public.sede_por_defecto(p_optica uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(s.id))[1] end
  from public.sedes s
  where s.optica_id = p_optica and s.activa and (auth.uid() is null or public.tiene_sede(s.id));
$$;

revoke execute on function public.tiene_sede(uuid), public.tiene_sede_orden(uuid), public.sede_por_defecto(uuid) from public, anon;
grant execute on function public.tiene_sede(uuid), public.tiene_sede_orden(uuid), public.sede_por_defecto(uuid) to authenticated;

-- 4 ----------------------------------------------------------------------------
-- Relleno: una "Sede principal" por óptica (con el teléfono y la dirección de la óptica),
-- todos los miembros asignados a ella y todos los registros movidos a ella.
-- Se desactivan los triggers de usuario (inmutabilidad, auditoría, fechas) solo durante el relleno.
insert into public.sedes (optica_id, nombre, direccion, telefono)
select o.id, 'Sede principal', o.direccion, o.telefono from public.opticas o;

insert into public.miembro_sedes (optica_id, usuario_id, sede_id, creado_por)
select m.optica_id, m.usuario_id, s.id, null
from public.miembros m join public.sedes s on s.optica_id = m.optica_id;

do $$
declare t text;
begin
  foreach t in array array['ordenes', 'orden_pagos', 'notificaciones', 'metas_ventas', 'lunas_variantes',
                           'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas', 'auditoria'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set sede_id = s.id from public.sedes s where s.optica_id = x.optica_id and x.sede_id is null', t);
    execute format('alter table public.%I enable trigger user', t);
  end loop;
end $$;

-- En la auditoría solo llevan sede las filas de tablas de sede y las hijas del pedido.
alter table public.auditoria disable trigger user;
update public.auditoria set sede_id = null
 where tabla not in ('ordenes', 'orden_ojos', 'orden_observaciones', 'orden_pagos', 'notificaciones', 'metas_ventas',
                     'lunas_variantes', 'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas');
alter table public.auditoria enable trigger user;

-- Comprobación: ningún registro queda sin sede (si falla, la migración entera se revierte).
do $$
declare t text; n bigint;
begin
  foreach t in array array['ordenes', 'orden_pagos', 'notificaciones', 'metas_ventas', 'lunas_variantes',
                           'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas'] loop
    execute format('select count(*) from public.%I where sede_id is null', t) into n;
    if n > 0 then
      raise exception 'Relleno incompleto: % filas de % sin sede', n, t;
    end if;
  end loop;
  if exists (select 1 from public.opticas o where not exists (select 1 from public.sedes s where s.optica_id = o.id)) then
    raise exception 'Relleno incompleto: hay ópticas sin sede';
  end if;
end $$;

-- 5 ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ordenes', 'orden_pagos', 'notificaciones', 'metas_ventas', 'lunas_variantes',
                           'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas'] loop
    execute format('alter table public.%I alter column sede_id set not null', t);
    execute format('alter table public.%I add constraint %I foreign key (sede_id, optica_id) references public.sedes (id, optica_id)',
                   t, t || '_sede_fkey');
  end loop;
end $$;

create index ordenes_por_sede on public.ordenes (sede_id, estado, creado_en desc);
create index orden_pagos_por_sede on public.orden_pagos (sede_id, fecha);
create index lunas_variantes_por_sede on public.lunas_variantes (sede_id, esfera, cilindro);
create index inventario_movimientos_por_sede on public.inventario_movimientos (sede_id, creado_en desc);
create index notificaciones_por_sede on public.notificaciones (sede_id, estado);

-- Cada sede tiene su propio stock: la medida exacta es única por sede.
alter table public.lunas_variantes drop constraint lunas_variantes_medida_unica;
alter table public.lunas_variantes add constraint lunas_variantes_medida_unica
  unique nulls not distinct (sede_id, producto_id, esfera, cilindro, eje, adicion, lado);

-- Una meta por sede y mes.
alter table public.metas_ventas drop constraint metas_ventas_optica_id_periodo_key;
alter table public.metas_ventas add constraint metas_ventas_sede_periodo_key unique (sede_id, periodo);

-- 6 ----------------------------------------------------------------------------
-- Registros que se crean en una sede elegida (pedidos, stock, operaciones, metas).
-- Completa la sede si falta, valida que el usuario tenga acceso y que la sede esté activa.
-- La sede de un registro no cambia nunca.
create function public.f_sede_asignar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.sede_id is distinct from old.sede_id then
      raise exception 'La sede de un registro no cambia';
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.es_miembro(new.optica_id) then
    raise exception 'No perteneces a esta óptica' using errcode = '42501';
  end if;
  if new.sede_id is null then
    new.sede_id := public.sede_por_defecto(new.optica_id);
    if new.sede_id is null then
      raise exception 'Indica la sede';
    end if;
  end if;
  if auth.uid() is not null and not public.tiene_sede(new.sede_id) then
    raise exception 'No tienes acceso a esa sede' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sedes s where s.id = new.sede_id and s.optica_id = new.optica_id and s.activa) then
    raise exception 'La sede no existe o está desactivada';
  end if;
  return new;
end $$;

-- Registros que dependen de otro (pagos, avisos y reservas del pedido; movimientos de la medida):
-- la sede se toma siempre del registro de origen, nunca del cliente.
create function public.f_sede_heredar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sede uuid;
begin
  if tg_op = 'UPDATE' then
    if new.sede_id is distinct from old.sede_id then
      raise exception 'La sede de un registro no cambia';
    end if;
    return new;
  end if;

  if auth.uid() is not null and not public.es_miembro(new.optica_id) then
    raise exception 'No tienes permiso en esta óptica' using errcode = '42501';
  end if;

  if tg_table_name = 'inventario_movimientos' then
    select v.sede_id into v_sede from public.lunas_variantes v where v.id = new.variante_id and v.optica_id = new.optica_id;
    if v_sede is null then
      raise exception 'La variante no existe en esta óptica';
    end if;
    if new.operacion_id is not null
       and exists (select 1 from public.inventario_operaciones op where op.id = new.operacion_id and op.sede_id <> v_sede) then
      raise exception 'La medida y la operación son de sedes distintas';
    end if;
  else
    select o.sede_id into v_sede from public.ordenes o where o.id = new.orden_id and o.optica_id = new.optica_id;
    if v_sede is null then
      raise exception 'La orden no existe';
    end if;
  end if;

  if auth.uid() is not null and not public.tiene_sede(v_sede) then
    raise exception 'No tienes acceso a esa sede' using errcode = '42501';
  end if;
  new.sede_id := v_sede;
  return new;
end $$;

-- "t_0_" para que se ejecuten antes que los demás triggers BEFORE (orden alfabético).
create trigger t_0_sede before insert or update on public.ordenes                for each row execute function public.f_sede_asignar();
create trigger t_0_sede before insert or update on public.lunas_variantes        for each row execute function public.f_sede_asignar();
create trigger t_0_sede before insert             on public.inventario_operaciones for each row execute function public.f_sede_asignar();
create trigger t_0_sede before insert or update on public.metas_ventas           for each row execute function public.f_sede_asignar();
create trigger t_0_sede before insert or update on public.orden_pagos            for each row execute function public.f_sede_heredar();
create trigger t_0_sede before insert or update on public.notificaciones         for each row execute function public.f_sede_heredar();
create trigger t_0_sede before insert or update on public.inventario_reservas    for each row execute function public.f_sede_heredar();
create trigger t_0_sede before insert             on public.inventario_movimientos for each row execute function public.f_sede_heredar();

-- Sedes: optica fija, solo el propietario activa o desactiva, siempre queda una sede activa.
create function public.f_sede_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.optica_id <> old.optica_id then
    raise exception 'La óptica de una sede no cambia';
  end if;
  if new.activa is distinct from old.activa then
    if auth.uid() is not null and not public.tiene_rol(old.optica_id, array['propietario']::public.rol_miembro[]) then
      raise exception 'Solo el propietario activa o desactiva sedes' using errcode = '42501';
    end if;
    if not new.activa and not exists (select 1 from public.sedes s where s.optica_id = old.optica_id and s.activa and s.id <> old.id) then
      raise exception 'La óptica debe conservar al menos una sede activa';
    end if;
  end if;
  return new;
end $$;
create trigger t_sede_controlar before update on public.sedes for each row execute function public.f_sede_controlar();
create trigger t_actualizado before update on public.sedes for each row execute function public.f_actualizado();
create trigger t_sin_delete before delete on public.sedes for each row execute function public.f_bloquear_delete();
create trigger t_auditar after insert or update or delete on public.sedes for each row execute function public.f_auditar();
create trigger t_auditar after insert or delete on public.miembro_sedes for each row execute function public.f_auditar();
create trigger t_autor before insert on public.miembro_sedes for each row execute function public.f_fijar_autor();

-- Toda óptica nueva nace con su "Sede principal".
create function public.f_optica_sede_principal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sedes (optica_id, nombre, direccion, telefono) values (new.id, 'Sede principal', new.direccion, new.telefono);
  return null;
end $$;
create trigger t_sede_principal after insert on public.opticas for each row execute function public.f_optica_sede_principal();

-- Un miembro nuevo de una óptica con una sola sede activa queda asignado a ella.
create function public.f_miembro_sede_unica() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sede uuid;
begin
  select case when count(*) = 1 then (array_agg(s.id))[1] end into v_sede
  from public.sedes s where s.optica_id = new.optica_id and s.activa;
  if v_sede is not null then
    insert into public.miembro_sedes (optica_id, usuario_id, sede_id) values (new.optica_id, new.usuario_id, v_sede)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger t_sede_unica after insert on public.miembros for each row execute function public.f_miembro_sede_unica();

-- La auditoría guarda la sede (propia o la del pedido) para filtrar lo que ve cada administrador.
create or replace function public.f_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_fila jsonb;
  v_sede uuid;
begin
  v_fila := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_sede := case when tg_table_name = 'sedes' then (v_fila ->> 'id')::uuid else (v_fila ->> 'sede_id')::uuid end;
  if v_sede is null and v_fila ? 'orden_id' then
    select o.sede_id into v_sede from public.ordenes o where o.id = (v_fila ->> 'orden_id')::uuid;
  end if;
  insert into public.auditoria (optica_id, tabla, registro_id, accion, antes, despues, usuario_id, sede_id)
  values (
    (v_fila ->> 'optica_id')::uuid, tg_table_name,
    coalesce(v_fila ->> 'id', v_fila ->> 'usuario_id'), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid(), v_sede
  );
  return null;
end $$;

revoke execute on function public.f_sede_asignar(), public.f_sede_heredar(), public.f_sede_controlar(),
                           public.f_optica_sede_principal(), public.f_miembro_sede_unica()
  from public, anon, authenticated;

-- 7 ----------------------------------------------------------------------------
-- RLS por sede. La separación entre ópticas (es_miembro) se conserva en todas las políticas.
alter table public.sedes         enable row level security;
alter table public.miembro_sedes enable row level security;
revoke all on public.sedes, public.miembro_sedes from anon, authenticated;
grant select on public.sedes to authenticated;
grant insert (optica_id, nombre, direccion, telefono, whatsapp_phone_number_id) on public.sedes to authenticated;
grant update (nombre, direccion, telefono, whatsapp_phone_number_id, activa) on public.sedes to authenticated;
grant select, delete on public.miembro_sedes to authenticated;
grant insert (optica_id, usuario_id, sede_id) on public.miembro_sedes to authenticated;

create policy sedes_select on public.sedes for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(id));
create policy sedes_insert on public.sedes for insert to authenticated
  with check (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));
create policy sedes_update on public.sedes for update to authenticated
  using (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[])
         or (public.tiene_rol(optica_id, array['administrador']::public.rol_miembro[]) and public.tiene_sede(id)))
  with check (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[])
              or (public.tiene_rol(optica_id, array['administrador']::public.rol_miembro[]) and public.tiene_sede(id)));

create policy miembro_sedes_select on public.miembro_sedes for select to authenticated
  using (public.es_miembro(optica_id)
         and (usuario_id = auth.uid()
              or public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[])
              or (public.tiene_rol(optica_id, array['administrador']::public.rol_miembro[]) and public.tiene_sede(sede_id))));
create policy miembro_sedes_insert on public.miembro_sedes for insert to authenticated
  with check (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));
create policy miembro_sedes_delete on public.miembro_sedes for delete to authenticated
  using (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));

-- Pedidos y sus tablas hijas
drop policy ordenes_select on public.ordenes;
drop policy ordenes_insert on public.ordenes;
drop policy ordenes_update on public.ordenes;
create policy ordenes_select on public.ordenes for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy ordenes_insert on public.ordenes for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy ordenes_update on public.ordenes for update to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id))
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

drop policy orden_ojos_select on public.orden_ojos;
drop policy orden_ojos_insert on public.orden_ojos;
drop policy orden_ojos_update on public.orden_ojos;
create policy orden_ojos_select on public.orden_ojos for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id));
create policy orden_ojos_insert on public.orden_ojos for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id));
create policy orden_ojos_update on public.orden_ojos for update to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id))
  with check (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id));

drop policy obs_select on public.orden_observaciones;
drop policy obs_insert on public.orden_observaciones;
create policy obs_select on public.orden_observaciones for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id));
create policy obs_insert on public.orden_observaciones for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id) and creado_por = auth.uid());

drop policy hist_select on public.orden_historial_estados;
create policy hist_select on public.orden_historial_estados for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede_orden(orden_id));

drop policy notificaciones_select on public.notificaciones;
create policy notificaciones_select on public.notificaciones for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

-- Caja
drop policy pagos_select on public.orden_pagos;
drop policy pagos_insert on public.orden_pagos;
drop policy pagos_update on public.orden_pagos;
create policy pagos_select on public.orden_pagos for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy pagos_insert on public.orden_pagos for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy pagos_update on public.orden_pagos for update to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id))
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

-- Metas: propietario o administrador de esa sede
drop policy metas_select on public.metas_ventas;
drop policy metas_insert on public.metas_ventas;
drop policy metas_update on public.metas_ventas;
create policy metas_select on public.metas_ventas for select to authenticated
  using (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]) and public.tiene_sede(sede_id));
create policy metas_insert on public.metas_ventas for insert to authenticated
  with check (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]) and public.tiene_sede(sede_id));
create policy metas_update on public.metas_ventas for update to authenticated
  using (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]) and public.tiene_sede(sede_id))
  with check (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]) and public.tiene_sede(sede_id));

-- Inventario (el catálogo lunas_productos sigue siendo de toda la óptica)
drop policy variantes_select on public.lunas_variantes;
drop policy variantes_insert on public.lunas_variantes;
drop policy variantes_update on public.lunas_variantes;
create policy variantes_select on public.lunas_variantes for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy variantes_insert on public.lunas_variantes for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy variantes_update on public.lunas_variantes for update to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id))
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
grant insert (sede_id) on public.lunas_variantes to authenticated;

drop policy operaciones_select on public.inventario_operaciones;
drop policy operaciones_insert on public.inventario_operaciones;
create policy operaciones_select on public.inventario_operaciones for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy operaciones_insert on public.inventario_operaciones for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id)
              and (tipo in ('compra', 'salida')
                   or public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[])));

drop policy movimientos_select on public.inventario_movimientos;
drop policy movimientos_insert on public.inventario_movimientos;
create policy movimientos_select on public.inventario_movimientos for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy movimientos_insert on public.inventario_movimientos for insert to authenticated
  with check (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

drop policy reservas_select on public.inventario_reservas;
create policy reservas_select on public.inventario_reservas for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

-- Auditoría: el propietario ve toda la óptica; el administrador, lo general y sus sedes.
drop policy audit_select on public.auditoria;
create policy audit_select on public.auditoria for select to authenticated
  using (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[])
         or (public.tiene_rol(optica_id, array['administrador']::public.rol_miembro[])
             and (sede_id is null or public.tiene_sede(sede_id))));

-- 8 ----------------------------------------------------------------------------
-- crear_orden gana p_sede (opcional si el usuario tiene una sola sede).
drop function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text, numeric, numeric);

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
  p_descuento           numeric default 0,
  p_sede                uuid default null
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

  -- La sede la valida t_0_sede (acceso del usuario y sede activa).
  insert into public.ordenes (optica_id, sede_id, paciente_id, receta_id, laboratorio_id, tipo_trabajo,
                              montura_descripcion, montura_origen, fecha_entrega_prometida, prioridad,
                              precio, descuento)
  values (v_optica, p_sede, p_paciente, p_receta, p_laboratorio, p_tipo_trabajo,
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
revoke execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text, numeric, numeric, uuid) from public, anon;
grant execute on function public.crear_orden(uuid, uuid, uuid, text, text, text, date, text, jsonb, text, numeric, numeric, uuid) to authenticated;

-- Compras y conteos en una sede.
drop function public.registrar_compra(uuid, text, text, date, text, jsonb);
create function public.registrar_compra(
  p_optica uuid, p_proveedor text, p_documento text, p_fecha date, p_notas text, p_lineas jsonb, p_sede uuid default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion uuid;
  v_sede uuid;
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

  insert into public.inventario_operaciones (optica_id, sede_id, tipo, proveedor, documento, fecha, notas)
  values (p_optica, p_sede, 'compra', nullif(trim(p_proveedor), ''), nullif(trim(p_documento), ''), coalesce(p_fecha, current_date), nullif(trim(p_notas), ''))
  returning id, sede_id into v_operacion, v_sede;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cantidad := (l ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada línea de compra necesita una cantidad mayor que cero';
    end if;

    insert into public.lunas_variantes (optica_id, sede_id, producto_id, esfera, cilindro, eje, adicion, lado)
    values (p_optica, v_sede, (l ->> 'producto_id')::uuid, (l ->> 'esfera')::numeric, coalesce((l ->> 'cilindro')::numeric, 0),
            (l ->> 'eje')::smallint, (l ->> 'adicion')::numeric, (l ->> 'lado')::public.ojo)
    on conflict on constraint lunas_variantes_medida_unica do nothing;

    select id into v_variante from public.lunas_variantes
     where sede_id = v_sede
       and producto_id = (l ->> 'producto_id')::uuid
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

drop function public.registrar_conteo(uuid, text, jsonb);
create function public.registrar_conteo(p_optica uuid, p_notas text, p_lineas jsonb, p_sede uuid default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_operacion uuid;
  v_sede uuid;
  l jsonb;
  v_actual integer;
  v_contado integer;
begin
  if not public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'Solo propietario o administrador registran inventarios físicos' using errcode = '42501';
  end if;
  insert into public.inventario_operaciones (optica_id, sede_id, tipo, notas)
  values (p_optica, p_sede, 'conteo', nullif(trim(p_notas), '')) returning id, sede_id into v_operacion, v_sede;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_contado := (l ->> 'contado')::integer;
    if v_contado is null or v_contado < 0 then
      raise exception 'Las cantidades contadas deben ser cero o más';
    end if;
    select stock into v_actual from public.lunas_variantes
     where id = (l ->> 'variante_id')::uuid and optica_id = p_optica and sede_id = v_sede;
    if v_actual is null then
      raise exception 'Variante no encontrada en esta sede';
    end if;
    if v_contado <> v_actual then
      insert into public.inventario_movimientos (optica_id, variante_id, operacion_id, tipo, cantidad, motivo, autoriza_negativo)
      values (p_optica, (l ->> 'variante_id')::uuid, v_operacion, 'ajuste', v_contado - v_actual,
              'Inventario físico' || coalesce(': ' || nullif(trim(p_notas), ''), ''), true);
    end if;
  end loop;
  return v_operacion;
end $$;

revoke execute on function public.registrar_compra(uuid, text, text, date, text, jsonb, uuid),
                           public.registrar_conteo(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.registrar_compra(uuid, text, text, date, text, jsonb, uuid),
                          public.registrar_conteo(uuid, text, jsonb, uuid) to authenticated;

-- Reservas: la medida debe estar en el stock de la sede del pedido.
create or replace function public.reservar_luna(p_orden uuid, p_ojo public.ojo, p_variante uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.ordenes;
  v public.lunas_variantes;
  v_reserva uuid;
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null or not public.tiene_sede(o.sede_id) then
    raise exception 'La orden no existe';
  end if;
  if o.estado <> 'borrador' then
    raise exception 'Solo se asigna stock a órdenes en venta iniciada';
  end if;
  select * into v from public.lunas_variantes where id = p_variante and optica_id = o.optica_id for update;
  if v.id is null or not v.activo then
    raise exception 'La medida no existe o está inactiva';
  end if;
  if v.sede_id <> o.sede_id then
    raise exception 'Esa medida es del stock de otra sede';
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

create or replace function public.liberar_luna(p_orden uuid, p_ojo public.ojo) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.ordenes;
  r public.inventario_reservas;
begin
  select * into o from public.ordenes where id = p_orden;
  if o.id is null or not public.tiene_sede(o.sede_id) then
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

-- Avisos: reintento solo con acceso a la sede; la Edge Function recibe el número de la sede.
create or replace function public.reintentar_notificacion(p_id uuid) returns public.estado_notificacion
language plpgsql security definer set search_path = '' as $$
declare
  n public.notificaciones;
  a record;
begin
  select * into n from public.notificaciones where id = p_id for update;
  if n.id is null or not public.tiene_sede(n.sede_id) then
    raise exception 'Aviso no encontrado';
  end if;
  if n.estado not in ('fallida', 'omitida') then
    raise exception 'Solo se reintentan avisos fallidos u omitidos (estado actual: %)', n.estado;
  end if;
  select * into a from public.preparar_aviso(n.paciente_id);
  update public.notificaciones
     set telefono = a.telefono, estado = a.estado, ultimo_error = a.motivo
   where id = p_id;
  return a.estado;
end $$;

create or replace function public.reclamar_notificacion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n public.notificaciones;
begin
  update public.notificaciones
     set estado = 'enviando', intentos = intentos + 1, ultimo_intento_en = now(), ultimo_error = null
   where id = p_id
     and (estado = 'pendiente' or (estado = 'enviando' and ultimo_intento_en < now() - interval '5 minutes'))
  returning * into n;
  if n.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', n.id, 'telefono', n.telefono, 'intentos', n.intentos,
    'paciente', (select p.nombres from public.pacientes p where p.id = n.paciente_id),
    'optica', (select o.nombre from public.opticas o where o.id = n.optica_id),
    'sede', (select s.nombre from public.sedes s where s.id = n.sede_id),
    'phone_number_id', (select s.whatsapp_phone_number_id from public.sedes s where s.id = n.sede_id));
end $$;

-- 9 ----------------------------------------------------------------------------
-- Informes por sede. p_sede null = todas las sedes que el usuario puede ver.
drop function public.ventas_mensuales(uuid, integer);
drop function public.ventas_del_dia(uuid);
drop function public.caja_del_dia(uuid);

-- Permiso común de los informes: propietario o administrador, y acceso a la sede pedida.
create function public.puede_ver_informes(p_optica uuid, p_sede uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[])
     and (p_sede is null
          or (public.tiene_sede(p_sede) and exists (select 1 from public.sedes s where s.id = p_sede and s.optica_id = p_optica)));
$$;
revoke execute on function public.puede_ver_informes(uuid, uuid) from public, anon, authenticated;

create function public.ventas_mensuales(p_optica uuid, p_meses integer default 12, p_sede uuid default null)
returns table (periodo date, ventas numeric, ordenes integer, meta numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver las ventas' using errcode = '42501';
  end if;
  return query
    with sedes_vistas as (
      select s.id from public.sedes s
      where s.optica_id = p_optica and (s.id = p_sede or (p_sede is null and public.tiene_sede(s.id)))
    ), meses as (
      select (date_trunc('month', (now() at time zone 'America/Lima')) - make_interval(months => g))::date as periodo
      from generate_series(0, greatest(1, least(p_meses, 36)) - 1) g
    ), ventas as (
      select date_trunc('month', o.confirmada_en at time zone 'America/Lima')::date as periodo,
             sum(o.precio - o.descuento) as total, count(*)::integer as cantidad
      from public.ordenes o
      where o.optica_id = p_optica and o.sede_id in (select id from sedes_vistas)
        and o.confirmada_en is not null and o.estado <> 'anulada'
      group by 1
    ), metas as (
      select mv.periodo, sum(mv.importe_objetivo) as objetivo
      from public.metas_ventas mv
      where mv.optica_id = p_optica and mv.sede_id in (select id from sedes_vistas)
      group by 1
    )
    select m.periodo, coalesce(v.total, 0), coalesce(v.cantidad, 0), mt.objetivo
    from meses m
    left join ventas v on v.periodo = m.periodo
    left join metas mt on mt.periodo = m.periodo
    order by m.periodo desc;
end $$;

create function public.ventas_del_dia(p_optica uuid, p_sede uuid default null)
returns table (ventas numeric, ordenes integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver las ventas' using errcode = '42501';
  end if;
  return query
    select coalesce(sum(o.precio - o.descuento), 0), count(*)::integer
    from public.ordenes o
    where o.optica_id = p_optica and o.estado <> 'anulada' and o.confirmada_en is not null
      and (o.sede_id = p_sede or (p_sede is null and public.tiene_sede(o.sede_id)))
      and (o.confirmada_en at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date;
end $$;

create function public.caja_del_dia(p_optica uuid, p_sede uuid default null)
returns table (cobrado numeric, pagos integer, por_medio jsonb, saldo_pendiente numeric, ordenes_con_saldo integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver la caja' using errcode = '42501';
  end if;
  return query
    with hoy as (
      select p.medio, sum(p.importe) as total, count(*)::integer as cantidad
      from public.orden_pagos p
      where p.optica_id = p_optica and p.anulado_en is null
        and (p.sede_id = p_sede or (p_sede is null and public.tiene_sede(p.sede_id)))
        and p.fecha = (now() at time zone 'America/Lima')::date
      group by p.medio
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

-- Consolidado del mes para el propietario: una fila por sede (el total lo suma la app).
create function public.reporte_consolidado(p_optica uuid, p_periodo date default null)
returns table (sede_id uuid, sede text, activa boolean, ventas numeric, ordenes integer, meta numeric,
               pedidos_en_curso integer, saldo_pendiente numeric, cobrado numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_mes date := coalesce(date_trunc('month', p_periodo), date_trunc('month', now() at time zone 'America/Lima'))::date;
begin
  if not public.tiene_rol(p_optica, array['propietario']::public.rol_miembro[]) then
    raise exception 'Solo el propietario ve el consolidado de sedes' using errcode = '42501';
  end if;
  return query
    select s.id, s.nombre, s.activa,
      coalesce((select sum(o.precio - o.descuento) from public.ordenes o
                where o.sede_id = s.id and o.estado <> 'anulada' and o.confirmada_en is not null
                  and date_trunc('month', o.confirmada_en at time zone 'America/Lima')::date = v_mes), 0)::numeric(12,2),
      (select count(*) from public.ordenes o
        where o.sede_id = s.id and o.estado <> 'anulada' and o.confirmada_en is not null
          and date_trunc('month', o.confirmada_en at time zone 'America/Lima')::date = v_mes)::integer,
      (select mv.importe_objetivo from public.metas_ventas mv where mv.sede_id = s.id and mv.periodo = v_mes),
      (select count(*) from public.ordenes o where o.sede_id = s.id and o.estado not in ('entregada', 'anulada'))::integer,
      coalesce((select sum(public.saldo(o)) from public.ordenes o where o.sede_id = s.id and o.estado <> 'anulada'), 0)::numeric(12,2),
      coalesce((select sum(p.importe) from public.orden_pagos p
                where p.sede_id = s.id and p.anulado_en is null and date_trunc('month', p.fecha)::date = v_mes), 0)::numeric(12,2)
    from public.sedes s
    where s.optica_id = p_optica
    order by s.activa desc, s.nombre;
end $$;

revoke execute on function public.ventas_mensuales(uuid, integer, uuid), public.ventas_del_dia(uuid, uuid),
                           public.caja_del_dia(uuid, uuid), public.reporte_consolidado(uuid, date) from public, anon;
grant execute on function public.ventas_mensuales(uuid, integer, uuid), public.ventas_del_dia(uuid, uuid),
                          public.caja_del_dia(uuid, uuid), public.reporte_consolidado(uuid, date) to authenticated;

-- 10 ---------------------------------------------------------------------------
-- La vista de existencias expone la sede (nueva columna al final: create or replace lo permite).
create or replace view public.lunas_existencias with (security_invoker = true) as
select v.id, v.optica_id, v.producto_id,
       p.nombre as producto, p.tipo, p.material, p.indice, p.tratamiento, p.color_tratamiento,
       p.vision, p.superficie, p.proveedor, p.por_lado,
       v.esfera, v.cilindro, v.eje, v.adicion, v.lado,
       v.stock, v.reservado, v.stock - v.reservado as disponible, v.stock_minimo, v.ubicacion,
       v.activo and p.activo as activo,
       case when v.stock - v.reservado <= 0 then 'agotado'
            when v.stock_minimo > 0 and v.stock - v.reservado <= v.stock_minimo then 'bajo'
            else 'ok' end as estado_stock,
       v.actualizado_en,
       v.sede_id
from public.lunas_variantes v
join public.lunas_productos p on p.id = v.producto_id;
