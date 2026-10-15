-- OptiPedidos · Pruebas de reglas de negocio: recetas, órdenes, borrado y auditoría
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1@prueba.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1@prueba.test', 'authenticated', 'authenticated');
insert into opticas (id, nombre) values
  ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');
insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');
insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A'),
  ('1b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Lab B');
insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana',  'Prueba Uno', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Luis', 'Prueba Dos', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Eva',  'Prueba B',   'bbbbbbbb-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', 0.50, 'bbbbbbbb-0000-0000-0000-000000000001');

-- Desde aquí actúa A1 a través de la API
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Recetas: valores y signos exactos
-- ---------------------------------------------------------------------------
select lives_ok($$
  insert into recetas (id, optica_id, paciente_id,
    od_esfera, od_cilindro, od_eje, od_adicion, od_dnp,
    oi_esfera, oi_cilindro, oi_eje, oi_adicion, oi_dnp)
  values ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
          '2a000000-0000-0000-0000-000000000001',
          -2.25, -0.75, 180, 2.00, 31.5,
          +1.50, +0.50,  90, 2.00, 32.0) $$, 'se registra una receta completa');

select results_eq($$ select od_esfera::text, od_cilindro::text, od_eje::smallint, oi_esfera::text, oi_cilindro::text, oi_eje::smallint
                     from recetas where id = '3a000000-0000-0000-0000-000000000001' $$,
  $$ values ('-2.25', '-0.75', 180::smallint, '1.50', '0.50', 90::smallint) $$,
  'se conservan signos y valores exactos (sin redondeo)');
select lives_ok($$ insert into recetas (optica_id, paciente_id, od_esfera, od_cilindro, od_eje)
                   values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', 0, -0.25, 0) $$,
  'acepta esfera neutra y eje 0');
select throws_ok($$ insert into recetas (optica_id, paciente_id, od_esfera)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -2.30) $$,
  '23514', null, 'rechaza esfera que no es múltiplo de 0.25');
select throws_ok($$ insert into recetas (optica_id, paciente_id, od_esfera)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -25.00) $$,
  '23514', null, 'rechaza esfera fuera de rango');
select throws_ok($$ insert into recetas (optica_id, paciente_id, od_esfera, od_cilindro, od_eje)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1, -1, 181) $$,
  '23514', null, 'rechaza eje mayor a 180');
select throws_ok($$ insert into recetas (optica_id, paciente_id, od_esfera, od_cilindro)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1, -1) $$,
  '23514', null, 'rechaza cilindro sin eje');
select throws_ok($$ insert into recetas (optica_id, paciente_id)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'rechaza receta sin ningún valor');
select throws_ok($$ insert into recetas (optica_id, paciente_id, od_esfera, od_adicion)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', 1, 0) $$,
  '23514', null, 'rechaza adición 0 (se deja vacía si no aplica)');

-- ---------------------------------------------------------------------------
-- 2. Recetas: inmutables, se anulan con motivo, no se borran
-- ---------------------------------------------------------------------------
select throws_ok($$ update recetas set od_esfera = -2.00 where id = '3a000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'una receta no se puede modificar');
select throws_ok($$ delete from recetas where id = '3a000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'una receta no se puede borrar desde la API');
select lives_ok($$ insert into recetas (id, optica_id, paciente_id, reemplaza_a, od_esfera)
                   values ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a',
                           '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', -2.00) $$,
  'una corrección se registra como receta nueva que reemplaza a la anterior');
select throws_ok($$ insert into recetas (optica_id, paciente_id, reemplaza_a, od_esfera)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001',
                            '3b000000-0000-0000-0000-000000000001', -2.00) $$,
  '23503', null, 'no se puede reemplazar una receta de otra óptica');
