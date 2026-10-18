-- OptiPedidos · Pruebas de planes de suscripción y superadmin (migración 20261020000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---------------------------------------------------------------------------
-- Datos de prueba
--   X: Básico (activa) · Y: Profesional · S: suspendida (venció hace 10 días) · G: en gracia (hace 3)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('11111111-0000-0000-0000-000000000001', 'px@prueba.test', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-000000000002', 'u2@prueba.test', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-000000000003', 'u3@prueba.test', 'authenticated', 'authenticated'),
  ('11111111-0000-0000-0000-000000000004', 'u4@prueba.test', 'authenticated', 'authenticated'),
  ('22222222-0000-0000-0000-000000000001', 'py@prueba.test', 'authenticated', 'authenticated'),
  ('33333333-0000-0000-0000-000000000001', 'ps@prueba.test', 'authenticated', 'authenticated'),
  ('44444444-0000-0000-0000-000000000001', 'pg@prueba.test', 'authenticated', 'authenticated'),
  ('55555555-0000-0000-0000-000000000001', 'nuevo-dueno@prueba.test', 'authenticated', 'authenticated'),
  ('99999999-0000-0000-0000-000000000001', 'superadmin@prueba.test', 'authenticated', 'authenticated');
insert into superadmins (usuario_id) values ('99999999-0000-0000-0000-000000000001');

create temp table f on commit drop as select (now() at time zone 'America/Lima')::date as hoy;
grant select on f to authenticated, service_role;

insert into opticas (id, nombre, plan, vence_el) select v.id::uuid, v.nombre, v.plan, f.hoy + v.dias
from f, (values
  ('a1000000-0000-0000-0000-00000000000a', 'Óptica Básica X',      'basico',      20),
  ('b2000000-0000-0000-0000-00000000000b', 'Óptica Profesional Y', 'profesional', 20),
  ('c3000000-0000-0000-0000-00000000000c', 'Óptica Suspendida S',  'basico',     -10),
  ('d4000000-0000-0000-0000-00000000000d', 'Óptica En Gracia G',   'basico',      -3)
) as v(id, nombre, plan, dias);
insert into miembros (optica_id, usuario_id, rol) values
  ('a1000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'propietario'),
  ('b2000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000001', 'propietario'),
  ('c3000000-0000-0000-0000-00000000000c', '33333333-0000-0000-0000-000000000001', 'propietario'),
  ('d4000000-0000-0000-0000-00000000000d', '44444444-0000-0000-0000-000000000001', 'propietario');
insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Lab X'),
  ('1b000000-0000-0000-0000-00000000000b', 'b2000000-0000-0000-0000-00000000000b', 'Lab Y'),
  ('1c000000-0000-0000-0000-00000000000c', 'c3000000-0000-0000-0000-00000000000c', 'Lab S');
insert into pacientes (id, optica_id, nombres, apellidos, telefono, acepta_whatsapp, acepta_recordatorios, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'Ana', 'X', '987000001', true, true, '11111111-0000-0000-0000-000000000001'),
  ('2b000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b', 'Bea', 'Y', '987000002', true, true, '22222222-0000-0000-0000-000000000001'),
  ('2c000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-00000000000c', 'Ciro', 'S', '987000003', true, true, '33333333-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, creado_por)
select v.id::uuid, v.optica::uuid, v.paciente::uuid, (f.hoy - interval '12 months')::date, -1, v.autor::uuid
from f, (values
  ('3a000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('3b000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001'),
  ('3c000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-00000000000c', '2c000000-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001')
) as v(id, optica, paciente, autor);

create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Estados y límites copiados del plan
-- ---------------------------------------------------------------------------
select results_eq($$ select public.estado_suscripcion_de(f.hoy, f.hoy), public.estado_suscripcion_de(f.hoy - 7, f.hoy),
                            public.estado_suscripcion_de(f.hoy - 8, f.hoy), public.estado_suscripcion_de(null, f.hoy) from f $$,
  $$ values ('activa', 'gracia', 'suspendida', 'activa') $$, 'activa hasta el vencimiento, 7 días de gracia, luego suspendida');
select results_eq($$ select plan, max_usuarios, max_sedes, whatsapp_mensual, estado_suscripcion from opticas
                     where id in ('a1000000-0000-0000-0000-00000000000a', 'b2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-00000000000c') order by nombre $$,
  $$ values ('basico', 3, 1, 0, 'activa'), ('profesional', null::int, null::int, 300, 'activa'), ('basico', 3, 1, 0, 'suspendida') $$,
  'cada óptica toma los límites de su plan y su estado');

-- ---------------------------------------------------------------------------
-- 2. Límites del plan Básico (como la API: rol authenticated)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$ insert into miembros (optica_id, usuario_id, rol) values ('a1000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000002', 'operador') $$,
  '2.º usuario');
select lives_ok($$ select public.agregar_miembro('a1000000-0000-0000-0000-00000000000a', 'u3@prueba.test') $$, '3.er usuario');
select throws_ok($$ insert into miembros (optica_id, usuario_id, rol) values ('a1000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000004', 'operador') $$,
  'P0001', 'Tu plan permite hasta 3 usuarios activos. Para agregar más, pasa al plan Profesional.',
  'PEDIDA: Básico no crea un 4.º usuario por la API');
select throws_ok($$ select public.agregar_miembro('a1000000-0000-0000-0000-00000000000a', 'u4@prueba.test') $$,
  'P0001', null, 'ni con la función de agregar miembros');
update miembros set activo = false where usuario_id = '11111111-0000-0000-0000-000000000003';
select lives_ok($$ select public.agregar_miembro('a1000000-0000-0000-0000-00000000000a', 'u4@prueba.test') $$, 'al desactivar uno, entra otro');
select throws_ok($$ update miembros set activo = true where usuario_id = '11111111-0000-0000-0000-000000000003' $$,
  'P0001', null, 'reactivar un usuario también respeta el límite');
select throws_ok($$ insert into sedes (optica_id, nombre) values ('a1000000-0000-0000-0000-00000000000a', 'Segunda sede') $$,
  'P0001', 'Tu plan permite 1 sede(s) activa(s). Disponible en plan Profesional: más sedes según contrato.',
  'PEDIDA: Básico no crea una 2.ª sede por la API');

-- Funciones Profesional en Básico
select throws_ok($$ insert into metas_ventas (optica_id, periodo, importe_objetivo)
  select 'a1000000-0000-0000-0000-00000000000a', date_trunc('month', f.hoy)::date, 1000 from f $$,
  'P0001', 'Disponible en plan Profesional: metas de ventas.', 'PEDIDA: Básico no usa metas');
select throws_ok($$ update opticas set recordatorios_automaticos = true where id = 'a1000000-0000-0000-0000-00000000000a' $$,
  'P0001', null, 'PEDIDA: Básico no activa recordatorios automáticos');

insert into t values ('ox', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-00000000000a'));
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'ox');
update ordenes set estado = 'recibida_optica' where id = (select id from t where clave = 'ox');
select results_eq($$ select estado::text, ultimo_error from notificaciones where orden_id = (select id from t where clave = 'ox') $$,
  $$ values ('omitida', 'Plan Básico: avisa al paciente con el botón de WhatsApp de la orden') $$,
  'PEDIDA: en Básico el aviso de lentes listos no sale por WhatsApp automático');

-- Profesional: sin esos límites
set local request.jwt.claims to '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ insert into sedes (optica_id, nombre) values ('b2000000-0000-0000-0000-00000000000b', 'Sede Norte') $$, 'Profesional crea varias sedes');
select lives_ok($$ insert into miembros (optica_id, usuario_id, rol)
  select 'b2000000-0000-0000-0000-00000000000b', u, 'operador'
  from unnest(array['11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001']::uuid[]) u $$,
  'Profesional tiene usuarios ilimitados');

-- ---------------------------------------------------------------------------
-- 3. WhatsApp automático: plan y tope por sede (service_role, como la Edge Function)
-- ---------------------------------------------------------------------------
reset role;
update opticas set whatsapp_mensual = 1 where id = 'b2000000-0000-0000-0000-00000000000b';
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('3b000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001', -2, '22222222-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated"}';
-- Y ya tiene dos sedes: el pedido indica la suya (Sede principal).
insert into t select 'sede_y', id from sedes where optica_id = 'b2000000-0000-0000-0000-00000000000b' and nombre = 'Sede principal';
insert into t values
  ('oy1', public.crear_orden('2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-00000000000b',
                             p_sede => (select id from t where clave = 'sede_y'))),
  ('oy2', public.crear_orden('2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-00000000000b',
                             p_sede => (select id from t where clave = 'sede_y')));
update ordenes set estado = 'enviada' where id in (select id from t where clave in ('oy1', 'oy2'));
update ordenes set estado = 'recibida_optica' where id in (select id from t where clave in ('oy1', 'oy2'));

reset role;
set local role service_role;
select isnt(public.reclamar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'oy1'))), null,
  'Profesional envía el primer aviso automático');
select lives_ok($$ select public.registrar_envio((select id from notificaciones where orden_id = (select id from t where clave = 'oy1')), true, 'wamid.Y1') $$,
  'registra el envío');
select is(public.reclamar_notificacion((select id from notificaciones where orden_id = (select id from t where clave = 'oy2'))), null,
  'PEDIDA: con el tope de la sede alcanzado no se envía otro automático');
select results_eq($$ select estado::text, ultimo_error from notificaciones where orden_id = (select id from t where clave = 'oy2') $$,
  $$ values ('fallida', 'Se alcanzó el tope mensual de WhatsApp automáticos de la sede') $$, 'queda registrado el motivo');
select ok(not public.sede_puede_enviar((select s.id from sedes s where s.optica_id = 'a1000000-0000-0000-0000-00000000000a')),
  'una sede de plan Básico nunca envía automáticos');
select ok(not exists (select 1 from public.recordatorios_para_enviar(((select hoy from f) + time '10:00') at time zone 'America/Lima')
                      where optica_id = 'a1000000-0000-0000-0000-00000000000a'),
  'PEDIDA: Básico no tiene recordatorios automáticos');

-- ---------------------------------------------------------------------------
-- 4. Suscripción suspendida: solo lectura
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.suscripcion_estado('c3000000-0000-0000-0000-00000000000c'), 'suspendida', 'la óptica S está suspendida');
select throws_ok($$ select public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000c') $$,
  'P0001', 'Tu suscripción está suspendida: puedes ver y exportar tus datos, pero no registrar cambios. Renueva para continuar.',
  'PEDIDA: una óptica suspendida no crea pedidos');
