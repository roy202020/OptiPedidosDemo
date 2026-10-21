-- OptiPedidos · Pruebas de la RLS por conjunto (migración 0017)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.
--
-- Óptica Quiroga con sedes Centro, Norte y Sur:
--   prop   propietario (todas las sedes)
--   adm    administrador de Centro y Norte
--   venC   vendedor (operador) de Centro
--   baja   operador de Centro dado de baja (inactivo)
-- Otra óptica con su propio propietario (otro).

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ---------------------------------------------------------------------------
-- 1. Estructura
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_proc
            where pronamespace = 'public'::regnamespace
              and proname in ('mis_opticas', 'mis_opticas_con_rol', 'mis_sedes', 'mis_sedes_gestion')
              and prosecdef and proretset and provolatile = 's' and proconfig = array['search_path=""']),
  4, 'las cuatro funciones de conjunto existen: STABLE, SECURITY DEFINER, devuelven conjuntos y fijan search_path');
select ok(not has_function_privilege('anon', 'public.mis_opticas()', 'execute')
          and not has_function_privilege('anon', 'public.mis_sedes()', 'execute')
          and has_function_privilege('authenticated', 'public.mis_sedes_gestion()', 'execute'),
  'anon no puede ejecutarlas; authenticated sí');
select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') ~ '(es_miembro|tiene_rol|tiene_sede|gestiona_sede|tiene_sede_orden)\('
         or coalesce(with_check, '') ~ '(es_miembro|tiene_rol|tiene_sede|gestiona_sede|tiene_sede_orden)\(') $$,
  'ninguna política llama por fila a es_miembro, tiene_rol, tiene_sede, gestiona_sede ni tiene_sede_orden');
select is_empty($$
  select tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(?<!SELECT )auth\.uid\(\)' $$,
  'auth.uid() en las políticas siempre va como (select auth.uid())');
select is((select i.indpred is null and pg_get_indexdef(i.indexrelid) like '%(orden_id)'
             from pg_index i where i.indexrelid = 'public.orden_pagos_por_orden'::regclass),
  true, 'orden_pagos tiene un índice completo por orden_id (el detalle de la orden también lista los anulados)');

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('f1111111-0000-0000-0000-000000000001', 'prop@quiroga.test', 'authenticated', 'authenticated'),
  ('f1111111-0000-0000-0000-000000000002', 'adm@quiroga.test',  'authenticated', 'authenticated'),
  ('f1111111-0000-0000-0000-000000000003', 'venc@quiroga.test', 'authenticated', 'authenticated'),
  ('f1111111-0000-0000-0000-000000000004', 'baja@quiroga.test', 'authenticated', 'authenticated'),
  ('f2222222-0000-0000-0000-000000000001', 'otro@otra.test',    'authenticated', 'authenticated');
insert into opticas (id, nombre, plan) values
  ('f0000000-0000-0000-0000-00000000000a', 'Óptica Quiroga', 'profesional'),
  ('f0000000-0000-0000-0000-00000000000b', 'Óptica Otra Quiroga', 'profesional');
update sedes set id = 'f1000000-0000-0000-0000-000000000001', nombre = 'Centro' where optica_id = 'f0000000-0000-0000-0000-00000000000a';
insert into sedes (id, optica_id, nombre) values
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-00000000000a', 'Norte'),
  ('f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-00000000000a', 'Sur');
insert into miembros (optica_id, usuario_id, rol) values
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000001', 'propietario'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000002', 'administrador'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000003', 'operador'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000004', 'operador'),
  ('f0000000-0000-0000-0000-00000000000b', 'f2222222-0000-0000-0000-000000000001', 'propietario');
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-00000000000a', 'f1111111-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001');
insert into laboratorios (id, optica_id, nombre) values
  ('f2000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a', 'Lab Quiroga');
insert into cajas (optica_id, sede_id, abierta_por, monto_inicial)
  select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s
  where s.optica_id in ('f0000000-0000-0000-0000-00000000000a', 'f0000000-0000-0000-0000-00000000000b')
    and not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);

