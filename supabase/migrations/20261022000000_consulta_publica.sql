-- OptiPedidos · Migración 0014 · Consulta pública del estado del pedido
-- Sin pérdida de datos: columnas nuevas (rellenadas), una tabla interna y funciones nuevas.
--
--   * Cada orden tiene un código de consulta aleatorio (12 caracteres de un alfabeto sin
--     caracteres confusos: sin 0/O, 1/I/L). No deriva del número ni del id de la orden.
--   * El cliente final consulta sin sesión con consulta_estado_publico(): SECURITY DEFINER,
--     devuelve solo los campos permitidos (nunca receta, medidas, documento, teléfono del
--     paciente ni apellidos). Las tablas siguen cerradas para anon.
--   * El enlace deja de funcionar si la orden se anula o 30 días después de la entrega. Si no
--     existe, expiró o está anulada, la respuesta es idéntica (null).
--   * Límite de intentos: 20 por minuto por IP (hash) y 600 por minuto en total, para que nadie
--     pueda adivinar códigos aunque llame a la API directamente inventando IPs.
--   * Solo propietario y administrador (de la sede de la orden) regeneran el código.
--   * Cada sede puede indicar su horario de atención (texto libre, opcional).

-- 1 ----------------------------------------------------------------------------
alter table public.sedes add column horario text check (horario is null or length(trim(horario)) between 1 and 120);
comment on column public.sedes.horario is 'Horario de atención que ve el cliente en la consulta pública (texto libre).';
grant insert (horario), update (horario) on public.sedes to authenticated;

-- 2 ----------------------------------------------------------------------------
-- Alfabeto de 31 símbolos; 12 caracteres ≈ 7,9·10^17 combinaciones.
create function public.generar_codigo_consulta() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_codigo text := '';
  v_bytes bytea;
  v_b integer;
  i integer;
begin
  while length(v_codigo) < 12 loop
    v_bytes := extensions.gen_random_bytes(32);
    for i in 0 .. 31 loop
      v_b := get_byte(v_bytes, i);
      -- Muestreo por rechazo: 248 = 31 · 8, así cada símbolo tiene la misma probabilidad.
      if v_b < 248 and length(v_codigo) < 12 then
        v_codigo := v_codigo || substr(v_alfabeto, (v_b % 31) + 1, 1);
      end if;
    end loop;
  end loop;
  return v_codigo;
end $$;
revoke execute on function public.generar_codigo_consulta() from public, anon, authenticated;

alter table public.ordenes add column codigo_consulta text;
comment on column public.ordenes.codigo_consulta is 'Código aleatorio de la consulta pública del estado. Solo lo cambia regenerar_codigo_consulta().';

-- Relleno de las órdenes existentes sin pasar por los triggers de control (la orden no cambia).
alter table public.ordenes disable trigger user;
update public.ordenes set codigo_consulta = public.generar_codigo_consulta() where codigo_consulta is null;
alter table public.ordenes enable trigger user;

-- Sin valor por defecto: lo asigna el trigger t_codigo_consulta (el generador no es ejecutable
-- por los usuarios, y un default se evalúa con los permisos de quien inserta).
alter table public.ordenes
  alter column codigo_consulta set not null,
  add constraint ordenes_codigo_consulta_formato check (codigo_consulta ~ '^[2-9A-HJKMNP-Z]{12}$');
create unique index ordenes_codigo_consulta on public.ordenes (codigo_consulta);

-- El código lo genera siempre la base y solo cambia desde regenerar_codigo_consulta().
create function public.f_orden_codigo_consulta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.codigo_consulta := public.generar_codigo_consulta();
  elsif new.codigo_consulta is distinct from old.codigo_consulta
        and coalesce(current_setting('optipedidos.regenerar_codigo', true), '') <> 'si' then
    raise exception 'El código de consulta solo se cambia regenerándolo' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.f_orden_codigo_consulta() from public, anon, authenticated;
create trigger t_codigo_consulta before insert or update on public.ordenes
  for each row execute function public.f_orden_codigo_consulta();

-- f_orden_controlar: igual que en la migración 0004, pero el código de consulta puede cambiar
-- (regenerarse) aunque la orden ya no esté en borrador.
create or replace function public.f_orden_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT'
      or new.receta_id is distinct from old.receta_id
      or new.paciente_id is distinct from old.paciente_id)
     and not exists (select 1 from public.recetas r
                     where r.id = new.receta_id and r.paciente_id = new.paciente_id
                       and r.anulada_en is null) then
    raise exception 'La receta no pertenece al paciente o está anulada';
  end if;

  if tg_op = 'INSERT' then
    new.numero := public.siguiente_numero_orden(new.optica_id);
    new.estado := 'borrador';
    new.anulada_en := null;
    new.confirmada_en := null;
    return new;
  end if;

  -- confirmada_en solo lo cambia el servidor, nunca el cliente.
  new.confirmada_en := old.confirmada_en;

  if new.id <> old.id or new.optica_id <> old.optica_id or new.numero <> old.numero then
    raise exception 'id, óptica y número de la orden no pueden cambiar';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_estado t
                   where t.desde = old.estado and t.hasta = new.estado) then
      raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
    end if;
    if new.estado = 'anulada' then new.anulada_en := now(); end if;
    if old.estado = 'borrador' and new.estado <> 'anulada' then new.confirmada_en := now(); end if;
    if new.estado = 'borrador' then new.confirmada_en := null; end if;
    insert into public.orden_historial_estados (optica_id, orden_id, desde, hasta, usuario_id)
    values (new.optica_id, new.id, old.estado, new.estado, auth.uid());
  end if;

  if old.estado <> 'borrador' and
     (to_jsonb(new) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en' - 'codigo_consulta')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en' - 'confirmada_en' - 'codigo_consulta') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

