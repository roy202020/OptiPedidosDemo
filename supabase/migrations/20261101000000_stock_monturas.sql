-- Existencias por sede. Los modelos anteriores empiezan sin existencias registradas.
-- No se descuentan retroactivamente los pedidos ya confirmados.
create table public.monturas_stock (
  optica_id uuid not null references public.opticas(id),
  sede_id uuid not null,
  montura_id uuid not null,
  stock integer not null default 0 check(stock between 0 and 999999),
  reservado integer not null default 0 check(reservado >= 0 and reservado <= stock),
  primary key(sede_id,montura_id),
  foreign key(sede_id,optica_id) references public.sedes(id,optica_id),
  foreign key(optica_id,montura_id) references public.monturas(optica_id,id)
);
create table public.monturas_asignaciones (
  orden_id uuid primary key references public.ordenes(id),
  optica_id uuid not null references public.opticas(id),
  sede_id uuid not null,
  montura_id uuid not null,
  estado text not null check(estado in ('reservada','vendida','liberada')),
  foreign key(sede_id,montura_id) references public.monturas_stock(sede_id,montura_id),
  foreign key(sede_id,optica_id) references public.sedes(id,optica_id),
  foreign key(optica_id,montura_id) references public.monturas(optica_id,id)
);
create table public.monturas_movimientos (
  id bigint generated always as identity primary key,
  optica_id uuid not null references public.opticas(id),
  sede_id uuid not null,
  montura_id uuid not null,
  orden_id uuid references public.ordenes(id),
  tipo text not null check(tipo in ('entrada','conteo','devolucion','reserva','liberacion','venta','reapertura')),
  variacion_stock integer not null,
  variacion_reservado integer not null default 0,
  motivo text not null check(length(trim(motivo)) between 3 and 300),
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  foreign key(sede_id,montura_id) references public.monturas_stock(sede_id,montura_id),
  foreign key(sede_id,optica_id) references public.sedes(id,optica_id),
  foreign key(optica_id,montura_id) references public.monturas(optica_id,id)
);
create index monturas_movimientos_sede_fecha_idx on public.monturas_movimientos(sede_id,creado_en desc);
do $$ declare t text; begin
  foreach t in array array['monturas_stock','monturas_asignaciones','monturas_movimientos'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy lectura on public.%I for select to authenticated using(optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()))',t);
    execute format('create trigger t_00_suscripcion before insert or update on public.%I for each row execute function public.f_exigir_suscripcion()',t);
  end loop;
end $$;

-- Única entrada de ajustes manuales: rol, óptica, sede, suscripción y reserva se validan en la base.
create function public.registrar_stock_montura(p_montura uuid,p_sede uuid,p_tipo text,p_cantidad integer,p_motivo text)
returns void language plpgsql security definer set search_path='' as $$
declare v_optica uuid; v_stock public.monturas_stock%rowtype; v_delta integer;
begin
  select optica_id into v_optica from public.monturas where id=p_montura;
  if v_optica is null or not public.tiene_rol(v_optica,array['propietario','administrador']::public.rol_miembro[])
     or not public.tiene_sede(p_sede)
     or not exists(select 1 from public.sedes where id=p_sede and optica_id=v_optica and activa) then
    raise exception 'No tienes permiso para ajustar stock en esta sede' using errcode='42501';
  end if;
  if p_tipo is null or p_tipo not in ('entrada','conteo','devolucion') or p_cantidad is null or p_cantidad<0 or p_cantidad>999999
     or (p_tipo <> 'conteo' and p_cantidad=0) or length(trim(coalesce(p_motivo,''))) not between 3 and 300 then
    raise exception 'Revisa el tipo, la cantidad y el motivo del movimiento';
  end if;
  insert into public.monturas_stock(optica_id,sede_id,montura_id) values(v_optica,p_sede,p_montura) on conflict do nothing;
  select * into v_stock from public.monturas_stock where sede_id=p_sede and montura_id=p_montura for update;
  v_delta := case when p_tipo='conteo' then p_cantidad-v_stock.stock else p_cantidad end;
  if v_stock.stock+v_delta < v_stock.reservado then raise exception 'El stock contado no puede ser menor que las unidades reservadas. Revisa primero los pedidos pendientes.'; end if;
  if v_stock.stock+v_delta>999999 then raise exception 'El stock máximo permitido es 999999 unidades'; end if;
  update public.monturas_stock set stock=stock+v_delta where sede_id=p_sede and montura_id=p_montura;
  insert into public.monturas_movimientos(optica_id,sede_id,montura_id,tipo,variacion_stock,motivo)
    values(v_optica,p_sede,p_montura,p_tipo,v_delta,trim(p_motivo));
