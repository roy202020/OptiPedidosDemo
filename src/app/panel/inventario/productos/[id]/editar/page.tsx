import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { existenciasDeProducto, obtenerProducto } from "@/lib/datos/inventario";
import { actualizarProducto } from "../../../acciones";
import { FormularioProducto } from "../../../formulario-producto";

export const metadata: Metadata = { title: "Editar producto" };

type Props = PageProps<"/panel/inventario/productos/[id]/editar">;

export default function PaginaEditarProducto({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Edicion params={params} />
    </Suspense>
  );
}

async function Edicion({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [p, existencias] = await Promise.all([obtenerProducto(id), existenciasDeProducto(id)]);
  const texto = (v: unknown) => (v == null ? "" : String(v));
  return (
    <>
      <Encabezado titulo="Editar producto" volver={{ href: `/panel/inventario/productos/${id}`, texto: p.nombre }} />
      <Tarjeta className="max-w-4xl">
        <FormularioProducto
          accion={actualizarProducto.bind(null, id)}
          inicial={{
            nombre: p.nombre,
            tipo: p.tipo,
            material: texto(p.material),
            indice: p.indice != null ? p.indice.toFixed(2) : "",
            tratamiento: texto(p.tratamiento),
            color_tratamiento: texto(p.color_tratamiento),
            vision: p.vision,
            superficie: texto(p.superficie),
            por_lado: p.por_lado ? "on" : "",
            proveedor: texto(p.proveedor),
            costo_referencial: p.costo_referencial != null ? Number(p.costo_referencial).toFixed(2) : "",
            stock_minimo_defecto: String(p.stock_minimo_defecto),
          }}
          textoBoton="Guardar cambios"
          cancelar={`/panel/inventario/productos/${id}`}
          bloquearEstructura={existencias.length > 0}
        />
      </Tarjeta>
    </>
  );
}