-- 3 ----------------------------------------------------------------------------
-- Regenerar el código (si se filtró): propietario o administrador con acceso a la sede.
create function public.regenerar_codigo_consulta(p_orden uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_orden public.ordenes;
  v_codigo text;
begin
  select * into v_orden from public.ordenes o where o.id = p_orden;
  if v_orden.id is null or not public.tiene_sede(v_orden.sede_id) then
    raise exception 'Orden no encontrada' using errcode = '42501';
  end if;
  if not public.tiene_rol(v_orden.optica_id, array['propietario', 'administrador']::public.rol_miembro[]) then
    raise exception 'Solo el propietario o un administrador regeneran el código de consulta' using errcode = '42501';
  end if;
  if v_orden.estado = 'anulada' then
    raise exception 'La orden está anulada: su consulta pública ya no funciona';
  end if;

  perform set_config('optipedidos.regenerar_codigo', 'si', true);
  update public.ordenes set codigo_consulta = public.generar_codigo_consulta()
   where id = p_orden returning codigo_consulta into v_codigo;
  perform set_config('optipedidos.regenerar_codigo', '', true);
  return v_codigo;
end $$;
revoke execute on function public.regenerar_codigo_consulta(uuid) from public, anon;
grant execute on function public.regenerar_codigo_consulta(uuid) to authenticated;

-- 4 ----------------------------------------------------------------------------
-- Intentos de la consulta pública por ventana de un minuto. Solo la usa la función pública.
create table public.consultas_publicas_intentos (
  clave    text not null,          -- sha256 de la IP, o '*' para el total
  ventana  timestamptz not null,   -- inicio del minuto
  intentos integer not null default 0,
  primary key (clave, ventana)
);
comment on table public.consultas_publicas_intentos is 'Contador de consultas públicas por IP (hash) y minuto, para limitar intentos.';
alter table public.consultas_publicas_intentos enable row level security;
revoke all on public.consultas_publicas_intentos from public, anon, authenticated;

-- 5 ----------------------------------------------------------------------------
-- Consulta pública. Devuelve null si el código no existe, la orden está anulada o pasaron
-- 30 días desde la entrega; {"limitado": true} si se superó el límite de intentos.
create function public.consulta_estado_publico(p_codigo text, p_ip text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ventana timestamptz := date_trunc('minute', now());
  v_clave text := encode(extensions.digest(coalesce(nullif(trim(p_ip), ''), 'desconocida'), 'sha256'), 'hex');
  v_ip integer;
  v_total integer;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'));
  v_orden public.ordenes;
  v_entregada_en timestamptz;
begin
  delete from public.consultas_publicas_intentos where ventana < v_ventana - interval '5 minutes';
  insert into public.consultas_publicas_intentos as c (clave, ventana, intentos) values (v_clave, v_ventana, 1)
    on conflict (clave, ventana) do update set intentos = c.intentos + 1 returning intentos into v_ip;
  insert into public.consultas_publicas_intentos as c (clave, ventana, intentos) values ('*', v_ventana, 1)
    on conflict (clave, ventana) do update set intentos = c.intentos + 1 returning intentos into v_total;
  if v_ip > 20 or v_total > 600 then
    return jsonb_build_object('limitado', true);
  end if;

  if v_codigo !~ '^[2-9A-HJKMNP-Z]{12}$' then
    return null;
  end if;
  select * into v_orden from public.ordenes o where o.codigo_consulta = v_codigo;
  if v_orden.id is null or v_orden.estado = 'anulada' then
    return null;
  end if;
  if v_orden.estado = 'entregada' then
    v_entregada_en := coalesce(
      (select max(h.creado_en) from public.orden_historial_estados h where h.orden_id = v_orden.id and h.hasta = 'entregada'),
      v_orden.actualizado_en);
    if v_entregada_en < now() - interval '30 days' then
      return null;
    end if;
  end if;

  return (
    select jsonb_build_object(
      'optica', op.nombre,
      'sede', s.nombre,
      'direccion', coalesce(s.direccion, op.direccion),
      'horario', s.horario,
      'whatsapp', public.normalizar_celular_pe(coalesce(s.telefono, op.telefono)),
      'numero', v_orden.numero,
      'paciente', split_part(trim(p.nombres), ' ', 1),
      'estado', v_orden.estado,
      'actualizado_en', coalesce(
        (select max(h.creado_en) from public.orden_historial_estados h where h.orden_id = v_orden.id), v_orden.creado_en),
      'fecha_prometida', v_orden.fecha_entrega_prometida,
      'entregada_en', v_entregada_en,
      'saldo', greatest(0, v_orden.precio - v_orden.descuento - coalesce(
        (select sum(pg.importe) from public.orden_pagos pg where pg.orden_id = v_orden.id and pg.anulado_en is null), 0))::numeric(10,2))
    from public.opticas op
    join public.sedes s on s.id = v_orden.sede_id
    join public.pacientes p on p.id = v_orden.paciente_id
    where op.id = v_orden.optica_id
  );
end $$;
comment on function public.consulta_estado_publico(text, text) is 'Estado de un pedido para el cliente final, por código de consulta. Única función pública (anon).';
revoke execute on function public.consulta_estado_publico(text, text) from public;
grant execute on function public.consulta_estado_publico(text, text) to anon, authenticated;

-- 6 ----------------------------------------------------------------------------
-- Endurecimiento: funciones de trigger que seguían ejecutables por anon (por los permisos por
-- defecto). Un trigger no necesita EXECUTE de quien modifica la tabla, así que no cambia nada.
revoke execute on function public.f_orden_controlar(), public.f_auditar(), public.f_orden_ojos_controlar() from public, anon;
