-- OptiPedidos · Pruebas de administración de miembros (migración 0006)
-- Ejecutar con:  npx supabase test db
-- Datos ficticios; todo se revierte al final.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'propietaria@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'admin@prueba.test', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Nueva.Persona@Prueba.test', 'authenticated', 'authenticated');
insert into opticas (id, nombre) values ('a0000000-0000-0000-0000-00000000000a', 'Óptica Ficticia A');
insert into miembros (optica_id, usuario_id, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'propietario'),
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000002', 'administrador');

set local role authenticated;

-- Administrador
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.agregar_miembro('a0000000-0000-0000-0000-00000000000a', 'nueva.persona@prueba.test') $$,
  '42501', null, 'el administrador no agrega miembros');
select lives_ok($$ update opticas set ruc = '20123456789' where id = 'a0000000-0000-0000-0000-00000000000a' $$,
  'el administrador edita los datos de la óptica');
select is((select ruc from opticas), '20123456789', 'el RUC quedó guardado');
update miembros set rol = 'propietario' where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select rol::text from miembros where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000002'), 'administrador',
  'el administrador no se asciende a propietario');

-- Propietaria
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select public.agregar_miembro('a0000000-0000-0000-0000-00000000000a', 'no-existe@prueba.test') $$,
  'P0001', 'No hay ninguna cuenta con ese correo. La persona debe crear su cuenta primero.', 'avisa si el correo no tiene cuenta');
select is(public.agregar_miembro('a0000000-0000-0000-0000-00000000000a', '  nueva.persona@prueba.test '), 'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  'agrega por correo sin distinguir mayúsculas ni espacios');
select is((select rol::text from miembros where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000003'), 'operador', 'el rol por defecto es operador');
update miembros set activo = false where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000003';
select lives_ok($$ select public.agregar_miembro('a0000000-0000-0000-0000-00000000000a', 'nueva.persona@prueba.test', 'administrador') $$,
  'volver a agregar reactiva y actualiza el rol');
select results_eq($$ select rol::text, activo from miembros where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000003' $$,
  $$ values ('administrador', true) $$, 'la membresía quedó activa con el nuevo rol');
select throws_ok($$ update miembros set rol = 'operador' where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'La óptica debe conservar al menos un propietario activo', 'la única propietaria no puede quitarse el rol');
select throws_ok($$ update miembros set activo = false where usuario_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'P0001', 'La óptica debe conservar al menos un propietario activo', 'ni desactivarse');

select * from finish();
rollback;
