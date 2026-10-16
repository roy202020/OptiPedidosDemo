import type { Metadata } from "next";
import { Encabezado, Tarjeta } from "@/components/ui";
import { crearProducto } from "../../acciones";
import { FormularioProducto } from "../../formulario-producto";

export const metadata: Metadata = { title: "Nuevo producto" };

export default function PaginaNuevoProducto() {
  return (
    <>
      <Encabezado titulo="Nuevo producto" volver={{ href: "/panel/inventario?vista=productos", texto: "Inventario" }} />
      <Tarjeta className="max-w-4xl">
        <FormularioProducto accion={crearProducto} textoBoton="Crear producto" cancelar="/panel/inventario?vista=productos" />
      </Tarjeta>
    </>
  );
}
