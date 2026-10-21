-- OptiPedidos · Migración 0013 · Cuentas con los laboratorios: tickets, pagos y caja de la sede
-- Sin cambios destructivos: una columna nueva en laboratorios, tablas nuevas, funciones, vista y bucket privado.
--
-- Reglas (acordadas con la óptica):
--   * Cada laboratorio tiene días de crédito (0 = contado). El ticket vence en fecha + días de crédito;
--     se calcula al crearlo y luego se puede cambiar por ticket.
--   * Un ticket cubre una o varias órdenes del mismo laboratorio y sede (una orden puede tener más de
--     un ticket: reprocesos). Si la suma de las órdenes no coincide con el total, solo se avisa.
--   * El número de ticket no se repite por laboratorio, salvo confirmación explícita (talonarios reutilizados).
--   * Un pago cubre uno o varios tickets y un ticket se paga en partes; nunca más de lo que se debe.
--   * Pago con efectivo de caja: crea un egreso en la caja abierta de la sede; sin caja abierta, se rechaza.
--   * Nada se borra: tickets, pagos y egresos se anulan con motivo. Todo queda en la auditoría.
--   * Escritura solo por funciones (con sus validaciones): la API no inserta ni edita directo.
--   * Permisos: el vendedor registra tickets de sus sedes; propietario y administrador (sus sedes) registran
--     pagos, abren y cierran caja, anulan y ven deuda, pagos y ganancia.

-- 1 ----------------------------------------------------------------------------
alter table public.laboratorios add column dias_credito integer not null default 0 check (dias_credito between 0 and 365);
comment on column public.laboratorios.dias_credito is 'Plazo de crédito en días (0 = contado). Lo cambian propietario y administrador.';