select throws_ok($$ insert into pacientes (optica_id, nombres, apellidos) values ('c3000000-0000-0000-0000-00000000000c', 'Nuevo', 'Paciente') $$,
  'P0001', null, 'ni registra pacientes');
select throws_ok($$ update pacientes set notas = 'x' where id = '2c000000-0000-0000-0000-000000000001' $$,
  'P0001', null, 'ni modifica datos');
select results_eq($$ select nombres from pacientes where optica_id = 'c3000000-0000-0000-0000-00000000000c' $$,
  $$ values ('Ciro') $$, 'PEDIDA: pero sí lee sus datos');
select lives_ok($$ select * from lunas_existencias where optica_id = 'c3000000-0000-0000-0000-00000000000c' $$,
  'PEDIDA: y puede leer las existencias para exportarlas');

set local request.jwt.claims to '{"sub":"44444444-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.suscripcion_estado('d4000000-0000-0000-0000-00000000000d'), 'gracia', 'la óptica G está en gracia');
select lives_ok($$ insert into pacientes (optica_id, nombres, apellidos) values ('d4000000-0000-0000-0000-00000000000d', 'Nuevo', 'Paciente') $$,
  'en gracia todavía se puede registrar');

-- ---------------------------------------------------------------------------
-- 5. Solo el superadmin cambia planes y registra pagos
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.superadmin_cambiar_plan('a1000000-0000-0000-0000-00000000000a', 'profesional') $$,
  '42501', null, 'PEDIDA: el propietario no cambia su plan con la función');
