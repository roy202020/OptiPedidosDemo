-- OptiPedidos · Pruebas de varias sedes por óptica (migración 0010)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.
--
-- Óptica Zamora con sedes Centro, Norte y Sur:
--   prop  propietario (todas las sedes)
--   adm   administrador de Centro y Norte
--   venC  vendedor (operador) de Centro
--   venN  vendedor (operador) de Norte
-- Otra óptica con su propio propietario (otro).

begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('dddddddd-0000-0000-0000-000000000001', 'prop@zamora.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000002', 'adm@zamora.test',  'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000003', 'venc@zamora.test', 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000004', 'venn@zamora.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'otro@otra.test',   'authenticated', 'authenticated');
insert into opticas (id, nombre, plan) values  -- plan Profesional: varias sedes (0012)
  ('d0000000-0000-0000-0000-00000000000d', 'Óptica Zamora', 'profesional'),
  ('e0000000-0000-0000-0000-00000000000e', 'Óptica Otra', 'profesional');

select is((select count(*)::int from sedes where optica_id = 'd0000000-0000-0000-0000-00000000000d'), 1,
  'toda óptica nueva nace con su sede principal');

-- La sede principal pasa a ser Centro; se agregan Norte y Sur.
update sedes set id = 'd1000000-0000-0000-0000-000000000001', nombre = 'Centro' where optica_id = 'd0000000-0000-0000-0000-00000000000d';
insert into sedes (id, optica_id, nombre) values
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000d', 'Norte'),
  ('d1000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-00000000000d', 'Sur');
insert into miembros (optica_id, usuario_id, rol) values
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000001', 'propietario'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000002', 'administrador'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000003', 'operador'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000004', 'operador'),
  ('e0000000-0000-0000-0000-00000000000e', 'eeeeeeee-0000-0000-0000-000000000001', 'propietario');
select is((select count(*)::int from miembro_sedes where optica_id = 'd0000000-0000-0000-0000-00000000000d'), 0,
  'con varias sedes, un miembro nuevo no se asigna solo');
select is((select count(*)::int from miembro_sedes where optica_id = 'e0000000-0000-0000-0000-00000000000e'), 1,
  'con una sola sede, el miembro nuevo queda asignado a ella');
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002');
insert into laboratorios (id, optica_id, nombre) values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Lab Zamora');
insert into lunas_productos (id, optica_id, nombre) values
  ('d3000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Resina AR');

insert into cajas (optica_id, sede_id, abierta_por, monto_inicial) select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s where not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);  -- caja abierta: el efectivo entra a la caja (0015)
set local role authenticated;
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

