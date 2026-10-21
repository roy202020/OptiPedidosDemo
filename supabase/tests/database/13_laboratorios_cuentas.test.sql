-- OptiPedidos · Pruebas de tickets y pagos a laboratorios y caja de la sede (migración 20261021000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- ---------------------------------------------------------------------------
-- Datos de prueba
--   Óptica A (Profesional): Sede principal y Sede Norte.
--     PA propietario · AA administrador (principal) · VA vendedor (principal) · VN vendedor (Norte)
--   Óptica B: PB propietario.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'pa@prueba.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a2', 'aa@prueba.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a3', 'va@prueba.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a4', 'vn@prueba.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-0000000000b1', 'pb@prueba.test', 'authenticated', 'authenticated');

create temp table f on commit drop as select (now() at time zone 'America/Lima')::date as hoy;
grant select on f to authenticated;
create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

insert into opticas (id, nombre, plan) values
  ('aa000000-0000-0000-0000-00000000000a', 'Óptica A', 'profesional'),
  ('bb000000-0000-0000-0000-00000000000b', 'Óptica B', 'profesional');
insert into miembros (optica_id, usuario_id, rol) values
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a1', 'propietario'),
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a2', 'administrador'),
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a3', 'operador'),
  ('bb000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-0000000000b1', 'propietario');
insert into t select 'sede_p', id from sedes where optica_id = 'aa000000-0000-0000-0000-00000000000a';
insert into t select 'sede_b', id from sedes where optica_id = 'bb000000-0000-0000-0000-00000000000b';
insert into sedes (id, optica_id, nombre) values ('ac000000-0000-0000-0000-00000000000c', 'aa000000-0000-0000-0000-00000000000a', 'Sede Norte');
insert into t values ('sede_n', 'ac000000-0000-0000-0000-00000000000c');
insert into miembros (optica_id, usuario_id, rol) values
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a4', 'operador');
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('aa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-0000000000a4', 'ac000000-0000-0000-0000-00000000000c');

insert into laboratorios (id, optica_id, nombre, dias_credito) values
  ('1a000000-0000-0000-0000-000000000007', 'aa000000-0000-0000-0000-00000000000a', 'Lab Siete', 7),
  ('1a000000-0000-0000-0000-000000000000', 'aa000000-0000-0000-0000-00000000000a', 'Lab Contado', 0),
  ('1b000000-0000-0000-0000-00000000000b', 'bb000000-0000-0000-0000-00000000000b', 'Lab B', 0);
insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('2a000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000000a', 'Ana', 'Prueba', 'a0000000-0000-0000-0000-0000000000a1');
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, creado_por) values
  ('3a000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-00000000000a', '2a000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Lima')::date, -1, 'a0000000-0000-0000-0000-0000000000a1');

-- Órdenes (como el propietario): o1..o7 del Lab Siete en la sede principal, c1 y c2 del Lab Contado, n1 en la Norte.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into t select 'o' || g, public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000007', p_precio => 250, p_sede => (select id from t where clave = 'sede_p'))
from generate_series(1, 7) g;
insert into t select 'c' || g, public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000000', p_precio => 120, p_sede => (select id from t where clave = 'sede_p'))
from generate_series(1, 2) g;
insert into t values ('n1', public.crear_orden('2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000007', p_precio => 250, p_sede => 'ac000000-0000-0000-0000-00000000000c'));
update ordenes set estado = 'enviada' where id in (select id from t where clave ~ '^(o|c|n)\d$');

