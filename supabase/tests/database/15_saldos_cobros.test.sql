-- OptiPedidos · Pruebas de saldos de clientes, cobros, caja y entrega con saldo (migración 20261023000000)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- ---------------------------------------------------------------------------
-- Datos de prueba
--   Óptica A (Profesional): Sede principal y Sede Norte.
--     PA propietario · AA administrador (principal) · VA vendedor (principal) · VN vendedor (Norte)
--   Óptica B: PB propietario.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('c0000000-0000-0000-0000-0000000000a1', 'pa15@prueba.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000a2', 'aa15@prueba.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000a3', 'va15@prueba.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000a4', 'vn15@prueba.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000b1', 'pb15@prueba.test', 'authenticated', 'authenticated');

create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;

insert into opticas (id, nombre, plan) values
  ('ca000000-0000-0000-0000-00000000000a', 'Óptica Saldos A', 'profesional'),
  ('cb000000-0000-0000-0000-00000000000b', 'Óptica Saldos B', 'profesional');
insert into miembros (optica_id, usuario_id, rol) values
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a1', 'propietario'),
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a2', 'administrador'),
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a3', 'operador'),
  ('cb000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-0000000000b1', 'propietario');
insert into t select 'sede_p', id from sedes where optica_id = 'ca000000-0000-0000-0000-00000000000a';
insert into sedes (id, optica_id, nombre) values ('cc000000-0000-0000-0000-00000000000c', 'ca000000-0000-0000-0000-00000000000a', 'Sede Norte');
insert into miembros (optica_id, usuario_id, rol) values ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a4', 'operador');
insert into miembro_sedes (optica_id, usuario_id, sede_id) values
  ('ca000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-0000000000a4', 'cc000000-0000-0000-0000-00000000000c');
insert into laboratorios (id, optica_id, nombre) values ('1c000000-0000-0000-0000-00000000000a', 'ca000000-0000-0000-0000-00000000000a', 'Lab A');
insert into pacientes (id, optica_id, nombres, apellidos, telefono, creado_por) values
  ('2c000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', 'Ana', 'Deudora', '987000111', 'c0000000-0000-0000-0000-0000000000a1');
insert into recetas (id, optica_id, paciente_id, fecha_examen, od_esfera, creado_por) values
  ('3c000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-00000000000a', '2c000000-0000-0000-0000-000000000001',
   (now() at time zone 'America/Lima')::date, -1, 'c0000000-0000-0000-0000-0000000000a1');

-- Órdenes (como la propietaria): o1 S/ 450 (500 − 50) y o2 S/ 200 y o3 S/ 100 en la principal; n1 S/ 300 en la Norte.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into t values
  ('o1', public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000a',
                            p_precio => 500, p_descuento => 50, p_sede => (select id from t where clave = 'sede_p'))),
  ('o2', public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000a',
                            p_precio => 200, p_sede => (select id from t where clave = 'sede_p'))),
  ('o3', public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000a',
                            p_precio => 100, p_sede => (select id from t where clave = 'sede_p'))),
  ('n1', public.crear_orden('2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-00000000000a',
                            p_precio => 300, p_sede => 'cc000000-0000-0000-0000-00000000000c'));
update ordenes set estado = 'enviada' where id in (select id from t where clave in ('o1', 'o2', 'o3', 'n1'));
update ordenes set estado = 'recibida_optica' where id in (select id from t where clave in ('o1', 'o2', 'o3'));

-- ---------------------------------------------------------------------------
-- 1. Cobros (como el vendedor de la sede principal)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 50, 'efectivo') $$,
  'P0001', 'No hay una caja abierta en esta sede: ábrela para cobrar en efectivo o elige otro medio', 'sin caja abierta no se cobra en efectivo');
select lives_ok($$ insert into t values ('caja', public.abrir_caja((select id from t where clave = 'sede_p'), 50)) $$, 'el vendedor abre la caja de su sede');
select throws_ok($$ select public.cerrar_caja((select id from t where clave = 'caja'), 50) $$, '42501', null, 'pero no la cierra');

