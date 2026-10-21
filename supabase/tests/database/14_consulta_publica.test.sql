-- OptiPedidos · Pruebas de la consulta pública del estado del pedido (migración 20261022000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ---------------------------------------------------------------------------
-- Datos de prueba
--   Óptica A: Sede principal (con dirección, teléfono y horario).
--     PA propietario · AA administrador · VA vendedor
--   Óptica B: PB propietario.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'pa@prueba.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a2', 'aa@prueba.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a3', 'va@prueba.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-0000000000b1', 'pb@prueba.test', 'authenticated', 'authenticated');

create temp table t (clave text primary key, id uuid, codigo text, numero integer) on commit drop;
grant all on t to authenticated, anon;

insert into opticas (id, nombre, plan) values
  ('aa000000-0000-0000-0000-00000000000a', 'Óptica A', 'profesional'),
  ('bb000000-0000-0000-0000-00000000000b', 'Óptica B', 'profesional');
insert into miembros (optica_id, usuario_id, rol) values
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a1', 'propietario'),
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a2', 'administrador'),
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a3', 'operador'),
  ('bb000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000b1', 'propietario');
update sedes set direccion = 'Av. Siempre Viva 123', telefono = '987 654 321', horario = 'Lun. a sáb. de 8:00 a 13:00'
 where optica_id = 'aa000000-0000-0000-0000-00000000000a';

insert into laboratorios (id, optica_id, nombre) values
  ('1a000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-00000000000a', 'Lab A'),
  ('1b000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-00000000000b', 'Lab B');
insert into pacientes (id, optica_id, nombres, apellidos, tipo_documento, numero_documento, telefono, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000000a', 'Ana María', 'Pérez Gómez', 'DNI', '45678912',
   '912 345 678', 'a0000000-0000-0000-0000-0000000000a1'),
  ('2b000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-00000000000b', 'Beto', 'Otro', 'DNI', '11223344',
   '934 567 890', 'b0000000-0000-0000-0000-0000000000b1');
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, od_cilindro, od_eje, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Lima')::date, -3.75, -1.25, 90, 'a0000000-0000-0000-0000-0000000000a1'),
  ('3b000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-00000000000b', '2b000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Lima')::date, -2, null, null, 'b0000000-0000-0000-0000-0000000000b1');

-- Órdenes de la óptica A (como el propietario): activa, a anular, entregada reciente y entregada vieja.
insert into cajas (optica_id, sede_id, abierta_por, monto_inicial) select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s where not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);  -- caja abierta: el efectivo entra a la caja (0015)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into t (clave, id) select 'o' || g, public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-00000000000a', p_precio => 300, p_fecha_entrega => (now() at time zone 'America/Lima')::date + 3)
from generate_series(1, 4) g;
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('aa000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 100, 'efectivo');
update ordenes set estado = 'enviada' where id in (select id from t where clave like 'o%');
update ordenes set estado = 'recibida_lab' where id in (select id from t where clave in ('o1', 'o3', 'o4'));
update ordenes set estado = 'en_proceso' where id in (select id from t where clave in ('o1', 'o3', 'o4'));
insert into orden_pagos (optica_id, orden_id, importe, medio)
  select 'aa000000-0000-0000-0000-00000000000a', id, 300, 'efectivo' from t where clave in ('o3', 'o4');
update ordenes set estado = 'lista' where id in (select id from t where clave in ('o3', 'o4'));
update ordenes set estado = 'recibida_optica' where id in (select id from t where clave in ('o3', 'o4'));
update ordenes set estado = 'entregada' where id in (select id from t where clave in ('o3', 'o4'));
update ordenes set estado = 'anulada', motivo_anulacion = 'Prueba' where id = (select id from t where clave = 'o2');

set local request.jwt.claims to '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into t (clave, id) values ('b1', public.crear_orden('2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001',
  '1b000000-0000-0000-0000-00000000000b', p_precio => 200));
reset role;

-- o4 se entregó hace 31 días (se mueve la fecha del historial solo para la prueba).
alter table orden_historial_estados disable trigger user;
update orden_historial_estados set creado_en = now() - interval '31 days'
 where orden_id = (select id from t where clave = 'o4') and hasta = 'entregada';
alter table orden_historial_estados enable trigger user;
update t set codigo = o.codigo_consulta, numero = o.numero from ordenes o where o.id = t.id;

