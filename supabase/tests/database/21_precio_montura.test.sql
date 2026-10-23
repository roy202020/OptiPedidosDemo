-- Regresiones: selección de un solo ojo y compatibilidad de pedidos.
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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
insert into t values ('montura', public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":80}',p_precio=>380,p_descuento=>20,p_sede=>(select id from t where clave='sede')));
select is((select precio_montura from public.ordenes where id=(select id from t where clave='montura')),80::numeric,'guarda precio de montura como vendedor');
select is((select precio from public.ordenes where id=(select id from t where clave='montura')),380::numeric,'precio mantiene total de lunas y montura');
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='montura'),'f1950000-0000-0000-0000-000000000001','lentes_completos',null,null,current_date+5,'normal','{"_precio_montura":100}',400,20)$$,'edita precio total y montura juntos');
select is((select precio_montura from public.ordenes where id=(select id from t where clave='montura')),100::numeric,'conserva nuevo desglose');
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='montura'),'f1950000-0000-0000-0000-000000000001','lentes_completos',null,null,current_date+5,'normal','{}',400,20)$$,'cliente anterior puede editar sin enviar desglose');
select is((select precio_montura from public.ordenes where id=(select id from t where clave='montura')),100::numeric,'cliente anterior no borra precio de montura');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_precio_montura":500}',p_precio=>380,p_sede=>(select id from t where clave='sede'))$$,'23514',null,'la base rechaza una montura mayor que el total');
select * from finish();
rollback;
