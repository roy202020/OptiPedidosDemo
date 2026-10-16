-- OptiPedidos · Pruebas del flujo comercial de órdenes (migración 0003)
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
insert into laboratorios (id, optica_id, nombre, activo) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A', true),
  ('1a000000-0000-0000-0000-0000000000ff', 'a0000000-0000-0000-0000-00000000000a', 'Lab A inactivo', false),
  ('1b000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Lab B', true);
insert into pacientes (id, optica_id, nombres, apellidos, creado_por, archivado_en) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana', 'Prueba', 'aaaaaaaa-0000-0000-0000-000000000001', null),
  ('2a000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-00000000000a', 'Archi', 'Vado', 'aaaaaaaa-0000-0000-0000-000000000001', now()),
  ('2b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Eva', 'Prueba B', 'bbbbbbbb-0000-0000-0000-000000000001', null);
insert into recetas (id, optica_id, paciente_id, od_esfera, od_cilindro, od_eje, oi_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1.25, -0.50, 90, -1.00, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', 0.50, null, null, null, 'bbbbbbbb-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', 2.00, 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Estado comercial
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select e::text, public.estado_comercial(e) from unnest(enum_range(null::estado_orden)) e $$,
  $$ values ('borrador', 'venta_iniciada'), ('enviada', 'en_laboratorio'), ('recibida_lab', 'en_laboratorio'),
            ('en_proceso', 'en_laboratorio'), ('lista', 'en_laboratorio'), ('recibida_optica', 'listo_entrega'),
            ('entregada', 'entregado'), ('anulada', 'anulado') $$,
  'cada estado interno tiene su estado comercial');

-- Desde aquí actúa A1 (propietario de A) a través de la API
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 2. Crear orden
-- ---------------------------------------------------------------------------
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

select lives_ok($$
  insert into t values ('o1', public.crear_orden(
    '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a',
    'lentes_completos', 'Montura metálica negra', 'optica', current_date + 7, 'urgente',
    '{"OD": {"material": "Policarbonato", "indice": "1.59", "tratamientos": ["antirreflejo", "filtro_azul"]}, "OI": {"material": "Policarbonato"}}',
    'Paciente pide entrega rápida')) $$,
  'crear_orden crea una orden completa');

select results_eq($$ select numero, estado::text, prioridad, creado_por::text from ordenes where id = (select id from t where clave = 'o1') $$,
  $$ values (1, 'borrador', 'urgente', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'la orden nace en borrador con número correlativo y autor del servidor');

select results_eq($$ select ojo::text, esfera::text, cilindro::text, eje::int, material, tratamientos
                     from orden_ojos where orden_id = (select id from t where clave = 'o1') order by ojo $$,
  $$ values ('OD', '-1.25', '-0.50', 90, 'Policarbonato', array['antirreflejo', 'filtro_azul']),
            ('OI', '-1.00', null, null, 'Policarbonato', '{}'::text[]) $$,
  'copia la graduación de la receta y guarda los datos del lente por ojo');

select is((select count(*)::int from orden_observaciones where orden_id = (select id from t where clave = 'o1')), 1,
  'guarda la observación inicial');

select lives_ok($$
  insert into t values ('o2', public.crear_orden(
    '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-00000000000a')) $$,
  'crear_orden funciona con los valores por defecto');
select is((select array_agg(ojo::text) from orden_ojos where orden_id = (select id from t where clave = 'o2')), array['OD'],
  'solo crea el ojo que tiene graduación en la receta');
select is((select numero from ordenes where id = (select id from t where clave = 'o2')), 2, 'la numeración es correlativa');

select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000009', '3a000000-0000-0000-0000-000000000001',
                    '1a000000-0000-0000-0000-00000000000a') $$,
  'P0001', 'El paciente no existe o está archivado', 'no crea órdenes para pacientes archivados');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
                    '1a000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'El laboratorio no existe o está inactivo', 'no usa laboratorios inactivos');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
                    '1b000000-0000-0000-0000-00000000000b') $$,
  'P0001', 'El laboratorio no existe o está inactivo', 'no usa laboratorios de otra óptica');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
                    '1a000000-0000-0000-0000-00000000000a', 'lentes_completos', null, null, current_date - 1) $$,
  'P0001', 'La fecha prometida no puede estar en el pasado', 'no acepta fechas prometidas pasadas');
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001',
                    '1a000000-0000-0000-0000-00000000000a') $$,
  null, null, 'no usa recetas de otra óptica');

