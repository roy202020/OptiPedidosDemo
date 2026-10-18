-- OptiPedidos · Migración 0012 · Planes de suscripción y superadmin
-- Sin pérdida de datos: agrega tablas, columnas con valores por defecto, funciones y triggers.
--
-- Decisiones (acordadas con el dueño de la plataforma):
--   * Planes en la tabla `planes`: basico (1 sede, 3 usuarios, WhatsApp solo manual, sin metas
--     ni recordatorios automáticos) y profesional (sedes según contrato, usuarios ilimitados,
--     300 WhatsApp automáticos por sede al mes, metas y recordatorios).
--   * Al asignar un plan se copian sus límites a la óptica; el superadmin puede ajustarlos.
--   * Estado según vence_el (hora de Lima): activa hasta el vencimiento (aviso 5 días antes),
--     gracia 7 días, luego suspendida = solo lectura. Nunca se borra nada.
--   * Ópticas existentes: conservan su plan, vencen en 30 días. Nuevas por registro propio:
--     Básico con 14 días de prueba.
--   * El aviso "lentes listos" en Básico no se envía por API: queda omitido y se avisa por wa.me.
--   * El tope de WhatsApp pasa a ser por sede (whatsapp_mensual). opticas.tope_mensajes_mes
--     se conserva pero deja de usarse.
--   * Superadmin: tabla aparte, solo se carga por SQL. No es miembro de ninguna óptica, así que
--     el RLS existente le impide leer pacientes y recetas; usa funciones superadmin_* que solo
--     devuelven datos de suscripción.

-- 1 ----------------------------------------------------------------------------
create table public.planes (
  codigo               text primary key check (codigo in ('basico', 'profesional')),
  nombre               text not null,
  max_usuarios         integer check (max_usuarios is null or max_usuarios > 0),   -- null = ilimitados
  max_sedes            integer check (max_sedes is null or max_sedes > 0),         -- null = según contrato
  whatsapp_mensual     integer not null check (whatsapp_mensual >= 0),             -- automáticos por sede y mes
  incluye_metas        boolean not null,
  incluye_whatsapp_api boolean not null,
  incluye_recordatorios boolean not null
);
insert into public.planes values
  ('basico',      'Básico',      3,    1,    0,   false, false, false),
  ('profesional', 'Profesional', null, null, 300, true,  true,  true);

alter table public.planes enable row level security;
revoke all on public.planes from anon, authenticated;
grant select on public.planes to authenticated;
create policy planes_select on public.planes for select to authenticated using (true);

-- 2 ----------------------------------------------------------------------------
alter table public.opticas
  add column estado_suscripcion text not null default 'activa' check (estado_suscripcion in ('activa', 'gracia', 'suspendida')),
  add column vence_el          date,
  add column max_usuarios      integer check (max_usuarios is null or max_usuarios > 0),
  add column max_sedes         integer check (max_sedes is null or max_sedes > 0),
  add column whatsapp_mensual  integer check (whatsapp_mensual is null or whatsapp_mensual >= 0);
alter table public.opticas add constraint opticas_plan_fkey foreign key (plan) references public.planes (codigo);

comment on column public.opticas.vence_el is 'Último día pagado de la suscripción (hora de Lima). Lo cambia solo el superadmin.';
comment on column public.opticas.estado_suscripcion is 'Copia diaria del estado calculado (activa, gracia, suspendida) para listados. Los bloqueos usan estado_suscripcion_de().';
comment on column public.opticas.whatsapp_mensual is 'Mensajes de WhatsApp automáticos por sede y mes.';
comment on column public.opticas.tope_mensajes_mes is 'Obsoleta desde 0012: el tope ahora es whatsapp_mensual por sede.';

-- Ópticas existentes: límites de su plan y 30 días. Nuevas: 14 días de prueba.
update public.opticas o
   set max_usuarios = p.max_usuarios, max_sedes = p.max_sedes, whatsapp_mensual = p.whatsapp_mensual,
       vence_el = ((now() at time zone 'America/Lima')::date + 30)
  from public.planes p
 where p.codigo = o.plan;
alter table public.opticas alter column vence_el set default ((now() at time zone 'America/Lima')::date + 14);