select is((select creado_por from recetas where id = '3a000000-0000-0000-0000-000000000002'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'el autor de la receta queda registrado');

-- ---------------------------------------------------------------------------
-- 3. Creación de órdenes
-- ---------------------------------------------------------------------------
select lives_ok($$
  insert into ordenes (id, optica_id, paciente_id, receta_id, laboratorio_id, numero, estado, creado_por)
  values ('4a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a',
          '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
          '1a000000-0000-0000-0000-00000000000a', 999, 'entregada', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  'se crea una orden');
select results_eq($$ select numero, estado::text, creado_por from ordenes where id = '4a000000-0000-0000-0000-000000000001' $$,
  $$ values (1, 'borrador', 'aaaaaaaa-0000-0000-0000-000000000001'::uuid) $$,
  'número, estado inicial y autor los fija el servidor, no el cliente');
select lives_ok($$
  insert into ordenes (id, optica_id, paciente_id, receta_id, laboratorio_id)
  values ('4a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a',
          '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000002',
          '1a000000-0000-0000-0000-00000000000a') $$, 'se crea una segunda orden');
select is((select numero from ordenes where id = '4a000000-0000-0000-0000-000000000002'), 2,
  'la numeración es correlativa por óptica');
select throws_ok($$ insert into ordenes (optica_id, paciente_id, receta_id, laboratorio_id)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000002',
                            '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a') $$,
  'P0001', null, 'no se puede usar la receta de otro paciente');
select lives_ok($$ insert into orden_ojos (optica_id, orden_id, ojo, esfera, cilindro, eje, material, indice)
                   values ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-000000000001', 'OD', -2.25, -0.75, 180, 'policarbonato', 1.59),
                          ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-000000000001', 'OI',  1.50,  0.50,  90, 'policarbonato', 1.59) $$,
  'se registran las especificaciones de ambos ojos');
select throws_ok($$ insert into orden_ojos (optica_id, orden_id, ojo, esfera)
                    values ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-000000000001', 'OD', -1) $$,
  '23505', null, 'no se duplica un ojo en la misma orden');

-- ---------------------------------------------------------------------------
-- 4. Estados y edición controlada
-- ---------------------------------------------------------------------------
select lives_ok($$ update ordenes set montura_descripcion = 'Montura metálica' where id = '4a000000-0000-0000-0000-000000000001' $$,
  'en borrador la orden es editable');
select lives_ok($$ update ordenes set estado = 'enviada' where id = '4a000000-0000-0000-0000-000000000001' $$,
  'borrador -> enviada');
select results_eq($$ select desde::text, hasta::text from orden_historial_estados where orden_id = '4a000000-0000-0000-0000-000000000001' $$,
  $$ values ('borrador', 'enviada') $$, 'el cambio de estado queda en el historial');
select throws_ok($$ update ordenes set estado = 'entregada' where id = '4a000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'no se pueden saltar estados (enviada -> entregada)');
select throws_ok($$ update ordenes set montura_descripcion = 'Otra' where id = '4a000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'una orden enviada no se puede editar');
select throws_ok($$ update orden_ojos set esfera = -3 where orden_id = '4a000000-0000-0000-0000-000000000001' and ojo = 'OD' $$,
  'P0001', null, 'las especificaciones de una orden enviada no se pueden editar');
select lives_ok($$ insert into orden_observaciones (optica_id, orden_id, texto)
                   values ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-000000000001', 'Laboratorio confirma recepción') $$,
  'se pueden agregar observaciones en cualquier estado');
select throws_ok($$ update orden_observaciones set texto = 'editado' $$,
  '42501', null, 'las observaciones no se pueden editar');

-- Anular la receta no debe bloquear una orden ya enviada (corrección de la migración 0002)
select lives_ok($$ update recetas set anulada_en = now(), motivo_anulacion = 'Error de digitación'
                   where id = '3a000000-0000-0000-0000-000000000001' $$, 'una receta se anula indicando el motivo');
select lives_ok($$ update ordenes set estado = 'recibida_lab' where id = '4a000000-0000-0000-0000-000000000001' $$,
  'la orden enviada sigue avanzando aunque su receta se anule');
select throws_ok($$ insert into ordenes (optica_id, paciente_id, receta_id, laboratorio_id)
                    values ('a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001',
                            '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a') $$,
  'P0001', null, 'no se crean órdenes con una receta anulada');

-- ---------------------------------------------------------------------------
-- 5. Anulación y no borrado
-- ---------------------------------------------------------------------------
select throws_ok($$ update ordenes set estado = 'anulada' where id = '4a000000-0000-0000-0000-000000000002' $$,
  '23514', null, 'anular una orden exige motivo');
select lives_ok($$ update ordenes set estado = 'anulada', motivo_anulacion = 'Paciente desistió'
                   where id = '4a000000-0000-0000-0000-000000000002' $$, 'una orden se anula con motivo');
select throws_ok($$ delete from ordenes where id = '4a000000-0000-0000-0000-000000000002' $$,
  '42501', null, 'una orden no se puede borrar desde la API');

reset role;

-- Ni siquiera un administrador con acceso total a la base puede borrar
select throws_ok($$ delete from ordenes where id = '4a000000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'el borrado de órdenes está bloqueado también para el administrador de la base');

-- ---------------------------------------------------------------------------
-- 6. Auditoría
-- ---------------------------------------------------------------------------
select cmp_ok((select count(*) from auditoria
               where tabla = 'ordenes' and registro_id = '4a000000-0000-0000-0000-000000000001'),
  '>=', 4::bigint, 'cada creación y cambio de la orden queda auditado');

select * from finish();
rollback;
