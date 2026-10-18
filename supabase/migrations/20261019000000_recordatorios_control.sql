-- OptiPedidos · Migración 0011 · Recordatorios de control visual anual
-- Sin pérdida de datos: agrega columnas con valores por defecto, un tipo, una tabla, funciones,
-- un trigger y una tarea programada.
--
-- Reglas (acordadas con la óptica):
--   * El ciclo lo define la ÚLTIMA receta vigente del paciente (fecha_examen), no la orden.
--     Vence a los opticas.recordatorio_meses (por defecto 12). Una receta más nueva abre otro ciclo.
--   * Solo con consentimiento de marketing (acepta_recordatorios) y sin baja posterior.
--     La baja detiene solo los recordatorios; el aviso "lentes listos" es transaccional y sigue.
--   * Un recordatorio por ciclo: unique (paciente_id, receta_id). El envío manual (wa.me) también
--     cierra el ciclo, pero no cuenta para el tope.
--   * Sale del número de WhatsApp de la sede de la última evaluación (recetas.sede_id),
--     entre 9:00 y 19:00 de Lima, solo en ópticas con plan Profesional y envío automático activo.
--   * Tope mensual (opticas.tope_mensajes_mes): cuenta todo lo enviado por la API en el mes
--     (avisos "lentes listos" + recordatorios). Al llegar al tope se frenan solo los recordatorios.
--   * "Por recordar este mes": vence este mes, o venció hasta 90 días atrás y aún no tiene envío.
--   * plan y tope_mensajes_mes los cambia solo la plataforma (sin permiso desde la app).

-- 1 ----------------------------------------------------------------------------
-- Consentimiento de marketing del paciente. Las fechas las fija el servidor.
alter table public.pacientes
  add column acepta_recordatorios boolean not null default false,
  add column fecha_consentimiento timestamptz,
  add column fecha_baja timestamptz;

comment on column public.pacientes.acepta_recordatorios is 'Aceptó recordatorios de control visual por WhatsApp (marketing).';
comment on column public.pacientes.fecha_consentimiento is 'Cuándo aceptó los recordatorios (servidor).';
comment on column public.pacientes.fecha_baja is 'Cuándo se dio de baja de los recordatorios: en la app o respondiendo BAJA (servidor).';

create function public.f_paciente_recordatorios() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.fecha_consentimiento := case when new.acepta_recordatorios then now() end;
    new.fecha_baja := null;
    return new;
  end if;
  -- El cliente nunca fija las fechas: solo cambian cuando cambia el consentimiento.
  new.fecha_consentimiento := old.fecha_consentimiento;
  new.fecha_baja := old.fecha_baja;
  if new.acepta_recordatorios and not old.acepta_recordatorios then
    new.fecha_consentimiento := now();
    new.fecha_baja := null;
  elsif not new.acepta_recordatorios and old.acepta_recordatorios then
    new.fecha_baja := now();
  end if;
  return new;
end $$;
create trigger t_consentimiento_recordatorios before insert or update on public.pacientes
  for each row execute function public.f_paciente_recordatorios();
revoke execute on function public.f_paciente_recordatorios() from public, anon, authenticated;

-- 2 ----------------------------------------------------------------------------
-- Sede de la evaluación. Se fija al registrar la receta y no cambia (f_receta_inmutable).
alter table public.recetas add column sede_id uuid;
alter table public.recetas add constraint recetas_sede_fkey foreign key (sede_id, optica_id) references public.sedes (id, optica_id);
comment on column public.recetas.sede_id is 'Sede donde se hizo la evaluación. De ahí sale el recordatorio de control.';
create index recetas_ultima_por_paciente on public.recetas (paciente_id, fecha_examen desc, creado_en desc) where anulada_en is null;

-- Al registrar: si no se indica, la única sede del usuario (puede quedar vacía si tiene varias).
-- Si se indica, debe ser de la óptica, estar activa y el usuario tener acceso.
create function public.f_receta_sede() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sede_id is null then
    new.sede_id := public.sede_por_defecto(new.optica_id);
    return new;
  end if;
  if not exists (select 1 from public.sedes s where s.id = new.sede_id and s.optica_id = new.optica_id and s.activa) then
    raise exception 'La sede no existe o está desactivada';
  end if;
  if auth.uid() is not null and not public.tiene_sede(new.sede_id) then
    raise exception 'No tienes acceso a esa sede' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_0_sede before insert on public.recetas for each row execute function public.f_receta_sede();
