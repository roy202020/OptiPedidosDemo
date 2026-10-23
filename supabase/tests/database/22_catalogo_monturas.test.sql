-- Regresiones: selección de un solo ojo y compatibilidad de pedidos.
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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
insert into public.opticas(id,nombre) values('f1910000-0000-0000-0000-000000000002','Óptica ajena de prueba');
insert into public.monturas(id,optica_id,nombre,precio) values('f1960000-0000-0000-0000-000000000002','f1910000-0000-0000-0000-000000000002','Montura ajena',99);
set local role authenticated;
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into public.monturas(id,optica_id,nombre,codigo,precio) values('f1960000-0000-0000-0000-000000000001','f1910000-0000-0000-0000-000000000001','Acetato Negro','AC-01',80);
select is((select precio from public.monturas where codigo='AC-01'),80::numeric,'administrador crea precio del catálogo');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.registrar_stock_montura('f1960000-0000-0000-0000-000000000001',(select id from t where clave='sede'),'entrada',5,'Existencias iniciales de prueba');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*) from public.monturas),1::bigint,'vendedor puede consultar catálogo');
update public.monturas set precio=1 where codigo='AC-01';
select is((select precio from public.monturas where codigo='AC-01'),80::numeric,'vendedor no puede cambiar precios del catálogo');
select throws_ok($$insert into public.monturas(optica_id,nombre,precio) values('f1910000-0000-0000-0000-000000000001','No autorizada',1)$$,'42501',null,'vendedor no crea monturas');
insert into t values('catalogo',public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":80,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001"}',p_precio=>380,p_sede=>(select id from t where clave='sede')));
select is((select montura_descripcion from public.ordenes where id=(select id from t where clave='catalogo')),'Acetato Negro','vendedor guarda nombre del catálogo');
select is((select montura_origen from public.ordenes where id=(select id from t where clave='catalogo')),'optica','fija origen óptica para montura seleccionada');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":1,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001"}',p_precio=>301,p_sede=>(select id from t where clave='sede'))$$,'P0001','El precio de la montura cambió. Recarga el catálogo antes de guardar.','rechaza un precio manipulado');
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}';
update public.monturas set precio=100,activo=false where codigo='AC-01';
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='catalogo'),'f1950000-0000-0000-0000-000000000001','lentes_completos',null,null,current_date+5,'normal','{"_precio_montura":80,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001"}',380,0)$$,'editar conserva la montura desactivada del pedido');
select is((select precio_montura from public.ordenes where id=(select id from t where clave='catalogo')),80::numeric,'nuevo precio del catálogo no cambia un pedido anterior');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":100,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000001"}',p_precio=>400,p_sede=>(select id from t where clave='sede'))$$,'P0001','La montura no está disponible en el catálogo de esta óptica','no vende monturas inactivas en pedidos nuevos');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":100,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000099"}',p_precio=>400,p_sede=>(select id from t where clave='sede'))$$,'P0001','La montura no está disponible en el catálogo de esta óptica','rechaza referencias de monturas ajenas o inexistentes');
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='catalogo'),'f1950000-0000-0000-0000-000000000001','lentes_completos','Montura manual','paciente',current_date+5,'normal','{"_precio_montura":0,"_montura_catalogo_id":""}',300,0)$$,'permite sustituir por montura del paciente');
select is((select montura_catalogo_id from public.ordenes where id=(select id from t where clave='catalogo')),null::uuid,'quitar la selección borra la referencia del catálogo');
select is((select count(*) from public.monturas where optica_id='f1910000-0000-0000-0000-000000000002'),0::bigint,'RLS oculta el catálogo de otras ópticas');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":99,"_montura_catalogo_id":"f1960000-0000-0000-0000-000000000002"}',p_precio=>399,p_sede=>(select id from t where clave='sede'))$$,'P0001','La montura no está disponible en el catálogo de esta óptica','no se puede asociar una montura de otra óptica');
select * from finish();rollback;