-- Vendedor de Norte: registra un paciente, su receta, un pedido confirmado, un pago y una compra.
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}';
insert into pacientes (id, optica_id, nombres, apellidos) values
  ('d4000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'Paciente', 'De Norte');
insert into recetas (id, optica_id, paciente_id, od_esfera) values
  ('d5000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'd4000000-0000-0000-0000-000000000001', -1.00);
insert into t values ('oN', public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', p_precio => 300, p_sede => 'd1000000-0000-0000-0000-000000000002'));
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('d0000000-0000-0000-0000-00000000000d', (select id from t where clave = 'oN'), 100, 'efectivo');
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'oN');
select public.registrar_compra('d0000000-0000-0000-0000-00000000000d', null, null, null, null,
  '[{"producto_id": "d3000000-0000-0000-0000-000000000001", "esfera": -1, "cantidad": 4}]', 'd1000000-0000-0000-0000-000000000002');
insert into t select 'vN', id from lunas_variantes where sede_id = 'd1000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- 1. Vendedor de Centro
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}';
select results_eq($$ select nombre from sedes order by nombre $$, $$ values ('Centro') $$, 'el vendedor de Centro solo ve su sede');
select isnt_empty($$ select 1 from pacientes where id = 'd4000000-0000-0000-0000-000000000001' $$,
  'el vendedor de Centro encuentra al paciente registrado en Norte');
select lives_ok($$ insert into t values ('oC', public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', p_precio => 200)) $$, 'y le vende en su sede');
select is((select sede_id from ordenes where id = (select id from t where clave = 'oC')), 'd1000000-0000-0000-0000-000000000001'::uuid,
  'sin indicar sede, usa su única sede (Centro)');
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('d0000000-0000-0000-0000-00000000000d', (select id from t where clave = 'oC'), 50, 'tarjeta');
select public.registrar_compra('d0000000-0000-0000-0000-00000000000d', null, null, null, null,
  '[{"producto_id": "d3000000-0000-0000-0000-000000000001", "esfera": -1, "cantidad": 2}]');
insert into t select 'vC', id from lunas_variantes where sede_id = 'd1000000-0000-0000-0000-000000000001';

select is_empty($$ select 1 from ordenes where sede_id <> 'd1000000-0000-0000-0000-000000000001' $$,
  'el vendedor de Centro no ve pedidos de Norte');
select is_empty($$ select 1 from orden_ojos where orden_id = (select id from t where clave = 'oN') $$,
  'ni el detalle de esos pedidos');
select is_empty($$ select 1 from orden_pagos where sede_id = 'd1000000-0000-0000-0000-000000000002' $$,
  'el vendedor de Centro no ve la caja de Norte');
select throws_ok($$ select * from public.caja_del_dia('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'ni puede pedir el informe de caja de Norte');
select is_empty($$ select 1 from lunas_existencias where sede_id = 'd1000000-0000-0000-0000-000000000002' $$,
  'el vendedor de Centro no ve el inventario de Norte');
select is_empty($$ select 1 from inventario_movimientos where sede_id = 'd1000000-0000-0000-0000-000000000002' $$,
  'ni sus movimientos');
select is((select stock from lunas_variantes where id = (select id from t where clave = 'vC')), 2, 'su compra sumó stock en Centro');
select throws_ok($$ select public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', p_sede => 'd1000000-0000-0000-0000-000000000002') $$,
  '42501', 'No tienes acceso a esa sede', 'el vendedor de Centro no puede crear un pedido en Norte');
select throws_ok($$ insert into ordenes (optica_id, sede_id, paciente_id, receta_id, laboratorio_id)
  values ('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001',
          'd5000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'ni con una inserción directa por la API');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('d0000000-0000-0000-0000-00000000000d', (select id from t where clave = 'oN'), 10, 'efectivo') $$,
  '42501', null, 'no registra pagos en un pedido de Norte');
select throws_ok($$ select public.registrar_compra('d0000000-0000-0000-0000-00000000000d', null, null, null, null,
  '[{"producto_id": "d3000000-0000-0000-0000-000000000001", "esfera": -2, "cantidad": 1}]', 'd1000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'no registra compras en el inventario de Norte');
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, motivo)
  values ('d0000000-0000-0000-0000-00000000000d', (select id from t where clave = 'vN'), 'perdida', -1, 'Rotura') $$,
  '42501', null, 'ni movimientos sobre el stock de Norte');
select throws_ok($$ update ordenes set sede_id = 'd1000000-0000-0000-0000-000000000002' where id = (select id from t where clave = 'oC') $$,
  'P0001', 'La sede de un registro no cambia', 'un pedido no se cambia de sede');
select results_eq($$ select sede_id from miembro_sedes $$, $$ values ('d1000000-0000-0000-0000-000000000001'::uuid) $$,
  'el vendedor solo ve sus propias asignaciones');

-- ---------------------------------------------------------------------------
-- 2. Propietario: todas las sedes y el consolidado
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
insert into t values ('oS', public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', p_precio => 150, p_sede => 'd1000000-0000-0000-0000-000000000003'));
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('d0000000-0000-0000-0000-00000000000d', (select id from t where clave = 'oS'), 30, 'yape_plin');
insert into metas_ventas (optica_id, sede_id, periodo, importe_objetivo) values
  ('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', date_trunc('month', now() at time zone 'America/Lima')::date, 500),
  ('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002', date_trunc('month', now() at time zone 'America/Lima')::date, 1000);

select throws_ok($$ select public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001') $$, 'P0001', 'Indica la sede', 'con varias sedes, el pedido exige indicar la sede');
select results_eq($$ select nombre from sedes order by nombre $$, $$ values ('Centro'), ('Norte'), ('Sur') $$,
  'el propietario ve las 3 sedes');
select is((select count(*)::int from ordenes), 3, 'y los pedidos de todas');
select results_eq($$ select sede, ventas::text, ordenes, meta::text, pedidos_en_curso, saldo_pendiente::text, cobrado::text
                     from public.reporte_consolidado('d0000000-0000-0000-0000-00000000000d') $$,
  $$ values ('Centro', '0.00',   0, '500.00',  1, '150.00', '50.00'),
            ('Norte',  '300.00', 1, '1000.00', 1, '200.00', '100.00'),
            ('Sur',    '0.00',   0, null,      1, '120.00', '30.00') $$,
  'el consolidado trae ventas, pedidos, metas, saldos y cobros por sede');
select is((select cobrado::text from public.caja_del_dia('d0000000-0000-0000-0000-00000000000d')), '180.00',
  'la caja consolidada suma las 3 sedes');
select is((select cobrado::text from public.caja_del_dia('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000002')), '100.00',
  'la caja de una sede solo cuenta esa sede');
select results_eq($$ select ventas::text, ordenes, meta::text from public.ventas_mensuales('d0000000-0000-0000-0000-00000000000d', 1, 'd1000000-0000-0000-0000-000000000002') $$,
  $$ values ('300.00', 1, '1000.00') $$, 'ventas y meta del mes de Norte');
select results_eq($$ select ventas::text, meta::text from public.ventas_mensuales('d0000000-0000-0000-0000-00000000000d', 1) $$,
  $$ values ('300.00', '1500.00') $$, 'ventas y metas consolidadas');
select throws_ok($$ select public.reservar_luna((select id from t where clave = 'oC'), 'OD', (select id from t where clave = 'vN')) $$,
  'P0001', 'Esa medida es del stock de otra sede', 'un pedido solo reserva lunas del stock de su sede');
select lives_ok($$ select public.reservar_luna((select id from t where clave = 'oC'), 'OD', (select id from t where clave = 'vC')) $$,
  'reserva del stock de su propia sede');

-- ---------------------------------------------------------------------------
-- 3. Administrador de Centro y Norte
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq($$ select nombre from sedes order by nombre $$, $$ values ('Centro'), ('Norte') $$,
  'el administrador de 2 sedes no ve la tercera');
select is_empty($$ select 1 from ordenes where sede_id = 'd1000000-0000-0000-0000-000000000003' $$, 'ni sus pedidos');
select is_empty($$ select 1 from orden_ojos where orden_id = (select id from t where clave = 'oS') $$, 'ni el detalle de esos pedidos');
select is_empty($$ select 1 from orden_pagos where sede_id = 'd1000000-0000-0000-0000-000000000003' $$, 'ni su caja');
select is((select cobrado::text from public.caja_del_dia('d0000000-0000-0000-0000-00000000000d')), '150.00',
  'su caja consolidada solo suma sus 2 sedes');
select throws_ok($$ select * from public.caja_del_dia('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000003') $$,
  '42501', null, 'no puede pedir la caja de la tercera sede');
select results_eq($$ select meta::text from public.ventas_mensuales('d0000000-0000-0000-0000-00000000000d', 1) $$,
  $$ values ('1500.00') $$, 've las metas de sus sedes');
select throws_ok($$ insert into metas_ventas (optica_id, sede_id, periodo, importe_objetivo)
  values ('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000003', '2099-01-01', 100) $$,
  '42501', null, 'no fija metas de la tercera sede');
select is_empty($$ select 1 from auditoria where sede_id = 'd1000000-0000-0000-0000-000000000003' $$,
  'ni ve su auditoría');
select isnt_empty($$ select 1 from auditoria where sede_id = 'd1000000-0000-0000-0000-000000000001' $$,
  'sí ve la auditoría de sus sedes');
select throws_ok($$ select * from public.reporte_consolidado('d0000000-0000-0000-0000-00000000000d') $$,
  '42501', null, 'el consolidado de sedes es solo del propietario');
select lives_ok($$ update sedes set telefono = '987654321' where id = 'd1000000-0000-0000-0000-000000000001' $$,
  'edita los datos de contacto de sus sedes');
select throws_ok($$ update sedes set activa = false where id = 'd1000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'pero no las desactiva');
select throws_ok($$ insert into miembro_sedes (optica_id, usuario_id, sede_id)
  values ('d0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'ni asigna usuarios a sedes');

-- ---------------------------------------------------------------------------
-- 4. Gestión de sedes por el propietario
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ insert into sedes (optica_id, nombre, whatsapp_phone_number_id)
  values ('d0000000-0000-0000-0000-00000000000d', 'Este', '1234567890') $$, 'el propietario crea sedes');
select lives_ok($$ insert into miembro_sedes (optica_id, usuario_id, sede_id)
  select 'd0000000-0000-0000-0000-00000000000d', 'dddddddd-0000-0000-0000-000000000003', id from sedes where nombre = 'Este' $$,
  'y asigna usuarios a cada sede');
select lives_ok($$ update sedes set activa = false where id = 'd1000000-0000-0000-0000-000000000003' $$, 'desactiva una sede');
select throws_ok($$ select public.crear_orden('d4000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', p_sede => 'd1000000-0000-0000-0000-000000000003') $$,
  'P0001', 'La sede no existe o está desactivada', 'una sede desactivada no recibe pedidos nuevos');
select is((select count(*)::int from ordenes where sede_id = 'd1000000-0000-0000-0000-000000000003'), 1,
  'pero conserva su historial');
select throws_ok($$ delete from sedes where id = 'd1000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'las sedes no se borran');

-- ---------------------------------------------------------------------------
-- 5. Otra óptica
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select 1 from sedes where optica_id = 'd0000000-0000-0000-0000-00000000000d'
                   union all select 1 from ordenes where optica_id = 'd0000000-0000-0000-0000-00000000000d'
                   union all select 1 from orden_pagos where optica_id = 'd0000000-0000-0000-0000-00000000000d'
                   union all select 1 from lunas_variantes where optica_id = 'd0000000-0000-0000-0000-00000000000d'
                   union all select 1 from pacientes where optica_id = 'd0000000-0000-0000-0000-00000000000d'
                   union all select 1 from miembro_sedes where optica_id = 'd0000000-0000-0000-0000-00000000000d' $$,
  'nadie de otra óptica ve sedes, pedidos, caja, inventario, pacientes ni asignaciones de Zamora');
select throws_ok($$ select * from public.reporte_consolidado('d0000000-0000-0000-0000-00000000000d') $$,
  '42501', null, 'ni su consolidado');
select throws_ok($$ insert into ordenes (optica_id, sede_id, paciente_id, receta_id, laboratorio_id)
  values ('d0000000-0000-0000-0000-00000000000d', 'd1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001',
          'd5000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'ni crea pedidos en sus sedes');

-- Zamora tampoco ve a la otra óptica.
set local request.jwt.claims to '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select 1 from sedes where optica_id = 'e0000000-0000-0000-0000-00000000000e' $$,
  'el propietario de Zamora no ve las sedes de otra óptica');

select * from finish();
rollback;