revoke execute on function public.f_receta_sede() from public, anon, authenticated;

-- Relleno: sede del último pedido hecho con la receta; si no hay, la sede más antigua de la óptica.
alter table public.recetas disable trigger t_receta_inmutable;
alter table public.recetas disable trigger t_auditar;
update public.recetas r
   set sede_id = coalesce(
     (select o.sede_id from public.ordenes o where o.receta_id = r.id order by o.creado_en desc limit 1),
     (select s.id from public.sedes s where s.optica_id = r.optica_id order by s.activa desc, s.creado_en limit 1))
 where r.sede_id is null;
alter table public.recetas enable trigger t_auditar;
alter table public.recetas enable trigger t_receta_inmutable;

-- 3 ----------------------------------------------------------------------------
alter table public.opticas
  add column recordatorio_meses        smallint not null default 12 check (recordatorio_meses between 1 and 36),
  add column plan                      text not null default 'basico' check (plan in ('basico', 'profesional')),
  add column tope_mensajes_mes         integer not null default 1000 check (tope_mensajes_mes >= 0),
  add column recordatorios_automaticos boolean not null default false;

comment on column public.opticas.recordatorio_meses is 'Meses desde la última evaluación hasta el recordatorio de control.';
comment on column public.opticas.plan is 'Plan contratado. Lo cambia solo la plataforma.';
comment on column public.opticas.tope_mensajes_mes is 'Máximo de mensajes de WhatsApp por API al mes. Lo cambia solo la plataforma.';
comment on column public.opticas.recordatorios_automaticos is 'Envío automático diario de recordatorios (solo plan Profesional).';

-- plan y tope_mensajes_mes quedan sin permiso de edición desde la API.
grant update (recordatorio_meses, recordatorios_automaticos) on public.opticas to authenticated;

create function public.f_optica_recordatorios() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recordatorios_automaticos and not old.recordatorios_automaticos then
    if new.plan <> 'profesional' then
      raise exception 'El envío automático de recordatorios requiere el plan Profesional';
    end if;
    if auth.uid() is not null and not public.tiene_rol(old.id, array['propietario']::public.rol_miembro[]) then
      raise exception 'Solo el propietario activa el envío automático' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger t_recordatorios before update on public.opticas for each row execute function public.f_optica_recordatorios();
revoke execute on function public.f_optica_recordatorios() from public, anon, authenticated;

-- 4 ----------------------------------------------------------------------------
create type public.estado_recordatorio as enum ('pendiente', 'enviado', 'fallido', 'entregado');

create table public.recordatorios_envios (
  id                   uuid primary key default gen_random_uuid(),
  optica_id            uuid not null references public.opticas(id),
  sede_id              uuid not null,
  paciente_id          uuid not null,
  receta_id            uuid not null,
  vence_en             date not null,
  canal                text not null check (canal in ('automatico', 'manual')),
  estado               public.estado_recordatorio not null default 'pendiente',
  telefono             text,
  intentos             integer not null default 0 check (intentos >= 0),
  ultimo_error         text,
  proveedor_mensaje_id text,
  creado_por           uuid default auth.uid(),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  ultimo_intento_en    timestamptz,
  enviado_en           timestamptz,
  entregado_en         timestamptz,
  constraint recordatorios_un_envio_por_ciclo unique (paciente_id, receta_id),
  foreign key (paciente_id, optica_id) references public.pacientes (id, optica_id),
  foreign key (receta_id, optica_id) references public.recetas (id, optica_id),
  foreign key (sede_id, optica_id) references public.sedes (id, optica_id)
);
comment on table public.recordatorios_envios is 'Historial de recordatorios de control: uno por paciente y ciclo (receta).';
create index recordatorios_por_mes on public.recordatorios_envios (optica_id, enviado_en);
create unique index recordatorios_por_mensaje on public.recordatorios_envios (proveedor_mensaje_id) where proveedor_mensaje_id is not null;

create trigger t_actualizado before update on public.recordatorios_envios for each row execute function public.f_actualizado();
create trigger t_sin_delete before delete on public.recordatorios_envios for each row execute function public.f_bloquear_delete();
create trigger t_auditar after insert or update on public.recordatorios_envios for each row execute function public.f_auditar();

-- Lectura por óptica y sede. Sin escrituras desde la API: solo funciones del servidor.
alter table public.recordatorios_envios enable row level security;
revoke all on public.recordatorios_envios from anon, authenticated;
grant select on public.recordatorios_envios to authenticated;
create policy recordatorios_select on public.recordatorios_envios for select to authenticated
  using (public.es_miembro(optica_id) and public.tiene_sede(sede_id));

