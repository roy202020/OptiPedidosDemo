import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { obtenerLaboratorio } from "@/lib/datos/laboratorios";
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
  const l = await obtenerLaboratorio(id);
  return (
    <>
      <Encabezado titulo="Editar laboratorio" volver={{ href: `/panel/laboratorios/${id}`, texto: l.nombre }} />
      <Tarjeta className="max-w-4xl">
        <FormularioLaboratorio
          accion={actualizarLaboratorio.bind(null, id)}
          inicial={{ nombre: l.nombre, contacto: l.contacto ?? "", telefono: l.telefono ?? "", email: l.email ?? "" }}
          textoBoton="Guardar cambios"
          cancelar={`/panel/laboratorios/${id}`}
        />
      </Tarjeta>
    </>
  );
}