-- Al crear una óptica se copian los límites de su plan (si no se indicaron).
create function public.f_optica_limites_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.planes;
begin
  select * into p from public.planes where codigo = new.plan;
  new.max_usuarios := coalesce(new.max_usuarios, p.max_usuarios);
  new.max_sedes := coalesce(new.max_sedes, p.max_sedes);
  new.whatsapp_mensual := coalesce(new.whatsapp_mensual, p.whatsapp_mensual);
  new.estado_suscripcion := public.estado_suscripcion_de(new.vence_el, (now() at time zone 'America/Lima')::date);
  return new;
end $$;

-- Estado según la fecha (función pura: también la usan las pruebas).
create function public.estado_suscripcion_de(p_vence date, p_hoy date) returns text
language sql immutable set search_path = '' as $$
  select case when p_vence is null or p_hoy <= p_vence then 'activa'
              when p_hoy <= p_vence + 7 then 'gracia'
              else 'suspendida' end
$$;

create trigger t_limites_plan before insert on public.opticas for each row execute function public.f_optica_limites_plan();

-- Al cambiar el vencimiento se actualiza la copia del estado.
create function public.f_optica_estado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vence_el is distinct from old.vence_el then
    new.estado_suscripcion := public.estado_suscripcion_de(new.vence_el, (now() at time zone 'America/Lima')::date);
  end if;
  return new;
end $$;
create trigger t_estado_suscripcion before update on public.opticas for each row execute function public.f_optica_estado();

-- 3 ----------------------------------------------------------------------------
-- Consultas de suscripción (las usan triggers, funciones y la interfaz).
create function public.suscripcion_estado(p_optica uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.estado_suscripcion_de(o.vence_el, (now() at time zone 'America/Lima')::date)
  from public.opticas o where o.id = p_optica
$$;

create function public.plan_incluye(p_optica uuid, p_funcion text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_funcion
             when 'metas' then p.incluye_metas
             when 'whatsapp_api' then p.incluye_whatsapp_api
             when 'recordatorios' then p.incluye_recordatorios
           end
    from public.opticas o join public.planes p on p.codigo = o.plan
    where o.id = p_optica), false)
$$;

revoke execute on function public.suscripcion_estado(uuid), public.plan_incluye(uuid, text) from public, anon;
grant execute on function public.suscripcion_estado(uuid), public.plan_incluye(uuid, text) to authenticated, service_role;

-- 4 ----------------------------------------------------------------------------
-- Superadmin de la plataforma (separado de los roles de las ópticas). Solo se carga por SQL:
--   insert into public.superadmins (usuario_id) select id from auth.users where email = '…';
create table public.superadmins (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  creado_en  timestamptz not null default now()
);
alter table public.superadmins enable row level security;
revoke all on public.superadmins from anon, authenticated;

create function public.es_superadmin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.superadmins s where s.usuario_id = auth.uid())
$$;
revoke execute on function public.es_superadmin() from public, anon;
grant execute on function public.es_superadmin() to authenticated;

-- 5 ----------------------------------------------------------------------------
-- Solo lectura con la suscripción suspendida: ningún usuario de la óptica registra ni modifica.
-- Exentos: el superadmin y los procesos internos (sin usuario). Las lecturas no se tocan.
create function public.f_exigir_suscripcion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_optica uuid;
begin
  if auth.uid() is null or public.es_superadmin() then
    return new;
  end if;
  -- Se lee como JSON: cada tabla tiene sus propias columnas (opticas usa id; el resto, optica_id).
  v_optica := (case when tg_table_name = 'opticas' then to_jsonb(new) ->> 'id' else to_jsonb(new) ->> 'optica_id' end)::uuid;
  if public.suscripcion_estado(v_optica) = 'suspendida' then
    raise exception 'Tu suscripción está suspendida: puedes ver y exportar tus datos, pero no registrar cambios. Renueva para continuar.';
  end if;
  return new;
end $$;
revoke execute on function public.f_exigir_suscripcion() from public, anon, authenticated;

do $$
declare t text;
begin
  -- "t_00_" para que se evalúe antes que los demás triggers BEFORE (orden alfabético).
  foreach t in array array['opticas', 'pacientes', 'recetas', 'laboratorios', 'ordenes', 'orden_ojos', 'orden_observaciones',
                           'orden_pagos', 'metas_ventas', 'sedes', 'miembros', 'miembro_sedes', 'lunas_productos',
                           'lunas_variantes', 'inventario_operaciones', 'inventario_movimientos', 'inventario_reservas',
                           'notificaciones', 'recordatorios_envios'] loop
    execute format('create trigger t_00_suscripcion before insert or update on public.%I for each row execute function public.f_exigir_suscripcion()', t);
  end loop;