-- Solo propietario o administrador cambian el plazo de crédito.
create function public.f_laboratorio_credito() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.dias_credito is distinct from (case when tg_op = 'UPDATE' then old.dias_credito else 0 end)
     and auth.uid() is not null
     and not public.tiene_rol(new.optica_id, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'Solo el propietario o un administrador cambian los días de crédito del laboratorio' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_credito before insert or update on public.laboratorios for each row execute function public.f_laboratorio_credito();

-- 2 ----------------------------------------------------------------------------
-- Caja de la sede: se abre y se cierra; registra los egresos (por ahora, pagos a laboratorios en efectivo).
create table public.cajas (
  id             uuid primary key default gen_random_uuid(),
  optica_id      uuid not null references public.opticas(id),
  sede_id        uuid not null references public.sedes(id),
  abierta_en     timestamptz not null default now(),
  abierta_por    uuid not null,
  monto_inicial  numeric(10,2) not null check (monto_inicial >= 0),
  cerrada_en     timestamptz,
  cerrada_por    uuid,
  monto_contado  numeric(10,2) check (monto_contado is null or monto_contado >= 0),
  observaciones  text check (observaciones is null or length(observaciones) <= 300)
);
comment on table public.cajas is 'Caja de efectivo de una sede: una abierta a la vez. Solo se abre y se cierra (no se borra).';
create unique index cajas_una_abierta on public.cajas (sede_id) where cerrada_en is null;
create index cajas_por_sede on public.cajas (sede_id, abierta_en desc);

create table public.caja_movimientos (
  id               uuid primary key default gen_random_uuid(),
  optica_id        uuid not null references public.opticas(id),
  sede_id          uuid not null references public.sedes(id),
  caja_id          uuid not null references public.cajas(id),
  tipo             text not null check (tipo in ('egreso')),
  monto            numeric(10,2) not null check (monto > 0),
  concepto         text not null check (length(trim(concepto)) > 0 and length(concepto) <= 300),
  lab_pago_id      uuid,
  creado_por       uuid,
  creado_en        timestamptz not null default now(),
  anulado_en       timestamptz,
  anulado_por      uuid,
  motivo_anulacion text,
  check (anulado_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
comment on table public.caja_movimientos is 'Egresos de la caja de una sede. Se anulan con motivo, no se borran.';
create index caja_movimientos_por_caja on public.caja_movimientos (caja_id, creado_en);

-- 3 ----------------------------------------------------------------------------
create table public.lab_tickets (
  id                uuid primary key default gen_random_uuid(),
  optica_id         uuid not null references public.opticas(id),
  sede_id           uuid not null references public.sedes(id),
  laboratorio_id    uuid not null,
  numero_ticket     text not null check (length(trim(numero_ticket)) between 1 and 40),
  fecha             date not null,
  monto_total       numeric(10,2) not null check (monto_total > 0),
  fecha_vencimiento date not null,
  foto_path         text,
  observaciones     text check (observaciones is null or length(observaciones) <= 500),
  registrado_por    uuid,
  creado_en         timestamptz not null default now(),
  anulado_en        timestamptz,
  anulado_por       uuid,
  motivo_anulacion  text,
  foreign key (laboratorio_id, optica_id) references public.laboratorios (id, optica_id),
  check (fecha_vencimiento >= fecha),
  check (anulado_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
comment on table public.lab_tickets is 'Tickets (boletas o notas) de los laboratorios. El número puede repetirse solo con confirmación.';
create index lab_tickets_numero on public.lab_tickets (optica_id, laboratorio_id, lower(trim(numero_ticket)));
create index lab_tickets_por_lab on public.lab_tickets (laboratorio_id, fecha_vencimiento) where anulado_en is null;
create index lab_tickets_por_sede on public.lab_tickets (sede_id, fecha);

create table public.lab_ticket_ordenes (
  id         uuid primary key default gen_random_uuid(),
  optica_id  uuid not null references public.opticas(id),
  sede_id    uuid not null references public.sedes(id),
  ticket_id  uuid not null references public.lab_tickets(id),
  orden_id   uuid not null references public.ordenes(id),
  monto      numeric(10,2) not null check (monto >= 0),
  creado_por uuid,
  creado_en  timestamptz not null default now(),
  unique (ticket_id, orden_id)
);
comment on table public.lab_ticket_ordenes is 'Órdenes que cubre cada ticket y su costo de laboratorio.';
create index lab_ticket_ordenes_por_orden on public.lab_ticket_ordenes (orden_id);

create table public.lab_pagos (
  id                 uuid primary key default gen_random_uuid(),
  optica_id          uuid not null references public.opticas(id),
  sede_id            uuid not null references public.sedes(id),
  laboratorio_id     uuid not null,
  fecha              date not null,
  monto              numeric(10,2) not null check (monto > 0),
  medio              text not null check (medio in ('efectivo_caja', 'yape', 'plin', 'transferencia', 'otro')),
  numero_operacion   text check (numero_operacion is null or length(numero_operacion) <= 60),
  foto_path          text,
  pagado_por         uuid,
  observaciones      text check (observaciones is null or length(observaciones) <= 500),
  creado_en          timestamptz not null default now(),
  anulado_en         timestamptz,
  anulado_por        uuid,
  motivo_anulacion   text,
  foreign key (laboratorio_id, optica_id) references public.laboratorios (id, optica_id),
  check (anulado_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
comment on table public.lab_pagos is 'Pagos a laboratorios: quién pagó, cuánto, cómo y con qué comprobante. Se anulan con motivo.';
create index lab_pagos_por_lab on public.lab_pagos (laboratorio_id, fecha desc);
create index lab_pagos_por_sede on public.lab_pagos (sede_id, fecha desc);
alter table public.caja_movimientos add foreign key (lab_pago_id) references public.lab_pagos(id);

create table public.lab_pago_aplicaciones (
  id        uuid primary key default gen_random_uuid(),
  optica_id uuid not null references public.opticas(id),
  sede_id   uuid not null references public.sedes(id),
  pago_id   uuid not null references public.lab_pagos(id),
  ticket_id uuid not null references public.lab_tickets(id),
  monto     numeric(10,2) not null check (monto > 0),
  unique (pago_id, ticket_id)
);
comment on table public.lab_pago_aplicaciones is 'Reparto de cada pago entre los tickets que cubre.';
create index lab_pago_aplicaciones_por_ticket on public.lab_pago_aplicaciones (ticket_id);

-- 4 ----------------------------------------------------------------------------
-- Inmutabilidad, auditoría y solo lectura por suscripción en todas las tablas nuevas.
do $$
declare t text;
begin
  foreach t in array array['cajas', 'caja_movimientos', 'lab_tickets', 'lab_ticket_ordenes', 'lab_pagos', 'lab_pago_aplicaciones'] loop
    execute format('create trigger t_00_suscripcion before insert or update on public.%I for each row execute function public.f_exigir_suscripcion()', t);
    execute format('create trigger t_sin_delete before delete on public.%I for each row execute function public.f_bloquear_delete()', t);
    execute format('create trigger t_auditar after insert or update or delete on public.%I for each row execute function public.f_auditar()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Las líneas del ticket y el reparto de los pagos no cambian nunca (se anula el ticket o el pago).
create trigger t_sin_update before update on public.lab_ticket_ordenes for each row execute function public.f_solo_insertar();
create trigger t_sin_update before update on public.lab_pago_aplicaciones for each row execute function public.f_solo_insertar();

-- Lectura: tickets para todo el que trabaja en la sede; pagos, caja y reparto, solo propietario y administrador.
create function public.gestiona_sede(p_optica uuid, p_sede uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tiene_rol(p_optica, array['propietario', 'administrador']::public.rol_miembro[]) and public.tiene_sede(p_sede)
     and exists (select 1 from public.sedes s where s.id = p_sede and s.optica_id = p_optica);
$$;
revoke execute on function public.gestiona_sede(uuid, uuid) from public, anon;
grant execute on function public.gestiona_sede(uuid, uuid) to authenticated;

create policy lab_tickets_select on public.lab_tickets for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy lab_ticket_ordenes_select on public.lab_ticket_ordenes for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));
create policy lab_pagos_select on public.lab_pagos for select to authenticated
  using (public.gestiona_sede(optica_id, sede_id));
create policy lab_pago_aplicaciones_select on public.lab_pago_aplicaciones for select to authenticated
  using (public.gestiona_sede(optica_id, sede_id));
create policy cajas_select on public.cajas for select to authenticated
  using (public.gestiona_sede(optica_id, sede_id));
create policy caja_movimientos_select on public.caja_movimientos for select to authenticated
  using (public.gestiona_sede(optica_id, sede_id));

-- 5 ----------------------------------------------------------------------------
-- Estados calculados (hora de Lima). Lo anulado no cuenta.
create function public.lab_ticket_pagado(p_ticket uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(a.monto), 0)::numeric(10,2)
  from public.lab_pago_aplicaciones a join public.lab_pagos p on p.id = a.pago_id
  where a.ticket_id = p_ticket and p.anulado_en is null;
$$;
revoke execute on function public.lab_ticket_pagado(uuid) from public, anon;
grant execute on function public.lab_ticket_pagado(uuid) to authenticated;

-- Estado de pago y de vencimiento de un ticket (función pura: también la usan las pruebas).
create function public.lab_estado_vencimiento(p_vence date, p_deuda numeric, p_hoy date) returns text
language sql immutable set search_path = '' as $$
  select case when p_deuda <= 0 then 'al_dia'
              when p_vence < p_hoy then 'vencido'
              when p_vence - p_hoy <= 2 then 'por_vencer'
              else 'al_dia' end
$$;

-- La vista respeta el RLS de lab_tickets (security_invoker). El total pagado sale de una función
-- para que el estado sea el mismo para quien no ve los pagos (vendedor).
create view public.lab_tickets_estado with (security_invoker = true) as
  select t.id, t.optica_id, t.sede_id, t.laboratorio_id, l.nombre as laboratorio, t.numero_ticket, t.fecha, t.monto_total,
         t.fecha_vencimiento, t.foto_path, t.observaciones, t.registrado_por, t.creado_en, t.anulado_en, t.motivo_anulacion,
         x.pagado,
         case when t.anulado_en is null then t.monto_total - x.pagado else 0 end as deuda,
         case when t.anulado_en is not null then 'anulado'
              when x.pagado >= t.monto_total then 'pagado'
              when x.pagado > 0 then 'parcial'
              else 'pendiente' end as estado_pago,
         case when t.anulado_en is not null then 'al_dia'
              else public.lab_estado_vencimiento(t.fecha_vencimiento, t.monto_total - x.pagado, x.hoy) end as estado_vencimiento,
         (t.fecha_vencimiento - x.hoy)::integer as dias_para_vencer,
         (select coalesce(sum(o.monto), 0) from public.lab_ticket_ordenes o where o.ticket_id = t.id)::numeric(10,2) as monto_ordenes,
         (select count(*) from public.lab_ticket_ordenes o where o.ticket_id = t.id)::integer as ordenes
  from public.lab_tickets t
  join public.laboratorios l on l.id = t.laboratorio_id
  cross join lateral (select public.lab_ticket_pagado(t.id) as pagado, (now() at time zone 'America/Lima')::date as hoy) x;
grant select on public.lab_tickets_estado to authenticated;

-- 6 ----------------------------------------------------------------------------
-- Fotos de tickets y comprobantes: bucket privado. Ruta: {optica}/{sede}/{tickets|pagos}/{archivo}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('laboratorios', 'laboratorios', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- ¿El usuario puede leer o subir este archivo? Tickets: quien trabaja en la sede. Pagos: propietario o administrador.
create function public.puede_archivo_laboratorio(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_partes text[] := string_to_array(p_nombre, '/');
  v_optica uuid;
  v_sede uuid;
begin
  if array_length(v_partes, 1) <> 4 or v_partes[3] not in ('tickets', 'pagos') then
    return false;
  end if;
  begin
    v_optica := v_partes[1]::uuid;
    v_sede := v_partes[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not exists (select 1 from public.sedes s where s.id = v_sede and s.optica_id = v_optica) then
    return false;
  end if;
  if v_partes[3] = 'tickets' then
    return public.es_miembro(v_optica) and public.tiene_sede(v_sede);
  end if;
  return public.gestiona_sede(v_optica, v_sede);
end $$;
revoke execute on function public.puede_archivo_laboratorio(text) from public, anon;
grant execute on function public.puede_archivo_laboratorio(text) to authenticated;

create policy laboratorios_archivos_select on storage.objects for select to authenticated
  using (bucket_id = 'laboratorios' and public.puede_archivo_laboratorio(name));
create policy laboratorios_archivos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'laboratorios' and public.puede_archivo_laboratorio(name));
-- Sin políticas de update ni delete: las fotos no se reemplazan ni se borran.

-- La foto guardada en un ticket o pago debe estar en la carpeta de su óptica, sede y tipo.
create function public.exigir_ruta_foto(p_ruta text, p_optica uuid, p_sede uuid, p_tipo text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  p_ruta := nullif(trim(p_ruta), '');
  if p_ruta is not null and p_ruta not like format('%s/%s/%s/%%', p_optica, p_sede, p_tipo) then
    raise exception 'La foto no corresponde a esta sede';
  end if;
  return p_ruta;
end $$;

-- 7 ----------------------------------------------------------------------------
-- Caja: abrir y cerrar (propietario o administrador de la sede).
create function public.abrir_caja(p_sede uuid, p_monto_inicial numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  v_id uuid;
begin
  select optica_id into v_optica from public.sedes where id = p_sede and activa;
  if v_optica is null or not public.gestiona_sede(v_optica, p_sede) then
    raise exception 'Solo el propietario o un administrador de la sede abren la caja' using errcode = '42501';
  end if;
  if exists (select 1 from public.cajas where sede_id = p_sede and cerrada_en is null) then
    raise exception 'Ya hay una caja abierta en esta sede';
  end if;
  insert into public.cajas (optica_id, sede_id, abierta_por, monto_inicial)
  values (v_optica, p_sede, auth.uid(), coalesce(p_monto_inicial, 0))
  returning id into v_id;
  return v_id;
end $$;

create function public.cerrar_caja(p_caja uuid, p_monto_contado numeric, p_observaciones text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.cajas;
begin
  select * into c from public.cajas where id = p_caja for update;
  if c.id is null or not public.gestiona_sede(c.optica_id, c.sede_id) then
    raise exception 'Solo el propietario o un administrador de la sede cierran la caja' using errcode = '42501';
  end if;
  if c.cerrada_en is not null then
    raise exception 'La caja ya está cerrada';
  end if;
  update public.cajas
     set cerrada_en = now(), cerrada_por = auth.uid(), monto_contado = p_monto_contado,
         observaciones = nullif(trim(p_observaciones), '')
   where id = p_caja;
end $$;

-- Resumen de una caja: efectivo cobrado por órdenes y egresos vigentes desde la apertura.
create function public.caja_resumen(p_caja uuid)
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
      where p.sede_id = c.sede_id and p.medio = 'efectivo' and p.anulado_en is null
        and p.creado_en >= c.abierta_en and (c.cerrada_en is null or p.creado_en <= c.cerrada_en)
    ), salidas as (
      select coalesce(sum(m.monto), 0)::numeric(10,2) as total from public.caja_movimientos m
      where m.caja_id = c.id and m.tipo = 'egreso' and m.anulado_en is null
    )
    select c.monto_inicial, cobros.total, salidas.total, (c.monto_inicial + cobros.total - salidas.total)::numeric(10,2)
    from cobros, salidas;
end $$;

-- 8 ----------------------------------------------------------------------------
-- Tickets.
-- Agrega órdenes a un ticket (validando óptica, sede, laboratorio y que no estén anuladas).
create function public.lab_ticket_agregar_lineas(t public.lab_tickets, p_ordenes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l jsonb;
  o public.ordenes;
  v_monto numeric;
begin
  for l in select * from jsonb_array_elements(coalesce(p_ordenes, '[]'::jsonb)) loop
    select * into o from public.ordenes where id = (l ->> 'orden_id')::uuid and optica_id = t.optica_id;
    if o.id is null then
      raise exception 'Una de las órdenes no existe';
    end if;
    if o.sede_id <> t.sede_id then
      raise exception 'La orden % es de otra sede', o.numero;
    end if;
    if o.laboratorio_id <> t.laboratorio_id then
      raise exception 'La orden % es de otro laboratorio', o.numero;
    end if;
    if o.estado = 'anulada' then
      raise exception 'La orden % está anulada', o.numero;
    end if;
    v_monto := coalesce(nullif(l ->> 'monto', '')::numeric, 0);
    if v_monto < 0 then
      raise exception 'El costo de la orden % no puede ser negativo', o.numero;
    end if;
    if exists (select 1 from public.lab_ticket_ordenes x where x.ticket_id = t.id and x.orden_id = o.id) then
      raise exception 'La orden % ya está en este ticket', o.numero;
    end if;
    insert into public.lab_ticket_ordenes (optica_id, sede_id, ticket_id, orden_id, monto, creado_por)
    values (t.optica_id, t.sede_id, t.id, o.id, v_monto, auth.uid());
  end loop;
end $$;
revoke execute on function public.lab_ticket_agregar_lineas(public.lab_tickets, jsonb) from public, anon, authenticated;

-- Registra un ticket con sus órdenes. Si el número ya existe en ese laboratorio y no se confirma,
-- falla con el código LT409 y el id del ticket existente en "detail".
create function public.registrar_lab_ticket(
  p_sede uuid, p_laboratorio uuid, p_numero text, p_fecha date, p_monto_total numeric, p_ordenes jsonb,
  p_fecha_vencimiento date default null, p_foto text default null, p_observaciones text default null,
  p_confirmar_duplicado boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  v_credito integer;
  v_existente uuid;
  t public.lab_tickets;
begin
  select optica_id into v_optica from public.sedes where id = p_sede and activa;
  if v_optica is null or not public.es_miembro(v_optica) or not public.tiene_sede(p_sede) then
    raise exception 'No tienes acceso a esa sede' using errcode = '42501';
  end if;
  select dias_credito into v_credito from public.laboratorios where id = p_laboratorio and optica_id = v_optica;
  if not found then
    raise exception 'El laboratorio no existe';
  end if;
  if length(trim(coalesce(p_numero, ''))) = 0 then
    raise exception 'Escribe el número del ticket';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha del ticket no puede estar en el futuro';
  end if;
  if jsonb_array_length(coalesce(p_ordenes, '[]'::jsonb)) = 0 then
    raise exception 'El ticket debe cubrir al menos una orden';
  end if;

  -- Bloqueo por laboratorio: dos registros simultáneos del mismo número no se cruzan.
  perform pg_advisory_xact_lock(hashtext(p_laboratorio::text || lower(trim(p_numero))));
  select id into v_existente from public.lab_tickets
   where optica_id = v_optica and laboratorio_id = p_laboratorio and anulado_en is null
     and lower(trim(numero_ticket)) = lower(trim(p_numero))
   order by creado_en limit 1;
  if v_existente is not null and not coalesce(p_confirmar_duplicado, false) then
    raise exception 'Ya existe un ticket % de este laboratorio', trim(p_numero)
      using errcode = 'LT409', detail = v_existente::text;
  end if;

  insert into public.lab_tickets (optica_id, sede_id, laboratorio_id, numero_ticket, fecha, monto_total, fecha_vencimiento,
                                  foto_path, observaciones, registrado_por)
  values (v_optica, p_sede, p_laboratorio, trim(p_numero), p_fecha, p_monto_total,
          coalesce(p_fecha_vencimiento, p_fecha + v_credito),
          public.exigir_ruta_foto(p_foto, v_optica, p_sede, 'tickets'), nullif(trim(p_observaciones), ''), auth.uid())
  returning * into t;
  perform public.lab_ticket_agregar_lineas(t, p_ordenes);
  return t.id;
end $$;

-- Agrega una orden a un ticket ya registrado (número repetido: "agregar la orden a este ticket").
create function public.agregar_orden_lab_ticket(p_ticket uuid, p_orden uuid, p_monto numeric, p_sumar_al_total boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
declare t public.lab_tickets;
begin
  select * into t from public.lab_tickets where id = p_ticket for update;
  if t.id is null or not public.es_miembro(t.optica_id) or not public.tiene_sede(t.sede_id) then
    raise exception 'No tienes acceso a ese ticket' using errcode = '42501';
  end if;
  if t.anulado_en is not null then
    raise exception 'El ticket está anulado';
  end if;
  perform public.lab_ticket_agregar_lineas(t, jsonb_build_array(jsonb_build_object('orden_id', p_orden, 'monto', p_monto)));
  if coalesce(p_sumar_al_total, false) and coalesce(p_monto, 0) > 0 then
    update public.lab_tickets set monto_total = monto_total + p_monto where id = t.id;
  end if;
end $$;

-- Edita vencimiento, total, observaciones o foto (propietario o administrador). El total no baja de lo pagado.
create function public.actualizar_lab_ticket(p_ticket uuid, p_fecha_vencimiento date, p_monto_total numeric,
                                             p_observaciones text default null, p_foto text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.lab_tickets;
  v_pagado numeric;
begin
  select * into t from public.lab_tickets where id = p_ticket for update;
  if t.id is null or not public.gestiona_sede(t.optica_id, t.sede_id) then
    raise exception 'Solo el propietario o un administrador de la sede editan el ticket' using errcode = '42501';
  end if;
  if t.anulado_en is not null then
    raise exception 'El ticket está anulado';
  end if;
  v_pagado := public.lab_ticket_pagado(t.id);
  if p_monto_total < v_pagado then
    raise exception 'El total (S/ %) no puede ser menor que lo ya pagado (S/ %)', p_monto_total, v_pagado;
  end if;
  update public.lab_tickets
     set fecha_vencimiento = coalesce(p_fecha_vencimiento, fecha_vencimiento),
         monto_total = coalesce(p_monto_total, monto_total),
         observaciones = nullif(trim(p_observaciones), ''),
         foto_path = coalesce(public.exigir_ruta_foto(p_foto, t.optica_id, t.sede_id, 'tickets'), foto_path)
   where id = t.id;
end $$;

create function public.anular_lab_ticket(p_ticket uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.lab_tickets;
begin
  select * into t from public.lab_tickets where id = p_ticket for update;
  if t.id is null or not public.gestiona_sede(t.optica_id, t.sede_id) then
    raise exception 'Solo el propietario o un administrador de la sede anulan tickets' using errcode = '42501';
  end if;
  if t.anulado_en is not null then
    raise exception 'El ticket ya está anulado';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Indica el motivo de la anulación';
  end if;
  if public.lab_ticket_pagado(t.id) > 0 then
    raise exception 'El ticket tiene pagos vigentes: anula primero esos pagos';
  end if;
  update public.lab_tickets set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo) where id = t.id;
end $$;

-- 9 ----------------------------------------------------------------------------
-- Pagos.
create function public.registrar_lab_pago(
  p_sede uuid, p_laboratorio uuid, p_fecha date, p_medio text, p_aplicaciones jsonb,
  p_numero_operacion text default null, p_foto text default null, p_observaciones text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  v_lab text;
  v_total numeric(10,2) := 0;
  v_pago uuid;
  v_caja uuid;
  v_numeros text[] := '{}';
  v_tickets uuid[] := '{}';
  v_montos numeric[] := '{}';
  l jsonb;
  t public.lab_tickets;
  v_monto numeric(10,2);
  v_deuda numeric(10,2);
begin
  select optica_id into v_optica from public.sedes where id = p_sede;
  if v_optica is null or not public.gestiona_sede(v_optica, p_sede) then
    raise exception 'Solo el propietario o un administrador de la sede registran pagos a laboratorios' using errcode = '42501';
  end if;
  select nombre into v_lab from public.laboratorios where id = p_laboratorio and optica_id = v_optica;
  if v_lab is null then
    raise exception 'El laboratorio no existe';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha del pago no puede estar en el futuro';
  end if;
  if p_medio not in ('efectivo_caja', 'yape', 'plin', 'transferencia', 'otro') then
    raise exception 'Medio de pago inválido';
  end if;
  if jsonb_array_length(coalesce(p_aplicaciones, '[]'::jsonb)) = 0 then
    raise exception 'Indica a qué tickets se aplica el pago';
  end if;

  -- Cada ticket se bloquea antes de leer su deuda: dos pagos simultáneos no superan lo que se debe.
  v_pago := gen_random_uuid();
  for l in select * from jsonb_array_elements(p_aplicaciones) loop
    v_monto := nullif(l ->> 'monto', '')::numeric;
    if v_monto is null or v_monto <= 0 then
      continue;
    end if;
    select * into t from public.lab_tickets where id = (l ->> 'ticket_id')::uuid and optica_id = v_optica for update;
    if t.id is null then
      raise exception 'Uno de los tickets no existe';
    end if;
    if t.laboratorio_id <> p_laboratorio or t.sede_id <> p_sede then
      raise exception 'El ticket % es de otro laboratorio o de otra sede', t.numero_ticket;
    end if;
    if t.anulado_en is not null then
      raise exception 'El ticket % está anulado', t.numero_ticket;
    end if;
    if t.id = any (v_tickets) then
      raise exception 'El ticket % está repetido en el pago', t.numero_ticket;
    end if;
    v_deuda := t.monto_total - public.lab_ticket_pagado(t.id);
    if v_monto > v_deuda then
      raise exception 'Al ticket % le quedan S/ % por pagar: no se puede aplicar S/ %', t.numero_ticket, v_deuda, v_monto;
    end if;
    v_tickets := v_tickets || t.id;
    v_montos := v_montos || v_monto;
    v_numeros := v_numeros || t.numero_ticket;
    v_total := v_total + v_monto;
  end loop;
  if v_total <= 0 then
    raise exception 'El pago debe aplicarse por un monto mayor que cero';
  end if;

  if p_medio = 'efectivo_caja' then
    select id into v_caja from public.cajas where sede_id = p_sede and cerrada_en is null for update;
    if v_caja is null then
      raise exception 'No hay una caja abierta en esta sede: ábrela o elige otro medio de pago';
    end if;
  end if;

  insert into public.lab_pagos (id, optica_id, sede_id, laboratorio_id, fecha, monto, medio, numero_operacion, foto_path, pagado_por, observaciones)
  values (v_pago, v_optica, p_sede, p_laboratorio, p_fecha, v_total, p_medio, nullif(trim(p_numero_operacion), ''),
          public.exigir_ruta_foto(p_foto, v_optica, p_sede, 'pagos'), auth.uid(), nullif(trim(p_observaciones), ''));
  insert into public.lab_pago_aplicaciones (optica_id, sede_id, pago_id, ticket_id, monto)
  select v_optica, p_sede, v_pago, x.ticket, x.monto from unnest(v_tickets, v_montos) as x(ticket, monto);

  if v_caja is not null then
    insert into public.caja_movimientos (optica_id, sede_id, caja_id, tipo, monto, concepto, lab_pago_id, creado_por)
    values (v_optica, p_sede, v_caja, 'egreso', v_total,
            format('Pago a %s (ticket %s)', v_lab, array_to_string(v_numeros, ', ')), v_pago, auth.uid());
  end if;
  return v_pago;
end $$;

create function public.anular_lab_pago(p_pago uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.lab_pagos;
begin
  select * into p from public.lab_pagos where id = p_pago for update;
  if p.id is null or not public.gestiona_sede(p.optica_id, p.sede_id) then
    raise exception 'Solo el propietario o un administrador de la sede anulan pagos' using errcode = '42501';
  end if;
  if p.anulado_en is not null then
    raise exception 'El pago ya está anulado';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Indica el motivo de la anulación';
  end if;
  update public.lab_pagos set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo) where id = p.id;
  -- El egreso de caja vuelve: se anula con el mismo motivo.
  update public.caja_movimientos set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = 'Pago anulado: ' || trim(p_motivo)
   where lab_pago_id = p.id and anulado_en is null;
end $$;

-- 10 ---------------------------------------------------------------------------
-- Informes (propietario y administrador; sin sede = todas las sedes visibles).
-- Deuda pendiente por laboratorio y fecha de vencimiento (para el total y las alertas).
create function public.lab_deuda_resumen(p_optica uuid, p_sede uuid default null)
returns table (laboratorio_id uuid, laboratorio text, fecha_vencimiento date, dias_para_vencer integer, estado text, deuda numeric, tickets integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver la deuda con laboratorios' using errcode = '42501';
  end if;
  return query
    select e.laboratorio_id, e.laboratorio, e.fecha_vencimiento, e.dias_para_vencer, e.estado_vencimiento,
           sum(e.deuda)::numeric(10,2), count(*)::integer
    from public.lab_tickets_estado e
    where e.optica_id = p_optica and e.anulado_en is null and e.deuda > 0
      and (e.sede_id = p_sede or (p_sede is null and public.tiene_sede(e.sede_id)))
    group by e.laboratorio_id, e.laboratorio, e.fecha_vencimiento, e.dias_para_vencer, e.estado_vencimiento
    order by e.fecha_vencimiento, e.laboratorio;
end $$;

-- Ganancia de las órdenes confirmadas en el mes (venta neta − costo de laboratorio de tickets vigentes).
create function public.ganancia_ordenes_mes(p_optica uuid, p_sede uuid default null, p_periodo date default null)
returns table (orden_id uuid, numero integer, paciente text, sede text, venta numeric, costo_laboratorio numeric, ganancia numeric, con_ticket boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_inicio date := date_trunc('month', coalesce(p_periodo, (now() at time zone 'America/Lima')::date))::date;
begin
  if not public.puede_ver_informes(p_optica, p_sede) then
    raise exception 'No tienes permiso para ver la ganancia' using errcode = '42501';
  end if;
  return query
    select o.id, o.numero, (pa.apellidos || ', ' || pa.nombres)::text, s.nombre,
           (o.precio - o.descuento)::numeric(10,2), c.costo, (o.precio - o.descuento - c.costo)::numeric(10,2), c.tickets > 0
    from public.ordenes o
    join public.pacientes pa on pa.id = o.paciente_id
    join public.sedes s on s.id = o.sede_id
    cross join lateral (
      select coalesce(sum(lo.monto), 0)::numeric(10,2) as costo, count(*) as tickets
      from public.lab_ticket_ordenes lo join public.lab_tickets t on t.id = lo.ticket_id
      where lo.orden_id = o.id and t.anulado_en is null
    ) c
    where o.optica_id = p_optica and o.estado <> 'anulada' and o.confirmada_en is not null
      and (o.confirmada_en at time zone 'America/Lima')::date >= v_inicio
      and (o.confirmada_en at time zone 'America/Lima')::date < (v_inicio + interval '1 month')::date
      and (o.sede_id = p_sede or (p_sede is null and public.tiene_sede(o.sede_id)))
    order by o.numero desc;
end $$;

-- 11 ---------------------------------------------------------------------------
-- Permisos de ejecución.
revoke execute on function public.f_laboratorio_credito(), public.exigir_ruta_foto(text, uuid, uuid, text),
  public.lab_estado_vencimiento(date, numeric, date) from public, anon;
grant execute on function public.lab_estado_vencimiento(date, numeric, date) to authenticated;
revoke execute on function
  public.abrir_caja(uuid, numeric), public.cerrar_caja(uuid, numeric, text), public.caja_resumen(uuid),
  public.registrar_lab_ticket(uuid, uuid, text, date, numeric, jsonb, date, text, text, boolean),
  public.agregar_orden_lab_ticket(uuid, uuid, numeric, boolean),
  public.actualizar_lab_ticket(uuid, date, numeric, text, text), public.anular_lab_ticket(uuid, text),
  public.registrar_lab_pago(uuid, uuid, date, text, jsonb, text, text, text), public.anular_lab_pago(uuid, text),
  public.lab_deuda_resumen(uuid, uuid), public.ganancia_ordenes_mes(uuid, uuid, date)
from public, anon;
grant execute on function
  public.abrir_caja(uuid, numeric), public.cerrar_caja(uuid, numeric, text), public.caja_resumen(uuid),
  public.registrar_lab_ticket(uuid, uuid, text, date, numeric, jsonb, date, text, text, boolean),
  public.agregar_orden_lab_ticket(uuid, uuid, numeric, boolean),
  public.actualizar_lab_ticket(uuid, date, numeric, text, text), public.anular_lab_ticket(uuid, text),
  public.registrar_lab_pago(uuid, uuid, date, text, jsonb, text, text, text), public.anular_lab_pago(uuid, text),
  public.lab_deuda_resumen(uuid, uuid), public.ganancia_ordenes_mes(uuid, uuid, date)
to authenticated;
