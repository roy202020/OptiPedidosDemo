-- OptiPedidos · Pruebas de avisos por WhatsApp (migración 0005)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'operador'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');
insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Lab A');
insert into pacientes (id, optica_id, nombres, apellidos, telefono, acepta_whatsapp, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana',  'Con permiso', '987 654 321', true,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Luis', 'Sin permiso', '987654322',   false, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Eva',  'Fijo',        '01 4445555',  true,  'aaaaaaaa-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', -1, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000002', -1, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000003', -1, 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Normalización de celulares
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select public.normalizar_celular_pe(t) from unnest(array['987 654 321', '+51 987-654-321', '0051987654321', '51987654321', '01 4445555', '87654321', null]) t $$,
  $$ values ('51987654321'), ('51987654321'), ('51987654321'), ('51987654321'), (null), (null), (null) $$,
  'normaliza celulares de Perú y descarta fijos o números incompletos');

-- ---------------------------------------------------------------------------
-- 2. Consentimiento
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select isnt((select whatsapp_consentimiento_en from pacientes where id = '2a000000-0000-0000-0000-000000000001'), null,
  'registra cuándo se dio el consentimiento');
update pacientes set whatsapp_consentimiento_en = '2000-01-01' where id = '2a000000-0000-0000-0000-000000000001';
select isnt((select whatsapp_consentimiento_en from pacientes where id = '2a000000-0000-0000-0000-000000000001'), '2000-01-01'::timestamptz,
  'la fecha del consentimiento no se puede falsear');
select is((select whatsapp_consentimiento_en from pacientes where id = '2a000000-0000-0000-0000-000000000002'), null,
  'sin consentimiento no hay fecha');

-- ---------------------------------------------------------------------------
-- 3. Encolado al pasar a "Listo para entrega"
-- ---------------------------------------------------------------------------
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated, service_role;
insert into t values
  ('con',  public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a')),
  ('sin',  public.crear_orden('2a000000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-00000000000a')),
  ('fijo', public.crear_orden('2a000000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000003', '1a000000-0000-0000-0000-00000000000a'));
update ordenes set estado = 'enviada' where id in (select id from t);

select is_empty($$ select * from notificaciones $$, 'no hay avisos mientras la orden está en el laboratorio');

update ordenes set estado = 'recibida_optica' where id in (select id from t);

select results_eq($$ select n.estado::text, n.telefono, n.ultimo_error from notificaciones n where n.orden_id = (select id from t where clave = 'con') $$,
  $$ values ('pendiente', '51987654321', null::text) $$, 'con consentimiento y celular válido queda pendiente');
select results_eq($$ select n.estado::text, n.ultimo_error from notificaciones n where n.orden_id = (select id from t where clave = 'sin') $$,
  $$ values ('omitida', 'El paciente no autorizó avisos por WhatsApp') $$, 'sin consentimiento se omite con el motivo');
select results_eq($$ select n.estado::text, n.ultimo_error from notificaciones n where n.orden_id = (select id from t where clave = 'fijo') $$,
  $$ values ('omitida', 'El teléfono del paciente no es un celular válido de Perú') $$, 'un teléfono fijo se omite con el motivo');
select is((select estado::text from ordenes where id = (select id from t where clave = 'sin')), 'recibida_optica',
  'un aviso omitido no bloquea el cambio de estado');

update ordenes set estado = 'entregada' where id = (select id from t where clave = 'con');
select is((select count(*)::int from notificaciones where orden_id = (select id from t where clave = 'con')), 1,
  'entregar la orden no genera otro aviso');

-- ---------------------------------------------------------------------------
-- 4. Permisos desde la API
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into notificaciones (optica_id, orden_id, paciente_id, telefono)
                    values ('a0000000-0000-0000-0000-00000000000a', (select id from t where clave = 'sin'), '2a000000-0000-0000-0000-000000000002', '51900000000') $$,
  '42501', null, 'la API no crea avisos');
select throws_ok($$ update notificaciones set estado = 'enviada' $$, '42501', null, 'la API no marca avisos como enviados');
select throws_ok($$ select public.reclamar_notificacion(gen_random_uuid()) $$, '42501', null, 'la API no reclama avisos');
select throws_ok($$ select public.registrar_envio(gen_random_uuid(), true, 'x') $$, '42501', null, 'la API no registra envíos');

-- ---------------------------------------------------------------------------
-- 5. Reintento
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.reintentar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'con'))) $$,
  'P0001', null, 'no se reintenta un aviso pendiente');
select is(public.reintentar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'sin'))), 'omitida'::estado_notificacion,
  'reintentar sin consentimiento lo vuelve a omitir');
update pacientes set acepta_whatsapp = true where id = '2a000000-0000-0000-0000-000000000002';
select is(public.reintentar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'sin'))), 'pendiente'::estado_notificacion,
  'tras registrar el consentimiento, el reintento lo deja pendiente');

-- ---------------------------------------------------------------------------
-- 6. Edge Function (service_role): reclamo atómico y registro del resultado
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
select is((public.reclamar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'con'))) ->> 'telefono'),
  '51987654321', 'la función reclama el aviso y recibe el teléfono');
select is(public.reclamar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'con'))), null,
  'un segundo reclamo no devuelve nada (sin envíos duplicados)');
select lives_ok($$ select public.registrar_envio((select id from notificaciones where orden_id = (select id from t where clave = 'con')), true, 'wamid.PRUEBA') $$,
  'registra el envío exitoso');
select results_eq($$ select estado::text, intentos, proveedor_mensaje_id from notificaciones where orden_id = (select id from t where clave = 'con') $$,
  $$ values ('enviada', 1, 'wamid.PRUEBA') $$, 'el aviso queda enviado con su id de mensaje');
select lives_ok($$ select public.reclamar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'sin'))) $$, 'reclama otro aviso');
select lives_ok($$ select public.registrar_envio((select id from notificaciones where orden_id = (select id from t where clave = 'sin')), false, null, 'WhatsApp 131030: número no válido') $$,
  'registra un fallo del proveedor');
select results_eq($$ select estado::text, ultimo_error from notificaciones where orden_id = (select id from t where clave = 'sin') $$,
  $$ values ('fallida', 'WhatsApp 131030: número no válido') $$, 'el fallo queda registrado para reintentarlo');

-- ---------------------------------------------------------------------------
-- 7. Aislamiento entre ópticas
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from notificaciones $$, 'otra óptica no ve los avisos de A');

select * from finish();
rollback;
