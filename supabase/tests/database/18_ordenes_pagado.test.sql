-- OptiPedidos · Pruebas de lo pagado guardado en la orden (migración 0018)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------------------
-- 1. Estructura
-- ---------------------------------------------------------------------------
select col_not_null('public', 'ordenes', 'pagado', 'ordenes.pagado existe y no es nula');
select col_default_is('public', 'ordenes', 'pagado', '0', 'y empieza en 0');
select is((select pg_get_constraintdef(oid) from pg_constraint where conname = 'ordenes_pagado_valido'),
  'CHECK (((pagado >= (0)::numeric) AND (pagado <= (precio - descuento))))', 'pagado va de 0 al importe neto');
select is((select not prosecdef and proconfig is null and prolang = (select oid from pg_language where lanname = 'sql')
             from pg_proc where oid = 'public.saldo(public.ordenes)'::regprocedure),
  true, 'saldo() es SQL simple, sin SECURITY DEFINER ni SET: Postgres la puede incrustar');
select is((select pg_get_expr(indpred, indrelid) from pg_index where indexrelid = 'public.ordenes_con_saldo'::regclass),
  '((estado <> ''anulada''::estado_orden) AND (((precio - descuento) - pagado) > (0)::numeric))',
  'índice parcial de órdenes con saldo');
select is_empty($$ select o.id from public.ordenes o where o.pagado <> public.total_pagado(o.id) $$,
  'en toda la base, pagado coincide con la suma de los pagos vigentes');

-- ---------------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('c7777777-0000-0000-0000-000000000001', 'prop@pagado.test', 'authenticated', 'authenticated'),
  ('c7777777-0000-0000-0000-000000000002', 'vend@pagado.test', 'authenticated', 'authenticated');
insert into opticas (id, nombre) values ('c0000000-0000-0000-0000-00000000000c', 'Óptica Pagado');
insert into miembros (optica_id, usuario_id, rol) values
  ('c0000000-0000-0000-0000-00000000000c', 'c7777777-0000-0000-0000-000000000001', 'propietario'),
  ('c0000000-0000-0000-0000-00000000000c', 'c7777777-0000-0000-0000-000000000002', 'operador');
insert into laboratorios (id, optica_id, nombre) values
  ('c1000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000c', 'Lab Pagado');
insert into pacientes (id, optica_id, nombres, apellidos, creado_por) values
  ('c2000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'Ana', 'Pagado', 'c7777777-0000-0000-0000-000000000001');
insert into recetas (id, optica_id, paciente_id, od_esfera, creado_por) values
  ('c3000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-000000000001', -1.00,
   'c7777777-0000-0000-0000-000000000001');
insert into cajas (optica_id, sede_id, abierta_por, monto_inicial)
  select s.optica_id, s.id, '00000000-0000-0000-0000-000000000000', 0 from sedes s
  where s.optica_id = 'c0000000-0000-0000-0000-00000000000c' and not exists (select 1 from cajas c where c.sede_id = s.id and c.cerrada_en is null);

create temp table t (clave text primary key, id uuid) on commit drop;
grant all on t to authenticated;
create temp table marca (clave text primary key, valor text) on commit drop;
grant all on marca to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c7777777-0000-0000-0000-000000000001","role":"authenticated"}';
-- o1: neto S/ 300 (se confirma) · o2: neto S/ 120 (queda en borrador)
insert into t values ('o1', public.crear_orden('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-00000000000c', p_precio => 320, p_descuento => 20));
insert into t values ('o2', public.crear_orden('c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-00000000000c', p_precio => 120));
update ordenes set estado = 'enviada' where id = (select id from t where clave = 'o1');

-- Fecha de modificación vieja, para ver que un pago no la mueve.
reset role;
alter table public.ordenes disable trigger t_actualizado;
update public.ordenes set actualizado_en = '2026-01-01 10:00-05' where id = (select id from t where clave = 'o1');
alter table public.ordenes enable trigger t_actualizado;
insert into marca select 'auditoria_o1', count(*)::text from public.auditoria
  where tabla = 'ordenes' and registro_id = (select id::text from t where clave = 'o1');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Registrar y anular pagos
-- ---------------------------------------------------------------------------
select is((select pagado::text from ordenes where id = (select id from t where clave = 'o1')), '0.00', 'una orden nueva no tiene nada pagado');

set local request.jwt.claims to '{"sub":"c7777777-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$ with x as (insert into orden_pagos (optica_id, orden_id, importe, medio)
    values ('c0000000-0000-0000-0000-00000000000c', (select id from t where clave = 'o1'), 100, 'efectivo') returning id)
    insert into t select 'p1', id from x $$,
  'el vendedor cobra un adelanto en una orden ya confirmada');
