-- OptiPedidos · Pruebas de aislamiento entre ópticas (RLS y privilegios)
-- Ejecutar con:  npx supabase test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
-- Los datos son ficticios.

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS)
-- ---------------------------------------------------------------------------
-- Usuarios: A1 propietario de A, A2 operador de A, B1 propietario de B, X sin óptica
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a2@prueba.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1@prueba.test', 'authenticated', 'authenticated'),
  ('99999999-0000-0000-0000-000000000001', 'x@prueba.test',  'authenticated', 'authenticated');

insert into opticas (id, nombre) values
  ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A'),
  ('b0000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B');

insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'operador'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');

insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A'),
  ('1b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Lab B');

insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('2a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Paciente', 'Ficticio A', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Paciente', 'Ficticio B', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into recetas (id, optica_id, paciente_id, od_esfera, oi_esfera, creado_por) values
  ('3a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-00000000000a', -1.00, -1.25, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-00000000000b',  1.00,  1.25, 'bbbbbbbb-0000-0000-0000-000000000001');

insert into ordenes (id, optica_id, paciente_id, receta_id, laboratorio_id, creado_por) values
  ('4a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-00000000000a', '3a000000-0000-0000-0000-00000000000a', '1a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('4b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-00000000000b', '3b000000-0000-0000-0000-00000000000b', '1b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into orden_ojos (optica_id, orden_id, ojo, esfera) values
  ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-00000000000a', 'OD', -1.00),
  ('b0000000-0000-0000-0000-00000000000b', '4b000000-0000-0000-0000-00000000000b', 'OD',  1.00);

insert into orden_observaciones (optica_id, orden_id, texto, creado_por) values
  ('b0000000-0000-0000-0000-00000000000b', '4b000000-0000-0000-0000-00000000000b', 'Nota interna de B', 'bbbbbbbb-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Usuario anónimo (solo clave publishable, sin sesión)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok($$ select * from pacientes $$, '42501', null, 'anon no puede leer pacientes');
select throws_ok($$ select * from recetas $$, '42501', null, 'anon no puede leer recetas');
select throws_ok($$ select * from ordenes $$, '42501', null, 'anon no puede leer órdenes');
select throws_ok($$ insert into pacientes (optica_id, nombres, apellidos)
                   values ('a0000000-0000-0000-0000-00000000000a', 'X', 'Y') $$,
                 '42501', null, 'anon no puede crear pacientes');
select throws_ok($$ select crear_optica('Intrusa') $$, '42501', null, 'anon no puede crear ópticas');

reset role;

-- ---------------------------------------------------------------------------
-- 2. Propietario de la óptica A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select results_eq($$ select id from opticas $$,
  $$ values ('a0000000-0000-0000-0000-00000000000a'::uuid) $$, 'A1 solo ve su óptica');
select results_eq($$ select id from pacientes $$,
  $$ values ('2a000000-0000-0000-0000-00000000000a'::uuid) $$, 'A1 solo ve pacientes de A');
select results_eq($$ select id from recetas $$,
  $$ values ('3a000000-0000-0000-0000-00000000000a'::uuid) $$, 'A1 solo ve recetas de A');
select results_eq($$ select id from ordenes $$,
  $$ values ('4a000000-0000-0000-0000-00000000000a'::uuid) $$, 'A1 solo ve órdenes de A');
select is((select count(*) from orden_ojos where optica_id <> 'a0000000-0000-0000-0000-00000000000a'), 0::bigint,
  'A1 no ve especificaciones de lentes de B');
select is((select count(*) from laboratorios where optica_id <> 'a0000000-0000-0000-0000-00000000000a'), 0::bigint,
  'A1 no ve laboratorios de B');
select is_empty($$ select * from orden_observaciones $$, 'A1 no ve observaciones de B');
select is((select count(*) from miembros where optica_id <> 'a0000000-0000-0000-0000-00000000000a'), 0::bigint,
  'A1 no ve miembros de B');

-- Intentos de escribir en B
select throws_ok($$ insert into pacientes (optica_id, nombres, apellidos)
                   values ('b0000000-0000-0000-0000-00000000000b', 'Intruso', 'A') $$,
                 '42501', null, 'A1 no puede crear pacientes en B');
select is_empty($$ update pacientes set notas = 'alterado' where id = '2b000000-0000-0000-0000-00000000000b' returning id $$,
  'A1 no puede modificar pacientes de B');
select is_empty($$ update ordenes set prioridad = 'urgente' where id = '4b000000-0000-0000-0000-00000000000b' returning id $$,
  'A1 no puede modificar órdenes de B');
select is_empty($$ update opticas set nombre = 'Hackeada' where id = 'b0000000-0000-0000-0000-00000000000b' returning id $$,
  'A1 no puede renombrar la óptica B');
select throws_ok($$ update pacientes set optica_id = 'b0000000-0000-0000-0000-00000000000b'
                   where id = '2a000000-0000-0000-0000-00000000000a' $$,
                 '42501', null, 'A1 no puede mover un paciente a B');
select throws_ok($$ insert into miembros (optica_id, usuario_id, rol)
                   values ('b0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario') $$,
                 '42501', null, 'A1 no puede unirse a la óptica B');
select throws_ok($$ insert into ordenes (optica_id, paciente_id, receta_id, laboratorio_id)
                   values ('a0000000-0000-0000-0000-00000000000a', '2b000000-0000-0000-0000-00000000000b',
                           '3b000000-0000-0000-0000-00000000000b', '1a000000-0000-0000-0000-00000000000a') $$,
                 '23503', null, 'A1 no puede crear una orden con paciente y receta de B');

-- Tablas y funciones internas
select throws_ok($$ select * from secuencias_orden $$, '42501', null, 'secuencias internas no accesibles');
select throws_ok($$ insert into orden_historial_estados (optica_id, orden_id, hasta)
                   values ('a0000000-0000-0000-0000-00000000000a', '4a000000-0000-0000-0000-00000000000a', 'entregada') $$,
                 '42501', null, 'el historial de estados no se puede falsificar');
select throws_ok($$ select siguiente_numero_orden('a0000000-0000-0000-0000-00000000000a') $$,
                 '42501', null, 'la numeración no se puede invocar desde la API');
select is((select count(*) from auditoria where optica_id <> 'a0000000-0000-0000-0000-00000000000a'), 0::bigint,
  'A1 no ve auditoría de B');
select isnt((select count(*) from auditoria), 0::bigint, 'A1 (propietario) sí ve la auditoría de A');

reset role;

-- ---------------------------------------------------------------------------
-- 3. Operador de A: no puede ascenderse ni ver auditoría
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

select is_empty($$ update miembros set rol = 'propietario'
                   where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002' returning usuario_id $$,
  'el operador no puede ascenderse a propietario');
select is_empty($$ select * from auditoria $$, 'el operador no ve la auditoría');
select is_empty($$ update opticas set nombre = 'Cambio' returning id $$, 'el operador no edita datos de la óptica');
select isnt_empty($$ select * from pacientes $$, 'el operador sí trabaja con pacientes de su óptica');

reset role;

-- ---------------------------------------------------------------------------
-- 4. Usuario sin óptica
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated"}';

select is_empty($$ select * from pacientes $$, 'un usuario sin óptica no ve pacientes');
select isnt(crear_optica('Óptica Ficticia X'), null, 'un usuario puede registrar su propia óptica');
select is((select rol::text from miembros where usuario_id = '99999999-0000-0000-0000-000000000001'),
  'propietario', 'quien crea la óptica queda como propietario');

reset role;

select * from finish();
rollback;
