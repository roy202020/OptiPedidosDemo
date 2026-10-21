-- OptiPedidos · Pruebas de egresos generales de la sede (migración 20261024000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Óptica A (Profesional): Sede principal y Sede Norte. PA propietario · AA administrador (principal) ·
-- VA vendedor (principal) · AN administrador (Norte). Óptica B: PB propietario.
insert into auth.users (id, email, aud, role) values
  ('d0000000-0000-0000-0000-0000000000a1', 'pa16@prueba.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-0000000000a2', 'aa16@prueba.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-0000000000a3', 'va16@prueba.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-0000000000a4', 'an16@prueba.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-0000000000b1', 'pb16@prueba.test', 'authenticated', 'authenticated');

create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;
create temp table f on commit drop as select (now() at time zone 'America/Lima')::date as hoy;
grant select on f to authenticated;

insert into opticas (id, nombre, plan) values
  ('da000000-0000-0000-0000-00000000000a', 'Óptica Egresos A', 'profesional'),
  ('db000000-0000-0000-0000-00000000000b', 'Óptica Egresos B', 'profesional');
insert into miembros (optica_id, usuario_id, rol) values
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a1', 'propietario'),
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a2', 'administrador'),
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a3', 'operador'),
  ('db000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-0000000000b1', 'propietario');
insert into t select 'sede_p', id from sedes where optica_id = 'da000000-0000-0000-0000-00000000000a';
insert into sedes (id, optica_id, nombre) values ('dc000000-0000-0000-0000-00000000000c', 'da000000-0000-0000-0000-00000000000a', 'Sede Norte');
insert into miembros (optica_id, usuario_id, rol) values ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a4', 'administrador');
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('da000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-0000000000a4', 'dc000000-0000-0000-0000-00000000000c');

set local role authenticated;

-- 1. Permisos de registro --------------------------------------------------------
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok($$ select public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 50, 'movilidad', 'Taxi', 'yape') $$,
  '42501', null, 'el vendedor no registra egresos');

set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$ select public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 120, 'servicios', 'Luz de octubre', 'efectivo_caja') $$,
  'P0001', 'No hay una caja abierta en esta sede: ábrela o elige otro medio de pago', 'sin caja abierta no hay egreso en efectivo');
select throws_ok($$ select public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy + 1 from f), 10, 'otros', 'Mañana', 'yape') $$,
  'P0001', 'La fecha del egreso no puede estar en el futuro', 'no se registran egresos con fecha futura');
select throws_ok($$ select public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 10, 'viajes', 'X', 'yape') $$,
  '23514', null, 'la categoría debe ser una de las previstas');
select throws_ok($$ select public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 10, 'otros', 'X', 'yape',
  p_foto => 'db000000-0000-0000-0000-00000000000b/x/egresos/a.jpg') $$,
  'P0001', 'La foto no corresponde a esta sede', 'la foto debe estar en la carpeta de su sede');
select throws_ok($$ insert into egresos (optica_id, sede_id, fecha, monto, categoria, concepto, medio)
  values ('da000000-0000-0000-0000-00000000000a', (select id from t where clave = 'sede_p'), now()::date, 1, 'otros', 'x', 'yape') $$,
  '42501', null, 'por la API no se inserta un egreso directo');

-- 2. Efectivo de caja y otros medios ----------------------------------------------
insert into t values ('caja', public.abrir_caja((select id from t where clave = 'sede_p'), 200));
select lives_ok($$ insert into t values ('e_luz', public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 120,
  'servicios', 'Luz de octubre', 'efectivo_caja', p_numero_comprobante => 'R-001')) $$, 'PEDIDA: se registra el pago de un servicio en efectivo');
select results_eq($$ select caja_id, tipo, monto from caja_movimientos where egreso_id = (select id from t where clave = 'e_luz') $$,
  $$ select (select id from t where clave = 'caja'), 'egreso', 120.00::numeric $$, 'el egreso en efectivo sale de la caja abierta de la sede');
select results_eq($$ select egresos, esperado from public.caja_resumen((select id from t where clave = 'caja')) $$,
  $$ values (120.00::numeric, 80.00::numeric) $$, 'la caja descuenta el egreso de lo esperado');
select lives_ok($$ insert into t values ('e_internet', public.registrar_egreso((select id from t where clave = 'sede_p'), (select hoy from f), 99.90,
  'servicios', 'Internet', 'transferencia', p_numero_comprobante => 'OP-77')) $$, 'egreso por transferencia');
select is((select count(*)::int from caja_movimientos where egreso_id = (select id from t where clave = 'e_internet')), 0,
  'un egreso por transferencia no toca la caja');
select results_eq($$ select categoria, monto, medio, numero_comprobante, registrado_por from egresos where id = (select id from t where clave = 'e_internet') $$,
  $$ values ('servicios', 99.90::numeric, 'transferencia', 'OP-77', 'd0000000-0000-0000-0000-0000000000a2'::uuid) $$, 'guarda categoría, monto, medio, comprobante y quién lo registró');

-- 3. Anulación ---------------------------------------------------------------------
select throws_ok($$ select public.anular_egreso((select id from t where clave = 'e_luz'), ' ') $$,
  'P0001', 'Indica el motivo de la anulación', 'anular exige motivo');
select lives_ok($$ select public.anular_egreso((select id from t where clave = 'e_luz'), 'Se pagó por transferencia') $$, 'se anula el egreso');
select results_eq($$ select (select anulado_en is not null from egresos where id = (select id from t where clave = 'e_luz')),
                            (select anulado_en is not null from caja_movimientos where egreso_id = (select id from t where clave = 'e_luz')),
                            (select egresos from public.caja_resumen((select id from t where clave = 'caja'))) $$,
  $$ values (true, true, 0.00::numeric) $$, 'el egreso anulado deja de contar también en la caja');
select throws_ok($$ select public.anular_egreso((select id from t where clave = 'e_luz'), 'Otra vez') $$,
  'P0001', 'El egreso ya está anulado', 'no se anula dos veces');
select throws_ok($$ delete from egresos where id = (select id from t where clave = 'e_luz') $$, '42501', null, 'los egresos no se borran');
select ok((select count(*) >= 2 from auditoria where tabla = 'egresos' and registro_id = (select id::text from t where clave = 'e_luz')),
  'el alta y la anulación quedan en la auditoría');

-- 4. Aislamiento -----------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from egresos), 0, 'el vendedor no ve los egresos');
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from egresos), 0, 'el administrador de otra sede no ve los egresos de la principal');
select throws_ok($$ select public.anular_egreso((select id from t where clave = 'e_internet'), 'Ajeno') $$, '42501', null, 'ni los anula');
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::int from egresos), 0, 'otra óptica no ve los egresos');
select ok(not public.puede_archivo_laboratorio('da000000-0000-0000-0000-00000000000a/' || (select id from t where clave = 'sede_p') || '/egresos/x.jpg'),
  'ni las fotos de sus comprobantes');
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from egresos), 2, 'la propietaria ve los egresos de todas sus sedes');

select * from finish();
rollback;