-- ---------------------------------------------------------------------------
-- 2. Los conjuntos coinciden con las funciones por fila de antes, para cada usuario de la prueba y uno sin óptica,
--    comparados contra todas las ópticas y sedes de la base.
-- ---------------------------------------------------------------------------
create function pg_temp.diferencias() returns table (usuario uuid, conjunto text, n bigint) language plpgsql as $$
declare u uuid;
begin
  for u in select m.usuario_id from public.miembros m join auth.users au on au.id = m.usuario_id
           where au.email like '%quiroga.test' or au.email = 'otro@otra.test'
           union all select gen_random_uuid() loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    return query
      select u, 'opticas', count(*) from (
        (select o.id from public.opticas o where public.es_miembro(o.id) except select public.mis_opticas())
        union all (select public.mis_opticas() except select o.id from public.opticas o where public.es_miembro(o.id))) x;
    return query
      select u, 'sedes', count(*) from (
        (select s.id from public.sedes s where public.tiene_sede(s.id) except select public.mis_sedes())
        union all (select public.mis_sedes() except select s.id from public.sedes s where public.tiene_sede(s.id))) x;
    return query
      select u, 'gestion', count(*) from (
        (select s.optica_id, s.id from public.sedes s where public.gestiona_sede(s.optica_id, s.id)
         except select g.optica_id, g.sede_id from public.mis_sedes_gestion() g)
        union all
        (select g.optica_id, g.sede_id from public.mis_sedes_gestion() g
         except select s.optica_id, s.id from public.sedes s where public.gestiona_sede(s.optica_id, s.id))) x;
    return query
      select u, 'rol ' || a.r::text, c.n
      from (values ('{propietario}'::public.rol_miembro[]), ('{administrador}'), ('{operador}'),
                   ('{propietario,administrador}')) a(r)
      cross join lateral (
        select count(*) from (
          (select o.id from public.opticas o where public.tiene_rol(o.id, a.r) except select public.mis_opticas_con_rol(a.r))
          union all
          (select public.mis_opticas_con_rol(a.r) except select o.id from public.opticas o where public.tiene_rol(o.id, a.r))) y
      ) c(n);
  end loop;
end $$;
create function pg_temp.plan_de(q text) returns setof text language plpgsql as $$
declare r record;
begin
  for r in execute 'explain (costs off) ' || q loop return next r."QUERY PLAN"; end loop;
end $$;
select is_empty($$ select * from pg_temp.diferencias() where n > 0 $$,
  'mis_opticas, mis_sedes, mis_sedes_gestion y mis_opticas_con_rol equivalen a es_miembro, tiene_sede, gestiona_sede y tiene_rol');

-- ---------------------------------------------------------------------------
-- Pedidos: uno en Centro y otro en Norte (los crea el propietario)
-- ---------------------------------------------------------------------------
set local role authenticated;
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;
set local request.jwt.claims to '{"sub":"f1111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into pacientes (id, optica_id, nombres, apellidos) values
  ('f4000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a', 'Paciente', 'Quiroga');
insert into recetas (id, optica_id, paciente_id, od_esfera) values
  ('f5000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-000000000001', -1.00);