-- ---------------------------------------------------------------------------
-- 1. Tickets (como el vendedor de la sede principal)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select lives_ok($$
  insert into t values ('t1', public.registrar_lab_ticket(
    (select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007', '001', (select hoy from f), 500,
    (select jsonb_agg(jsonb_build_object('orden_id', id, 'monto', 100)) from t where clave in ('o1', 'o2', 'o3', 'o4', 'o5'))))
$$, 'PEDIDA: el vendedor registra un ticket con 5 órdenes');
select results_eq($$ select count(*)::int, count(distinct ticket_id)::int, sum(monto) from lab_ticket_ordenes
                     where orden_id in (select id from t where clave in ('o1', 'o2', 'o3', 'o4', 'o5')) $$,
  $$ values (5, 1, 500.00::numeric) $$, 'PEDIDA: un solo ticket y cada orden con su costo');
select is((select count(*)::int from lab_tickets where numero_ticket = '001'), 1, 'el ticket se guardó una sola vez');
select is((select fecha_vencimiento - fecha from lab_tickets where id = (select id from t where clave = 't1')), 7,
  'PEDIDA: con 7 días de crédito vence 7 días después');
select is((select registrado_por from lab_tickets where id = (select id from t where clave = 't1')),
  'a0000000-0000-0000-0000-0000000000a3'::uuid, 'queda quién lo registró');

select throws_ok($$ select public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
  ' 001 ', (select hoy from f), 50, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 50)) from t where clave = 'o6')) $$,
  'LT409', 'Ya existe un ticket 001 de este laboratorio', 'PEDIDA: un número repetido en el mismo laboratorio no se duplica');
select is((select count(*)::int from lab_tickets where numero_ticket = '001'), 1, 'sigue habiendo un solo ticket 001');
select lives_ok($$
  insert into t values ('t1dup', public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
    '001', (select hoy from f), 50, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 50)) from t where clave = 'o6'),
    p_confirmar_duplicado => true))
$$, 'PEDIDA: con confirmación explícita sí se registra (talonario reutilizado)');
select lives_ok($$ select public.agregar_orden_lab_ticket((select id from t where clave = 't1dup'), (select id from t where clave = 'o7'), 30) $$,
  'se agrega otra orden a un ticket existente');
select is((select monto_total from lab_tickets where id = (select id from t where clave = 't1dup')), 80.00::numeric,
  'y su monto se suma al total');

select lives_ok($$
  insert into t values ('tc', public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000000',
    '001', (select hoy from f), 60, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 60)) from t where clave = 'c1')))
$$, 'el mismo número en otro laboratorio no es duplicado');
select is((select fecha_vencimiento from lab_tickets where id = (select id from t where clave = 'tc')), (select hoy from f),
  'PEDIDA: de contado vence el mismo día');
select lives_ok($$
  insert into t values ('tv', public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000000',
    'V-10', (select hoy - 10 from f), 80, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 80)) from t where clave = 'c2')))
$$, 'ticket de hace 10 días');
select results_eq($$ select estado_pago, estado_vencimiento from lab_tickets_estado where id = (select id from t where clave = 'tv') $$,
  $$ values ('pendiente', 'vencido') $$, 'impago y vencido');
select is(public.lab_estado_vencimiento((select hoy + 2 from f), 10, (select hoy from f)), 'por_vencer', 'vence en 2 días: por vencer');

select throws_ok($$ select public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
  'X-1', (select hoy from f), 10, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 10)) from t where clave = 'n1')) $$,
  'P0001', 'La orden ' || (select numero from ordenes where id = (select id from t where clave = 'n1')) || ' es de otra sede',
  'una orden de otra sede no entra en el ticket');
