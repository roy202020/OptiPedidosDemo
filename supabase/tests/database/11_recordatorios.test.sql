-- OptiPedidos · Pruebas de recordatorios de control visual (migración 20261019000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'a2@prueba.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1@prueba.test', 'authenticated', 'authenticated');
-- Cada óptica nace con su "Sede principal" (trigger).
insert into opticas (id, nombre, plan, tope_mensajes_mes) values
  ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A', 'profesional', 100),
  ('b0000000-0000-0000-0000-00000000000b', 'Óptica Ficticia B', 'basico', 100);
update opticas set recordatorios_automaticos = true where id = 'a0000000-0000-0000-0000-00000000000a';
insert into sedes (id, optica_id, nombre, whatsapp_phone_number_id) values
  ('5a000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000a', 'Sede Norte', '1111111111');
insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'operador'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000001', 'propietario');
-- El operador A2 solo trabaja en la Sede Norte.
delete from miembro_sedes where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002';
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000000e');

-- Fechas relativas a hoy en Lima: "hace un año" vence hoy; 10:00 y 20:00 de hoy en Lima.
create temp table f on commit drop as
select (now() at time zone 'America/Lima')::date as hoy,
       ((now() at time zone 'America/Lima')::date - interval '12 months')::date as hace_un_anio,
       (((now() at time zone 'America/Lima')::date + time '10:00') at time zone 'America/Lima') as a_las_10,
       (((now() at time zone 'America/Lima')::date + time '20:00') at time zone 'America/Lima') as a_las_20,
       (((now() at time zone 'America/Lima')::date + time '08:00') at time zone 'America/Lima') as a_las_8;
grant select on f to authenticated, service_role;

insert into pacientes (id, optica_id, nombres, apellidos, telefono, acepta_recordatorios, archivado_en, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Ana',  'Con permiso',  '987 000 001', true,  null,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'Luis', 'Sin permiso',  '987000002',   false, null,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'Eva',  'Receta nueva', '987000003',   true,  null,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'Sol',  'Archivada',    '987000005',   true,  now(), 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a', 'Nora', 'Sede Norte',   '987000006',   true,  null,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2a000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-00000000000a', 'Iván', 'Manual',       '987000007',   true,  null,  'aaaaaaaa-0000-0000-0000-000000000001'),
  ('2b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Bea',  'Óptica B',     '987000099',   true,  null,  'bbbbbbbb-0000-0000-0000-000000000001');

-- Recetas de hace un año (vencen hoy). Eva además tiene una de hace 2 meses. Nora se evaluó en la Sede Norte.
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, sede_id, creado_por)
select v.id::uuid, v.optica::uuid, v.paciente::uuid, f.hace_un_anio, -1, v.sede::uuid, v.autor::uuid
from f, (values
  ('3a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000002', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000003', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000005', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000006', '5a000000-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3a000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000007', null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('3b000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', null, 'bbbbbbbb-0000-0000-0000-000000000001')
) as v(id, optica, paciente, sede, autor);
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, creado_por)
select '3a000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000003',
       (f.hoy - interval '2 months')::date, -1.25, 'aaaaaaaa-0000-0000-0000-000000000001' from f;

-- ---------------------------------------------------------------------------
-- 1. Consentimiento y sede de la receta
-- ---------------------------------------------------------------------------
select isnt((select fecha_consentimiento from pacientes where id = '2a000000-0000-0000-0000-000000000001'), null,
  'el consentimiento guarda su fecha');
select is((select s.nombre from public.recordatorios_ciclos('a0000000-0000-0000-0000-00000000000a') c join sedes s on s.id = c.sede_id
            where c.paciente_id = '2a000000-0000-0000-0000-000000000001'), 'Sede principal',
  'una receta sin sede (la óptica tiene varias) se recuerda desde la sede más antigua');

-- ---------------------------------------------------------------------------
-- 2. Selección para el envío automático (service_role, como la Edge Function)
-- ---------------------------------------------------------------------------
set local role service_role;
select set_eq($$ select paciente_id::text from public.recordatorios_para_enviar((select a_las_10 from f)) $$,
  $$ values ('2a000000-0000-0000-0000-000000000001'), ('2a000000-0000-0000-0000-000000000006'), ('2a000000-0000-0000-0000-000000000007') $$,
  'solo pacientes con consentimiento, sin receta más nueva, no archivados y de ópticas Profesional');