select throws_ok($$ update opticas set plan = 'profesional', max_sedes = 10 where id = 'a1000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'ni editando la tabla');
select throws_ok($$ select public.superadmin_registrar_pago('a1000000-0000-0000-0000-00000000000a', 50, current_date, 'yape', current_date, current_date + 30) $$,
  '42501', null, 'PEDIDA: el propietario no registra pagos');
select throws_ok($$ insert into suscripcion_pagos (optica_id, monto, fecha, medio, periodo_desde, periodo_hasta, registrado_por)
  values ('a1000000-0000-0000-0000-00000000000a', 50, current_date, 'yape', current_date, current_date + 30, auth.uid()) $$,
  '42501', null, 'ni insertando en la tabla de pagos');
select throws_ok($$ select * from public.superadmin_opticas() $$, '42501', null, 'ni lista las ópticas de la plataforma');

set local request.jwt.claims to '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.superadmin_cambiar_plan('a1000000-0000-0000-0000-00000000000a', 'profesional', p_max_sedes => 3, p_nota => 'Contrato de 3 sedes') $$,
  'PEDIDA: el superadmin cambia el plan');
select results_eq($$ select o.plan, o.max_usuarios, o.max_sedes, o.whatsapp_mensual from public.superadmin_opticas() o where o.id = 'a1000000-0000-0000-0000-00000000000a' $$,
  $$ values ('profesional', null::int, 3, 300) $$, 'con los límites del plan y las sedes del contrato');