-- ---------------------------------------------------------------------------
-- 3. Editar en borrador
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o1'), '1a000000-0000-0000-0000-00000000000a',
                   'solo_lunas', 'Montura del paciente', 'paciente', current_date + 3, 'normal', '{"OD": {"material": "CR-39"}}') $$,
  'edita una orden en borrador');
select results_eq($$ select o.tipo_trabajo, o.prioridad, oj.material, oj.esfera::text from ordenes o join orden_ojos oj on oj.orden_id = o.id
                     where o.id = (select id from t where clave = 'o1') and oj.ojo = 'OD' $$,
  $$ values ('solo_lunas', 'normal', 'CR-39', '-1.25') $$,
  'actualiza cabecera y lente sin tocar la graduación');

-- ---------------------------------------------------------------------------
-- 4. Transiciones
-- ---------------------------------------------------------------------------
select lives_ok($$ update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1') $$, 'venta iniciada → en laboratorio');
select throws_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o1'), '1a000000-0000-0000-0000-00000000000a',
                    'lentes_completos', null, null, null, 'normal') $$,
  'P0001', null, 'no edita órdenes que ya salieron de borrador');
select throws_ok($$ select public.insertar_orden_ojo((select id from t where clave = 'o2'), 'OD', '{}') $$,
  '23505', null, 'insertar_orden_ojo no duplica un ojo existente');
select lives_ok($$ select public.insertar_orden_ojo((select id from t where clave = 'o2'), 'OI', '{}') $$, 'insertar_orden_ojo sin graduación no falla…');
select is((select count(*)::int from orden_ojos where orden_id = (select id from t where clave = 'o2')), 1, '…ni agrega un ojo que la receta no tiene');
select lives_ok($$ update ordenes set estado = 'recibida_optica' where id = (select id from t where clave = 'o1') $$,
  'atajo: en laboratorio → listo para entrega');
select throws_ok($$ update ordenes set estado = 'anulada', motivo_anulacion = 'x' where id = (select id from t where clave = 'o1') $$,
  'P0001', null, 'listo para entrega no se puede anular');
select lives_ok($$ update ordenes set estado = 'entregada' where id = (select id from t where clave = 'o1') $$, 'listo → entregado');
select throws_ok($$ update ordenes set estado = 'borrador' where id = (select id from t where clave = 'o1') $$,
  'P0001', null, 'una orden entregada no retrocede');
select set_eq($$ select desde::text, hasta::text, usuario_id::text from orden_historial_estados
                     where orden_id = (select id from t where clave = 'o1') $$,
  $$ values ('borrador', 'enviada', 'aaaaaaaa-0000-0000-0000-000000000001'),
            ('enviada', 'recibida_optica', 'aaaaaaaa-0000-0000-0000-000000000001'),
            ('recibida_optica', 'entregada', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  'cada cambio queda en el historial con su usuario');

-- ---------------------------------------------------------------------------
-- 5. Miembros con correo
-- ---------------------------------------------------------------------------
select set_eq($$ select email, rol::text from public.miembros_optica('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('a1@prueba.test', 'propietario'), ('a2@prueba.test', 'operador') $$,
  'un miembro ve los correos de su óptica');
select is_empty($$ select * from public.miembros_optica('b0000000-0000-0000-0000-00000000000b') $$,
  'no ve los miembros de otra óptica');

-- ---------------------------------------------------------------------------
-- 6. Óptica B no puede tocar las órdenes de A
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
                    '1b000000-0000-0000-0000-00000000000b') $$,
  'P0001', 'El paciente no existe o está archivado', 'B no crea órdenes con pacientes de A');
select is_empty($$ select id from ordenes $$, 'B no ve las órdenes de A');
select throws_ok($$ select public.actualizar_orden_borrador((select id from t where clave = 'o2'), '1b000000-0000-0000-0000-00000000000b',
                    'lentes_completos', null, null, null, 'normal') $$,
  'P0001', 'La orden no existe', 'B no edita órdenes de A');

-- Anónimo no ejecuta las funciones
reset role;
set local role anon;
select throws_ok($$ select public.crear_orden(gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
  '42501', null, 'un visitante sin sesión no puede crear órdenes');

select * from finish();
rollback;
