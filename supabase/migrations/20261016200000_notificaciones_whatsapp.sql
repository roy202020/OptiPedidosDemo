-- OptiPedidos · Migración 0005 · Avisos por WhatsApp cuando la orden está lista para entrega
-- Sin pérdida de datos: agrega columnas con valores por defecto, un tipo, una tabla y funciones.
--
-- Flujo:
--   1. La orden pasa a recibida_optica ("Listo para entrega") → el trigger encola un aviso en
--      notificaciones, en la misma transacción. Nunca bloquea el cambio de estado.
--   2. La app invoca la Edge Function enviar-whatsapp, que reclama el aviso de forma atómica
--      (pendiente → enviando), llama a la API de WhatsApp Business (Meta Cloud API) y guarda
--      el resultado. Las credenciales viven solo en los secretos de la función.
--   3. Un aviso fallido u omitido se puede reintentar con reintentar_notificacion().
-- Idempotencia: unique (orden_id, tipo) garantiza un solo aviso por orden.

-- 1 ----------------------------------------------------------------------------
-- Consentimiento: WhatsApp exige que el cliente acepte recibir mensajes (opt-in).
alter table public.pacientes
  add column acepta_whatsapp boolean not null default false,
  add column whatsapp_consentimiento_en timestamptz;

comment on column public.pacientes.acepta_whatsapp is 'El paciente aceptó recibir avisos por WhatsApp.';
comment on column public.pacientes.whatsapp_consentimiento_en is 'Cuándo se registró el consentimiento (lo asigna el servidor).';

create function public.f_paciente_consentimiento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.acepta_whatsapp and (tg_op = 'INSERT' or not old.acepta_whatsapp) then
    new.whatsapp_consentimiento_en := now();
  elsif not new.acepta_whatsapp then
    new.whatsapp_consentimiento_en := null;
  else
    new.whatsapp_consentimiento_en := old.whatsapp_consentimiento_en;
  end if;
  return new;
end $$;
create trigger t_consentimiento before insert or update on public.pacientes
  for each row execute function public.f_paciente_consentimiento();
revoke execute on function public.f_paciente_consentimiento() from public, anon, authenticated;

