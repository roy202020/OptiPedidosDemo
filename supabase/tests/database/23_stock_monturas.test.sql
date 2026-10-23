-- Regresiones: selección de un solo ojo y compatibilidad de pedidos.
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id,email,aud,role) values
 ('f1900000-0000-0000-0000-000000000001','prop@cotizaciones-roles.test','authenticated','authenticated'),
 ('f1900000-0000-0000-0000-000000000002','admin@cotizaciones-roles.test','authenticated','authenticated'),
 ('f1900000-0000-0000-0000-000000000003','vend@cotizaciones-roles.test','authenticated','authenticated');
insert into public.opticas (id,nombre,plan,max_usuarios,max_sedes) values
 ('f1910000-0000-0000-0000-000000000001','Óptica Demo · Revisión de diseño','profesional',null,null);
insert into public.miembros (optica_id,usuario_id,rol) values
 ('f1910000-0000-0000-0000-000000000001','f1900000-0000-0000-0000-000000000001','propietario'),
 ('f1910000-0000-0000-0000-000000000001','f1900000-0000-0000-0000-000000000002','administrador'),
 ('f1910000-0000-0000-0000-000000000001','f1900000-0000-0000-0000-000000000003','operador');
insert into public.pacientes (id,optica_id,nombres,apellidos,creado_por) values
 ('f1920000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','Paciente','Roles','f1900000-0000-0000-0000-000000000001');
insert into public.recetas (id,optica_id,paciente_id,od_esfera,od_cilindro,od_eje,oi_esfera,oi_cilindro,oi_eje,creado_por) values
 ('f1930000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','f1920000-0000-0000-0000-000000000001',-1,-.5,90,-1,-.5,90,'f1900000-0000-0000-0000-000000000001');
insert into public.lunas_productos (id,optica_id,nombre,tipo,vision) values
 ('f1940000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','Lente de prueba','resina','monofocal');
create temp table t (clave text primary key,id uuid) on commit drop;
grant all on t to authenticated;
insert into t select 'sede',id from public.sedes where optica_id='f1910000-0000-0000-0000-000000000001';


insert into public.laboratorios (id,optica_id,nombre) values ('f1950000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','Laboratorio prueba');
insert into public.recetas (id,optica_id,paciente_id,od_esfera,creado_por) values ('f1930000-0000-0000-0000-000000000002','f1910000-0000-0000-0000-000000000001','f1920000-0000-0000-0000-000000000001',-2,'f1900000-0000-0000-0000-000000000001');
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
reset role;
set local request.jwt.claims to '{}';
insert into public.monturas(id,optica_id,nombre,precio) values('f1960000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','Montura A',80),('f1960000-0000-0000-0000-000000000002','f1910000-0000-0000-0000-000000000001','Montura B',120);
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}';

select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001',(select id from t where clave='sede'),'entrada',3,'Stock inicial A');
select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000002',(select id from t where clave='sede'),'entrada',1,'Stock inicial B');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/0'],'entrada aumenta stock físico sin reservar');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';

