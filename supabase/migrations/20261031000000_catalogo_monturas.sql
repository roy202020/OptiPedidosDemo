create table public.monturas (
  id uuid primary key default gen_random_uuid(),
  optica_id uuid not null references public.opticas(id),
  nombre text not null check (length(trim(nombre)) between 1 and 160),
  codigo text check (codigo is null or length(codigo) between 1 and 60),
  precio numeric(10,2) not null check (precio >= 0 and precio <= 99999999),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (optica_id,id), unique (optica_id,codigo)
);
alter table public.monturas enable row level security;
revoke all on public.monturas from anon, authenticated;
grant select, insert on public.monturas to authenticated;
grant update(nombre,codigo,precio,activo) on public.monturas to authenticated;
create policy monturas_select on public.monturas for select to authenticated using (optica_id in (select public.mis_opticas()));
create policy monturas_insert on public.monturas for insert to authenticated with check (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create policy monturas_update on public.monturas for update to authenticated using (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[]))) with check (optica_id in (select public.mis_opticas_con_rol(array['propietario','administrador']::public.rol_miembro[])));
create trigger t_00_suscripcion before insert or update on public.monturas for each row execute function public.f_exigir_suscripcion();
create trigger t_actualizado before update on public.monturas for each row execute function public.f_actualizado();
create trigger t_auditar after insert or update or delete on public.monturas for each row execute function public.f_auditar();
alter table public.ordenes add column montura_catalogo_id uuid;
alter table public.ordenes add constraint ordenes_montura_optica_fk foreign key(optica_id,montura_catalogo_id) references public.monturas(optica_id,id);
create index ordenes_montura_catalogo_idx on public.ordenes(montura_catalogo_id) where montura_catalogo_id is not null;

-- Validación dentro de la misma transacción de creación/edición, también para llamadas directas al RPC.
create function public.f_orden_montura_catalogo() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_montura public.monturas%rowtype;
begin
  if new.montura_catalogo_id is null then return new; end if;
  if tg_op='UPDATE' then
    if new.montura_catalogo_id is not distinct from old.montura_catalogo_id then
      if new.precio_montura is distinct from old.precio_montura then
        raise exception 'El precio de esta montura se conserva del pedido. Para un precio acordado, elige ingreso manual.';
      end if;
      new.montura_descripcion := old.montura_descripcion;
      new.montura_origen := 'optica';
      return new;
    end if;
  end if;
  select * into v_montura from public.monturas where id=new.montura_catalogo_id and optica_id=new.optica_id and activo;
  if not found then raise exception 'La montura no está disponible en el catálogo de esta óptica'; end if;
  if new.precio_montura is distinct from v_montura.precio then
    raise exception 'El precio de la montura cambió. Recarga el catálogo antes de guardar.';
  end if;
  new.montura_descripcion := v_montura.nombre;
  new.montura_origen := 'optica';
  return new;
end $$;
revoke all on function public.f_orden_montura_catalogo() from public, anon;
create trigger t_02_montura_catalogo before insert or update on public.ordenes for each row execute function public.f_orden_montura_catalogo();

