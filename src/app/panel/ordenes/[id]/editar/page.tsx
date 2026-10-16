import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, EnlaceBoton, EstadoVacio, Tarjeta } from "@/components/ui";
import { listarLaboratorios } from "@/lib/datos/laboratorios";
import { obtenerOrden } from "@/lib/datos/ordenes";
import { fecha } from "@/lib/formato";
import { numeroOrden } from "@/lib/ordenes/estados";
import { hoyISO } from "@/lib/validacion/comun";
import { actualizarOrden } from "../../acciones";
import { FormularioOrden } from "../../formulario-orden";

export const metadata: Metadata = { title: "Editar orden" };

type Props = PageProps<"/panel/ordenes/[id]/editar">;

export default function PaginaEditarOrden({ params }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Edicion params={params} />
    </Suspense>
  );
}

async function Edicion({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const [{ orden: o }, labs] = await Promise.all([obtenerOrden(id), listarLaboratorios({ soloActivos: true })]);
  const volver = { href: `/panel/ordenes/${id}`, texto: `Orden ${numeroOrden(o.numero)}` };

  if (o.estado !== "borrador") {
    return (
      <>
        <Encabezado titulo={`Editar orden ${numeroOrden(o.numero)}`} volver={volver} />
        <EstadoVacio
          icono={ClipboardList}
          titulo="Esta orden ya no se puede editar"
          descripcion="Solo se editan las órdenes en venta iniciada. Si hay un error, anula la orden y crea una nueva."
        >
          <EnlaceBoton href={volver.href}>Volver a la orden</EnlaceBoton>
        </EstadoVacio>
      </>
    );
  }

  const inicial: Record<string, string> = {
    receta_id: o.receta_id,
    laboratorio_id: o.laboratorio_id,
    tipo_trabajo: o.tipo_trabajo,
    prioridad: o.prioridad,
    fecha_entrega_prometida: o.fecha_entrega_prometida ?? "",
    montura_origen: o.montura_origen ?? "",
    montura_descripcion: o.montura_descripcion ?? "",
    precio: Number(o.precio).toFixed(2),
    descuento: Number(o.descuento).toFixed(2),
  };
  for (const j of o.ojos) {
    const p = j.ojo.toLowerCase();
    inicial[`${p}_material`] = j.material ?? "";
    inicial[`${p}_indice`] = j.indice == null ? "" : String(j.indice);
    inicial[`${p}_diseno`] = j.diseno ?? "";
    inicial[`${p}_diametro_mm`] = j.diametro_mm == null ? "" : String(j.diametro_mm);
    inicial[`${p}_tinte`] = j.tinte ?? "";
    inicial[`${p}_tratamientos`] = j.tratamientos.join(",");
  }

  // El laboratorio actual se ofrece aunque se haya desactivado (la base exige uno activo al guardar).
  const opcionesLab = labs.map((l) => ({ valor: l.id, texto: l.nombre }));
  if (!labs.some((l) => l.id === o.laboratorio_id)) {
    opcionesLab.unshift({ valor: o.laboratorio_id, texto: `${o.laboratorio.nombre} (inactivo)` });
  }

  return (
    <>
      <Encabezado
        titulo={`Editar orden ${numeroOrden(o.numero)}`}
        descripcion={`${o.paciente.apellidos}, ${o.paciente.nombres}`}
        volver={volver}
      />
      <Tarjeta>
        <FormularioOrden
          accion={actualizarOrden.bind(null, id)}
          recetas={[{ valor: o.receta_id, texto: `Examen del ${fecha(o.receta.fecha_examen)}` }]}
          laboratorios={opcionesLab}
          ojos={o.ojos.map((j) => j.ojo.toLowerCase() as "od" | "oi")}
          inicial={inicial}
          hoy={hoyISO()}
          cancelar={volver.href}
          edicion
        />
      </Tarjeta>
    </>
  );
}