select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio, numero_operacion)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 100, 'yape', ' OP-123 ') $$, 'adelanto por Yape');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 150, 'efectivo') $$, 'segundo cobro en efectivo');
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 80, 'plin') $$, 'tercer cobro por Plin');
insert into t select 'pe', id from orden_pagos where orden_id = (select id from t where clave = 'o1') and medio = 'efectivo';

select results_eq($$ select o.precio - o.descuento, (select coalesce(sum(p.importe), 0) from orden_pagos p where p.orden_id = o.id and p.anulado_en is null), o.saldo from ordenes o where o.id = (select id from t where clave = 'o1') $$,
  $$ values (450.00::numeric, 330.00::numeric, 120.00::numeric) $$, 'PEDIDA: el saldo se calcula bien con varios cobros parciales');
select results_eq($$ select numero_operacion, sede_id, creado_por from orden_pagos where medio = 'yape' and orden_id = (select id from t where clave = 'o1') $$,
  $$ select 'OP-123', (select id from t where clave = 'sede_p'), 'c0000000-0000-0000-0000-0000000000a3'::uuid $$, 'el cobro guarda operación, sede y usuario');
select is((select caja_id from orden_pagos where id = (select id from t where clave = 'pe')), (select id from t where clave = 'caja'),
  'PEDIDA: el cobro en efectivo entra a la caja de la sede');
select is((select caja_id from orden_pagos where medio = 'yape' and orden_id = (select id from t where clave = 'o1')), null::uuid,
  'un cobro por Yape no entra a la caja');
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o1'), 120.01, 'tarjeta') $$,
  'P0001', 'El pago (S/ 120.01) supera el saldo pendiente (S/ 120.00)', 'PEDIDA: no se cobra más que el saldo');

-- Anulación: solo propietario o administrador.
select throws_ok($$ update orden_pagos set motivo_anulacion = 'Error' where id = (select id from t where clave = 'pe') $$,
  '42501', 'Solo el propietario o un administrador anulan cobros', 'el vendedor no anula cobros');

-- Entrega con saldo: bloqueada para todos sin autorización.
select throws_ok($$ update ordenes set estado = 'entregada' where id = (select id from t where clave = 'o1') $$,
  'P0001', 'La orden tiene un saldo pendiente de S/ 120.00: cobra el saldo o pide a un administrador que autorice la entrega con saldo',
  'PEDIDA: no se entrega con saldo');
select throws_ok($$ select public.entregar_con_saldo((select id from t where clave = 'o1'), 'Cliente conocido') $$,
  '42501', null, 'el vendedor no autoriza la entrega con saldo');

-- Una orden pagada por completo se entrega normalmente.
select lives_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'o3'), 100, 'transferencia') $$, 'se cobra todo el saldo de o3');
select lives_ok($$ update ordenes set estado = 'entregada' where id = (select id from t where clave = 'o3') $$, 'sin saldo se entrega');

select results_eq($$ select numero, total, pagado, saldo, estado from public.saldos_pendientes('ca000000-0000-0000-0000-00000000000a') $$,
  $$ select o.numero, o.precio - o.descuento, (select coalesce(sum(p.importe), 0) from orden_pagos p where p.orden_id = o.id and p.anulado_en is null), o.saldo, o.estado::text from ordenes o
     where o.id in (select id from t where clave in ('o1', 'o2')) order by o.creado_en, o.numero $$,
  'el vendedor ve los saldos de su sede, del más antiguo al más reciente');
select throws_ok($$ select * from public.resumen_por_cobrar('ca000000-0000-0000-0000-00000000000a') $$, '42501', null,
  'el total por cobrar es del panel del dueño y del administrador');

-- ---------------------------------------------------------------------------
-- 2. Administrador de la sede principal
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select cobros_efectivo from public.caja_resumen((select id from t where clave = 'caja'))), 150.00::numeric, 'la caja suma el cobro en efectivo');
select throws_ok($$ update orden_pagos set motivo_anulacion = '  ' where id = (select id from t where clave = 'pe') $$,
  'P0001', 'Indica el motivo de la anulación del pago', 'anular exige motivo');