select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000002', '3a000000-0000-0000-0000-000000000002', (select a_las_10 from f)), null,
  'PEDIDA: no se envía sin consentimiento');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000003', '3a000000-0000-0000-0000-000000000003', (select a_las_10 from f)), null,
  'PEDIDA: no se envía si hay una receta más reciente');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000005', '3a000000-0000-0000-0000-000000000005', (select a_las_10 from f)), null,
  'no se envía a pacientes archivados');
select is(public.reclamar_recordatorio('2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001', (select a_las_10 from f)), null,
  'no hay envío automático en el plan básico');
select is_empty($$ select * from public.recordatorios_para_enviar((select a_las_20 from f)) $$, 'no se envía después de las 19:00 de Lima');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', (select a_las_8 from f)), null,
  'no se envía antes de las 9:00 de Lima');

create temp table t (clave text primary key, valor jsonb) on commit drop;
grant all on t to service_role, authenticated;
insert into t values ('ana', public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', (select a_las_10 from f)));
select is((select valor ->> 'telefono' from t where clave = 'ana'), '51987000001', 'reclama el envío con el celular normalizado');
select is((select valor ->> 'phone_number_id' from t where clave = 'ana'), null, 'la sede principal no tiene número propio (usará el por defecto)');
insert into t values ('nora', public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000006', '3a000000-0000-0000-0000-000000000006', (select a_las_10 from f)));
select is((select valor ->> 'phone_number_id' from t where clave = 'nora'), '1111111111', 'sale del número de la sede de la última evaluación');

select lives_ok($$ select public.registrar_recordatorio(((select valor from t where clave = 'ana') ->> 'id')::uuid, true, 'wamid.ANA') $$, 'registra el envío exitoso');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', (select a_las_10 from f)), null,
  'PEDIDA: no se repite en el mismo ciclo');
select ok(not exists (select 1 from public.recordatorios_para_enviar((select a_las_10 from f)) where paciente_id = '2a000000-0000-0000-0000-000000000001'),
  'el paciente ya recordado sale de la lista de envío');

-- Un fallo se reintenta (hasta 3 intentos), sin duplicar la fila del ciclo.
select lives_ok($$ select public.registrar_recordatorio(((select valor from t where clave = 'nora') ->> 'id')::uuid, false, null, 'WhatsApp 131026: no es un número de WhatsApp') $$, 'registra un fallo');
select ok(exists (select 1 from public.recordatorios_para_enviar((select a_las_10 from f)) where paciente_id = '2a000000-0000-0000-0000-000000000006'),
  'un envío fallido vuelve a la lista para reintentar');

-- Webhook: estado de entrega
select lives_ok($$ select public.actualizar_estado_recordatorio('wamid.ANA', 'delivered') $$, 'procesa el estado "delivered"');
select is((select estado::text from recordatorios_envios where proveedor_mensaje_id = 'wamid.ANA'), 'entregado', 'queda como entregado');

-- Webhook: baja
select is(public.registrar_baja_whatsapp('1111111111', '+51 987 000 006'), 1, 'la respuesta BAJA al número de la Sede Norte da de baja a Nora');
select isnt((select fecha_baja from pacientes where id = '2a000000-0000-0000-0000-000000000006'), null, 'se marca fecha_baja automáticamente');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000006', '3a000000-0000-0000-0000-000000000006', (select a_las_10 from f)), null,
  'PEDIDA: la baja detiene los envíos');
select is(public.registrar_baja_whatsapp('1111111111', '987000099'), 0, 'una baja no toca pacientes de otra óptica');

-- Tope mensual: cuentan los mensajes por API del mes (avisos + recordatorios automáticos).
update opticas set tope_mensajes_mes = 1 where id = 'a0000000-0000-0000-0000-00000000000a';
select is(public.mensajes_del_mes('a0000000-0000-0000-0000-00000000000a', (select a_las_10 from f)), 1, 'ya se usó 1 mensaje este mes');
select is_empty($$ select * from public.recordatorios_para_enviar((select a_las_10 from f)) where optica_id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'con el tope alcanzado no hay más candidatos');
select is(public.reclamar_recordatorio('2a000000-0000-0000-0000-000000000007', '3a000000-0000-0000-0000-000000000007', (select a_las_10 from f)), null,
  'con el tope alcanzado no se reclama ningún envío');