insert into t values ('oC', public.crear_orden('f4000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001', p_precio => 200, p_sede => 'f1000000-0000-0000-0000-000000000001'));
insert into t values ('oN', public.crear_orden('f4000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001', p_precio => 300, p_sede => 'f1000000-0000-0000-0000-000000000002'));
insert into orden_pagos (optica_id, orden_id, importe, medio) values
  ('f0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'oC'), 50, 'tarjeta'),
  ('f0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'oN'), 80, 'tarjeta');
select is((select count(*)::int from ordenes where optica_id = 'f0000000-0000-0000-0000-00000000000a'), 2,
  'el propietario ve los pedidos de todas las sedes');
select is((select count(*)::int from cajas where optica_id = 'f0000000-0000-0000-0000-00000000000a'), 3,
  'y las cajas de las tres sedes');

-- ---------------------------------------------------------------------------
-- 3. Vendedor de Centro
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f1111111-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select id from ordenes where optica_id = 'f0000000-0000-0000-0000-00000000000a' $$,
  $$ select id from t where clave = 'oC' $$, 'el vendedor de Centro solo ve el pedido de Centro');
select isnt_empty($$ select 1 from orden_ojos where orden_id = (select id from t where clave = 'oC') $$,
  've el detalle (ojos) del pedido de su sede');
select is_empty($$ select 1 from orden_ojos where orden_id = (select id from t where clave = 'oN') $$,
  'pero no el detalle del pedido de Norte');
select is_empty($$ select 1 from orden_historial_estados where orden_id = (select id from t where clave = 'oN') $$,
  'ni su historial');
select is((select count(*)::int from orden_pagos where optica_id = 'f0000000-0000-0000-0000-00000000000a'), 1,
  'solo ve los pagos de Centro');
select lives_ok($$ insert into orden_observaciones (optica_id, orden_id, texto)
  values ('f0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'oC'), 'Cliente llamó') $$,
  'anota observaciones en un pedido de su sede');
select throws_ok($$ insert into orden_observaciones (optica_id, orden_id, texto)
  values ('f0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'oN'), 'No debería') $$,
  '42501', null, 'no anota observaciones en un pedido de Norte');
select throws_ok($$ insert into orden_ojos (optica_id, orden_id, ojo)
  values ('f0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'oN'), 'OI') $$,
  '42501', null, 'ni agrega ojos a un pedido de Norte');
select is_empty($$ select 1 from cajas where optica_id = 'f0000000-0000-0000-0000-00000000000a' $$,
  'un operador no ve las cajas');
select results_eq($$ select nombre from sedes where optica_id = 'f0000000-0000-0000-0000-00000000000a' $$,
  $$ values ('Centro') $$, 'solo ve su sede');
select ok((select bool_and(p !~ '(es_miembro|tiene_sede)\(') and bool_or(p ~ 'hashed SubPlan')
           from pg_temp.plan_de('select count(*) from public.ordenes where optica_id = ''f0000000-0000-0000-0000-00000000000a''') p),
  'el plan de una consulta a ordenes compara con un hash y no llama funciones por fila');

-- ---------------------------------------------------------------------------
-- 4. Administrador de Centro y Norte
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f1111111-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq($$ select s.nombre from cajas c join sedes s on s.id = c.sede_id
                     where c.optica_id = 'f0000000-0000-0000-0000-00000000000a' order by 1 $$,
  $$ values ('Centro'), ('Norte') $$, 'el administrador ve las cajas de sus dos sedes, no la de Sur');
select is((select count(*)::int from ordenes where optica_id = 'f0000000-0000-0000-0000-00000000000a'), 2,
  'y los pedidos de Centro y Norte');
select is((select count(*)::int from miembro_sedes where optica_id = 'f0000000-0000-0000-0000-00000000000a'), 4,
  've las asignaciones de sus sedes');
select throws_ok($$ insert into sedes (optica_id, nombre) values ('f0000000-0000-0000-0000-00000000000a', 'Este') $$,
  '42501', null, 'no crea sedes (solo el propietario)');

-- ---------------------------------------------------------------------------
-- 5. Miembro dado de baja y otra óptica
-- ---------------------------------------------------------------------------
reset role;
update miembros set activo = false where usuario_id = 'f1111111-0000-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1111111-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty($$ select 1 from opticas $$, 'un miembro dado de baja no ve la óptica');
select is_empty($$ select 1 from ordenes $$, 'ni sus pedidos');
select is_empty($$ select 1 from sedes $$, 'ni sus sedes, aunque siga asignado');

set local request.jwt.claims to '{"sub":"f2222222-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select 1 from ordenes where optica_id = 'f0000000-0000-0000-0000-00000000000a' $$,
  'el propietario de otra óptica no ve pedidos de Quiroga');
select is_empty($$ select 1 from cajas where optica_id = 'f0000000-0000-0000-0000-00000000000a' $$,
  'ni sus cajas');

select * from finish();
rollback;