-- 5 ----------------------------------------------------------------------------
-- Ciclo vigente de cada paciente de una óptica (función interna, sin control de acceso:
-- la usan funciones que ya lo comprueban).
create function public.recordatorios_ciclos(p_optica uuid)
returns table (
  paciente_id uuid, nombres text, apellidos text, telefono text, celular text,
  receta_id uuid, fecha_examen date, vence_en date, sede_id uuid,
  acepta boolean, de_baja boolean, archivado boolean,
  envio_id uuid, envio_estado public.estado_recordatorio, envio_canal text, envio_intentos integer,
  envio_ultimo_intento timestamptz, enviado_en timestamptz
)
language sql stable security definer set search_path = '' as $$
  with ultima as (
    select distinct on (r.paciente_id) r.paciente_id, r.id as receta_id, r.fecha_examen, r.sede_id
    from public.recetas r
    where r.optica_id = p_optica and r.anulada_en is null
    order by r.paciente_id, r.fecha_examen desc, r.creado_en desc
  )
  select p.id, p.nombres, p.apellidos, p.telefono, public.normalizar_celular_pe(p.telefono),
         u.receta_id, u.fecha_examen,
         (u.fecha_examen + make_interval(months => o.recordatorio_meses))::date,
         coalesce(u.sede_id, (select s.id from public.sedes s where s.optica_id = p_optica order by s.activa desc, s.creado_en limit 1)),
         p.acepta_recordatorios,
         p.fecha_baja is not null and (p.fecha_consentimiento is null or p.fecha_baja >= p.fecha_consentimiento),
         p.archivado_en is not null,
         e.id, e.estado, e.canal, e.intentos, e.ultimo_intento_en, e.enviado_en
  from ultima u
  join public.pacientes p on p.id = u.paciente_id
  join public.opticas o on o.id = p_optica
  left join public.recordatorios_envios e on e.paciente_id = u.paciente_id and e.receta_id = u.receta_id
$$;
revoke execute on function public.recordatorios_ciclos(uuid) from public, anon, authenticated;

