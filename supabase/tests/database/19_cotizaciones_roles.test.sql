-- Regresiones: autorización de importes y copia de costos al versionar.
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

set local role authenticated;
set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into t values ('regla',public.crear_regla_cotizacion_lunas(
 p_producto=>'f1940000-0000-0000-0000-000000000001',p_modalidad=>'fabricacion_especial',
 p_esfera_min=>-6,p_esfera_max=>6,p_cilindro_min=>-2,p_cilindro_max=>0,
 p_adicion_min=>null,p_adicion_max=>null,p_unidad_precio=>'por_luna',p_precio_base=>100,p_precio_venta=>150,p_costo=>60));

set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$insert into t values ('cotizacion',public.crear_cotizacion_lunas(
 'f1930000-0000-0000-0000-000000000001',(select id from t where clave='sede'),(select id from t where clave='regla'),null))$$,
 'el vendedor crea una cotización compatible');
select is_empty($$select * from public.lunas_reglas_cotizacion_costos where optica_id='f1910000-0000-0000-0000-000000000001'$$,
 'el vendedor no lee costos del catálogo');
select throws_ok($$select public.actualizar_cotizacion_lunas((select id from t where clave='cotizacion'),null,10)$$,
 '42501','Solo propietario o administrador pueden fijar precios manuales o autorizar descuentos',
 'el vendedor no autoriza descuentos');

set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.actualizar_cotizacion_lunas((select id from t where clave='cotizacion'),null,50)$$,
 'el administrador autoriza descuento y copia el costo sin ambigüedad de alias');
select is((select v.total from public.cotizaciones_lunas_versiones v join public.cotizaciones_lunas c on c.id=v.cotizacion_id and c.version_actual=v.numero where c.id=(select id from t where clave='cotizacion')),250::numeric,
 'total actualizado: 300 menos 50');
select is((select k.costo_unitario_snapshot from public.cotizaciones_lunas_costos k join public.cotizaciones_lunas_lineas l on l.id=k.linea_id join public.cotizaciones_lunas_versiones v on v.id=l.version_id where v.cotizacion_id=(select id from t where clave='cotizacion') and v.numero=2),60::numeric,
 'la nueva versión conserva el costo original');

set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.actualizar_cotizacion_lunas((select id from t where clave='cotizacion'),null,0)$$,
 '42501','Solo propietario o administrador pueden fijar precios manuales o autorizar descuentos',
 'el vendedor tampoco elimina el descuento enviando cero por API');
select is((select count(*) from public.cotizaciones_lunas_versiones where cotizacion_id=(select id from t where clave='cotizacion')),2::bigint,
 'los rechazos no crean versiones adicionales');
select is_empty($$select * from public.cotizaciones_lunas_costos where optica_id='f1910000-0000-0000-0000-000000000001'$$,
 'el vendedor no lee los costos versionados');

set local request.jwt.claims to '{"sub":"f1900000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select public.actualizar_cotizacion_lunas((select id from t where clave='cotizacion'),null,0)$$,
 'el administrador sí puede retirar un descuento');
select is((select v.total from public.cotizaciones_lunas_versiones v join public.cotizaciones_lunas c on c.id=v.cotizacion_id and c.version_actual=v.numero where c.id=(select id from t where clave='cotizacion')),300::numeric,
 'el total vuelve a 300 y las versiones anteriores se conservan');
select * from finish();
rollback;
