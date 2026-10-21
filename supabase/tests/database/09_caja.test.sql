-- OptiPedidos · Pruebas de saldo por orden y caja del día (migración 0009)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a2@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'a3@prueba.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1@prueba.test', 'authenticated', 'authenticated');
insert into opticas (id, nombre) values
  ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');
insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'operador'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000003', 'administrador'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');
insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A'),
  ('1b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Lab B');
insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana', 'Prueba', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Beto', 'Prueba', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1.00, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', -1.00, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into cajas (optica_id, sede_id, abierta_por, monto_inicial) select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s where not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);  -- caja abierta: el efectivo entra a la caja (0015)
set local role authenticated;
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

-- Óptica B: una orden cobrada hoy, que no debe aparecer en la caja de A.
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
insert into t values ('b1', public.crear_orden('2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001',
  '1b000000-0000-0000-0000-00000000000b', p_precio => 300));
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('b0000000-0000-0000-0000-00000000000b', (select id from t where clave = 'b1'), 70, 'efectivo');

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
-- o1: neto S/ 450.00 · o2: neto S/ 100.00 (se anulará) · o3: neto S/ 80.00 (se paga completa).
insert into t values ('o1', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 500, p_descuento => 50));
insert into t values ('o2', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 100));
insert into t values ('o3', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 80));

-- ---------------------------------------------------------------------------
-- 1. Caja vacía
-- ---------------------------------------------------------------------------
select results_eq($$ select cobrado::text, pagos, por_medio, saldo_pendiente::text, ordenes_con_saldo
  from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('0.00', 0, '{"efectivo": 0.00, "tarjeta": 0.00, "transferencia": 0.00, "yape_plin": 0.00}'::jsonb, '630.00', 3) $$,
  'sin cobros: caja en cero con los cuatro medios y todo el neto como saldo');

-- ---------------------------------------------------------------------------
-- 2. Saldo de cada orden (columna calculada)
-- ---------------------------------------------------------------------------
insert into orden_pagos (optica_id, orden_id, importe, medio) values
  ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 100, 'efectivo'),
  ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 50, 'tarjeta'),
  ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 30, 'yape_plin'),
  ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o3'), 80, 'transferencia');
-- Un pago de ayer: resta del saldo pero no entra en la caja de hoy.
insert into orden_pagos (optica_id, orden_id, importe, medio, fecha)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 20, 'efectivo',
          (now() at time zone 'America/Lima')::date - 1);
update orden_pagos set motivo_anulacion = 'Yape rechazado' where medio = 'yape_plin';

select is((select public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o1')), '280.00',
  'saldo = neto − pagos vigentes (el anulado no resta)');
select is((select public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o2')), '100.00',
  'una orden sin pagos tiene todo el neto como saldo');
select is((select public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o3')), '0.00',
  'una orden pagada por completo no tiene saldo');
select is((select count(*)::int from ordenes o where public.saldo(o) > 0), 2,
  'se puede filtrar por saldo pendiente');

update ordenes set estado = 'anulada', motivo_anulacion = 'Prueba' where id = (select id from t where clave = 'o2');
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1');

-- ---------------------------------------------------------------------------
-- 3. Caja del día
-- ---------------------------------------------------------------------------
select is((select cobrado::text from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')), '230.00',
  'lo cobrado hoy suma solo los pagos vigentes con fecha de hoy');
select is((select pagos from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')), 3,
  'cuenta los pagos vigentes de hoy');
select is((select por_medio from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')),
  '{"efectivo": 100.00, "tarjeta": 50.00, "transferencia": 80.00, "yape_plin": 0.00}'::jsonb,
  'desglose por medio: sin el pago anulado, el de ayer ni los de otra óptica');
select is((select saldo_pendiente::text from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')), '280.00',
  'el saldo pendiente excluye las órdenes anuladas y las pagadas');
select is((select ordenes_con_saldo from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')), 1,
  'cuenta las órdenes no anuladas con saldo');
select is((select ventas::text from public.ventas_del_dia('a0000000-0000-0000-0000-00000000000a')), '450.00',
  'la venta del día sigue siendo el neto confirmado, no lo cobrado');

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select cobrado::text from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a')), '230.00',
  'el administrador ve la caja');

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$ select * from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  '42501', 'No tienes permiso para ver la caja', 'el operador no ve la caja');
select is((select public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o1')), '280.00',
  'el operador ve el saldo de cada orden');

set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from public.caja_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  '42501', 'No tienes permiso para ver la caja', 'otra óptica no ve la caja de A');
select results_eq($$ select cobrado::text, pagos, saldo_pendiente::text, ordenes_con_saldo
  from public.caja_del_dia('b0000000-0000-0000-0000-00000000000b') $$,
  $$ values ('70.00', 1, '230.00', 1) $$, 'cada óptica ve solo su propia caja');
select is_empty($$ select 1 from ordenes o where public.saldo(o) > 0 and optica_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'otra óptica no ve saldos de A');

reset role;
select ok(not has_function_privilege('anon', 'public.caja_del_dia(uuid, uuid)', 'execute'), 'anon no ejecuta caja_del_dia');
select ok(not has_function_privilege('anon', 'public.saldo(public.ordenes)', 'execute'), 'anon no ejecuta saldo');

select * from finish();
rollback;