-- "Pacientes por recordar este mes" para la pantalla. p_sede null = sedes visibles del usuario.
create function public.pacientes_por_recordar(p_optica uuid, p_sede uuid default null, p_hoy date default null)
returns table (
  paciente_id uuid, nombres text, apellidos text, telefono text, celular text,
  receta_id uuid, fecha_examen date, vence_en date, sede_id uuid, sede text, sede_con_whatsapp boolean,
  acepta boolean, de_baja boolean, envio_estado public.estado_recordatorio, envio_canal text, enviado_en timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Lima')::date);
  v_inicio date := date_trunc('month', v_hoy)::date;
  v_fin date := (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date;
begin
  if not public.es_miembro(p_optica) then
    raise exception 'No perteneces a esta óptica' using errcode = '42501';
  end if;
  return query
    select c.paciente_id, c.nombres, c.apellidos, c.telefono, c.celular, c.receta_id, c.fecha_examen, c.vence_en,
           c.sede_id, s.nombre, s.whatsapp_phone_number_id is not null, c.acepta, c.de_baja,
           c.envio_estado, c.envio_canal, c.enviado_en
    from public.recordatorios_ciclos(p_optica) c
    join public.sedes s on s.id = c.sede_id
    where not c.archivado
      and public.tiene_sede(c.sede_id)
      and (p_sede is null or c.sede_id = p_sede)
      and (c.vence_en between v_inicio and v_fin
           or (c.vence_en between v_hoy - 90 and v_inicio - 1 and c.envio_id is null))
    order by c.vence_en, c.apellidos, c.nombres;
end $$;
revoke execute on function public.pacientes_por_recordar(uuid, uuid, date) from public, anon;
grant execute on function public.pacientes_por_recordar(uuid, uuid, date) to authenticated;

-- Mensajes enviados por la API en el mes (hora de Lima) de una óptica: avisos + recordatorios.
create function public.mensajes_del_mes(p_optica uuid, p_ahora timestamptz default now()) returns integer
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_inicio timestamp := date_trunc('month', p_ahora at time zone 'America/Lima');
begin
  if auth.uid() is not null and not public.es_miembro(p_optica) then
    raise exception 'No perteneces a esta óptica' using errcode = '42501';
  end if;
  return (select count(*) from public.notificaciones n
          where n.optica_id = p_optica and n.enviado_en is not null
            and (n.enviado_en at time zone 'America/Lima') >= v_inicio
            and (n.enviado_en at time zone 'America/Lima') < v_inicio + interval '1 month')
       + (select count(*) from public.recordatorios_envios e
          where e.optica_id = p_optica and e.canal = 'automatico' and e.enviado_en is not null
            and (e.enviado_en at time zone 'America/Lima') >= v_inicio
            and (e.enviado_en at time zone 'America/Lima') < v_inicio + interval '1 month');
end $fn$;
revoke execute on function public.mensajes_del_mes(uuid, timestamptz) from public, anon;
grant execute on function public.mensajes_del_mes(uuid, timestamptz) to authenticated, service_role;

-- 6 ----------------------------------------------------------------------------
-- Envío automático (solo service_role: la Edge Function enviar-recordatorios).

-- ¿Se puede enviar automáticamente ahora? (horario de Lima)
create function public.en_horario_recordatorios(p_ahora timestamptz default now()) returns boolean
language sql immutable set search_path = '' as $$
  select extract(hour from p_ahora at time zone 'America/Lima') between 9 and 18
$$;

-- Candidatos a enviar ahora, respetando horario, plan, interruptor y lo que queda del tope.
create function public.recordatorios_para_enviar(p_ahora timestamptz default now(), p_limite integer default 500)
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
      select o.id as optica_id, c.paciente_id, c.receta_id, c.vence_en,
             greatest(o.tope_mensajes_mes - public.mensajes_del_mes(o.id, p_ahora), 0) as disponibles
      from public.opticas o
      cross join lateral public.recordatorios_ciclos(o.id) c
      where o.plan = 'profesional' and o.recordatorios_automaticos
        and not c.archivado and c.acepta and not c.de_baja and c.celular is not null
        and c.vence_en between v_hoy - 90 and v_hoy
        and (c.envio_id is null
             or (c.envio_canal = 'automatico' and c.envio_estado = 'fallido' and c.envio_intentos < 3))
    )
    select x.optica_id, x.paciente_id, x.receta_id
    from (select c.*, row_number() over (partition by c.optica_id order by c.vence_en, c.paciente_id) as n from candidatos c) x
    where x.n <= x.disponibles
    limit p_limite;
end $$;

-- Reclama un envío: vuelve a comprobar todo en la misma transacción y crea (o reabre si falló)
-- la fila del ciclo. Devuelve null si ya no corresponde enviar (otro proceso, baja, tope…).
create function public.reclamar_recordatorio(p_paciente uuid, p_receta uuid, p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  o public.opticas;
  c record;
  e public.recordatorios_envios;
begin
  select optica_id into v_optica from public.pacientes where id = p_paciente;
  -- Bloquea la óptica: serializa el conteo del tope entre envíos simultáneos.
  select * into o from public.opticas where id = v_optica for update;
  if o.id is null or o.plan <> 'profesional' or not o.recordatorios_automaticos
     or not public.en_horario_recordatorios(p_ahora)
     or public.mensajes_del_mes(o.id, p_ahora) >= o.tope_mensajes_mes then
    return null;
  end if;

  select * into c from public.recordatorios_ciclos(o.id) x where x.paciente_id = p_paciente;
  if c.receta_id is distinct from p_receta  -- apareció una receta más nueva: otro ciclo
     or c.archivado or not c.acepta or c.de_baja or c.celular is null
     or c.vence_en > (p_ahora at time zone 'America/Lima')::date then
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

create function public.registrar_recordatorio(p_id uuid, p_ok boolean, p_mensaje_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.recordatorios_envios
     set estado = case when p_ok then 'enviado'::public.estado_recordatorio else 'fallido'::public.estado_recordatorio end,
         proveedor_mensaje_id = case when p_ok then p_mensaje_id else proveedor_mensaje_id end,
         enviado_en = case when p_ok then now() else enviado_en end,
         ultimo_error = case when p_ok then null else left(coalesce(p_error, 'Error desconocido'), 500) end
   where id = p_id and estado = 'pendiente';
end $$;

revoke execute on function public.en_horario_recordatorios(timestamptz) from public, anon;
revoke execute on function public.recordatorios_para_enviar(timestamptz, integer), public.reclamar_recordatorio(uuid, uuid, timestamptz),
                           public.registrar_recordatorio(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.recordatorios_para_enviar(timestamptz, integer), public.reclamar_recordatorio(uuid, uuid, timestamptz),
                          public.registrar_recordatorio(uuid, boolean, text, text), public.recordatorios_ciclos(uuid) to service_role;

-- 7 ----------------------------------------------------------------------------
-- Envío manual desde la pantalla (wa.me desde el teléfono de la sede): cierra el ciclo.
-- Exige consentimiento vigente, acceso a la sede y que el control venza este mes o antes.
create function public.registrar_recordatorio_manual(p_paciente uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  c record;
  v_id uuid;
begin
  select optica_id into v_optica from public.pacientes where id = p_paciente;
  if v_optica is null or not public.es_miembro(v_optica) then
    raise exception 'Paciente no encontrado';
  end if;
  select * into c from public.recordatorios_ciclos(v_optica) x where x.paciente_id = p_paciente;
  if c.receta_id is null then
    raise exception 'El paciente no tiene recetas vigentes';
  end if;
  if not public.tiene_sede(c.sede_id) then
    raise exception 'No tienes acceso a la sede de su última evaluación' using errcode = '42501';
  end if;
  if c.archivado or not c.acepta or c.de_baja then
    raise exception 'El paciente no autorizó recordatorios o se dio de baja';
  end if;
  if c.vence_en > (date_trunc('month', now() at time zone 'America/Lima') + interval '1 month - 1 day')::date then
    raise exception 'Su control aún no vence este mes';
  end if;

  insert into public.recordatorios_envios (optica_id, sede_id, paciente_id, receta_id, vence_en, canal, estado, telefono, enviado_en)
  values (v_optica, c.sede_id, p_paciente, c.receta_id, c.vence_en, 'manual', 'enviado', c.celular, now())
  on conflict on constraint recordatorios_un_envio_por_ciclo do nothing
  returning id into v_id;
  return coalesce(v_id, c.envio_id);
end $$;
revoke execute on function public.registrar_recordatorio_manual(uuid) from public, anon;
grant execute on function public.registrar_recordatorio_manual(uuid) to authenticated;

-- 8 ----------------------------------------------------------------------------
-- Webhook de Meta (solo service_role: la Edge Function whatsapp-webhook).

-- El paciente respondió BAJA al número p_phone_number_id. Se da de baja en las ópticas que usan
-- ese número (sede con ese id, o sedes sin número propio si es el número por defecto).
create function public.registrar_baja_whatsapp(p_phone_number_id text, p_telefono text, p_es_numero_por_defecto boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_celular text := public.normalizar_celular_pe(p_telefono);
  v_total integer;
begin
  if v_celular is null then
    return 0;
  end if;
  update public.pacientes p
     set acepta_recordatorios = false
   where p.acepta_recordatorios
     and public.normalizar_celular_pe(p.telefono) = v_celular
     and p.optica_id in (
       select s.optica_id from public.sedes s
       where s.whatsapp_phone_number_id = p_phone_number_id
          or (p_es_numero_por_defecto and s.whatsapp_phone_number_id is null));
  get diagnostics v_total = row_count;
  return v_total;
end $$;

-- Estado de entrega informado por Meta para un recordatorio.
create function public.actualizar_estado_recordatorio(p_mensaje_id text, p_estado text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado in ('delivered', 'read') then
    update public.recordatorios_envios
       set estado = 'entregado', entregado_en = coalesce(entregado_en, now())
     where proveedor_mensaje_id = p_mensaje_id and estado in ('enviado', 'entregado');
  elsif p_estado = 'failed' then
    update public.recordatorios_envios
       set estado = 'fallido', ultimo_error = left(coalesce(p_error, 'WhatsApp no pudo entregar el mensaje'), 500)
     where proveedor_mensaje_id = p_mensaje_id;
  end if;
end $$;

revoke execute on function public.registrar_baja_whatsapp(text, text, boolean), public.actualizar_estado_recordatorio(text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_baja_whatsapp(text, text, boolean), public.actualizar_estado_recordatorio(text, text, text)
  to service_role;

-- 9 ----------------------------------------------------------------------------
-- Tarea diaria a las 10:00 de Lima (15:00 UTC): llama a la Edge Function enviar-recordatorios.
-- La URL y el secreto compartido se guardan en Supabase Vault (ver README). Sin ellos no hace nada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

select cron.schedule(
  'recordatorios-control-diario',
  '0 15 * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_secreto')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000)
    where exists (select 1 from vault.decrypted_secrets where name = 'recordatorios_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'recordatorios_secreto');
  $cron$
);