select throws_ok($$ select public.registrar_lab_ticket((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
  'X-2', (select hoy from f), 10, (select jsonb_build_array(jsonb_build_object('orden_id', id, 'monto', 10)) from t where clave = 'c1')) $$,
  'P0001', 'La orden ' || (select numero from ordenes where id = (select id from t where clave = 'c1')) || ' es de otro laboratorio',
  'ni una de otro laboratorio');
select throws_ok($$ insert into lab_tickets (optica_id, sede_id, laboratorio_id, numero_ticket, fecha, monto_total, fecha_vencimiento)
  values ('aa000000-0000-0000-0000-00000000000a', (select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007', 'Z', now()::date, 1, now()::date) $$,
  '42501', null, 'por la API no se inserta un ticket directo (se salta las reglas)');

-- El vendedor no paga, no ve pagos ni deuda y no cambia el crédito.
select throws_ok($$ select public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
  (select hoy from f), 'yape', jsonb_build_array(jsonb_build_object('ticket_id', (select id from t where clave = 't1'), 'monto', 10))) $$,
  '42501', null, 'el vendedor no registra pagos');
select throws_ok($$ select * from public.lab_deuda_resumen('aa000000-0000-0000-0000-00000000000a') $$, '42501', null, 'ni ve la deuda');
select throws_ok($$ update laboratorios set dias_credito = 30 where id = '1a000000-0000-0000-0000-000000000007' $$,
  '42501', null, 'ni cambia los días de crédito');

-- ---------------------------------------------------------------------------
-- 2. Pagos (como el administrador de la sede principal)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok($$ select public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
  (select hoy from f), 'yape', jsonb_build_array(jsonb_build_object('ticket_id', (select id from t where clave = 't1'), 'monto', 600))) $$,
  'P0001', 'Al ticket 001 le quedan S/ 500.00 por pagar: no se puede aplicar S/ 600.00', 'PEDIDA: no se paga más de lo que se debe');
select lives_ok($$
  insert into t values ('p1', public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
    (select hoy from f), 'yape', jsonb_build_array(jsonb_build_object('ticket_id', (select id from t where clave = 't1'), 'monto', 200)),
    p_numero_operacion => 'OP-1'))
$$, 'PEDIDA: un ticket se paga en partes (1.ª parte)');
select results_eq($$ select estado_pago, deuda from lab_tickets_estado where id = (select id from t where clave = 't1') $$,
  $$ values ('parcial', 300.00::numeric) $$, 'queda en pago parcial');
select lives_ok($$
  insert into t values ('p2', public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000007',
    (select hoy from f), 'transferencia', jsonb_build_array(
      jsonb_build_object('ticket_id', (select id from t where clave = 't1'), 'monto', 300),
      jsonb_build_object('ticket_id', (select id from t where clave = 't1dup'), 'monto', 80))))
$$, 'PEDIDA: un pago se reparte entre varios tickets');
select results_eq($$ select (select monto from lab_pagos where id = (select id from t where clave = 'p2')),
                            (select count(*)::int from lab_tickets_estado where id in (select id from t where clave in ('t1', 't1dup')) and estado_pago = 'pagado') $$,
  $$ values (380.00::numeric, 2) $$, 'el pago suma 380 y los dos tickets quedan pagados');
select is((select pagado_por from lab_pagos where id = (select id from t where clave = 'p1')), 'a0000000-0000-0000-0000-0000000000a2'::uuid,
  'queda quién pagó');

-- Caja
select throws_ok($$ select public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000000',
  (select hoy from f), 'efectivo_caja', jsonb_build_array(jsonb_build_object('ticket_id', (select id from t where clave = 'tv'), 'monto', 80))) $$,
  'P0001', 'No hay una caja abierta en esta sede: ábrela o elige otro medio de pago', 'PEDIDA: sin caja abierta no se paga en efectivo de caja');
select lives_ok($$ insert into t values ('caja', public.abrir_caja((select id from t where clave = 'sede_p'), 100)) $$, 'el administrador abre la caja');
select throws_ok($$ select public.abrir_caja((select id from t where clave = 'sede_p'), 0) $$, 'P0001', 'Ya hay una caja abierta en esta sede',
  'una sola caja abierta por sede');
select lives_ok($$
  insert into t values ('pe', public.registrar_lab_pago((select id from t where clave = 'sede_p'), '1a000000-0000-0000-0000-000000000000',
    (select hoy from f), 'efectivo_caja', jsonb_build_array(jsonb_build_object('ticket_id', (select id from t where clave = 'tv'), 'monto', 80))))
$$, 'pago en efectivo de caja');
select results_eq($$ select caja_id, tipo, monto from caja_movimientos where lab_pago_id = (select id from t where clave = 'pe') $$,
  $$ select (select id from t where clave = 'caja'), 'egreso', 80.00::numeric $$, 'PEDIDA: crea el egreso en la caja de la sede');
select results_eq($$ select estado_pago, estado_vencimiento from lab_tickets_estado where id = (select id from t where clave = 'tv') $$,
  $$ values ('pagado', 'al_dia') $$, 'PEDIDA: un ticket pagado no aparece como vencido');