update opticas set tope_mensajes_mes = 100 where id = 'a0000000-0000-0000-0000-00000000000a';

-- ---------------------------------------------------------------------------
-- 3. Desde la app (usuarios autenticados)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok($$ insert into recordatorios_envios (optica_id, sede_id, paciente_id, receta_id, vence_en, canal)
  select 'a0000000-0000-0000-0000-00000000000a', sede_id, '2a000000-0000-0000-0000-000000000002', id, current_date, 'manual'
  from recetas where id = '3a000000-0000-0000-0000-000000000002' $$, '42501', null, 'la app no escribe el historial directamente');
select throws_ok($$ update recordatorios_envios set estado = 'entregado' $$, '42501', null, 'la app no cambia estados del historial');
select throws_ok($$ update opticas set plan = 'profesional' where id = 'b0000000-0000-0000-0000-00000000000b' $$, '42501', null, 'la óptica no cambia su plan');
update pacientes set fecha_baja = null, fecha_consentimiento = '2000-01-01' where id = '2a000000-0000-0000-0000-000000000006';
select isnt((select fecha_baja from pacientes where id = '2a000000-0000-0000-0000-000000000006'), null, 'la app no borra una baja tocando las fechas');

select throws_ok($$ select public.registrar_recordatorio_manual('2a000000-0000-0000-0000-000000000002') $$,
  'P0001', 'El paciente no autorizó recordatorios o se dio de baja', 'el envío manual también exige consentimiento');
select lives_ok($$ select public.registrar_recordatorio_manual('2a000000-0000-0000-0000-000000000007') $$, 'registra un envío manual (wa.me)');
select is((select canal || '/' || estado from recordatorios_envios where paciente_id = '2a000000-0000-0000-0000-000000000007'), 'manual/enviado',
  'el envío manual cierra el ciclo');
select is(public.mensajes_del_mes('a0000000-0000-0000-0000-00000000000a', (select a_las_10 from f)), 1, 'el envío manual no cuenta para el tope');

-- Volver a aceptar después de la baja reabre la posibilidad de recordar.
update pacientes set acepta_recordatorios = true where id = '2a000000-0000-0000-0000-000000000006';
select is((select de_baja from public.pacientes_por_recordar('a0000000-0000-0000-0000-00000000000a') where paciente_id = '2a000000-0000-0000-0000-000000000006'), false,
  'un nuevo consentimiento deja sin efecto la baja anterior');

 
-- Pantalla "por recordar": el propietario ve todas sus sedes.
select set_eq($$ select paciente_id::text from public.pacientes_por_recordar('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('2a000000-0000-0000-0000-000000000001'), ('2a000000-0000-0000-0000-000000000002'),
            ('2a000000-0000-0000-0000-000000000006'), ('2a000000-0000-0000-0000-000000000007') $$,
  'por recordar este mes: vencen ahora, sin archivados ni pacientes con receta más nueva');

-- El operador de la Sede Norte solo ve lo de su sede.
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select set_eq($$ select paciente_id::text from public.pacientes_por_recordar('a0000000-0000-0000-0000-00000000000a') $$,
  $$ values ('2a000000-0000-0000-0000-000000000006') $$, 'un usuario de una sede solo ve los recordatorios de su sede');
select is_empty($$ select * from recordatorios_envios where sede_id <> '5a000000-0000-0000-0000-00000000000e' $$,
  'ni el historial de otras sedes');

-- ---------------------------------------------------------------------------
-- 4. Aislamiento entre ópticas
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from recordatorios_envios $$, 'PEDIDA: una óptica no ve los recordatorios de otra');
select throws_ok($$ select * from public.pacientes_por_recordar('a0000000-0000-0000-0000-00000000000a') $$, '42501', null,
  'ni puede pedir la lista de otra óptica');
select throws_ok($$ select public.mensajes_del_mes('a0000000-0000-0000-0000-00000000000a') $$, '42501', null, 'ni su conteo de mensajes');
select throws_ok($$ update opticas set recordatorios_automaticos = true where id = 'b0000000-0000-0000-0000-00000000000b' $$,
  'P0001', 'El envío automático de recordatorios requiere el plan Profesional', 'el envío automático exige el plan Profesional');

select * from finish();
rollback;
