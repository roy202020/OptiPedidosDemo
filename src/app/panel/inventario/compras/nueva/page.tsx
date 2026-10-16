import { Boxes, Plus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, EstadoVacio, Tarjeta } from "@/components/ui";
import { listarProductos } from "@/lib/datos/inventario";
import { hoyISO } from "@/lib/validacion/comun";
import { FormularioCompra } from "./formulario-compra";

export const metadata: Metadata = { title: "Registrar compra" };

type Props = PageProps<"/panel/inventario/compras/nueva">;

export default function PaginaNuevaCompra({ searchParams }: Props) {
  return (
    <>
      <Encabezado
        titulo="Registrar compra de lunas"
        descripcion="Escribe las cantidades en la matriz. Las medidas que no existan se crean solas; todo se registra en una sola operación."
        volver={{ href: "/panel/inventario", texto: "Inventario" }}
      />
      <Suspense fallback={<Cargando alto="h-96" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<Props, "searchParams">) {
  const sp = await searchParams;
  const productos = await listarProductos({ incluirInactivos: false });
  if (productos.length === 0) {
    return (
      <EstadoVacio icono={Boxes} titulo="Primero crea un producto" descripcion="Por ejemplo «Resina blanca» o «Fotoblue AR azul».">
        <EnlaceBoton href="/panel/inventario/productos/nuevo" variante="primario" icono={Plus}>
          Nuevo producto
        </EnlaceBoton>
      </EstadoVacio>
    );
  }
  return (
    <Tarjeta>
      <FormularioCompra
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          vision: p.vision,
          por_lado: p.por_lado,
          proveedor: p.proveedor,
          costo_referencial: p.costo_referencial == null ? null : Number(p.costo_referencial),
        }))}
        hoy={hoyISO()}
        inicial={typeof sp.producto === "string" && productos.some((p) => p.id === sp.producto) ? sp.producto : undefined}
      />
    </Tarjeta>
  );
}
