import type { Metadata } from "next";
import { Encabezado, Tarjeta } from "@/components/ui";
import { crearLaboratorio } from "../acciones";
import { FormularioLaboratorio } from "../formulario-laboratorio";

export const metadata: Metadata = { title: "Nuevo laboratorio" };

export default function PaginaNuevoLaboratorio() {
  return (
    <>
      <Encabezado titulo="Nuevo laboratorio" volver={{ href: "/panel/laboratorios", texto: "Laboratorios" }} />
      <Tarjeta className="max-w-4xl">
        <FormularioLaboratorio accion={crearLaboratorio} textoBoton="Registrar laboratorio" cancelar="/panel/laboratorios" />
      </Tarjeta>
    </>
  );
}
