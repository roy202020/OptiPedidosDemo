import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { exigirOptica } from "@/lib/sesion";
import { hoyISO } from "@/lib/validacion/comun";
import { crearPaciente } from "../acciones";
import { FormularioPaciente } from "../formulario-paciente";

export const metadata: Metadata = { title: "Nuevo paciente" };

export default function PaginaNuevoPaciente() {
  return (
    <>
      <Encabezado titulo="Nuevo paciente" descripcion="Los campos con * son obligatorios." volver={{ href: "/panel/pacientes", texto: "Pacientes" }} />
      <Tarjeta className="max-w-4xl">
        <Suspense fallback={<Cargando />}>
          <Formulario />
        </Suspense>
      </Tarjeta>
    </>
  );
}

async function Formulario() {
  await exigirOptica();
  return <FormularioPaciente accion={crearPaciente} textoBoton="Registrar paciente" cancelar="/panel/pacientes" hoy={hoyISO()} />;
}
