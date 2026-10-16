import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { existenciasDeProducto, obtenerProducto } from "@/lib/datos/inventario";
import { exigirPermiso } from "@/lib/sesion";
import { registrarConteo } from "../../../acciones";
import { FormularioConteo } from "./formulario-conteo";

export const metadata: Metadata = { title: "Inventario físico" };

type Props = PageProps<"/panel/inventario/productos/[id]/conteo">;

export default function PaginaConteo({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Conteo params={params} />
    </Suspense>
  );
}

async function Conteo({ params }: Pick<Props, "params">) {
  await exigirPermiso("administrarOptica");
  const { id } = await params;
  const [p, existencias] = await Promise.all([obtenerProducto(id), existenciasDeProducto(id)]);
  return (
    <>
      <Encabezado
        titulo={`Inventario físico · ${p.nombre}`}
        descripcion="Escribe cuántas lunas hay realmente en cada medida revisada. Cada diferencia queda como ajuste con tu usuario."
        volver={{ href: `/panel/inventario/productos/${id}`, texto: p.nombre }}
      />
      <Tarjeta>
        <FormularioConteo
          accion={registrarConteo.bind(null, id)}
          filas={existencias.map((e) => ({
            id: e.id,
            esfera: e.esfera,
            cilindro: e.cilindro,
            adicion: e.adicion,
            lado: e.lado,
            stock: e.stock,
            ubicacion: e.ubicacion,
          }))}
        />
      </Tarjeta>
    </>
  );
}