create or replace function public.crear_orden(
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
  v_elegidos jsonb := p_ojos -> '_ojos';
begin
  if p_ojos ? '_ojos' then
    if jsonb_typeof(v_elegidos) is distinct from 'array' then
      raise exception 'Selecciona uno o dos ojos válidos';
    end if;
    if jsonb_array_length(v_elegidos) not between 1 and 2
       or exists (select 1 from jsonb_array_elements_text(v_elegidos) e where e not in ('OD','OI'))
       or (select count(distinct e) from jsonb_array_elements_text(v_elegidos) e) <> jsonb_array_length(v_elegidos) then
      raise exception 'Selecciona uno o dos ojos válidos';
    end if;
  end if;
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
                              precio, descuento, precio_montura, montura_catalogo_id)
  values (v_optica, p_sede, p_paciente, p_receta, p_laboratorio, p_tipo_trabajo,
          nullif(trim(p_montura_descripcion), ''), nullif(p_montura_origen, ''), p_fecha_entrega, p_prioridad,
          coalesce(p_precio, 0), coalesce(p_descuento, 0), coalesce((p_ojos ->> '_precio_montura')::numeric, 0), nullif(p_ojos ->> '_montura_catalogo_id','')::uuid)
  returning id into v_orden;

  if v_elegidos is null or v_elegidos ? 'OD' then
    perform public.insertar_orden_ojo(v_orden, 'OD', coalesce(p_ojos -> 'OD', '{}'));
  end if;
  if v_elegidos is null or v_elegidos ? 'OI' then
    perform public.insertar_orden_ojo(v_orden, 'OI', coalesce(p_ojos -> 'OI', '{}'));
  end if;
  if v_elegidos is not null and (select count(*) from public.orden_ojos where orden_id = v_orden) <> jsonb_array_length(v_elegidos) then
    raise exception 'La receta no tiene graduación para el ojo seleccionado';
  end if;

  if length(trim(coalesce(p_observacion, ''))) > 0 then
    insert into public.orden_observaciones (optica_id, orden_id, texto) values (v_optica, v_orden, trim(p_observacion));
  end if;

  return v_orden;
end $$;

create or replace function public.actualizar_orden_borrador(
  p_orden               uuid,
  p_laboratorio         uuid,
  p_tipo_trabajo        text,
  p_montura_descripcion text,
  p_montura_origen      text,
  p_fecha_entrega       date,
  p_prioridad           text,
  p_ojos                jsonb default '{}',
  p_precio              numeric default null,
  p_descuento           numeric default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_optica uuid;
  v_ojo    public.ojo;
  v_specs  jsonb;
begin
  select optica_id into v_optica from public.ordenes where id = p_orden;
  if v_optica is null then
    raise exception 'La orden no existe';
  end if;
  if not exists (select 1 from public.laboratorios where id = p_laboratorio and optica_id = v_optica and activo) then
    raise exception 'El laboratorio no existe o está inactivo';
  end if;
  if p_fecha_entrega is not null and p_fecha_entrega < current_date then
    raise exception 'La fecha prometida no puede estar en el pasado';
  end if;

  update public.ordenes set
    laboratorio_id          = p_laboratorio,
    tipo_trabajo            = p_tipo_trabajo,
    montura_descripcion     = nullif(trim(p_montura_descripcion), ''),
    montura_origen          = nullif(p_montura_origen, ''),
    fecha_entrega_prometida = p_fecha_entrega,
    prioridad               = p_prioridad,
    precio                  = coalesce(p_precio, precio),
    montura_catalogo_id     = case when p_ojos ? '_montura_catalogo_id' then nullif(p_ojos ->> '_montura_catalogo_id','')::uuid else montura_catalogo_id end,
    precio_montura          = case when p_ojos ? '_precio_montura' then coalesce((p_ojos ->> '_precio_montura')::numeric, 0) else precio_montura end,
    descuento               = coalesce(p_descuento, descuento)
  where id = p_orden;

  foreach v_ojo in array array['OD', 'OI']::public.ojo[] loop
    v_specs := coalesce(p_ojos -> v_ojo::text, '{}');
    update public.orden_ojos set
      material      = nullif(v_specs ->> 'material', ''),
      indice        = nullif(v_specs ->> 'indice', '')::numeric,
      diseno        = nullif(v_specs ->> 'diseno', ''),
      tratamientos  = coalesce(array(select jsonb_array_elements_text(coalesce(v_specs -> 'tratamientos', '[]'))), '{}'),
      tinte         = nullif(v_specs ->> 'tinte', ''),
      diametro_mm   = nullif(v_specs ->> 'diametro_mm', '')::smallint,
      observaciones = nullif(v_specs ->> 'observaciones', '')
    where orden_id = p_orden and ojo = v_ojo;
  end loop;
end $$;
