import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { obtenerLaboratorio } from "@/lib/datos/laboratorios";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica } from "@/lib/sesion";
import { actualizarLaboratorio } from "../../acciones";
import { FormularioLaboratorio } from "../../formulario-laboratorio";

export const metadata: Metadata = { title: "Editar laboratorio" };

type Props = PageProps<"/panel/laboratorios/[id]/editar">;

export default function PaginaEditarLaboratorio({ params }: Props) {
  return (
    <Suspense fallback={<Cargando />}>
      <Edicion params={params} />
    </Suspense>
  );
}

async function Edicion({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [l, optica] = await Promise.all([obtenerLaboratorio(id), exigirOptica()]);
  return (
    <>
      <Encabezado titulo="Editar laboratorio" volver={{ href: `/panel/laboratorios/${id}`, texto: l.nombre }} />
      <Tarjeta className="max-w-4xl">
        <FormularioLaboratorio
          accion={actualizarLaboratorio.bind(null, id)}
          inicial={{ nombre: l.nombre, contacto: l.contacto ?? "", telefono: l.telefono ?? "", email: l.email ?? "", dias_credito: String(l.dias_credito) }}
          editaCredito={tienePermiso(optica.rol, "gestionarCuentasLaboratorio")}
          textoBoton="Guardar cambios"
          cancelar={`/panel/laboratorios/${id}`}
        />
      </Tarjeta>
    </>
  );
}