-- ---------------------------------------------------------------------------
-- 1. Código de consulta
-- ---------------------------------------------------------------------------
select is((select count(*)::int from t where codigo ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$'), 5,
  'PEDIDA: cada orden nueva recibe un código de 12 caracteres sin 0/O/1/I/L');
select is((select count(distinct codigo)::int from t), 5, 'los códigos no se repiten');
select is((select count(*)::int from ordenes where codigo_consulta is null), 0, 'PEDIDA: ninguna orden (tampoco las existentes) queda sin código');
select ok((select bool_and(o.codigo_consulta <> o.numero::text and o.codigo_consulta <> o.id::text) from ordenes o where o.id in (select id from t)),
  'PEDIDA: el código no es el número ni el id de la orden');
select is((select count(distinct public.generar_codigo_consulta())::int from generate_series(1, 2000)), 2000,
  '2000 códigos generados seguidos son todos distintos');
select is((select count(*)::int from (select regexp_split_to_table(string_agg(public.generar_codigo_consulta(), ''), '') c
                                       from generate_series(1, 300)) x where c ~ '[01OIL]'), 0,
  'el generador nunca usa caracteres confusos');

-- ---------------------------------------------------------------------------
-- 2. Consulta pública como anon
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select array_agg(k order by k) from jsonb_object_keys(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1')) k),
  array['actualizado_en', 'direccion', 'entregada_en', 'estado', 'fecha_prometida', 'horario', 'numero', 'optica', 'paciente', 'saldo', 'sede', 'whatsapp'],
  'PEDIDA: un código válido devuelve solo los campos permitidos');
select results_eq($$ select r ->> 'optica', r ->> 'sede', r ->> 'paciente', r ->> 'estado', (r ->> 'saldo')::numeric, r ->> 'direccion', r ->> 'horario', r ->> 'whatsapp'
                     from (select public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1') r) x $$,
  $$ values ('Óptica A', 'Sede principal', 'Ana', 'en_proceso', 200.00::numeric, 'Av. Siempre Viva 123', 'Lun. a sáb. de 8:00 a 13:00', '51987654321') $$,
  'PEDIDA: devuelve óptica, sede, primer nombre, estado, saldo, dirección, horario y WhatsApp de la sede');
select is((public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1') ->> 'fecha_prometida')::date,
  (now() at time zone 'America/Lima')::date + 3, 'PEDIDA: devuelve la fecha prometida');
select is((public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1') ->> 'numero')::int,
  (select numero from t where clave = 'o1'), 'devuelve el número de orden');

-- Nunca datos sensibles: apellidos, documento, teléfono del paciente, receta ni medidas.
select ok(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1')::text !~* 'pérez|gómez|45678912|912 ?345 ?678|51912345678|-3\.75|-1\.25|esfera|cilindro|receta',
  'PEDIDA: la respuesta no contiene apellidos, documento, teléfono del paciente ni datos de receta');
select ok(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.1')::text !~ (select id::text from t where clave = 'o1'),
  'la respuesta no contiene el id interno de la orden');

select is(public.consulta_estado_publico(lower((select codigo from t where clave = 'o1')), '10.0.0.1') ->> 'estado', 'en_proceso',
  'acepta el código en minúsculas');
select is(public.consulta_estado_publico((select regexp_replace(codigo, '(.{4})(.{4})(.{4})', '\1-\2 \3') from t where clave = 'o1'), '10.0.0.1') ->> 'estado',
  'en_proceso', 'acepta el código con guiones y espacios');

select is(public.consulta_estado_publico('ZZZZZZZZZZZZ', '10.0.0.3'), null, 'PEDIDA: un código inexistente no devuelve nada');
select is(public.consulta_estado_publico('', '10.0.0.3'), null, 'un código vacío no devuelve nada');
select is(public.consulta_estado_publico(null, '10.0.0.3'), null, 'un código nulo no devuelve nada');
select is(public.consulta_estado_publico('%', '10.0.0.3'), null, 'un comodín no devuelve nada');
select is(public.consulta_estado_publico((select substr(codigo, 1, 11) from t where clave = 'o1'), '10.0.0.3'), null,
  'un código incompleto no devuelve nada');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o2'), '10.0.0.3'), null, 'PEDIDA: una orden anulada no devuelve nada');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o4'), '10.0.0.3'), null,
  'PEDIDA: el enlace expira 30 días después de la entrega');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o3'), '10.0.0.3') ->> 'estado', 'entregada',
  'una orden entregada hace menos de 30 días sigue visible');
select ok(public.consulta_estado_publico((select codigo from t where clave = 'o3'), '10.0.0.3') ->> 'entregada_en' is not null,
  'informa cuándo se entregó (para mostrar hasta cuándo funciona el enlace)');