-- 2 ----------------------------------------------------------------------------
-- Teléfonos de Perú a formato internacional sin "+": 987654321 → 51987654321.
-- Devuelve null si no parece un celular válido (WhatsApp requiere celular).
create function public.normalizar_celular_pe(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^9[0-9]{8}$' then '51' || d
    when d ~ '^519[0-9]{8}$' then d
    when d ~ '^00519[0-9]{8}$' then substr(d, 3)
    else null
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- 3 ----------------------------------------------------------------------------
create type public.estado_notificacion as enum ('pendiente', 'enviando', 'enviada', 'fallida', 'omitida');

create table public.notificaciones (
  id                   uuid primary key default gen_random_uuid(),
  optica_id            uuid not null references public.opticas(id),
  orden_id             uuid not null,
  paciente_id          uuid not null,
  canal                text not null default 'whatsapp' check (canal in ('whatsapp')),
  tipo                 text not null default 'orden_lista' check (tipo in ('orden_lista')),
  telefono             text,
  estado               public.estado_notificacion not null default 'pendiente',
  intentos             integer not null default 0 check (intentos >= 0),
  ultimo_error         text,
  proveedor_mensaje_id text,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  ultimo_intento_en    timestamptz,
  enviado_en           timestamptz,
  unique (orden_id, tipo),
  foreign key (orden_id, optica_id) references public.ordenes (id, optica_id),
  foreign key (paciente_id, optica_id) references public.pacientes (id, optica_id),
  check (estado <> 'pendiente' or telefono is not null),
  check (estado <> 'enviada' or (enviado_en is not null and proveedor_mensaje_id is not null))
);
create index notificaciones_por_estado on public.notificaciones (optica_id, estado, creado_en desc);

create trigger t_actualizado before update on public.notificaciones for each row execute function public.f_actualizado();
create trigger t_sin_delete before delete on public.notificaciones for each row execute function public.f_bloquear_delete();

-- Lectura para los miembros de la óptica. Sin escritura desde la API: solo el trigger,
-- reintentar_notificacion() y la Edge Function (con la clave de servicio) cambian avisos.
alter table public.notificaciones enable row level security;
revoke all on public.notificaciones from anon, authenticated;
grant select on public.notificaciones to authenticated;
create policy notificaciones_select on public.notificaciones for select to authenticated
  using (public.es_miembro(optica_id));

-- 4 ----------------------------------------------------------------------------
-- Calcula teléfono y estado inicial de un aviso según los datos actuales del paciente.
create function public.preparar_aviso(p_paciente uuid, out telefono text, out estado public.estado_notificacion, out motivo text)
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.pacientes;
begin
  select * into p from public.pacientes where id = p_paciente;
  telefono := public.normalizar_celular_pe(p.telefono);
  if not coalesce(p.acepta_whatsapp, false) then
    estado := 'omitida';
    motivo := 'El paciente no autorizó avisos por WhatsApp';
  elsif telefono is null then
    estado := 'omitida';
    motivo := 'El teléfono del paciente no es un celular válido de Perú';
  else
    estado := 'pendiente';
    motivo := null;
  end if;
end $$;
revoke execute on function public.preparar_aviso(uuid) from public, anon, authenticated;

create function public.f_orden_encolar_aviso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  if new.estado = 'recibida_optica' and old.estado is distinct from new.estado then
    select * into a from public.preparar_aviso(new.paciente_id);
    insert into public.notificaciones (optica_id, orden_id, paciente_id, telefono, estado, ultimo_error)
    values (new.optica_id, new.id, new.paciente_id, a.telefono, a.estado, a.motivo)
    on conflict (orden_id, tipo) do nothing;
  end if;
  return null;
end $$;
create trigger t_encolar_aviso after update of estado on public.ordenes
  for each row execute function public.f_orden_encolar_aviso();
revoke execute on function public.f_orden_encolar_aviso() from public, anon, authenticated;

-- Reintento manual: vuelve a pendiente un aviso fallido u omitido, recalculando teléfono y
-- consentimiento (por si se corrigieron los datos del paciente). Devuelve el estado resultante.
create function public.reintentar_notificacion(p_id uuid) returns public.estado_notificacion
language plpgsql security definer set search_path = '' as $$
declare
  n public.notificaciones;
  a record;
begin
  select * into n from public.notificaciones where id = p_id for update;
  if n.id is null or not public.es_miembro(n.optica_id) then
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
revoke execute on function public.reintentar_notificacion(uuid) from public, anon;
grant execute on function public.reintentar_notificacion(uuid) to authenticated;

-- Auditoría de los avisos (quién reintentó, resultados del proveedor).
create trigger t_auditar after insert or update on public.notificaciones
  for each row execute function public.f_auditar();

-- 5 ----------------------------------------------------------------------------
-- Funciones para la Edge Function enviar-whatsapp (solo service_role).

-- Reclama un aviso para enviarlo: pendiente → enviando, de forma atómica (dos invocaciones
-- simultáneas no envían dos veces). Recupera avisos que quedaron en "enviando" más de 5 minutos
-- (por ejemplo, si la función se cortó). Devuelve null si no hay nada que enviar.
create function public.reclamar_notificacion(p_id uuid) returns jsonb
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
    'optica', (select o.nombre from public.opticas o where o.id = n.optica_id));
end $$;

-- Guarda el resultado de un intento de envío.
create function public.registrar_envio(p_id uuid, p_ok boolean, p_mensaje_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notificaciones
     set estado = case when p_ok then 'enviada'::public.estado_notificacion else 'fallida'::public.estado_notificacion end,
         proveedor_mensaje_id = case when p_ok then p_mensaje_id else proveedor_mensaje_id end,
         enviado_en = case when p_ok then now() else enviado_en end,
         ultimo_error = case when p_ok then null else left(coalesce(p_error, 'Error desconocido'), 500) end
   where id = p_id and estado = 'enviando';
end $$;

revoke execute on function public.reclamar_notificacion(uuid), public.registrar_envio(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.reclamar_notificacion(uuid), public.registrar_envio(uuid, boolean, text, text)
  to service_role;
