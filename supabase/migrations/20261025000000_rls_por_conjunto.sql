-- OptiPedidos · Migración 0017 · RLS por conjunto e índice de pagos por orden (auditoría de escalabilidad)
-- Sin cambios destructivos: cuatro funciones nuevas, las mismas políticas con otra expresión y un índice reemplazado.
--
-- Problema: las políticas llamaban a es_miembro(optica_id), tiene_sede(sede_id), gestiona_sede(...) y
-- tiene_sede_orden(orden_id) con un argumento de la fila. Son SECURITY DEFINER: Postgres no las incrusta y las
-- ejecuta por cada fila de la óptica, antes que los filtros de la consulta. Con 10 000 órdenes, contar las activas
-- tardaba 325 ms (25 ms sin RLS) y el filtro de saldo 5,8 s.
--
-- Solución: funciones sin argumentos de fila que devuelven el conjunto de ópticas / sedes del usuario. En la política
-- se usan como `columna in (select ...)`: se evalúan una sola vez por consulta y se comparan con un hash.
-- Cada política conserva su nombre, comando y roles; la regla de acceso es la misma que antes:
--   es_miembro(o)            → o in (select mis_opticas())
--   tiene_rol(o, roles)      → o in (select mis_opticas_con_rol(roles))
--   tiene_sede(s)            → s in (select mis_sedes())
--   gestiona_sede(o, s)      → (o, s) in (select optica_id, sede_id from mis_sedes_gestion())
--   tiene_sede_orden(orden)  → exists (orden visible de una sede del usuario)
-- Las funciones antiguas se mantienen: las usan las funciones de reportes y las acciones.

-- 1 ----------------------------------------------------------------------------
-- Conjuntos del usuario actual (auth.uid()). Solo devuelven ids propios del usuario.
create function public.mis_opticas() returns setof uuid
language sql stable security definer set search_path = '' rows 5 as $$
  select m.optica_id from public.miembros m where m.usuario_id = (select auth.uid()) and m.activo;
$$;

create function public.mis_opticas_con_rol(p_roles public.rol_miembro[]) returns setof uuid
language sql stable security definer set search_path = '' rows 5 as $$
  select m.optica_id from public.miembros m
  where m.usuario_id = (select auth.uid()) and m.activo and m.rol = any (p_roles);
$$;

-- Mismo criterio que tiene_sede(): el propietario ve todas las sedes de su óptica; los demás, las asignadas.
create function public.mis_sedes() returns setof uuid
language sql stable security definer set search_path = '' rows 20 as $$
  select s.id
  from public.sedes s
  join public.miembros m on m.optica_id = s.optica_id and m.usuario_id = (select auth.uid()) and m.activo
  where m.rol = 'propietario'
     or exists (select 1 from public.miembro_sedes ms where ms.sede_id = s.id and ms.usuario_id = (select auth.uid()));
$$;

-- Mismo criterio que gestiona_sede(): propietario de la óptica, o administrador asignado a la sede.
create function public.mis_sedes_gestion() returns table (optica_id uuid, sede_id uuid)
language sql stable security definer set search_path = '' rows 20 as $$
  select s.optica_id, s.id
  from public.sedes s
  join public.miembros m on m.optica_id = s.optica_id and m.usuario_id = (select auth.uid()) and m.activo
  where m.rol = 'propietario'
     or (m.rol = 'administrador'
         and exists (select 1 from public.miembro_sedes ms where ms.sede_id = s.id and ms.usuario_id = (select auth.uid())));
$$;

revoke execute on function public.mis_opticas(), public.mis_opticas_con_rol(public.rol_miembro[]), public.mis_sedes(),
  public.mis_sedes_gestion() from public, anon;
grant execute on function public.mis_opticas(), public.mis_opticas_con_rol(public.rol_miembro[]), public.mis_sedes(),
  public.mis_sedes_gestion() to authenticated, service_role;

-- 2 ----------------------------------------------------------------------------
-- Ópticas, miembros y sedes
alter policy opticas_select on public.opticas using (id in (select public.mis_opticas()));
alter policy opticas_update on public.opticas
  using (id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[])))
  with check (id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[])));

alter policy miembros_select on public.miembros using (optica_id in (select public.mis_opticas()));
alter policy miembros_insert on public.miembros
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));
alter policy miembros_update on public.miembros
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])))
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));

alter policy miembro_sedes_select on public.miembro_sedes
  using (optica_id in (select public.mis_opticas())
         and (usuario_id = (select auth.uid())
              or optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[]))
              or (optica_id in (select public.mis_opticas_con_rol(array['administrador']::public.rol_miembro[]))
                  and sede_id in (select public.mis_sedes()))));
alter policy miembro_sedes_insert on public.miembro_sedes
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));
alter policy miembro_sedes_delete on public.miembro_sedes
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));

alter policy sedes_select on public.sedes
  using (optica_id in (select public.mis_opticas()) and id in (select public.mis_sedes()));
alter policy sedes_insert on public.sedes
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));
alter policy sedes_update on public.sedes
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[]))
         or (optica_id in (select public.mis_opticas_con_rol(array['administrador']::public.rol_miembro[]))
             and id in (select public.mis_sedes())))
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[]))
              or (optica_id in (select public.mis_opticas_con_rol(array['administrador']::public.rol_miembro[]))
                  and id in (select public.mis_sedes())));

-- 3 ----------------------------------------------------------------------------
-- Datos de toda la óptica
alter policy pacientes_select on public.pacientes using (optica_id in (select public.mis_opticas()));
alter policy pacientes_insert on public.pacientes with check (optica_id in (select public.mis_opticas()));
alter policy pacientes_update on public.pacientes
  using (optica_id in (select public.mis_opticas())) with check (optica_id in (select public.mis_opticas()));

