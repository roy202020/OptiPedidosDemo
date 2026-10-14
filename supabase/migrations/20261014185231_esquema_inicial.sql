-- OptiPedidos · Migración 0001 · Esquema inicial (PostgreSQL / Supabase)
-- Estado: BORRADOR DE DISEÑO. No ejecutado ni probado todavía.
-- Ejecutar solo en un proyecto Supabase de desarrollo con datos ficticios.

-- =========================================================
-- 1. Tipos y dominios (validación clínica reutilizable)
-- =========================================================
create type rol_miembro  as enum ('propietario', 'administrador', 'operador');
create type estado_orden as enum (
  'borrador', 'enviada', 'recibida_lab', 'en_proceso',
  'lista', 'recibida_optica', 'entregada', 'anulada'
);
create type ojo as enum ('OD', 'OI');

-- numeric conserva el signo y el valor exacto (no se guarda como texto ni float)
create domain d_esfera   as numeric(4,2) check (value between -20 and 20 and value * 4 = trunc(value * 4));
create domain d_cilindro as numeric(4,2) check (value between -10 and 10 and value * 4 = trunc(value * 4));
create domain d_eje      as smallint     check (value between 0 and 180);
create domain d_adicion  as numeric(3,2) check (value between 0.25 and 4 and value * 4 = trunc(value * 4));
create domain d_mm       as numeric(3,1) check (value between 0 and 60);
create domain d_prisma   as numeric(3,1) check (value between 0 and 20);

-- =========================================================
-- 2. Tablas de tenant y membresía
-- =========================================================
create table opticas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  ruc           text check (ruc ~ '^[0-9]{11}$'),
  telefono      text,
  direccion     text,
  creada_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table miembros (
  optica_id   uuid not null references opticas(id),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  rol         rol_miembro not null default 'operador',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  primary key (optica_id, usuario_id)
);
create index on miembros (usuario_id);

-- =========================================================
-- 3. Funciones auxiliares de seguridad
-- =========================================================
create function public.es_miembro(p_optica uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
    where m.optica_id = p_optica and m.usuario_id = auth.uid() and m.activo
  );
$$;

