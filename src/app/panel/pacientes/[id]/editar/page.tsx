import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { obtenerPaciente } from "@/lib/datos/pacientes";
import { hoyISO } from "@/lib/validacion/comun";
import { actualizarPaciente } from "../../acciones";
import { FormularioPaciente } from "../../formulario-paciente";

export const metadata: Metadata = { title: "Editar paciente" };

export default function PaginaEditarPaciente({ params }: PageProps<"/panel/pacientes/[id]/editar">) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Edicion params={params} />
    </Suspense>
  );
}

async function Edicion({ params }: Pick<PageProps<"/panel/pacientes/[id]/editar">, "params">) {
  const { id } = await params;
  const p = await obtenerPaciente(id);
  const inicial = Object.fromEntries(
    (["nombres", "apellidos", "tipo_documento", "numero_documento", "fecha_nacimiento", "telefono", "email", "notas"] as const).map(
      (k) => [k, p[k] ?? ""],
    ),
  );

  return (
    <>
      <Encabezado
        titulo="Editar paciente"
        volver={{ href: `/panel/pacientes/${id}`, texto: `${p.apellidos}, ${p.nombres}` }}
      />
      <Tarjeta className="max-w-2xl">
        <FormularioPaciente
          accion={actualizarPaciente.bind(null, id)}
          inicial={inicial}
          textoBoton="Guardar cambios"
          hoy={hoyISO()}
        />
      </Tarjeta>
    </>
  );
}
