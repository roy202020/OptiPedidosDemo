-- OptiPedidos · Cotizaciones de lunas: modo solo lectura y auditoría (migración 20261102000000)
-- Datos ficticios en una transacción que se revierte al terminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id,email,aud,role) values
 ('f2400000-0000-0000-0000-000000000001','admin@cotizaciones-susp.test','authenticated','authenticated');
insert into public.opticas (id,nombre,plan,max_usuarios,max_sedes) values
 ('f2410000-0000-0000-0000-000000000001','Óptica Cotizaciones Suspensión','profesional',null,null);
insert into public.miembros (optica_id,usuario_id,rol) values
 ('f2410000-0000-0000-0000-000000000001','f2400000-0000-0000-0000-000000000001','propietario');
insert into public.pacientes (id,optica_id,nombres,apellidos,creado_por) values
 ('f2420000-0000-0000-0000-000000000001','f2410000-0000-0000-0000-000000000001','Paciente','Cotiza','f2400000-0000-0000-0000-000000000001');
insert into public.recetas (id,optica_id,paciente_id,od_esfera,od_cilindro,od_eje,oi_esfera,oi_cilindro,oi_eje,creado_por) values
 ('f2430000-0000-0000-0000-000000000001','f2410000-0000-0000-0000-000000000001','f2420000-0000-0000-0000-000000000001',-1,-.5,90,-1,-.5,90,'f2400000-0000-0000-0000-000000000001');
insert into public.lunas_productos (id,optica_id,nombre,tipo,vision) values
 ('f2440000-0000-0000-0000-000000000001','f2410000-0000-0000-0000-000000000001','Lente de prueba','resina','monofocal');
create temp table t (clave text primary key,id uuid) on commit drop;
grant all on t to authenticated;
insert into t select 'sede',id from public.sedes where optica_id='f2410000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims to '{"sub":"f2400000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into t values ('regla',public.crear_regla_cotizacion_lunas(
 p_producto=>'f2440000-0000-0000-0000-000000000001',p_modalidad=>'fabricacion_especial',
 p_esfera_min=>-6,p_esfera_max=>6,p_cilindro_min=>-2,p_cilindro_max=>0,
 p_adicion_min=>null,p_adicion_max=>null,p_unidad_precio=>'por_luna',p_precio_base=>100,p_precio_venta=>150,p_costo=>60));
select lives_ok($$insert into t values ('cotizacion',public.crear_cotizacion_lunas(
 'f2430000-0000-0000-0000-000000000001',(select id from t where clave='sede'),(select id from t where clave='regla'),null))$$,
 'con la suscripción activa se crea una cotización');
select ok((select count(*) > 0 from public.auditoria where tabla='cotizaciones_lunas' and registro_id=(select id::text from t where clave='cotizacion')
           and usuario_id='f2400000-0000-0000-0000-000000000001'), 'la cotización queda en la auditoría con su autor');
select ok((select count(*) > 0 from public.auditoria where tabla='lunas_reglas_cotizacion' and registro_id=(select id::text from t where clave='regla')),
 'la regla del catálogo queda en la auditoría');

-- La suscripción vence hace 10 días: solo lectura.
reset role;
update public.opticas set vence_el=(now() at time zone 'America/Lima')::date - 10 where id='f2410000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to '{"sub":"f2400000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.crear_cotizacion_lunas(
 'f2430000-0000-0000-0000-000000000001',(select id from t where clave='sede'),(select id from t where clave='regla'),null)$$,
 'P0001','Tu suscripción está suspendida: puedes ver y exportar tus datos, pero no registrar cambios. Renueva para continuar.',
 'suspendida no crea cotizaciones');
select isnt_empty($$select * from public.cotizaciones_lunas where id=(select id from t where clave='cotizacion')$$,
 'pero sí lee las que ya tiene');

select * from finish();
rollback;
