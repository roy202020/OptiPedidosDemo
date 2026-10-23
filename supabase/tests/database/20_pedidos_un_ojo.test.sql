-- Regresiones: selección de un solo ojo y compatibilidad de pedidos.
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
insert into t values ('ambos', public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_sede=>(select id from t where clave='sede')));
select is((select count(*) from public.orden_ojos where orden_id=(select id from t where clave='ambos')),2::bigint,'sin selección conserva los dos ojos de la receta');
insert into t values ('od', public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_ojos":["OD"],"OD":{"material":"Policarbonato","indice":1.59,"tratamientos":["antirreflejo"]}}',p_sede=>(select id from t where clave='sede')));
select results_eq($$select ojo::text from public.orden_ojos where orden_id=(select id from t where clave='od')$$,array['OD'],'reposición OD no crea OI');
insert into t values ('oi', public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_ojos":["OI"],"OI":{"material":"CR-39","indice":1.5}}',p_sede=>(select id from t where clave='sede')));
select results_eq($$select ojo::text from public.orden_ojos where orden_id=(select id from t where clave='oi')$$,array['OI'],'reposición OI no crea OD');
select is((select esfera::numeric from public.orden_ojos where orden_id=(select id from t where clave='od')),-1::numeric,'copia la graduación original del ojo seleccionado');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_ojos":[]}',p_sede=>(select id from t where clave='sede'))$$,'P0001','Selecciona uno o dos ojos válidos','rechaza pedidos sin ningún ojo');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000001','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_ojos":"OD"}',p_sede=>(select id from t where clave='sede'))$$,'P0001','Selecciona uno o dos ojos válidos','rechaza una selección mal formada');
select throws_ok($$select public.crear_orden('f1920000-0000-0000-0000-000000000001','f1930000-0000-0000-0000-000000000002','f1950000-0000-0000-0000-000000000001',p_ojos=>' {"_ojos":["OI"]}',p_sede=>(select id from t where clave='sede'))$$,'P0001','La receta no tiene graduación para el ojo seleccionado','no fabrica un ojo ausente de la receta');
select lives_ok($$select public.actualizar_orden_borrador((select id from t where clave='od'),'f1950000-0000-0000-0000-000000000001','solo_lunas',null,null,current_date+5,'normal','{"OD":{"material":"Trivex"}}',120,0)$$,'edita los datos de una reposición');
select results_eq($$select ojo::text from public.orden_ojos where orden_id=(select id from t where clave='od')$$,array['OD'],'editar no añade el otro ojo');
select is((select count(*) from public.orden_ojos where orden_id=(select id from t where clave='ambos')),2::bigint,'las otras órdenes mantienen sus ojos');
select * from finish();
rollback;