end $$;

-- 6 ----------------------------------------------------------------------------
-- Límites de usuarios y sedes (también al reactivar). Valen para la app y para la API directa.
create function public.f_limite_usuarios() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_activos integer;
begin
  if not new.activo or (tg_op = 'UPDATE' and old.activo) then
    return new;
  end if;
  select max_usuarios into v_max from public.opticas where id = new.optica_id for update;
  if v_max is null then
    return new;
  end if;
  select count(*) into v_activos from public.miembros
   where optica_id = new.optica_id and activo and usuario_id <> new.usuario_id;
  if v_activos >= v_max then
    raise exception 'Tu plan permite hasta % usuarios activos. Para agregar más, pasa al plan Profesional.', v_max;
  end if;
  return new;
end $$;
create trigger t_limite_usuarios before insert or update on public.miembros for each row execute function public.f_limite_usuarios();

create function public.f_limite_sedes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
  v_activas integer;
begin
  if not new.activa or (tg_op = 'UPDATE' and old.activa) then
    return new;
  end if;
  select max_sedes into v_max from public.opticas where id = new.optica_id for update;
  if v_max is null then
    return new;
  end if;
  select count(*) into v_activas from public.sedes where optica_id = new.optica_id and activa and id <> new.id;
  if v_activas >= v_max then
    raise exception 'Tu plan permite % sede(s) activa(s). Disponible en plan Profesional: más sedes según contrato.', v_max;
  end if;
  return new;
end $$;
create trigger t_limite_sedes before insert or update on public.sedes for each row execute function public.f_limite_sedes();
revoke execute on function public.f_limite_usuarios(), public.f_limite_sedes(), public.f_optica_limites_plan(), public.f_optica_estado()
  from public, anon, authenticated;

-- 7 ----------------------------------------------------------------------------
-- Funciones del plan Profesional.

-- Metas de ventas
create function public.f_metas_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.plan_incluye(new.optica_id, 'metas') then
    raise exception 'Disponible en plan Profesional: metas de ventas.';
  end if;
  return new;
end $$;
create trigger t_01_plan before insert or update on public.metas_ventas for each row execute function public.f_metas_plan();
revoke execute on function public.f_metas_plan() from public, anon, authenticated;

-- Recordatorios automáticos: el interruptor exige el plan (antes comparaba el texto del plan).
create or replace function public.f_optica_recordatorios() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recordatorios_automaticos and not old.recordatorios_automaticos then
    if not public.plan_incluye(old.id, 'recordatorios') then
      raise exception 'El envío automático de recordatorios requiere el plan Profesional';
    end if;
    if auth.uid() is not null and not public.tiene_rol(old.id, array['propietario']::public.rol_miembro[]) then
      raise exception 'Solo el propietario activa el envío automático' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Aviso "lentes listos": sin WhatsApp por API en el plan, se registra omitido (se avisa por wa.me).
create or replace function public.f_orden_encolar_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  if new.estado = 'recibida_optica' and old.estado is distinct from new.estado then
    if public.plan_incluye(new.optica_id, 'whatsapp_api') then
      select * into a from public.preparar_aviso(new.paciente_id);
    else
      select public.normalizar_celular_pe(p.telefono) as telefono, 'omitida'::public.estado_notificacion as estado,
             'Plan Básico: avisa al paciente con el botón de WhatsApp de la orden' as motivo
        into a from public.pacientes p where p.id = new.paciente_id;
    end if;
    insert into public.notificaciones (optica_id, orden_id, paciente_id, telefono, estado, ultimo_error)
    values (new.optica_id, new.id, new.paciente_id, a.telefono, a.estado, a.motivo)
    on conflict (orden_id, tipo) do nothing;
  end if;
  return null;
end $$;

-- 8 ----------------------------------------------------------------------------
-- Tope de WhatsApp automático por sede y mes (avisos + recordatorios automáticos).
create function public.mensajes_del_mes_sede(p_sede uuid, p_ahora timestamptz default now()) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inicio timestamp := date_trunc('month', p_ahora at time zone 'America/Lima');
  v_optica uuid;
