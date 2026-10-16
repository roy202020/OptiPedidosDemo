-- OptiPedidos · Pruebas del inventario de lunas por medida exacta (migración 0007)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

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
insert into recetas (id, optica_id, paciente_id, od_esfera, oi_esfera, oi_cilindro, oi_eje, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001',
   -2.00, -2.50, 0.50, 90, 'aaaaaaaa-0000-0000-0000-000000000001');
insert into lunas_productos (id, optica_id, nombre, tipo, tratamiento, vision, por_lado, stock_minimo_defecto) values
  ('4a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Resina blanca', 'resina', null, 'monofocal', false, 4),
  ('4a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Fotoblue AR azul', 'resina', 'Fotoblue', 'monofocal', false, 0),
  ('4a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Progresivo ficticio', 'resina', null, 'progresivo', true, 0);

-- Ayudante: stock de una medida exacta de un producto.
create function pg_temp.stock(p_producto uuid, p_esfera numeric, p_cilindro numeric) returns integer
language sql as $$
  select stock from lunas_variantes where producto_id = p_producto and esfera = p_esfera and cilindro = p_cilindro
$$;

create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

set local role authenticated;
-- Operador de A
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Compras de muchas medidas en una operación
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', 'Proveedor ficticio', 'F001-1', null, null, '[
  {"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -2.00, "cilindro": 0,     "cantidad": 24, "costo_unitario": 15},
  {"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -2.50, "cilindro": 0,     "cantidad": 16},
  {"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -2.00, "cilindro": -0.50, "cantidad": 10},
  {"producto_id": "4a000000-0000-0000-0000-000000000002", "esfera": -2.00, "cilindro": 0,     "cantidad": 20}
]') $$, 'el operador registra una compra de varias medidas');

select results_eq($$ select pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.00, 0),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.50, 0),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.00, -0.50),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000002', -2.00, 0) $$,
  $$ values (24, 16, 10, 20) $$, 'cada combinación tiene su propio stock (12, 8 y 5 pares; 10 pares Fotoblue)');
select is((select stock_minimo from lunas_variantes where producto_id = '4a000000-0000-0000-0000-000000000001' and esfera = -2.50), 4,
  'la variante nueva toma el mínimo por defecto del producto');

select lives_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -2.00, "cilindro": 0, "cantidad": 4}]') $$,
  'segunda compra de una medida existente');
select results_eq($$ select pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.00, 0),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.50, 0),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.00, -0.50),
                            pg_temp.stock('4a000000-0000-0000-0000-000000000002', -2.00, 0) $$,
  $$ values (28, 16, 10, 20) $$, 'la entrada solo afecta a su combinación');
select is((select count(*)::int from lunas_variantes where producto_id = '4a000000-0000-0000-0000-000000000001'), 3,
  'no duplica variantes de la misma medida');

select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -1.00, "cilindro": 0.50, "cantidad": 2}]') $$,
  '23514', null, 'el stock se guarda en cilindro negativo');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -1.13, "cilindro": 0, "cantidad": 2}]') $$,
  '23514', null, 'la esfera va en pasos de 0.25');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -1.00, "cilindro": 0, "cantidad": 0}]') $$,
  'P0001', null, 'cada línea necesita cantidad');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": 1, "cilindro": 0, "cantidad": 2},
    {"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": 2, "cilindro": 0, "adicion": 1.00, "cantidad": 2}]') $$,
  'P0001', 'Un producto monofocal no lleva adición', 'un monofocal no lleva adición…');
select is((select count(*)::int from lunas_variantes where esfera in (1, 2)), 0, '…y una compra con error no registra nada (atómica)');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000003", "esfera": 1, "cilindro": 0, "lado": "OD", "cantidad": 2}]') $$,
  'P0001', 'Un producto progresivo requiere la adición', 'un progresivo requiere adición');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000003", "esfera": 1, "cilindro": 0, "adicion": 2, "cantidad": 2}]') $$,
  'P0001', 'Este producto distingue OD y OI: indica el lado', 'un producto por lado exige OD u OI');
