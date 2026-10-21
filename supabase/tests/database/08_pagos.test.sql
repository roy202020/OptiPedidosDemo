-- OptiPedidos · Pruebas de pagos de las órdenes (migración 0008)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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

insert into cajas (optica_id, sede_id, abierta_por, monto_inicial) select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s where not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);  -- caja abierta: el efectivo entra a la caja (0015)
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

-- Orden con importe neto de S/ 450.00 (precio 500, descuento 50), todavía en venta iniciada.
insert into t values ('o1', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 500, p_descuento => 50));

-- ---------------------------------------------------------------------------
-- 1. Registro de pagos
-- ---------------------------------------------------------------------------
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 200, 'efectivo')
  returning id $$, 'registra un adelanto en venta iniciada');
insert into t select 'p1', id from orden_pagos where importe = 200;
select results_eq($$ select importe::text, medio, fecha, creado_por::text, anulado_en from orden_pagos where id = (select id from t where clave = 'p1') $$,
  $$ values ('200.00', 'efectivo', (now() at time zone 'America/Lima')::date, 'aaaaaaaa-0000-0000-0000-000000000001', null::timestamptz) $$,
  'guarda importe, medio, fecha de Lima y autor');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio, creado_por)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 10, 'efectivo', 'aaaaaaaa-0000-0000-0000-000000000002') $$,
  '42501', null, 'el autor no lo elige el cliente');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 0, 'efectivo') $$,
  '23514', null, 'el importe debe ser mayor que cero');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), -5, 'efectivo') $$,
  '23514', null, 'el importe no puede ser negativo');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 10, 'cheque') $$,
  '23514', null, 'solo medios de pago conocidos');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio, fecha)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 10, 'efectivo', current_date + 2) $$,
  'P0001', 'La fecha del pago no puede estar en el futuro', 'la fecha del pago no puede estar en el futuro');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio, fecha)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 50, 'tarjeta', current_date - 3) $$,
  'acepta un pago con fecha pasada');

-- ---------------------------------------------------------------------------
-- 2. Saldo: lo pagado nunca supera el importe neto
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 200.01, 'transferencia') $$,
  'P0001', 'El pago (S/ 200.01) supera el saldo pendiente (S/ 200.00)', 'un pago no puede superar el saldo');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 200, 'yape_plin') $$,
  'un pago puede cancelar exactamente el saldo');
insert into t select 'p3', id from orden_pagos where medio = 'yape_plin';
select is((select sum(importe)::text from orden_pagos where orden_id = (select id from t where clave = 'o1') and anulado_en is null),
  '450.00', 'la orden queda pagada por completo');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 0.01, 'efectivo') $$,
  'P0001', null, 'sin saldo no se registran más pagos');
select throws_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o1'), '1a000000-0000-0000-0000-00000000000a',
  'lentes_completos', null, null, null, 'normal', '{}', 400, 0) $$,
  'P0001', null, 'el importe neto no puede bajar de lo ya pagado');
select lives_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o1'), '1a000000-0000-0000-0000-00000000000a',
  'lentes_completos', null, null, null, 'normal', '{}', 600, 50) $$,
  'el importe neto puede subir aunque ya haya pagos');

-- ---------------------------------------------------------------------------
-- 3. Inmutabilidad y anulación
-- ---------------------------------------------------------------------------
select throws_ok($$ update orden_pagos set importe = 1 where id = (select id from t where clave = 'p1') $$,
  '42501', null, 'el importe de un pago no se edita');
select throws_ok($$ delete from orden_pagos where id = (select id from t where clave = 'p1') $$,
  '42501', null, 'los pagos no se borran');
select throws_ok($$ update orden_pagos set motivo_anulacion = '  ' where id = (select id from t where clave = 'p3') $$,
  'P0001', 'Indica el motivo de la anulación del pago', 'anular exige un motivo');
select lives_ok($$ update orden_pagos set motivo_anulacion = 'Yape rechazado' where id = (select id from t where clave = 'p3') $$,
  'se anula un pago con motivo');
select results_eq($$ select anulado_en is not null, anulado_por::text, motivo_anulacion from orden_pagos where id = (select id from t where clave = 'p3') $$,
  $$ values (true, 'aaaaaaaa-0000-0000-0000-000000000001', 'Yape rechazado') $$, 'el servidor fija cuándo y quién anuló');
select throws_ok($$ update orden_pagos set motivo_anulacion = 'Otra vez' where id = (select id from t where clave = 'p3') $$,
  'P0001', 'El pago ya está anulado', 'un pago anulado no cambia');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 290, 'transferencia') $$,
  'lo anulado libera saldo para otro pago');
select is((select count(*)::int from auditoria where tabla = 'orden_pagos'), 5,
  'cada alta y anulación queda en la auditoría');

-- ---------------------------------------------------------------------------
-- 4. Órdenes confirmadas y anuladas
-- ---------------------------------------------------------------------------
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1');
select results_eq($$ select ventas::text from public.ventas_del_dia('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('550.00') $$, 'la venta del día sigue siendo el importe neto confirmado, no lo cobrado');
insert into t values ('o2', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 100));
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o2'), 40, 'efectivo');
update ordenes set estado = 'anulada', motivo_anulacion = 'Prueba' where id = (select id from t where clave = 'o2');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o2'), 10, 'efectivo') $$,
  'P0001', 'No se registran pagos en una orden anulada', 'no se cobra una orden anulada');
select lives_ok($$ update orden_pagos set motivo_anulacion = 'Devolución al anular la orden'
  where orden_id = (select id from t where clave = 'o2') $$, 'los pagos de una orden anulada se pueden anular (devolución)');

-- ---------------------------------------------------------------------------
-- 5. Permisos: operador y otra óptica
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from orden_pagos), 5, 'el operador ve los pagos de su óptica');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 10, 'efectivo') $$,
  'el operador registra pagos');

set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from orden_pagos $$, 'otra óptica no ve los pagos de A');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 10, 'efectivo') $$,
  '42501', null, 'otra óptica no registra pagos en A');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('b0000000-0000-0000-0000-00000000000b', (select id from t where clave = 'o1'), 10, 'efectivo') $$,
  'P0001', 'La orden no existe', 'un pago no se cuelga de una orden de otra óptica');
update orden_pagos set motivo_anulacion = 'Intruso';  -- el RLS no le deja ver ninguna fila

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from orden_pagos where anulado_en is not null), 2, 'otra óptica no anula pagos de A');

select * from finish();
rollback;
