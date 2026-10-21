import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { tienePermiso } from "@/lib/permisos";
import { exigirOptica } from "@/lib/sesion";
import { crearLaboratorio } from "../acciones";
import { FormularioLaboratorio } from "../formulario-laboratorio";

export const metadata: Metadata = { title: "Nuevo laboratorio" };

export default function PaginaNuevoLaboratorio() {
  return (
    <>
      <Encabezado titulo="Nuevo laboratorio" volver={{ href: "/panel/laboratorios", texto: "Laboratorios" }} />
      <Tarjeta className="max-w-4xl">
        <Suspense fallback={<Cargando alto="h-64" />}>
          <Formulario />
        </Suspense>
      </Tarjeta>
    </>
  );
}

async function Formulario() {
  const optica = await exigirOptica();
  return (
    <FormularioLaboratorio
      accion={crearLaboratorio}
      textoBoton="Registrar laboratorio"
      cancelar="/panel/laboratorios"
      editaCredito={tienePermiso(optica.rol, "gestionarCuentasLaboratorio")}
    />
  );
}