select is((public.consulta_estado_publico((select codigo from t where clave = 'o3'), '10.0.0.3') ->> 'saldo')::numeric, 0::numeric,
  'sin saldo pendiente el saldo es 0');
select is(public.consulta_estado_publico((select codigo from t where clave = 'b1'), '10.0.0.3') ->> 'optica', 'Óptica B',
  'cada código devuelve solo su propia orden');

-- ---------------------------------------------------------------------------
-- 3. anon no puede leer las tablas
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from ordenes $$, '42501', null, 'PEDIDA: anon no puede leer ordenes');
select throws_ok($$ select * from pacientes $$, '42501', null, 'PEDIDA: anon no puede leer pacientes');
select throws_ok($$ select * from recetas $$, '42501', null, 'anon no puede leer recetas');
select throws_ok($$ select * from orden_ojos $$, '42501', null, 'anon no puede leer las medidas de la orden');
select throws_ok($$ select * from consultas_publicas_intentos $$, '42501', null, 'anon no puede leer el contador de intentos');
select throws_ok($$ select public.regenerar_codigo_consulta((select id from t where clave = 'o1')) $$, '42501', null,
  'anon no puede regenerar códigos');
select throws_ok($$ select public.generar_codigo_consulta() $$, '42501', null, 'anon no puede ejecutar el generador');
reset role;

select is((select count(*)::int from information_schema.role_table_grants
            where grantee = 'anon' and table_schema = 'public' and table_name in ('ordenes', 'pacientes', 'recetas', 'orden_ojos', 'sedes', 'opticas', 'orden_pagos')),
  0, 'anon no tiene ningún permiso sobre las tablas con datos de la orden');
select is((select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')),
  array['consulta_estado_publico'], 'PEDIDA: la única función SECURITY DEFINER que anon puede ejecutar es la consulta pública');
select ok((select 'search_path=""' = any (p.proconfig) from pg_proc p where p.proname = 'consulta_estado_publico'),
  'la consulta pública fija search_path');

-- ---------------------------------------------------------------------------
-- 4. Límite de intentos por IP
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from generate_series(1, 30) g
            where public.consulta_estado_publico('ZZZZZZZZZZZ' || g % 10, '203.0.113.7') ->> 'limitado' = 'true'), 10,
  'PEDIDA: desde una misma IP, a partir del intento 21 del minuto se rechaza');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '203.0.113.7'), '{"limitado": true}'::jsonb,
  'limitada, ni siquiera un código válido devuelve datos');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '198.51.100.9') ->> 'estado', 'en_proceso',
  'otra IP sigue pudiendo consultar');
reset role;
select ok(not exists (select 1 from consultas_publicas_intentos where clave like '%203.0.113.7%'), 'la IP se guarda solo como hash');

-- ---------------------------------------------------------------------------
-- 5. Regenerar el código
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok($$ select public.regenerar_codigo_consulta((select id from t where clave = 'o1')) $$, '42501', null,
  'PEDIDA: el vendedor no puede regenerar el código');
select throws_ok($$ update ordenes set codigo_consulta = 'ABCDEFGHJKMN' where id = (select id from t where clave = 'o1') $$, '42501', null,
  'nadie cambia el código directamente');

set local request.jwt.claims to '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$ select public.regenerar_codigo_consulta((select id from t where clave = 'o1')) $$, '42501', null,
  'el propietario de otra óptica no puede regenerarlo');

set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into t (clave, codigo) select 'o1_viejo', codigo from t where clave = 'o1';
select lives_ok($$ update t set codigo = public.regenerar_codigo_consulta(id) where clave = 'o1' $$,
  'PEDIDA: el administrador regenera el código aunque la orden ya no esté en borrador');
select isnt((select codigo from t where clave = 'o1'), (select codigo from t where clave = 'o1_viejo'), 'el código nuevo es distinto');
select is((select codigo_consulta from ordenes where id = (select id from t where clave = 'o1')), (select codigo from t where clave = 'o1'),
  'la orden guarda el código nuevo');
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$ select public.regenerar_codigo_consulta((select id from t where clave = 'o2')) $$, 'P0001', null,
  'una orden anulada no se regenera');
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(public.consulta_estado_publico((select codigo from t where clave = 'o1'), '10.0.0.2') ->> 'estado', 'en_proceso',
  'el código nuevo funciona');
select is(public.consulta_estado_publico((select codigo from t where clave = 'o1_viejo'), '10.0.0.2'), null,
  'PEDIDA: el código anterior deja de funcionar');
reset role;

select * from finish();
rollback;