alter policy recetas_select on public.recetas using (optica_id in (select public.mis_opticas()));
alter policy recetas_insert on public.recetas with check (optica_id in (select public.mis_opticas()));
alter policy recetas_update on public.recetas
  using (optica_id in (select public.mis_opticas())) with check (optica_id in (select public.mis_opticas()));

alter policy laboratorios_select on public.laboratorios using (optica_id in (select public.mis_opticas()));
alter policy laboratorios_insert on public.laboratorios with check (optica_id in (select public.mis_opticas()));
alter policy laboratorios_update on public.laboratorios
  using (optica_id in (select public.mis_opticas())) with check (optica_id in (select public.mis_opticas()));

alter policy productos_select on public.lunas_productos using (optica_id in (select public.mis_opticas()));
alter policy productos_insert on public.lunas_productos with check (optica_id in (select public.mis_opticas()));
alter policy productos_update on public.lunas_productos
  using (optica_id in (select public.mis_opticas())) with check (optica_id in (select public.mis_opticas()));

-- 4 ----------------------------------------------------------------------------
-- Datos de una sede: miembro de la óptica y con acceso a la sede
alter policy ordenes_select on public.ordenes
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy ordenes_insert on public.ordenes
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy ordenes_update on public.ordenes
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()))
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy pagos_select on public.orden_pagos
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy pagos_insert on public.orden_pagos
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy pagos_update on public.orden_pagos
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()))
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy notificaciones_select on public.notificaciones
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy recordatorios_select on public.recordatorios_envios
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy lab_tickets_select on public.lab_tickets
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy lab_ticket_ordenes_select on public.lab_ticket_ordenes
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy variantes_select on public.lunas_variantes
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy variantes_insert on public.lunas_variantes
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy variantes_update on public.lunas_variantes
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()))
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy movimientos_select on public.inventario_movimientos
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy movimientos_insert on public.inventario_movimientos
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy operaciones_select on public.inventario_operaciones
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));
alter policy operaciones_insert on public.inventario_operaciones
  with check (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes())
              and (tipo in ('compra', 'salida')
                   or optica_id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[]))));
alter policy reservas_select on public.inventario_reservas
  using (optica_id in (select public.mis_opticas()) and sede_id in (select public.mis_sedes()));

alter policy metas_select on public.metas_ventas
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[]))
         and sede_id in (select public.mis_sedes()));
alter policy metas_insert on public.metas_ventas
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[]))
              and sede_id in (select public.mis_sedes()));
alter policy metas_update on public.metas_ventas
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[]))
         and sede_id in (select public.mis_sedes()))
  with check (optica_id in (select public.mis_opticas_con_rol(array['propietario', 'administrador']::public.rol_miembro[]))
              and sede_id in (select public.mis_sedes()));

-- 5 ----------------------------------------------------------------------------
-- Detalle de la orden: la orden debe ser de una sede del usuario (antes tiene_sede_orden por fila)
alter policy orden_ojos_select on public.orden_ojos
  using (optica_id in (select public.mis_opticas())
         and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())));
alter policy orden_ojos_insert on public.orden_ojos
  with check (optica_id in (select public.mis_opticas())
              and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())));
alter policy orden_ojos_update on public.orden_ojos
  using (optica_id in (select public.mis_opticas())
         and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())))
  with check (optica_id in (select public.mis_opticas())
              and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())));

alter policy hist_select on public.orden_historial_estados
  using (optica_id in (select public.mis_opticas())
         and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())));

alter policy obs_select on public.orden_observaciones
  using (optica_id in (select public.mis_opticas())
         and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes())));
alter policy obs_insert on public.orden_observaciones
  with check (optica_id in (select public.mis_opticas())
              and exists (select 1 from public.ordenes o where o.id = orden_id and o.sede_id in (select public.mis_sedes()))
              and creado_por = (select auth.uid()));

-- 6 ----------------------------------------------------------------------------
-- Dinero de la sede: propietario o administrador de la sede (antes gestiona_sede por fila)
alter policy cajas_select on public.cajas
  using ((optica_id, sede_id) in (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g));
alter policy caja_movimientos_select on public.caja_movimientos
  using ((optica_id, sede_id) in (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g));
alter policy egresos_select on public.egresos
  using ((optica_id, sede_id) in (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g));
alter policy lab_pagos_select on public.lab_pagos
  using ((optica_id, sede_id) in (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g));
alter policy lab_pago_aplicaciones_select on public.lab_pago_aplicaciones
  using ((optica_id, sede_id) in (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g));

-- 7 ----------------------------------------------------------------------------
-- Auditoría y suscripción
alter policy audit_select on public.auditoria
  using (optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[]))
         or (optica_id in (select public.mis_opticas_con_rol(array['administrador']::public.rol_miembro[]))
             and (sede_id is null or sede_id in (select public.mis_sedes()))));

alter policy eventos_select on public.suscripcion_eventos
  using ((select public.es_superadmin())
         or optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));
alter policy pagos_select on public.suscripcion_pagos
  using ((select public.es_superadmin())
         or optica_id in (select public.mis_opticas_con_rol(array['propietario']::public.rol_miembro[])));

-- 8 ----------------------------------------------------------------------------
-- Pagos de una orden: el único índice por orden_id era parcial (sin anulados) y el detalle de la orden, que también
-- lista los anulados, recorría la tabla entera (3,6 M filas: ~500 ms). Un índice completo sirve a ambos casos.
drop index public.orden_pagos_por_orden;
create index orden_pagos_por_orden on public.orden_pagos (orden_id);
