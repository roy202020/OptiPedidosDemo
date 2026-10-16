-- OptiPedidos · Pruebas de importes de venta y metas (migración 0004)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a2@prueba.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1@prueba.test', 'authenticated', 'authenticated');
insert into opticas (id, nombre) values
  ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');
insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'operador'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');
insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A');
insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana', 'Prueba', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1.00, 'aaaaaaaa-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Importes en la orden
-- ---------------------------------------------------------------------------
select lives_ok($$ insert into t values ('o1', public.crear_orden('2a000000-0000-0000-0000-000000000001',
  '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a',
  p_precio => 500, p_descuento => 50)) $$, 'crea una orden con precio y descuento');
select results_eq($$ select precio::text, descuento::text, confirmada_en from ordenes where id = (select id from t where clave = 'o1') $$,
  $$ values ('500.00', '50.00', null::timestamptz) $$, 'guarda los importes y nace sin confirmar');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 100, p_descuento => 150) $$,
  '23514', null, 'el descuento no puede superar el precio');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => -1) $$,
  '23514', null, 'el precio no puede ser negativo');
select lives_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o1'), '1a000000-0000-0000-0000-00000000000a',
  'lentes_completos', null, null, null, 'normal', '{}', 600, 100) $$, 'los importes se editan en borrador');
select is((select (precio - descuento)::text from ordenes where id = (select id from t where clave = 'o1')), '500.00', 'importe neto actualizado');

-- ---------------------------------------------------------------------------
-- 2. Confirmación de la venta
-- ---------------------------------------------------------------------------
update ordenes set confirmada_en = '2020-01-01' where id = (select id from t where clave = 'o1');
select is((select confirmada_en from ordenes where id = (select id from t where clave = 'o1')), null,
  'el cliente no puede fijar la fecha de confirmación');
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1');
select isnt((select confirmada_en from ordenes where id = (select id from t where clave = 'o1')), null,
  'al salir de borrador la venta queda confirmada');
select throws_ok($$ update ordenes set precio = 1 where id = (select id from t where clave = 'o1') $$,
  'P0001', null, 'el precio no cambia después de confirmar');
update ordenes set estado = 'borrador' where id = (select id from t where clave = 'o1');
select is((select confirmada_en from ordenes where id = (select id from t where clave = 'o1')), null,
  'si vuelve a borrador deja de contar como venta');
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1');

-- Una segunda orden confirmada y luego anulada no cuenta como venta.
insert into t values ('o2', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 300));
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o2');
update ordenes set estado = 'anulada', motivo_anulacion = 'Prueba' where id = (select id from t where clave = 'o2');
-- Una tercera queda en borrador: tampoco cuenta.
insert into t values ('o3', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 999));

-- ---------------------------------------------------------------------------
-- 3. Metas
-- ---------------------------------------------------------------------------
select lives_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo)
  values ('a0000000-0000-0000-0000-00000000000a', date_trunc('month', now() at time zone 'America/Lima')::date, 2000) $$,
  'el propietario crea la meta del mes');
select is((select creado_por::text from metas_ventas), 'aaaaaaaa-0000-0000-0000-000000000001', 'el autor de la meta lo fija el servidor');
select throws_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo)
  values ('a0000000-0000-0000-0000-00000000000a', date_trunc('month', now() at time zone 'America/Lima')::date, 3000) $$,
  '23505', null, 'no hay dos metas para el mismo mes');
select throws_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo)
  values ('a0000000-0000-0000-0000-00000000000a', '2026-01-15', 1000) $$,
  '23514', null, 'el periodo es siempre el primer día del mes');
select throws_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo)
  values ('a0000000-0000-0000-0000-00000000000a', '2026-02-01', 0) $$,
  '23514', null, 'la meta debe ser mayor que cero');
select lives_ok($$ update metas_ventas set importe_objetivo = 2500 where optica_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'el propietario edita la meta');
select throws_ok($$ update metas_ventas set periodo = '2020-01-01' $$, '42501', null, 'el periodo de una meta no se cambia');
select throws_ok($$ delete from metas_ventas $$, '42501', null, 'las metas no se borran (se conserva el historial)');

-- ---------------------------------------------------------------------------
-- 4. Ventas por mes
-- ---------------------------------------------------------------------------
select results_eq($$ select ventas::text, ordenes, meta::text from public.ventas_mensuales('a0000000-0000-0000-0000-00000000000a', 3) limit 1 $$,
  $$ values ('500.00', 1, '2500.00') $$,
  'el mes actual suma solo ventas confirmadas y no anuladas, con su meta');
select is((select count(*)::int from public.ventas_mensuales('a0000000-0000-0000-0000-00000000000a', 3)), 3, 'devuelve los meses pedidos');
select results_eq($$ select ventas::text, ordenes from public.ventas_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('500.00', 1) $$, 'ventas del día');

-- ---------------------------------------------------------------------------
-- 5. Permisos: operador y otra óptica
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is_empty($$ select * from metas_ventas $$, 'el operador no ve las metas');
select throws_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo) values ('a0000000-0000-0000-0000-00000000000a', '2026-03-01', 1) $$,
  '42501', null, 'el operador no crea metas');
select throws_ok($$ select * from public.ventas_mensuales('a0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'el operador no ve el informe de ventas');

set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from metas_ventas $$, 'otra óptica no ve las metas de A');
select throws_ok($$ select * from public.ventas_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'otra óptica no ve las ventas de A');

select * from finish();
rollback;
