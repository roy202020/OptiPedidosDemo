import type { Metadata } from "next";
import { Suspense } from "react";
import { MapPin } from "lucide-react";
import { Cargando, Encabezado, EstadoVacio, Tarjeta } from "@/components/ui";
import { existenciasDeProducto, obtenerProducto } from "@/lib/datos/inventario";
import { exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
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
  const [p, destino] = await Promise.all([obtenerProducto(id), sedeParaRegistrar()]);
  const encabezado = (descripcion: string) => (
    <Encabezado titulo={`Inventario físico · ${p.nombre}`} descripcion={descripcion} volver={{ href: `/panel/inventario/productos/${id}`, texto: p.nombre }} />
  );
  if (!destino.sede) {
    return (
      <>
        {encabezado("El inventario físico se hace sede por sede.")}
        <EstadoVacio icono={MapPin} titulo="Elige la sede que vas a contar" descripcion={destino.error} />
      </>
    );
  }
  const existencias = await existenciasDeProducto(id, destino.sede.id);
  return (
    <>
      {encabezado(`Sede ${destino.sede.nombre}: escribe cuántas lunas hay realmente en cada medida revisada. Cada diferencia queda como ajuste con tu usuario.`)}
      <Tarjeta>
        <FormularioConteo
          accion={registrarConteo.bind(null, id, destino.sede.id)}
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