select throws_ok($$select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001',(select id from t where clave='sede'),'entrada',1,'No autorizado')$$,'42501','No tienes permiso para ajustar stock en esta sede','vendedor no ajusta stock');
select throws_ok($$update public.monturas_stock set stock=999 where montura_id='f1960000-0000-0000-0000-000000000001'$$,'42501',null,'API no permite editar contadores directamente');
insert into t values('primero',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001","_precio_montura":80}',p_precio=>380,p_sede=>(select id from t where clave='sede')));
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/1'],'guardar pedido reserva una unidad sin descontar stock físico');
insert into t values('segundo',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001","_precio_montura":80}',p_precio=>380,p_sede=>(select id from t where clave='sede')));
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/2'],'otro pedido mantiene su reserva separada');
update public.ordenes set estado='enviada' where id=(select id from t where clave='primero');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['2/1'],'confirmar venta descuenta una unidad y consume su reserva');
update public.ordenes set estado='enviada' where id=(select id from t where clave='primero');
select is((select count(*) from public.monturas_movimientos where orden_id=(select id from t where clave='primero') and tipo='venta'),1::bigint,'repetir actualización no duplica venta');
update public.ordenes set estado='anulada',motivo_anulacion='Cancelación de prueba' where id=(select id from t where clave='segundo');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['2/0'],'anular borrador libera la reserva');
update public.ordenes set estado='borrador' where id=(select id from t where clave='primero');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/1'],'volver a venta iniciada repone stock y reserva la unidad');
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='primero'),'f1950000-0000-0000-0000-000000000001','lentes_completos',null,'optica',current_date+5,'normal','{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000002","_precio_montura":120}',420,0)$$,'cambiar modelo mueve la reserva de forma atómica');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/0'],'cambio libera la montura anterior');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000002' and sede_id=(select id from t where clave='sede')$$,array['1/1'],'cambio reserva la nueva montura');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000002","_precio_montura":120}',p_precio=>420,p_sede=>(select id from t where clave='sede'))$$,'P0001','Sin unidades disponibles de esta montura en la sede del pedido','no se puede vender la última unidad reservada');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into t values('cambio_fallido',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001","_precio_montura":80}',p_precio=>380,p_sede=>(select id from t where clave='sede')));
select throws_ok($$select public.actualizar_orden_borrador((select id from t where clave='cambio_fallido'),'f1950000-0000-0000-0000-000000000001','lentes_completos',null,'optica',current_date+5,'normal','{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000002","_precio_montura":120}',420,0)$$,'P0001','Sin unidades disponibles de esta montura en la sede del pedido','cambio a montura agotada se rechaza de forma atómica');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['3/1'],'cambio fallido conserva la reserva original');
update public.ordenes set estado='anulada',motivo_anulacion='Finalizar prueba de cambio fallido' where id=(select id from t where clave='cambio_fallido');
select throws_ok($$select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000002',(select id from t where clave='sede'),'conteo',0,'Conteo insuficiente')$$,'P0001','El stock contado no puede ser menor que las unidades reservadas. Revisa primero los pedidos pendientes.','conteo no puede dejar reservas sin stock');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';

update public.ordenes set estado='anulada',motivo_anulacion='Cancelar antes de venta' where id=(select id from t where clave='primero');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000002' and sede_id=(select id from t where clave='sede')$$,array['1/0'],'anulación libera el modelo cambiado');
insert into t values('venta',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000002","_precio_montura":120}',p_precio=>420,p_sede=>(select id from t where clave='sede')));
update public.ordenes set estado='enviada' where id=(select id from t where clave='venta');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000002' and sede_id=(select id from t where clave='sede')$$,array['0/0'],'venta de última unidad deja disponibilidad cero');
update public.ordenes set estado='anulada',motivo_anulacion='Anular después de enviar' where id=(select id from t where clave='venta');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000002' and sede_id=(select id from t where clave='sede')$$,array['0/0'],'anular después de vender no inventa una devolución física');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}';

select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000002',(select id from t where clave='sede'),'devolucion',1,'Montura recibida físicamente');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000002' and sede_id=(select id from t where clave='sede')$$,array['1/0'],'devolución recibida repone la unidad');
select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001',(select id from t where clave='sede'),'conteo',2,'Conteo físico del inventario');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['2/0'],'conteo fija el stock absoluto sin sumar otra vez');
select throws_ok($$select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001',(select id from t where clave='sede'),'entrada',-1,'Entrada negativa')$$,'P0001','Revisa el tipo, la cantidad y el motivo del movimiento','no acepta entradas negativas');
select throws_ok($$delete from public.monturas_movimientos$$,'42501',null,'historial no se puede borrar por la API');
reset role;
set local request.jwt.claims to '{}';
insert into public.sedes(id,optica_id,nombre) values('f1970000-0000-0000-0000-000000000002','f1910000-0000-0000-0000-000000000001','Sede ajena al vendedor');
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001','f1970000-0000-0000-0000-000000000002','entrada',7,'Stock de otra sede');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from public.monturas_stock where sede_id='f1970000-0000-0000-0000-000000000002'),0::bigint,'vendedor no ve stock de sedes sin asignación');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['2/0'],'entrada en otra sede no modifica existencias de la sede del pedido');
insert into t values('legacy_confirmado',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>'{"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001","_precio_montura":80}',p_precio=>380,p_sede=>(select id from t where clave='sede')));
update public.ordenes set estado='enviada' where id=(select id from t where clave='legacy_confirmado');
reset role;
delete from public.monturas_asignaciones where orden_id=(select id from t where clave='legacy_confirmado');
set local role authenticated;
update public.ordenes set estado='recibida_lab' where id=(select id from t where clave='legacy_confirmado');
select results_eq($$select stock::text||'/'||reservado::text from public.monturas_stock where montura_id='f1960000-0000-0000-0000-000000000001' and sede_id=(select id from t where clave='sede')$$,array['1/0'],'pedido ya confirmado sin registro anterior no se descuenta retroactivamente al avanzar');
select is((select count(*) from public.monturas_asignaciones where orden_id=(select id from t where clave='legacy_confirmado')),0::bigint,'avance de pedido histórico no crea otra venta de montura');
select * from finish();rollback;
