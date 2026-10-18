import { Building2, UserCheck, UserX } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Confirmacion } from "@/components/formulario";
import { Alerta } from "@/components/formulario";
import { Cargando, Datos, Encabezado, EnlaceBoton, Insignia, SoloProfesional, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { listarPagosSuscripcion, obtenerSuscripcion, type Suscripcion } from "@/lib/datos/suscripcion";
import { fecha, soles } from "@/lib/formato";
import { NOMBRE_ROL, tienePermiso, type Rol } from "@/lib/permisos";
import { exigirPermiso, obtenerUsuario } from "@/lib/sesion";
import { DIAS_GRACIA, NOMBRE_ESTADO, NOMBRE_MEDIO, sumarDias, TONO_ESTADO } from "@/lib/suscripcion";
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
  const [datos, miembros, suscripcion] = await Promise.all([
    supabase.from("opticas").select("nombre, ruc, telefono, direccion").eq("id", optica.id).single(),
    supabase.rpc("miembros_optica", { p_optica: optica.id }),
    obtenerSuscripcion(),
  ]);
  const error = datos.error ?? miembros.error;
  if (error) throw new Error(`No se pudo leer la administración: ${error.message}`);

  const o = datos.data as { nombre: string; ruc: string | null; telefono: string | null; direccion: string | null };
  const gestiona = tienePermiso(optica.rol, "gestionarMiembros");
  const lista = miembros.data as Miembro[];
  const activos = lista.filter((m) => m.activo).length;
  const alLimite = suscripcion.max_usuarios != null && activos >= suscripcion.max_usuarios;

  return (
    <div className="flex flex-col gap-6">
      <TarjetaSuscripcion suscripcion={suscripcion} activos={activos} propietario={optica.rol === "propietario"} opticaId={optica.id} />

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
        <Tarjeta
          titulo="Agregar miembro"
          descripcion={suscripcion.max_usuarios != null ? `${activos} de ${suscripcion.max_usuarios} usuarios activos en tu plan.` : undefined}
          className="max-w-4xl"
        >
          {!alLimite ? (
            <FormularioNuevoMiembro />
          ) : suscripcion.plan === "basico" ? (
            <SoloProfesional>
              El plan Básico incluye hasta {suscripcion.max_usuarios} usuarios activos; Profesional no tiene límite. También puedes quitar el
              acceso a alguien que ya no trabaja en la óptica.
            </SoloProfesional>
          ) : (
            <Alerta tipo="info">Llegaste a los {suscripcion.max_usuarios} usuarios de tu contrato. Escríbenos para ampliarlo.</Alerta>
          )}
        </Tarjeta>
      )}
    </div>
  );
}

/** Plan, vencimiento, límites y pagos de la óptica (los pagos solo los ve el propietario: RLS). */
async function TarjetaSuscripcion({
  suscripcion: s,
  activos,
  propietario,
  opticaId,
}: {
  suscripcion: Suscripcion;
  activos: number;
  propietario: boolean;
  opticaId: string;
}) {
  const pagos = propietario ? await listarPagosSuscripcion(opticaId) : [];
  const incluidas = [
    s.incluye.metas && "metas de ventas",
    s.incluye.whatsapp_api && `WhatsApp automáticos (${s.whatsapp_mensual} por sede al mes)`,
    s.incluye.recordatorios && "recordatorios automáticos",
  ].filter(Boolean);
  return (
    <section id="suscripcion" className="max-w-4xl scroll-mt-6">
      <Tarjeta
        titulo={`Plan ${s.nombrePlan}`}
        descripcion="Para cambiar de plan o renovar, escríbenos: registramos tu pago (Yape o transferencia) y extendemos el vencimiento."
        acciones={<Insignia tono={TONO_ESTADO[s.estado]}>{NOMBRE_ESTADO[s.estado]}</Insignia>}
      >
        <div className="flex flex-col gap-4">
          <Datos
            columnas={4}
            items={[
              { titulo: "Vence", valor: fecha(s.vence_el) },
              {
                titulo: s.estado === "gracia" ? "Solo lectura desde" : "Gracia hasta",
                valor: s.vence_el ? fecha(sumarDias(s.vence_el, DIAS_GRACIA + (s.estado === "gracia" ? 1 : 0))) : "—",
              },
              { titulo: "Usuarios activos", valor: s.max_usuarios == null ? `${activos} (sin límite)` : `${activos} de ${s.max_usuarios}` },
              { titulo: "Sedes", valor: s.max_sedes == null ? "Según contrato" : `Hasta ${s.max_sedes}` },
            ]}
          />
          {incluidas.length > 0 ? (
            <p className="text-sm text-slate-600">Incluye: {incluidas.join(", ")}.</p>
          ) : (
            <SoloProfesional>Metas de ventas, WhatsApp automáticos (300 por sede al mes), recordatorios automáticos, usuarios ilimitados y más sedes.</SoloProfesional>
          )}
          {propietario && pagos.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Pagos registrados</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {pagos.slice(0, 12).map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="tabular-nums">
                      {fecha(p.fecha)} · {soles(p.monto)} · {NOMBRE_MEDIO[p.medio]}
                    </span>
                    <span className="text-slate-500 tabular-nums">
                      {fecha(p.periodo_desde)} – {fecha(p.periodo_hasta)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Tarjeta>
    </section>
  );
}