create function public.tiene_rol(p_optica uuid, p_roles public.rol_miembro[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
    where m.optica_id = p_optica and m.usuario_id = auth.uid()
      and m.activo and m.rol = any (p_roles)
  );
$$;

-- Alta de una óptica + primer propietario (única vía para crear un tenant)
create function public.crear_optica(p_nombre text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  insert into public.opticas (nombre) values (p_nombre) returning id into v_id;
  insert into public.miembros (optica_id, usuario_id, rol) values (v_id, auth.uid(), 'propietario');
  return v_id;
end $$;

revoke execute on function public.es_miembro(uuid), public.tiene_rol(uuid, public.rol_miembro[]),
  public.crear_optica(text) from public, anon;
grant execute on function public.es_miembro(uuid), public.tiene_rol(uuid, public.rol_miembro[]),
  public.crear_optica(text) to authenticated;

-- =========================================================
-- 4. Pacientes y laboratorios
-- =========================================================
create table pacientes (
  id               uuid primary key default gen_random_uuid(),
  optica_id        uuid not null references opticas(id),
  nombres          text not null check (length(trim(nombres)) > 0),
  apellidos        text not null check (length(trim(apellidos)) > 0),
  tipo_documento   text not null default 'DNI' check (tipo_documento in ('DNI', 'CE', 'PASAPORTE')),
  numero_documento text,
  fecha_nacimiento date check (fecha_nacimiento <= current_date),
  telefono         text,
  email            text check (email is null or email like '%_@_%'),
  notas            text,
  archivado_en     timestamptz,
  creado_por       uuid not null default auth.uid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (id, optica_id),
  unique (optica_id, tipo_documento, numero_documento),
  check (tipo_documento <> 'DNI' or numero_documento is null or numero_documento ~ '^[0-9]{8}$')
);
create index on pacientes (optica_id, apellidos, nombres);

create table laboratorios (
  id             uuid primary key default gen_random_uuid(),
  optica_id      uuid not null references opticas(id),
  nombre         text not null check (length(trim(nombre)) > 0),
  contacto       text,
  telefono       text,
  email          text,
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (id, optica_id)
);

-- =========================================================
-- 5. Recetas (inmutables: se corrigen creando una nueva)
-- =========================================================
create table recetas (
  id              uuid primary key default gen_random_uuid(),
  optica_id       uuid not null references opticas(id),
  paciente_id     uuid not null,
  fecha_examen    date not null default current_date,
  profesional     text,
  reemplaza_a     uuid references recetas(id),
  -- Ojo derecho
  od_esfera d_esfera, od_cilindro d_cilindro, od_eje d_eje, od_adicion d_adicion,
  od_dnp d_mm, od_altura d_mm, od_prisma d_prisma, od_base_prisma text,
  -- Ojo izquierdo
  oi_esfera d_esfera, oi_cilindro d_cilindro, oi_eje d_eje, oi_adicion d_adicion,
  oi_dnp d_mm, oi_altura d_mm, oi_prisma d_prisma, oi_base_prisma text,
  observaciones   text,
  anulada_en      timestamptz,
  motivo_anulacion text,
  creado_por      uuid not null default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (id, optica_id),
  foreign key (paciente_id, optica_id) references pacientes (id, optica_id),
  check (coalesce(od_cilindro, 0) = 0 or od_eje is not null),
  check (coalesce(oi_cilindro, 0) = 0 or oi_eje is not null),
  check (od_base_prisma is null or od_base_prisma in ('arriba', 'abajo', 'interna', 'externa')),
  check (oi_base_prisma is null or oi_base_prisma in ('arriba', 'abajo', 'interna', 'externa')),
  check (num_nonnulls(od_esfera, od_cilindro, oi_esfera, oi_cilindro) > 0),
  check (anulada_en is null or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index on recetas (optica_id, paciente_id, fecha_examen desc);

-- =========================================================
-- 6. Órdenes de trabajo
-- =========================================================
create table secuencias_orden (
  optica_id uuid primary key references opticas(id),
  ultimo    integer not null default 0
);

create table transiciones_estado (
  desde estado_orden not null,
  hasta estado_orden not null,
  primary key (desde, hasta)
);
insert into transiciones_estado values
  ('borrador', 'enviada'), ('borrador', 'anulada'),
  ('enviada', 'borrador'), ('enviada', 'recibida_lab'), ('enviada', 'anulada'),
  ('recibida_lab', 'en_proceso'), ('recibida_lab', 'anulada'),
  ('en_proceso', 'lista'), ('en_proceso', 'anulada'),
  ('lista', 'recibida_optica'), ('lista', 'anulada'),
  ('recibida_optica', 'entregada');

create table ordenes (
  id                       uuid primary key default gen_random_uuid(),
  optica_id                uuid not null references opticas(id),
  numero                   integer not null,
  paciente_id              uuid not null,
  receta_id                uuid not null,
  laboratorio_id           uuid not null,
  estado                   estado_orden not null default 'borrador',
  tipo_trabajo             text not null default 'lentes_completos'
                           check (tipo_trabajo in ('lentes_completos', 'solo_lunas')),
  montura_descripcion      text,
  montura_origen           text check (montura_origen in ('optica', 'paciente')),
  fecha_entrega_prometida  date,
  prioridad                text not null default 'normal' check (prioridad in ('normal', 'urgente')),
  motivo_anulacion         text,
  anulada_en               timestamptz,
  creado_por               uuid not null default auth.uid(),
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  unique (id, optica_id),
  unique (optica_id, numero),
  foreign key (paciente_id, optica_id)     references pacientes (id, optica_id),
  foreign key (receta_id, optica_id)       references recetas (id, optica_id),
  foreign key (laboratorio_id, optica_id)  references laboratorios (id, optica_id),
  check (estado <> 'anulada' or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index on ordenes (optica_id, estado, creado_en desc);
create index on ordenes (optica_id, paciente_id);

-- Especificaciones por ojo: copia (snapshot) de los valores de la receta usados + datos del lente
create table orden_ojos (
  id            uuid primary key default gen_random_uuid(),
  optica_id     uuid not null references opticas(id),
  orden_id      uuid not null,
  ojo           ojo not null,
  esfera d_esfera, cilindro d_cilindro, eje d_eje, adicion d_adicion,
  dnp d_mm, altura d_mm, prisma d_prisma, base_prisma text
                check (base_prisma is null or base_prisma in ('arriba', 'abajo', 'interna', 'externa')),
  material      text,
  indice        numeric(3,2) check (indice is null or indice between 1.4 and 2.0),
  diseno        text,                 -- monofocal, bifocal, progresivo, etc.
  tratamientos  text[] not null default '{}',
  tinte         text,
  diametro_mm   smallint check (diametro_mm is null or diametro_mm between 40 and 90),
  observaciones text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (orden_id, ojo),
  foreign key (orden_id, optica_id) references ordenes (id, optica_id),
  check (coalesce(cilindro, 0) = 0 or eje is not null)
);

create table orden_historial_estados (
  id         uuid primary key default gen_random_uuid(),
  optica_id  uuid not null references opticas(id),
  orden_id   uuid not null,
  desde      estado_orden,
  hasta      estado_orden not null,
  usuario_id uuid default auth.uid(),
  creado_en  timestamptz not null default now(),
  foreign key (orden_id, optica_id) references ordenes (id, optica_id)
);
create index on orden_historial_estados (orden_id, creado_en);

create table orden_observaciones (
  id         uuid primary key default gen_random_uuid(),
  optica_id  uuid not null references opticas(id),
  orden_id   uuid not null,
  texto      text not null check (length(trim(texto)) > 0),
  creado_por uuid not null default auth.uid(),
  creado_en  timestamptz not null default now(),
  foreign key (orden_id, optica_id) references ordenes (id, optica_id)
);
create index on orden_observaciones (orden_id, creado_en);

-- =========================================================
-- 7. Auditoría genérica (solo inserción)
-- =========================================================
create table auditoria (
  id          bigint generated always as identity primary key,
  optica_id   uuid,
  tabla       text not null,
  registro_id text,
  accion      text not null,
  antes       jsonb,
  despues     jsonb,
  usuario_id  uuid,
  creado_en   timestamptz not null default now()
);
create index on auditoria (optica_id, tabla, registro_id, creado_en desc);

create function public.f_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fila jsonb;
begin
  v_fila := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.auditoria (optica_id, tabla, registro_id, accion, antes, despues, usuario_id)
  values (
    (v_fila ->> 'optica_id')::uuid, tg_table_name,
    coalesce(v_fila ->> 'id', v_fila ->> 'usuario_id'), tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return null;
end $$;

-- =========================================================
-- 8. Reglas de negocio en la base de datos
-- =========================================================
create function public.f_actualizado() returns trigger
language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

create function public.f_bloquear_delete() returns trigger
language plpgsql as $$
begin raise exception 'Borrado no permitido en %. Use anulación/archivado.', tg_table_name; end $$;

-- Recetas: inmutables salvo anulación
create function public.f_receta_inmutable() returns trigger
language plpgsql as $$
begin
  if old.anulada_en is not null then
    raise exception 'La receta ya está anulada y no admite cambios';
  end if;
  if (to_jsonb(new) - 'anulada_en' - 'motivo_anulacion')
     is distinct from (to_jsonb(old) - 'anulada_en' - 'motivo_anulacion') then
    raise exception 'Las recetas son inmutables: cree una nueva receta que reemplace a la anterior';
  end if;
  return new;
end $$;

-- Numeración correlativa por óptica
create function public.siguiente_numero_orden(p_optica uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  insert into public.secuencias_orden (optica_id, ultimo) values (p_optica, 1)
  on conflict (optica_id) do update set ultimo = public.secuencias_orden.ultimo + 1
  returning ultimo into v;
  return v;
end $$;
revoke execute on function public.siguiente_numero_orden(uuid) from public, anon, authenticated;

-- Órdenes: numeración, coherencia receta/paciente, transiciones y edición controlada
create function public.f_orden_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.recetas r
                 where r.id = new.receta_id and r.paciente_id = new.paciente_id and r.anulada_en is null) then
    raise exception 'La receta no pertenece al paciente o está anulada';
  end if;

  if tg_op = 'INSERT' then
    new.numero := public.siguiente_numero_orden(new.optica_id);
    new.estado := 'borrador';
    return new;
  end if;

  if new.id <> old.id or new.optica_id <> old.optica_id or new.numero <> old.numero then
    raise exception 'id, óptica y número de la orden no pueden cambiar';
  end if;

  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_estado t where t.desde = old.estado and t.hasta = new.estado) then
      raise exception 'Transición no permitida: % -> %', old.estado, new.estado;
    end if;
    if new.estado = 'anulada' then new.anulada_en := now(); end if;
    insert into public.orden_historial_estados (optica_id, orden_id, desde, hasta, usuario_id)
    values (new.optica_id, new.id, old.estado, new.estado, auth.uid());
  end if;

  if old.estado <> 'borrador' and
     (to_jsonb(new) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en')
     is distinct from
     (to_jsonb(old) - 'estado' - 'actualizado_en' - 'motivo_anulacion' - 'anulada_en') then
    raise exception 'La orden solo es editable en estado borrador (actual: %)', old.estado;
  end if;
  return new;
end $$;

create function public.f_orden_ojos_controlar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_estado public.estado_orden;
begin
  select estado into v_estado from public.ordenes where id = new.orden_id;
  if v_estado is distinct from 'borrador' then
    raise exception 'Las especificaciones solo se editan con la orden en borrador (actual: %)', v_estado;
  end if;
  return new;
end $$;

create function public.f_solo_insertar() returns trigger
language plpgsql as $$
begin raise exception '% es de solo inserción', tg_table_name; end $$;

-- =========================================================
-- 9. Instalación de triggers
-- =========================================================
create trigger t_orden_controlar before insert or update on ordenes
  for each row execute function public.f_orden_controlar();
create trigger t_orden_ojos_controlar before insert or update on orden_ojos
  for each row execute function public.f_orden_ojos_controlar();
create trigger t_receta_inmutable before update on recetas
  for each row execute function public.f_receta_inmutable();

do $$
declare t text;
begin
  -- timestamps
  foreach t in array array['opticas', 'pacientes', 'laboratorios', 'ordenes', 'orden_ojos'] loop
    execute format('create trigger t_actualizado before update on %I for each row execute function public.f_actualizado()', t);
  end loop;
  -- sin DELETE en ninguna tabla de negocio
  foreach t in array array['opticas', 'miembros', 'pacientes', 'laboratorios', 'recetas', 'ordenes',
                           'orden_ojos', 'orden_historial_estados', 'orden_observaciones', 'auditoria'] loop
    execute format('create trigger t_sin_delete before delete on %I for each row execute function public.f_bloquear_delete()', t);
  end loop;
  -- auditoría
  foreach t in array array['miembros', 'pacientes', 'laboratorios', 'recetas', 'ordenes', 'orden_ojos', 'orden_observaciones'] loop
    execute format('create trigger t_auditar after insert or update or delete on %I for each row execute function public.f_auditar()', t);
  end loop;
  -- tablas de solo inserción: sin UPDATE
  foreach t in array array['orden_historial_estados', 'orden_observaciones', 'auditoria'] loop
    execute format('create trigger t_sin_update before update on %I for each row execute function public.f_solo_insertar()', t);
  end loop;
end $$;

-- =========================================================
-- 10. Privilegios y RLS
-- =========================================================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select, update (nombre, ruc, telefono, direccion) on opticas to authenticated;
grant select, insert, update on miembros, pacientes, laboratorios, recetas, ordenes, orden_ojos to authenticated;
grant select, insert on orden_observaciones to authenticated;
grant select on orden_historial_estados, auditoria, transiciones_estado to authenticated;

alter table opticas                  enable row level security;
alter table miembros                 enable row level security;
alter table pacientes                enable row level security;
alter table laboratorios             enable row level security;
alter table recetas                  enable row level security;
alter table ordenes                  enable row level security;
alter table orden_ojos               enable row level security;
alter table orden_historial_estados  enable row level security;
alter table orden_observaciones      enable row level security;
alter table auditoria                enable row level security;
alter table secuencias_orden         enable row level security;  -- sin políticas: inaccesible desde la API
alter table transiciones_estado      enable row level security;

create policy transiciones_leer on transiciones_estado for select to authenticated using (true);

-- opticas: ver la propia; editar solo propietario/administrador. Sin INSERT: se usa crear_optica().
create policy opticas_select on opticas for select to authenticated using (public.es_miembro(id));
create policy opticas_update on opticas for update to authenticated
  using (public.tiene_rol(id, array['propietario', 'administrador']::public.rol_miembro[]))
  with check (public.tiene_rol(id, array['propietario', 'administrador']::public.rol_miembro[]));

-- miembros: ver los de mi óptica; gestionar solo propietario (evita auto-ascenso)
create policy miembros_select on miembros for select to authenticated using (public.es_miembro(optica_id));
create policy miembros_insert on miembros for insert to authenticated
  with check (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));
create policy miembros_update on miembros for update to authenticated
  using (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]))
  with check (public.tiene_rol(optica_id, array['propietario']::public.rol_miembro[]));

-- tablas de negocio con patrón estándar
do $$
declare t text;
begin
  foreach t in array array['pacientes', 'laboratorios', 'recetas', 'ordenes', 'orden_ojos'] loop
    execute format('create policy %I on %I for select to authenticated using (public.es_miembro(optica_id))', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (public.es_miembro(optica_id))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (public.es_miembro(optica_id)) with check (public.es_miembro(optica_id))', t || '_update', t);
  end loop;
end $$;

create policy obs_select on orden_observaciones for select to authenticated using (public.es_miembro(optica_id));
create policy obs_insert on orden_observaciones for insert to authenticated
  with check (public.es_miembro(optica_id) and creado_por = auth.uid());
create policy hist_select on orden_historial_estados for select to authenticated using (public.es_miembro(optica_id));
create policy audit_select on auditoria for select to authenticated
  using (public.tiene_rol(optica_id, array['propietario', 'administrador']::public.rol_miembro[]));