select lives_ok($$ update orden_pagos set motivo_anulacion = 'Billete falso' where id = (select id from t where clave = 'pe') $$, 'el administrador anula el cobro');
select results_eq($$ select o.saldo, (select cobros_efectivo from public.caja_resumen((select id from t where clave = 'caja')))
                     from ordenes o where o.id = (select id from t where clave = 'o1') $$,
  $$ values (270.00::numeric, 0.00::numeric) $$, 'PEDIDA: el cobro anulado deja de contar (vuelve al saldo y sale de la caja)');
select ok((select count(*) = 1 from auditoria where tabla = 'orden_pagos' and accion = 'UPDATE' and registro_id = (select id::text from t where clave = 'pe')
           and usuario_id = 'c0000000-0000-0000-0000-0000000000a2'), 'la anulación queda en la auditoría');

select results_eq($$ select por_cobrar, ordenes, en_listos, ordenes_listas from public.resumen_por_cobrar('ca000000-0000-0000-0000-00000000000a') $$,
  $$ values (470.00::numeric, 2, 470.00::numeric, 2) $$, 'por cobrar: 270 + 200, todo en pedidos listos para entregar');

select throws_ok($$ select public.entregar_con_saldo((select id from t where clave = 'o1'), ' ') $$,
  'P0001', 'Indica el motivo para entregar con saldo', 'autorizar exige motivo');
select lives_ok($$ select public.entregar_con_saldo((select id from t where clave = 'o1'), 'Cliente frecuente: paga el viernes') $$,
  'PEDIDA: el administrador autoriza la entrega con saldo');
select results_eq($$ select estado::text, entrega_con_saldo_monto, entrega_con_saldo_motivo, entrega_con_saldo_por from ordenes where id = (select id from t where clave = 'o1') $$,
  $$ values ('entregada', 270.00::numeric, 'Cliente frecuente: paga el viernes', 'c0000000-0000-0000-0000-0000000000a2'::uuid) $$,
  'queda registrado quién, cuánto y por qué');
select ok((select count(*) > 0 from auditoria where tabla = 'ordenes' and registro_id = (select id::text from t where clave = 'o1')
           and despues ->> 'entrega_con_saldo_motivo' = 'Cliente frecuente: paga el viernes'), 'la autorización queda en la auditoría');

set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
update ordenes set entrega_con_saldo_motivo = 'Otro motivo' where id = (select id from t where clave = 'o1');
select is((select entrega_con_saldo_motivo from ordenes where id = (select id from t where clave = 'o1')), 'Cliente frecuente: paga el viernes',
  'la autorización no se edita por la API');
select is((select count(*)::int from public.saldos_pendientes('ca000000-0000-0000-0000-00000000000a')), 3,
  'la propietaria ve los saldos de todas sus sedes (también lo entregado con saldo)');

-- ---------------------------------------------------------------------------
-- 3. Aislamiento: otra sede y otra óptica
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select results_eq($$ select (select count(*)::int from public.saldos_pendientes('ca000000-0000-0000-0000-00000000000a')),
                            (select count(*)::int from orden_pagos), (select count(*)::int from ordenes o where o.saldo > 0 and o.sede_id <> 'cc000000-0000-0000-0000-00000000000c') $$,
  $$ values (1, 0, 0) $$, 'PEDIDA: el vendedor de otra sede solo ve el saldo de su sede, no los cobros de la principal');
select throws_ok($$ select * from public.saldos_pendientes('ca000000-0000-0000-0000-00000000000a', (select id from t where clave = 'sede_p')) $$,
  '42501', null, 'ni pidiendo la otra sede');

set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$ select * from public.saldos_pendientes('ca000000-0000-0000-0000-00000000000a') $$, '42501', null,
  'PEDIDA: otra óptica no ve los saldos');
select results_eq($$ select (select count(*)::int from orden_pagos), (select count(*)::int from ordenes) $$, $$ values (0, 0) $$,
  'ni los cobros ni las órdenes por consulta directa');

select * from finish();
rollback;