end $$;
revoke all on function public.registrar_stock_montura(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.registrar_stock_montura(uuid,uuid,text,integer,text) to authenticated;

create function public.f_orden_stock_montura() returns trigger language plpgsql security definer set search_path='' as $$
declare
  r public.monturas_asignaciones%rowtype;
  v_stock public.monturas_stock%rowtype;
  v_deseado text;
  v_ds integer := 0; v_dr integer := 0; v_tipo text; v_motivo text;
begin
  select * into r from public.monturas_asignaciones where orden_id=new.id for update;
  -- Un pedido que ya estaba confirmado antes de instalar el control no se vuelve a cobrar al avanzar de estado.
  if r.orden_id is null and tg_op='UPDATE' then
    if old.estado <> 'borrador' and new.estado <> 'borrador' then return null; end if;
  end if;
  if new.montura_catalogo_id is null and r.orden_id is null then return null; end if;
  if new.estado='anulada' and r.orden_id is null then return null; end if;

  -- Orden fijo de bloqueos: permite cambios simultáneos de modelo sin sobrevender ni bloquearse mutuamente.
  perform 1 from public.monturas_stock s
    where (s.sede_id=new.sede_id and s.montura_id=new.montura_catalogo_id)
       or (s.sede_id=r.sede_id and s.montura_id=r.montura_id)
    order by s.sede_id,s.montura_id for update;

  if r.orden_id is not null and (new.montura_catalogo_id is distinct from r.montura_id or new.sede_id is distinct from r.sede_id) then
    if r.estado='reservada' then
      update public.monturas_stock set reservado=reservado-1 where sede_id=r.sede_id and montura_id=r.montura_id;
      insert into public.monturas_movimientos(optica_id,sede_id,montura_id,orden_id,tipo,variacion_stock,variacion_reservado,motivo)
        values(r.optica_id,r.sede_id,r.montura_id,new.id,'liberacion',0,-1,'Montura sustituida o retirada del pedido');
    elsif r.estado='vendida' then
      raise exception 'Una montura vendida no se puede sustituir sin volver el pedido a venta iniciada';
    end if;
    update public.monturas_asignaciones set estado='liberada' where orden_id=new.id;
    r.estado := 'liberada';
  end if;
  if new.montura_catalogo_id is null then return null; end if;
  v_deseado := case when new.estado='borrador' then 'reservada' when new.estado='anulada' then
    case when r.estado='vendida' then 'vendida' else 'liberada' end else 'vendida' end;
  if r.orden_id is not null and r.montura_id=new.montura_catalogo_id and r.sede_id=new.sede_id and r.estado=v_deseado then return null; end if;
  if v_deseado='liberada' and (r.orden_id is null or r.estado='liberada') then return null; end if;
  select * into v_stock from public.monturas_stock where sede_id=new.sede_id and montura_id=new.montura_catalogo_id;
  if not found then raise exception 'Sin stock de esta montura en la sede del pedido. Registra una entrada antes de venderla.'; end if;
  if (r.orden_id is null or r.estado='liberada') and v_deseado in ('reservada','vendida') and v_stock.stock-v_stock.reservado<1 then
    raise exception 'Sin unidades disponibles de esta montura en la sede del pedido';
  end if;
  if v_deseado='reservada' then
    v_dr:=1; v_ds:=case when r.estado='vendida' then 1 else 0 end;
    v_tipo:=case when r.estado='vendida' then 'reapertura' else 'reserva' end;
    v_motivo:='Montura reservada para pedido en venta iniciada';
  elsif v_deseado='vendida' then
    v_ds:=-1; v_dr:=case when r.estado='reservada' then -1 else 0 end;
    v_tipo:='venta'; v_motivo:='Venta confirmada: pedido enviado al laboratorio';
  else
    v_ds:=0; v_dr:=-1; v_tipo:='liberacion'; v_motivo:='Reserva liberada al anular el pedido';
  end if;
  update public.monturas_stock set stock=stock+v_ds,reservado=reservado+v_dr where sede_id=new.sede_id and montura_id=new.montura_catalogo_id;
  insert into public.monturas_asignaciones(orden_id,optica_id,sede_id,montura_id,estado)
    values(new.id,new.optica_id,new.sede_id,new.montura_catalogo_id,v_deseado)
    on conflict(orden_id) do update set sede_id=excluded.sede_id,montura_id=excluded.montura_id,estado=excluded.estado;
  insert into public.monturas_movimientos(optica_id,sede_id,montura_id,orden_id,tipo,variacion_stock,variacion_reservado,motivo)
    values(new.optica_id,new.sede_id,new.montura_catalogo_id,new.id,v_tipo,v_ds,v_dr,v_motivo);
  return null;
end $$;
revoke all on function public.f_orden_stock_montura() from public,anon,authenticated;
create trigger t_montura_stock after insert or update of estado,montura_catalogo_id,sede_id on public.ordenes for each row execute function public.f_orden_stock_montura();