select lives_ok($$ select public.superadmin_registrar_pago('c3000000-0000-0000-0000-00000000000c', 79.90, current_date, 'yape',
  current_date, current_date + 30, 'Pago por Yape') $$, 'PEDIDA: el superadmin registra un pago');
select is((select o.estado from public.superadmin_opticas() o where o.id = 'c3000000-0000-0000-0000-00000000000c'), 'activa',
  'el pago extiende el vencimiento y reactiva la óptica');
select set_eq($$ select tipo from suscripcion_eventos where optica_id in ('a1000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-00000000000c') $$,
  $$ values ('cambio_plan'), ('pago'), ('vencimiento') $$, 'historial de cambio de plan, pago y vencimiento');
select throws_ok($$ update suscripcion_eventos set nota = 'x' $$, '42501', null, 'el historial no se modifica');
select throws_ok($$ delete from suscripcion_pagos $$, '42501', null, 'los pagos no se borran');
select lives_ok($$ select public.superadmin_crear_optica('Óptica Nueva', 'nuevo-dueno@prueba.test', 'basico', current_date + 30) $$,
  'el superadmin crea una óptica con su propietario');

-- El superadmin no ve datos clínicos ni pedidos.
select is_empty($$ select * from pacientes $$, 'PEDIDA: el superadmin no puede leer pacientes');
select is_empty($$ select * from recetas $$, 'PEDIDA: ni recetas');
select is_empty($$ select * from ordenes $$, 'ni pedidos');

-- La óptica S, ya pagada, vuelve a registrar.
set local request.jwt.claims to '{"sub":"33333333-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000c') $$,
  'tras el pago la óptica vuelve a crear pedidos');
select results_eq($$ select monto::text, medio from suscripcion_pagos $$, $$ values ('79.90', 'yape') $$, 'el propietario ve los pagos de su óptica');
set local request.jwt.claims to '{"sub":"22222222-0000-0000-0000-000000000001","role":"authenticated"}';
select is_empty($$ select * from suscripcion_pagos $$, 'y no los de otras ópticas');

select * from finish();
rollback;
