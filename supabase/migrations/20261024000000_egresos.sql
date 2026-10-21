-- OptiPedidos · Migración 0016 · Egresos generales de la sede (servicios, alquiler, sueldos, movilidad…)
-- Sin cambios destructivos: una tabla nueva, una columna en caja_movimientos, funciones y políticas.
-- Mismo patrón que los pagos a laboratorios (0013): el egreso en efectivo crea un movimiento en la caja abierta.
--
-- Reglas (acordadas con la óptica):
--   * Egreso: fecha, monto, categoría, concepto, medio, n.º de comprobante, foto del recibo, usuario y sede.
--   * En efectivo de caja sale de la caja abierta de la sede (sin caja abierta no se permite);
--     por Yape, Plin, transferencia, tarjeta u otro es un gasto de la sede que no toca la caja.
--   * Nada se borra: se anula con motivo (y su movimiento de caja también). Todo queda en la auditoría.
--   * Registran, anulan y ven egresos el propietario y el administrador de la sede.

-- 1 ----------------------------------------------------------------------------
create table public.egresos (
  id                 uuid primary key default gen_random_uuid(),
  optica_id          uuid not null references public.opticas(id),
  sede_id            uuid not null references public.sedes(id),
  fecha              date not null,
  monto              numeric(10,2) not null check (monto > 0),
  categoria          text not null check (categoria in ('servicios', 'alquiler', 'sueldos', 'movilidad', 'compras', 'otros')),
  concepto           text not null check (length(trim(concepto)) between 1 and 300),
  medio              text not null check (medio in ('efectivo_caja', 'yape', 'plin', 'transferencia', 'tarjeta', 'otro')),
  numero_comprobante text check (numero_comprobante is null or length(numero_comprobante) <= 60),
  foto_path          text,
  registrado_por     uuid,
  creado_en          timestamptz not null default now(),
  anulado_en         timestamptz,
  anulado_por        uuid,
  motivo_anulacion   text,
  check (anulado_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
comment on table public.egresos is 'Gastos de la sede. En efectivo de caja también generan un egreso en caja_movimientos. Se anulan con motivo.';
create index egresos_por_sede on public.egresos (sede_id, fecha desc);
create index egresos_por_optica on public.egresos (optica_id, fecha desc);

alter table public.caja_movimientos add column egreso_id uuid references public.egresos(id);

create trigger t_00_suscripcion before insert or update on public.egresos for each row execute function public.f_exigir_suscripcion();
create trigger t_sin_delete before delete on public.egresos for each row execute function public.f_bloquear_delete();
create trigger t_auditar after insert or update or delete on public.egresos for each row execute function public.f_auditar();
alter table public.egresos enable row level security;
revoke all on public.egresos from anon, authenticated;
grant select on public.egresos to authenticated;
create policy egresos_select on public.egresos for select to authenticated using (public.gestiona_sede(optica_id, sede_id));

-- 2 ----------------------------------------------------------------------------
-- Fotos de comprobantes de egresos: misma carpeta privada, {optica}/{sede}/egresos/…, solo propietario y administrador.
create or replace function public.puede_archivo_laboratorio(p_nombre text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_partes text[] := string_to_array(p_nombre, '/');
  v_optica uuid;
  v_sede uuid;
begin
  if array_length(v_partes, 1) <> 4 or v_partes[3] not in ('tickets', 'pagos', 'egresos') then
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

-- 3 ----------------------------------------------------------------------------
create function public.registrar_egreso(
  p_sede uuid, p_fecha date, p_monto numeric, p_categoria text, p_concepto text, p_medio text,
  p_numero_comprobante text default null, p_foto text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_optica uuid;
  v_caja uuid;
  v_id uuid := gen_random_uuid();
begin
  select optica_id into v_optica from public.sedes where id = p_sede;
  if v_optica is null or not public.gestiona_sede(v_optica, p_sede) then
    raise exception 'Solo el propietario o un administrador de la sede registran egresos' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > (now() at time zone 'America/Lima')::date then
    raise exception 'La fecha del egreso no puede estar en el futuro';
  end if;
  if p_medio = 'efectivo_caja' then
    select id into v_caja from public.cajas where sede_id = p_sede and cerrada_en is null for update;
    if v_caja is null then
      raise exception 'No hay una caja abierta en esta sede: ábrela o elige otro medio de pago';
    end if;
  end if;

  insert into public.egresos (id, optica_id, sede_id, fecha, monto, categoria, concepto, medio, numero_comprobante, foto_path, registrado_por)
  values (v_id, v_optica, p_sede, p_fecha, p_monto, p_categoria, trim(p_concepto), p_medio, nullif(trim(p_numero_comprobante), ''),
          public.exigir_ruta_foto(p_foto, v_optica, p_sede, 'egresos'), auth.uid());

  if v_caja is not null then
    insert into public.caja_movimientos (optica_id, sede_id, caja_id, tipo, monto, concepto, egreso_id, creado_por)
    values (v_optica, p_sede, v_caja, 'egreso', p_monto, format('Egreso (%s): %s', p_categoria, trim(p_concepto)), v_id, auth.uid());
  end if;
  return v_id;
end $$;

create function public.anular_egreso(p_egreso uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.egresos;
begin
  select * into e from public.egresos where id = p_egreso for update;
  if e.id is null or not public.gestiona_sede(e.optica_id, e.sede_id) then
    raise exception 'Solo el propietario o un administrador de la sede anulan egresos' using errcode = '42501';
  end if;
  if e.anulado_en is not null then
    raise exception 'El egreso ya está anulado';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Indica el motivo de la anulación';
  end if;
  update public.egresos set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo) where id = e.id;
  update public.caja_movimientos set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = 'Egreso anulado: ' || trim(p_motivo)
   where egreso_id = e.id and anulado_en is null;
end $$;

revoke execute on function public.registrar_egreso(uuid, date, numeric, text, text, text, text, text), public.anular_egreso(uuid, text)
  from public, anon;
grant execute on function public.registrar_egreso(uuid, date, numeric, text, text, text, text, text), public.anular_egreso(uuid, text)
  to authenticated;