begin
  select optica_id into v_optica from public.sedes where id = p_sede;
  if auth.uid() is not null and not (public.es_miembro(v_optica) and public.tiene_sede(p_sede)) then
    raise exception 'No tienes acceso a esa sede' using errcode = '42501';
  end if;
  return (select count(*) from public.notificaciones n
          where n.sede_id = p_sede and n.enviado_en is not null
            and (n.enviado_en at time zone 'America/Lima') >= v_inicio
            and (n.enviado_en at time zone 'America/Lima') < v_inicio + interval '1 month')
       + (select count(*) from public.recordatorios_envios e
          where e.sede_id = p_sede and e.canal = 'automatico' and e.enviado_en is not null
            and (e.enviado_en at time zone 'America/Lima') >= v_inicio
            and (e.enviado_en at time zone 'America/Lima') < v_inicio + interval '1 month');
end $$;
revoke execute on function public.mensajes_del_mes_sede(uuid, timestamptz) from public, anon;
grant execute on function public.mensajes_del_mes_sede(uuid, timestamptz) to authenticated, service_role;

-- ¿La sede todavía puede enviar un automático este mes? (plan con API, suscripción no suspendida y bajo el tope)
create function public.sede_puede_enviar(p_sede uuid, p_ahora timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.plan_incluye(o.id, 'whatsapp_api')
     and public.estado_suscripcion_de(o.vence_el, (p_ahora at time zone 'America/Lima')::date) <> 'suspendida'
     and public.mensajes_del_mes_sede(s.id, p_ahora) < coalesce(o.whatsapp_mensual, 0)
  from public.sedes s join public.opticas o on o.id = s.optica_id
  where s.id = p_sede
$$;
revoke execute on function public.sede_puede_enviar(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sede_puede_enviar(uuid, timestamptz) to service_role;

-- Aviso "lentes listos": antes de enviar, plan, suscripción y tope de la sede.
create or replace function public.reclamar_notificacion(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n public.notificaciones;
begin
  select * into n from public.notificaciones where id = p_id;
  if n.id is null then
    return null;
  end if;
  -- Serializa por sede para que dos envíos simultáneos no superen el tope.
  perform 1 from public.sedes where id = n.sede_id for update;
  if n.estado = 'pendiente' and not coalesce(public.sede_puede_enviar(n.sede_id), false) then
    update public.notificaciones
       set estado = 'fallida',
           ultimo_error = case
             when not public.plan_incluye(n.optica_id, 'whatsapp_api') then 'Plan Básico: avisa al paciente con el botón de WhatsApp de la orden'
             when public.suscripcion_estado(n.optica_id) = 'suspendida' then 'Suscripción suspendida'
             else 'Se alcanzó el tope mensual de WhatsApp automáticos de la sede' end
     where id = p_id;
    return null;
  end if;

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

-- Recordatorios: candidatos por sede según lo que queda del tope de cada sede.
create or replace function public.recordatorios_para_enviar(p_ahora timestamptz default now(), p_limite integer default 500)
returns table (optica_id uuid, paciente_id uuid, receta_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoy date := (p_ahora at time zone 'America/Lima')::date;
begin
  if not public.en_horario_recordatorios(p_ahora) then
    return;
  end if;
  return query
    with candidatos as (
      select o.id as optica_id, c.paciente_id, c.receta_id, c.vence_en, c.sede_id,
             greatest(coalesce(o.whatsapp_mensual, 0) - public.mensajes_del_mes_sede(c.sede_id, p_ahora), 0) as disponibles
      from public.opticas o
      cross join lateral public.recordatorios_ciclos(o.id) c
      where public.plan_incluye(o.id, 'recordatorios') and o.recordatorios_automaticos
        and public.estado_suscripcion_de(o.vence_el, v_hoy) <> 'suspendida'
        and not c.archivado and c.acepta and not c.de_baja and c.celular is not null
        and c.vence_en between v_hoy - 90 and v_hoy
        and (c.envio_id is null
             or (c.envio_canal = 'automatico' and c.envio_estado = 'fallido' and c.envio_intentos < 3))
    )
    select x.optica_id, x.paciente_id, x.receta_id
    from (select c.*, row_number() over (partition by c.sede_id order by c.vence_en, c.paciente_id) as n from candidatos c) x
    where x.n <= x.disponibles
    limit p_limite;
end $$;

create or replace function public.reclamar_recordatorio(p_paciente uuid, p_receta uuid, p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  o public.opticas;
  c record;
  e public.recordatorios_envios;
begin
  select optica_id into v_optica from public.pacientes where id = p_paciente;
  select * into o from public.opticas where id = v_optica;
  if o.id is null or not public.plan_incluye(o.id, 'recordatorios') or not o.recordatorios_automaticos
     or not public.en_horario_recordatorios(p_ahora)
     or public.estado_suscripcion_de(o.vence_el, (p_ahora at time zone 'America/Lima')::date) = 'suspendida' then
    return null;
  end if;

  select * into c from public.recordatorios_ciclos(o.id) x where x.paciente_id = p_paciente;
  if c.receta_id is distinct from p_receta
     or c.archivado or not c.acepta or c.de_baja or c.celular is null
     or c.vence_en > (p_ahora at time zone 'America/Lima')::date then
    return null;
  end if;

  -- Bloquea la sede: serializa el conteo del tope entre envíos simultáneos.
  perform 1 from public.sedes where id = c.sede_id for update;
  if public.mensajes_del_mes_sede(c.sede_id, p_ahora) >= coalesce(o.whatsapp_mensual, 0) then
    return null;
  end if;

  insert into public.recordatorios_envios as r (optica_id, sede_id, paciente_id, receta_id, vence_en, canal, estado, telefono, intentos, ultimo_intento_en, creado_por)
  values (o.id, c.sede_id, p_paciente, p_receta, c.vence_en, 'automatico', 'pendiente', c.celular, 1, p_ahora, null)
  on conflict on constraint recordatorios_un_envio_por_ciclo do update
     set estado = 'pendiente', intentos = r.intentos + 1, ultimo_intento_en = p_ahora, ultimo_error = null, telefono = excluded.telefono
   where r.canal = 'automatico'
     and ((r.estado = 'fallido' and r.intentos < 3)
          or (r.estado = 'pendiente' and r.ultimo_intento_en < p_ahora - interval '30 minutes'))
  returning * into e;
  if e.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', e.id, 'telefono', e.telefono, 'paciente', c.nombres, 'optica', o.nombre,
    'sede', (select s.nombre from public.sedes s where s.id = e.sede_id),
    'phone_number_id', (select s.whatsapp_phone_number_id from public.sedes s where s.id = e.sede_id));
end $$;

-- 9 ----------------------------------------------------------------------------
-- Pagos de la suscripción e historial (auditoría). Solo inserción.
create table public.suscripcion_pagos (
  id             uuid primary key default gen_random_uuid(),
  optica_id      uuid not null references public.opticas(id),
  monto          numeric(10,2) not null check (monto > 0),
  fecha          date not null,
  medio          text not null check (medio in ('yape', 'transferencia')),
  periodo_desde  date not null,
  periodo_hasta  date not null check (periodo_hasta >= periodo_desde),
  nota           text,
  registrado_por uuid not null,
  creado_en      timestamptz not null default now()
);
create index suscripcion_pagos_por_optica on public.suscripcion_pagos (optica_id, fecha desc);

create table public.suscripcion_eventos (
  id         bigint generated always as identity primary key,
  optica_id  uuid not null references public.opticas(id),
  tipo       text not null check (tipo in ('alta', 'cambio_plan', 'vencimiento', 'pago')),
  antes      jsonb,
  despues    jsonb,
  nota       text,
  usuario_id uuid,
  creado_en  timestamptz not null default now()
);
create index suscripcion_eventos_por_optica on public.suscripcion_eventos (optica_id, creado_en desc);

do $$
declare t text;
begin
  foreach t in array array['suscripcion_pagos', 'suscripcion_eventos'] loop
    execute format('create trigger t_sin_update before update on public.%I for each row execute function public.f_solo_insertar()', t);
    execute format('create trigger t_sin_delete before delete on public.%I for each row execute function public.f_bloquear_delete()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on sequence public.suscripcion_eventos_id_seq from anon, authenticated;

-- Lectura: el superadmin todo; el propietario los de su óptica. Escritura: solo funciones superadmin_*.
create policy pagos_select on public.suscripcion_pagos for select to authenticated
  using (public.es_superadmin() or public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));
create policy eventos_select on public.suscripcion_eventos for select to authenticated
  using (public.es_superadmin() or public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));

-- 10 ---------------------------------------------------------------------------
-- Funciones del superadmin. Solo datos de suscripción: nunca pacientes, recetas ni pedidos.
create function public.exigir_superadmin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el superadmin de la plataforma puede hacer esto' using errcode = '42501';
  end if;
end $$;

create function public.superadmin_opticas()
returns table (
  id uuid, nombre text, ruc text, telefono text, plan text, estado text, vence_el date, dias_para_vencer integer,
  max_usuarios integer, usuarios_activos integer, max_sedes integer, sedes_activas integer, whatsapp_mensual integer,
  propietario text, creada_en timestamptz, ultimo_pago date, ultimo_monto numeric
)
language plpgsql stable security definer set search_path = '' as $$
declare v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform public.exigir_superadmin();
  return query
    select o.id, o.nombre, o.ruc, o.telefono, o.plan, public.estado_suscripcion_de(o.vence_el, v_hoy), o.vence_el,
           (o.vence_el - v_hoy)::integer,
           o.max_usuarios, (select count(*)::integer from public.miembros m where m.optica_id = o.id and m.activo),
           o.max_sedes, (select count(*)::integer from public.sedes s where s.optica_id = o.id and s.activa),
           o.whatsapp_mensual,
           (select u.email::text from public.miembros m join auth.users u on u.id = m.usuario_id
             where m.optica_id = o.id and m.rol = 'propietario' and m.activo order by m.creado_en limit 1),
           o.creada_en,
           (select max(p.fecha) from public.suscripcion_pagos p where p.optica_id = o.id),
           (select p.monto from public.suscripcion_pagos p where p.optica_id = o.id order by p.fecha desc, p.creado_en desc limit 1)
    from public.opticas o
    order by o.vence_el nulls last, o.nombre;
end $$;

create function public.superadmin_crear_optica(p_nombre text, p_email_propietario text, p_plan text, p_vence_el date, p_max_sedes integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
  v_id uuid;
begin
  perform public.exigir_superadmin();
  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email_propietario));
  if v_usuario is null then
    raise exception 'No hay ninguna cuenta con ese correo. El propietario debe crear su cuenta primero.';
  end if;
  insert into public.opticas (nombre, plan, vence_el, max_sedes)
  values (trim(p_nombre), p_plan, p_vence_el, p_max_sedes)
  returning id into v_id;
  insert into public.miembros (optica_id, usuario_id, rol) values (v_id, v_usuario, 'propietario');
  insert into public.suscripcion_eventos (optica_id, tipo, despues, usuario_id)
  select v_id, 'alta', jsonb_build_object('plan', o.plan, 'vence_el', o.vence_el, 'max_usuarios', o.max_usuarios,
                                          'max_sedes', o.max_sedes, 'whatsapp_mensual', o.whatsapp_mensual), auth.uid()
  from public.opticas o where o.id = v_id;
  return v_id;
end $$;

-- Cambia plan y límites. Los límites que no se indican toman los valores del plan.
create function public.superadmin_cambiar_plan(p_optica uuid, p_plan text, p_max_usuarios integer default null,
                                               p_max_sedes integer default null, p_whatsapp_mensual integer default null,
                                               p_nota text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  antes jsonb;
  p public.planes;
begin
  perform public.exigir_superadmin();
  select jsonb_build_object('plan', plan, 'max_usuarios', max_usuarios, 'max_sedes', max_sedes, 'whatsapp_mensual', whatsapp_mensual,
                            'recordatorios_automaticos', recordatorios_automaticos)
    into antes from public.opticas where id = p_optica;
  if antes is null then
    raise exception 'La óptica no existe';
  end if;
  select * into p from public.planes where codigo = p_plan;
  if p.codigo is null then
    raise exception 'Plan inválido';
  end if;
  update public.opticas
     set plan = p_plan,
         max_usuarios = coalesce(p_max_usuarios, p.max_usuarios),
         max_sedes = coalesce(p_max_sedes, p.max_sedes),
         whatsapp_mensual = coalesce(p_whatsapp_mensual, p.whatsapp_mensual),
         -- Sin recordatorios en el plan, el envío automático se apaga.
         recordatorios_automaticos = recordatorios_automaticos and p.incluye_recordatorios
   where id = p_optica;
  insert into public.suscripcion_eventos (optica_id, tipo, antes, despues, nota, usuario_id)
  select p_optica, 'cambio_plan', antes,
         jsonb_build_object('plan', o.plan, 'max_usuarios', o.max_usuarios, 'max_sedes', o.max_sedes, 'whatsapp_mensual', o.whatsapp_mensual,
                            'recordatorios_automaticos', o.recordatorios_automaticos),
         nullif(trim(p_nota), ''), auth.uid()
  from public.opticas o where o.id = p_optica;
end $$;

create function public.superadmin_extender(p_optica uuid, p_vence_el date, p_nota text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_antes date;
begin
  perform public.exigir_superadmin();
  select vence_el into v_antes from public.opticas where id = p_optica for update;
  if not found then
    raise exception 'La óptica no existe';
  end if;
  update public.opticas set vence_el = p_vence_el where id = p_optica;
  insert into public.suscripcion_eventos (optica_id, tipo, antes, despues, nota, usuario_id)
  values (p_optica, 'vencimiento', jsonb_build_object('vence_el', v_antes), jsonb_build_object('vence_el', p_vence_el), nullif(trim(p_nota), ''), auth.uid());
end $$;

-- Registra un pago y, si se pide, extiende el vencimiento hasta el fin del periodo pagado.
create function public.superadmin_registrar_pago(p_optica uuid, p_monto numeric, p_fecha date, p_medio text,
                                                 p_periodo_desde date, p_periodo_hasta date, p_nota text default null,
                                                 p_extender boolean default true)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pago uuid;
  v_antes date;
begin
  perform public.exigir_superadmin();
  select vence_el into v_antes from public.opticas where id = p_optica for update;
  if not found then
    raise exception 'La óptica no existe';
  end if;
  insert into public.suscripcion_pagos (optica_id, monto, fecha, medio, periodo_desde, periodo_hasta, nota, registrado_por)
  values (p_optica, p_monto, p_fecha, p_medio, p_periodo_desde, p_periodo_hasta, nullif(trim(p_nota), ''), auth.uid())
  returning id into v_pago;
  insert into public.suscripcion_eventos (optica_id, tipo, despues, nota, usuario_id)
  values (p_optica, 'pago', jsonb_build_object('pago_id', v_pago, 'monto', p_monto, 'fecha', p_fecha, 'medio', p_medio,
                                               'periodo_desde', p_periodo_desde, 'periodo_hasta', p_periodo_hasta),
          nullif(trim(p_nota), ''), auth.uid());
  if p_extender and (v_antes is null or p_periodo_hasta > v_antes) then
    update public.opticas set vence_el = p_periodo_hasta where id = p_optica;
    insert into public.suscripcion_eventos (optica_id, tipo, antes, despues, nota, usuario_id)
    values (p_optica, 'vencimiento', jsonb_build_object('vence_el', v_antes), jsonb_build_object('vence_el', p_periodo_hasta),
            'Extendido por el pago registrado', auth.uid());
  end if;
  return v_pago;
end $$;

revoke execute on function public.exigir_superadmin(), public.superadmin_opticas(),
  public.superadmin_crear_optica(text, text, text, date, integer),
  public.superadmin_cambiar_plan(uuid, text, integer, integer, integer, text),
  public.superadmin_extender(uuid, date, text),
  public.superadmin_registrar_pago(uuid, numeric, date, text, date, date, text, boolean) from public, anon;
grant execute on function public.superadmin_opticas(),
  public.superadmin_crear_optica(text, text, text, date, integer),
  public.superadmin_cambiar_plan(uuid, text, integer, integer, integer, text),
  public.superadmin_extender(uuid, date, text),
  public.superadmin_registrar_pago(uuid, numeric, date, text, date, date, text, boolean) to authenticated;

-- 11 ---------------------------------------------------------------------------
-- Copia diaria del estado (00:05 de Lima = 05:05 UTC) para listados y avisos.
select cron.schedule(
  'suscripciones-estado-diario',
  '5 5 * * *',
  $cron$
    update public.opticas
       set estado_suscripcion = public.estado_suscripcion_de(vence_el, (now() at time zone 'America/Lima')::date)
     where estado_suscripcion is distinct from public.estado_suscripcion_de(vence_el, (now() at time zone 'America/Lima')::date);
  $cron$
);

-- 12 ---------------------------------------------------------------------------
-- Orden estable de las sedes: "la sede más antigua" (recordatorios) no debe empatar cuando
-- se crean varias en la misma transacción (now() es la hora de inicio de la transacción).
alter table public.sedes alter column creado_en set default clock_timestamp();