select lives_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000003", "esfera": 1, "cilindro": 0, "adicion": 2, "lado": "OD", "cantidad": 1},
    {"producto_id": "4a000000-0000-0000-0000-000000000003", "esfera": 1, "cilindro": 0, "adicion": 2, "lado": "OI", "cantidad": 1}]') $$,
  'OD y OI de la misma medida son variantes distintas');

-- ---------------------------------------------------------------------------
-- 2. Salidas, ajustes y protección del stock
-- ---------------------------------------------------------------------------
insert into t select 'v200', id from lunas_variantes where producto_id = '4a000000-0000-0000-0000-000000000001' and esfera = -2.00 and cilindro = 0;
insert into t select 'v250', id from lunas_variantes where producto_id = '4a000000-0000-0000-0000-000000000001' and esfera = -2.50;

select lives_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v200'), 'venta', -6) $$, 'el operador registra una venta');
select results_eq($$ select stock_anterior, stock_resultante, creado_por::text from inventario_movimientos order by id desc limit 1 $$,
  $$ values (28, 22, 'aaaaaaaa-0000-0000-0000-000000000002') $$, 'el movimiento guarda el stock antes y después, y quién lo hizo');
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, motivo)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'perdida', -20, 'Rotas') $$,
  'P0001', 'Stock insuficiente: hay 16 disponibles', 'no deja stock negativo');
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, motivo)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'ajuste', -1, 'Conteo') $$,
  '42501', null, 'el operador no hace ajustes');
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, autoriza_negativo)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'venta', -20, true) $$,
  '42501', null, 'el operador no autoriza stock negativo');
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'compra', -1) $$,
  '23514', null, 'una compra siempre suma');
select throws_ok($$ update lunas_variantes set stock = 999 where id = (select id from t where clave = 'v250') $$,
  '42501', null, 'el stock no se edita directamente');
select throws_ok($$ update inventario_movimientos set cantidad = 1 $$, '42501', null, 'los movimientos no se editan');
select throws_ok($$ delete from inventario_movimientos $$, '42501', null, 'los movimientos no se borran');
select lives_ok($$ update lunas_variantes set stock_minimo = 6, ubicacion = 'Cajón A3' where id = (select id from t where clave = 'v250') $$,
  'mínimo y ubicación sí se editan');

-- Propietario
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'ajuste', -1) $$,
  '23514', null, 'un ajuste exige motivo');
select lives_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, motivo)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'ajuste', -1, 'Luna rayada') $$,
  'el propietario ajusta con motivo');
select lives_ok($$ insert into inventario_movimientos (optica_id, variante_id, tipo, cantidad, motivo, autoriza_negativo)
  values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'v250'), 'venta', -16, 'Venta urgente', true) $$,
  'con autorización explícita se permite quedar en negativo');
select is(pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.50, 0), -1, 'el stock negativo autorizado queda registrado');

