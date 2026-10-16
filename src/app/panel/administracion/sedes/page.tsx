import { Building2, Power, PowerOff } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Confirmacion } from "@/components/formulario";
import { Cargando, Encabezado, Insignia, Tarjeta } from "@/components/ui";
import { NOMBRE_ROL, tienePermiso, type Rol } from "@/lib/permisos";
import { exigirPermiso, obtenerSedes } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { actualizarSede, asignarSedes, cambiarEstadoSede, crearSede } from "./acciones";
import { AsignacionSedes, FormularioSede } from "./formularios";

export const metadata: Metadata = { title: "Sedes" };

export default function PaginaSedes() {
  return (
    <>
      <Encabezado
        titulo="Sedes"
        descripcion="Locales de la óptica. Pedidos, inventario, caja y metas son de cada sede; pacientes y recetas, de toda la óptica."
        volver={{ href: "/panel/administracion", texto: "Administración" }}
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido />
      </Suspense>
    </>
  );
}

type Miembro = { usuario_id: string; email: string; rol: Rol; activo: boolean };

async function Contenido() {
  const optica = await exigirPermiso("administrarOptica");
  const gestiona = tienePermiso(optica.rol, "gestionarSedes");
  const sedes = await obtenerSedes();

  return (
    <div className="flex flex-col gap-6">
      {!gestiona && (
        <p className="text-sm text-slate-600">
          Ves y editas las sedes que tienes asignadas. Solo el propietario crea o desactiva sedes y asigna usuarios.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {sedes.map((s) => (
          <Tarjeta
            key={s.id}
            titulo={s.nombre}
            acciones={s.activa ? <Insignia tono="verde">Activa</Insignia> : <Insignia>Desactivada</Insignia>}
          >
            <FormularioSede
              accion={actualizarSede.bind(null, s.id)}
              inicial={{
                id: s.id,
                nombre: s.nombre,
                direccion: s.direccion ?? "",
                telefono: s.telefono ?? "",
                whatsapp_phone_number_id: s.whatsapp_phone_number_id ?? "",
              }}
            />
            {gestiona && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <Confirmacion
                  accion={cambiarEstadoSede.bind(null, s.id, !s.activa)}
                  titulo={s.activa ? `Desactivar sede ${s.nombre}` : `Reactivar sede ${s.nombre}`}
                  descripcion={
                    s.activa
                      ? "No se podrán registrar pedidos, compras ni metas nuevas en esta sede. Su historial se conserva y sigue visible."
                      : "La sede volverá a recibir pedidos, compras y metas."
                  }
                  textoBoton={s.activa ? "Desactivar" : "Reactivar"}
                  iconoBoton={s.activa ? <PowerOff /> : <Power />}
                  tamanoBoton="sm"
                  textoConfirmar={s.activa ? "Desactivar sede" : "Reactivar sede"}
                  variante={s.activa ? "peligro" : "primario"}
                />
              </div>
            )}
          </Tarjeta>
        ))}
      </div>

      {gestiona && (
        <>
          <Tarjeta titulo="Nueva sede" className="max-w-4xl">
            <FormularioSede accion={crearSede} nueva />
          </Tarjeta>
          <Suspense fallback={<Cargando alto="h-48" />}>
            <Asignaciones opticaId={optica.id} sedes={sedes} />
          </Suspense>
        </>
      )}
    </div>
  );
}

/** Qué sedes ve cada usuario (solo propietario). */
async function Asignaciones({ opticaId, sedes }: { opticaId: string; sedes: Awaited<ReturnType<typeof obtenerSedes>> }) {
  const supabase = await crearClienteServidor();
  const [miembros, asignaciones] = await Promise.all([
    supabase.rpc("miembros_optica", { p_optica: opticaId }),
    supabase.from("miembro_sedes").select("usuario_id, sede_id").eq("optica_id", opticaId),
  ]);
  const error = miembros.error ?? asignaciones.error;
  if (error) throw new Error(`No se pudieron leer las asignaciones: ${error.message}`);

  const lista = (miembros.data as Miembro[]).filter((m) => m.activo);
  const de = (uid: string) => (asignaciones.data as { usuario_id: string; sede_id: string }[]).filter((a) => a.usuario_id === uid).map((a) => a.sede_id);
  const opciones = sedes.map(({ id, nombre, activa }) => ({ id, nombre, activa }));

  return (
    <Tarjeta
      titulo="Usuarios por sede"
      descripcion="Administradores y vendedores solo ven y registran datos de las sedes marcadas. El propietario ve todas."
      acciones={<Building2 aria-hidden className="size-5 text-marca-600" />}
    >
      <ul className="divide-y divide-slate-100">
        {lista.map((m) => (
          <li key={m.usuario_id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-all font-medium text-slate-900">{m.email}</span>
              <Insignia>{NOMBRE_ROL[m.rol]}</Insignia>
            </div>
            {m.rol === "propietario" ? (
              <p className="text-sm text-slate-500">Ve todas las sedes y el consolidado.</p>
            ) : (
              <AsignacionSedes accion={asignarSedes.bind(null, m.usuario_id)} sedes={opciones} asignadas={de(m.usuario_id)} usuario={m.email} />
            )}
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}