select results_eq($$ select pagado::text, public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o1') $$,
  $$ values ('100.00', '200.00') $$, 'el pago suma a pagado y baja el saldo');
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('c0000000-0000-0000-0000-00000000000c', (select id from t where clave = 'o1'), 50, 'tarjeta');
select is((select pagado::text from ordenes where id = (select id from t where clave = 'o1')), '150.00', 'un segundo pago también suma');
select is((select actualizado_en from ordenes where id = (select id from t where clave = 'o1')), '2026-01-01 10:00-05'::timestamptz,
  'cobrar no cambia la fecha de modificación de la orden');

set local request.jwt.claims to '{"sub":"c7777777-0000-0000-0000-000000000001","role":"authenticated"}';
update orden_pagos set motivo_anulacion = 'Monto equivocado' where id = (select id from t where clave = 'p1');
select results_eq($$ select pagado::text, public.saldo(o)::text from ordenes o where id = (select id from t where clave = 'o1') $$,
  $$ values ('50.00', '250.00') $$, 'anular un pago lo resta de pagado');

reset role;
select is((select count(*)::text from public.auditoria where tabla = 'ordenes' and registro_id = (select id::text from t where clave = 'o1')),
  (select valor from marca where clave = 'auditoria_o1'), 'los cobros no agregan filas de auditoría a la orden');
select is((select count(*)::int from public.auditoria where tabla = 'orden_pagos'
             and (despues ->> 'orden_id') = (select id::text from t where clave = 'o1')), 3,
  'cada pago y su anulación quedan auditados en orden_pagos');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 3. Nadie escribe pagado a mano
-- ---------------------------------------------------------------------------
update ordenes set pagado = 300 where id = (select id from t where clave = 'o1');
select is((select pagado::text from ordenes where id = (select id from t where clave = 'o1')), '50.00',
  'en una orden confirmada, pagado no se cambia por la API (se ignora)');
update ordenes set pagado = 100, montura_descripcion = 'Montura negra' where id = (select id from t where clave = 'o2');
select results_eq($$ select pagado::text, montura_descripcion from ordenes where id = (select id from t where clave = 'o2') $$,
  $$ values ('0.00', 'Montura negra') $$, 'en un borrador se guardan los demás cambios, pero pagado no');
with x as (insert into ordenes (optica_id, paciente_id, receta_id, laboratorio_id, precio, pagado)
  values ('c0000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-00000000000c', 90, 90) returning id)
insert into t select 'o3', id from x;
select is((select pagado::text from ordenes where id = (select id from t where clave = 'o3')), '0.00',
  'una orden insertada por la API empieza con pagado 0 aunque se envíe otro valor');

-- ---------------------------------------------------------------------------
-- 4. Reglas que siguen igual
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into orden_pagos (optica_id, orden_id, importe, medio)
    values ('c0000000-0000-0000-0000-00000000000c', (select id from t where clave = 'o1'), 251, 'efectivo') $$,
  null, 'El pago (S/ 251.00) supera el saldo pendiente (S/ 250.00)', 'no se cobra más que el saldo');
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('c0000000-0000-0000-0000-00000000000c', (select id from t where clave = 'o2'), 40, 'efectivo');
select throws_ok($$ update ordenes set precio = 30 where id = (select id from t where clave = 'o2') $$,
  null, null, 'el neto de un borrador no baja de lo ya pagado');

-- ---------------------------------------------------------------------------
-- 5. Filtro "con saldo"
-- ---------------------------------------------------------------------------
select results_eq($$ select o.numero from ordenes o where o.optica_id = 'c0000000-0000-0000-0000-00000000000c'
                     and o.estado <> 'anulada' and public.saldo(o) > 0 order by o.numero $$,
  $$ select numero from ordenes where id in (select id from t where clave in ('o1', 'o2', 'o3')) order by numero $$,
  'las tres órdenes tienen saldo');
insert into orden_pagos (optica_id, orden_id, importe, medio)
  values ('c0000000-0000-0000-0000-00000000000c', (select id from t where clave = 'o3'), 90, 'yape');
select is((select count(*)::int from ordenes o where o.optica_id = 'c0000000-0000-0000-0000-00000000000c' and public.saldo(o) > 0), 2,
  'al pagarse completa, la orden sale del filtro');

reset role;
create function pg_temp.plan_de(q text) returns setof text language plpgsql as $$
declare r record;
begin
  for r in execute 'explain (costs off) ' || q loop return next r."QUERY PLAN"; end loop;
end $$;
select ok((select bool_and(p !~ 'saldo\(') and bool_or(p ~ '\(\(precio - descuento\) - pagado\) > ')
           from pg_temp.plan_de('select id from public.ordenes o where public.saldo(o) > 0') p),
  'saldo() se incrusta en la consulta (el filtro es sobre columnas, apto para índices)');

select * from finish();
rollback;