-- ---------------------------------------------------------------------------
-- 3. Órdenes: reservar, descontar, devolver y liberar
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
insert into t values ('orden', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a'));

select lives_ok($$ select public.reservar_luna((select id from t where clave = 'orden'), 'OD', (select id from t where clave = 'v200')) $$,
  'el operador reserva una luna para el OD');
select results_eq($$ select stock, reservado from lunas_variantes where id = (select id from t where clave = 'v200') $$,
  $$ values (22, 1) $$, 'la reserva no descuenta stock, lo aparta');
select throws_ok($$ select public.reservar_luna((select id from t where clave = 'orden'), 'OI', (select id from t where clave = 'v250')) $$,
  'P0001', null, 'no reserva una medida sin stock disponible');
select lives_ok($$ select public.reservar_luna((select id from t where clave = 'orden'), 'OD', (select id from t where clave = 'v200')) $$,
  'volver a reservar el mismo ojo reemplaza la reserva');
select is((select reservado from lunas_variantes where id = (select id from t where clave = 'v200')), 1, 'sin reservas duplicadas');

update ordenes set estado = 'enviada' where id = (select id from t where clave = 'orden');
select results_eq($$ select stock, reservado from lunas_variantes where id = (select id from t where clave = 'v200') $$,
  $$ values (21, 0) $$, 'al enviar al laboratorio se descuenta lo reservado');
select results_eq($$ select tipo::text, cantidad, orden_id from inventario_movimientos where orden_id is not null order by id $$,
  $$ values ('consumo', -1, (select id from t where clave = 'orden')) $$, 'queda un movimiento de consumo ligado a la orden');
select throws_ok($$ select public.liberar_luna((select id from t where clave = 'orden'), 'OD') $$,
  'P0001', null, 'fuera de venta iniciada no se cambia el stock asignado');

update ordenes set estado = 'borrador' where id = (select id from t where clave = 'orden');
select results_eq($$ select stock, reservado from lunas_variantes where id = (select id from t where clave = 'v200') $$,
  $$ values (22, 1) $$, 'si vuelve a venta iniciada se repone y se vuelve a reservar');

update ordenes set estado = 'anulada', motivo_anulacion = 'Prueba' where id = (select id from t where clave = 'orden');
select results_eq($$ select stock, reservado from lunas_variantes where id = (select id from t where clave = 'v200') $$,
  $$ values (22, 0) $$, 'anulada en venta iniciada libera la reserva sin mover stock');
select is((select count(*)::int from inventario_movimientos where orden_id = (select id from t where clave = 'orden')), 2,
  'consumo y devolución, sin movimientos duplicados');

-- ---------------------------------------------------------------------------
-- 4. Inventario físico
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.registrar_conteo('a0000000-0000-0000-0000-00000000000a', null,
  jsonb_build_array(jsonb_build_object('variante_id', (select id from t where clave = 'v200'), 'contado', 20))) $$,
  '42501', null, 'el operador no registra inventarios físicos');

set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.registrar_conteo('a0000000-0000-0000-0000-00000000000a', 'Cierre de mes',
  jsonb_build_array(jsonb_build_object('variante_id', (select id from t where clave = 'v200'), 'contado', 20),
                    jsonb_build_object('variante_id', (select id from t where clave = 'v250'), 'contado', 0))) $$,
  'el propietario registra un inventario físico');
select results_eq($$ select pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.00, 0), pg_temp.stock('4a000000-0000-0000-0000-000000000001', -2.50, 0) $$,
  $$ values (20, 0) $$, 'el stock queda igual a lo contado');
select is((select motivo from inventario_movimientos order by id desc limit 1), 'Inventario físico: Cierre de mes', 'el ajuste lleva motivo');

-- ---------------------------------------------------------------------------
-- 5. Consistencia: el stock de cada variante es exactamente la suma de sus movimientos
-- ---------------------------------------------------------------------------
select is_empty($$ select v.id from lunas_variantes v
                   left join (select variante_id, sum(cantidad) s from inventario_movimientos group by 1) m on m.variante_id = v.id
                   where v.stock <> coalesce(m.s, 0) $$,
  'stock = suma de movimientos en todas las variantes');
select is_empty($$ select v.id from lunas_variantes v
                   left join (select variante_id, sum(cantidad) s from inventario_reservas where estado = 'activa' group by 1) r on r.variante_id = v.id
                   where v.reservado <> coalesce(r.s, 0) $$,
  'reservado = suma de reservas activas');

-- ---------------------------------------------------------------------------
-- 6. Aislamiento entre ópticas
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from lunas_variantes $$, 'B no ve el inventario de A');
select throws_ok($$ select public.registrar_compra('a0000000-0000-0000-0000-00000000000a', null, null, null, null,
  '[{"producto_id": "4a000000-0000-0000-0000-000000000001", "esfera": -2.00, "cilindro": 0, "cantidad": 50}]') $$,
  '42501', null, 'B no registra compras en A');

select * from finish();
rollback;
