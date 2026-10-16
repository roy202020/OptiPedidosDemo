import { Building2, UserCheck, UserX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Confirmacion } from "@/components/formulario";
import { Cargando, Encabezado, EnlaceBoton, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { fecha } from "@/lib/formato";
import { NOMBRE_ROL, tienePermiso, type Rol } from "@/lib/permisos";
import { exigirPermiso, obtenerUsuario } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cambiarMiembro } from "./acciones";
import { FormularioNuevoMiembro, FormularioOptica, SelectorRol } from "./formularios";

export const metadata: Metadata = { title: "Administración" };

export default function PaginaAdministracion() {
  return (
    <>
      <Encabezado titulo="Administración" descripcion="Datos de la óptica, sedes y personas con acceso.">
        <EnlaceBoton href="/panel/administracion/sedes" icono={Building2}>
          Sedes
        </EnlaceBoton>
      </Encabezado>
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido />
      </Suspense>
    </>
  );
}

type Miembro = { usuario_id: string; email: string; rol: Rol; activo: boolean; creado_en: string };

async function Contenido() {
  const [optica, usuario] = await Promise.all([exigirPermiso("administrarOptica"), obtenerUsuario()]);
  const supabase = await crearClienteServidor();
  const [datos, miembros] = await Promise.all([
    supabase.from("opticas").select("nombre, ruc, telefono, direccion").eq("id", optica.id).single(),
    supabase.rpc("miembros_optica", { p_optica: optica.id }),
  ]);
  const error = datos.error ?? miembros.error;
  if (error) throw new Error(`No se pudo leer la administración: ${error.message}`);

  const o = datos.data as { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
  const gestiona = tienePermiso(optica.rol, "gestionarMiembros");
  const lista = miembros.data as Miembro[];

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta titulo="Datos de la óptica" descripcion="Aparecen en las órdenes y comunicaciones." className="max-w-4xl">
        <FormularioOptica
          inicial={{ nombre: o.nombre, ruc: o.ruc ?? "", telefono: o.telefono ?? "", direccion: o.direccion ?? "" }}
        />
      </Tarjeta>

      <Tarjeta
        titulo="Miembros"
        descripcion={
          gestiona
            ? "Propietario: todo, incluidos miembros y sedes. Administrador: operación, ventas, metas y datos de sus sedes. Vendedor: pacientes, recetas, órdenes y laboratorios de sus sedes. Las sedes de cada persona se asignan en Sedes."
            : "Solo el propietario puede agregar miembros o cambiar roles."
        }
        sinRelleno
      >
        <Tabla>
          <thead>
            <tr>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th className="hidden sm:table-cell">Desde</Th>
              <Th>Estado</Th>
              {gestiona && (
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {lista.map((m) => {
              const yo = m.usuario_id === usuario.id;
              return (
                <tr key={m.usuario_id}>
                  <Td className="break-all font-medium text-slate-900">
                    {m.email}
                    {yo && <span className="ml-2 text-xs font-normal text-slate-500">(tú)</span>}
                  </Td>
                  <Td>
                    {gestiona && !yo ? (
                      <SelectorRol accion={cambiarMiembro.bind(null, m.usuario_id, {})} rol={m.rol} etiqueta={`Rol de ${m.email}`} />
                    ) : (
                      NOMBRE_ROL[m.rol]
                    )}
                  </Td>
                  <Td className="hidden tabular-nums sm:table-cell">{fecha(m.creado_en)}</Td>
                  <Td>{m.activo ? <Insignia tono="verde">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</Td>
                  {gestiona && (
                    <Td className="text-right">
                      {!yo && (
                        <Confirmacion
                          accion={cambiarMiembro.bind(null, m.usuario_id, { activo: !m.activo })}
                          titulo={m.activo ? "Quitar acceso" : "Devolver acceso"}
                          descripcion={
                            m.activo
                              ? `${m.email} ya no podrá ingresar a esta óptica. Su historial (órdenes, cambios) se conserva.`
                              : `${m.email} volverá a ingresar con el rol ${NOMBRE_ROL[m.rol]}.`
                          }
                          textoBoton={m.activo ? "Quitar acceso" : "Devolver acceso"}
                          iconoBoton={m.activo ? <UserX /> : <UserCheck />}
                          tamanoBoton="sm"
                          textoConfirmar={m.activo ? "Quitar acceso" : "Devolver acceso"}
                          variante={m.activo ? "peligro" : "primario"}
                        />
                      )}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      </Tarjeta>

      {gestiona && (
        <Tarjeta titulo="Agregar miembro" className="max-w-4xl">
          <FormularioNuevoMiembro />
        </Tarjeta>
      )}
    </div>
  );
}