-- Anulaciones
select throws_ok($$ select public.anular_lab_ticket((select id from t where clave = 'tv'), 'error') $$,
  'P0001', 'El ticket tiene pagos vigentes: anula primero esos pagos', 'un ticket con pagos no se anula');
select throws_ok($$ select public.anular_lab_pago((select id from t where clave = 'pe'), '  ') $$,
  'P0001', 'Indica el motivo de la anulación', 'anular exige motivo');
select is((select sum(deuda) from lab_deuda_resumen('aa000000-0000-0000-0000-00000000000a')), 60.00::numeric, 'deuda antes de anular: solo el ticket de contado');
select lives_ok($$ select public.anular_lab_pago((select id from t where clave = 'pe'), 'Se pagó dos veces') $$, 'se anula el pago en efectivo');
select results_eq($$ select (select sum(deuda) from lab_deuda_resumen('aa000000-0000-0000-0000-00000000000a')),
                            (select egresos from caja_resumen((select id from t where clave = 'caja'))) $$,
  $$ values (140.00::numeric, 0.00::numeric) $$, 'PEDIDA: el pago anulado deja de contar (vuelve la deuda y sale de la caja)');
select lives_ok($$ select public.anular_lab_ticket((select id from t where clave = 'tc'), 'Ticket mal registrado') $$, 'se anula un ticket sin pagos');
select is((select sum(deuda) from lab_deuda_resumen('aa000000-0000-0000-0000-00000000000a')), 80.00::numeric,
  'PEDIDA: el ticket anulado deja de contar en la deuda');
select is((select ganancia from ganancia_ordenes_mes('aa000000-0000-0000-0000-00000000000a') where orden_id = (select id from t where clave = 'o1')),
  150.00::numeric, 'ganancia de la orden: 250 − 100 de laboratorio');
select ok((select count(*) > 0 from auditoria where tabla = 'lab_pagos' and usuario_id = 'a0000000-0000-0000-0000-0000000000a2'),
  'la auditoría guarda quién registró y anuló');

-- ---------------------------------------------------------------------------
-- 3. Aislamiento por sede y por óptica (incluidas las fotos)
-- ---------------------------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name) values
  ('laboratorios', 'aa000000-0000-0000-0000-00000000000a/' || (select id from t where clave = 'sede_p') || '/tickets/t1.jpg'),
  ('laboratorios', 'aa000000-0000-0000-0000-00000000000a/' || (select id from t where clave = 'sede_p') || '/pagos/p1.jpg');
set local role authenticated;

set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select results_eq($$ select (select count(*)::int from lab_tickets), (select count(*)::int from lab_pagos),
                            (select count(*)::int from storage.objects where bucket_id = 'laboratorios') $$,
  $$ values (4, 0, 1) $$, 'el vendedor de la sede ve sus tickets y la foto del ticket, pero no los pagos');

set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select results_eq($$ select (select count(*)::int from lab_tickets), (select count(*)::int from lab_ticket_ordenes),
                            (select count(*)::int from lab_pagos), (select count(*)::int from storage.objects where bucket_id = 'laboratorios') $$,
  $$ values (0, 0, 0, 0) $$, 'PEDIDA: un vendedor de otra sede no ve tickets, pagos ni fotos');

set local request.jwt.claims to '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select results_eq($$ select (select count(*)::int from lab_tickets), (select count(*)::int from lab_pagos),
                            (select count(*)::int from caja_movimientos), (select count(*)::int from storage.objects where bucket_id = 'laboratorios') $$,
  $$ values (0, 0, 0, 0) $$, 'PEDIDA: otra óptica no ve tickets, pagos, caja ni fotos');
select throws_ok($$ insert into storage.objects (bucket_id, name) values
  ('laboratorios', 'aa000000-0000-0000-0000-00000000000a/' || (select id from t where clave = 'sede_p') || '/tickets/intruso.jpg') $$,
  '42501', null, 'ni sube fotos a la carpeta de otra óptica');

set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from storage.objects where bucket_id = 'laboratorios'), 2, 'el administrador ve la foto del ticket y la del comprobante');

select * from finish();
rollback;
