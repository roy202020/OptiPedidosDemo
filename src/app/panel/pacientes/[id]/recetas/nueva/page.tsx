import type { Metadata } from "next";
import { Suspense } from "react";
import { Cargando, Encabezado, Tarjeta } from "@/components/ui";
import { obtenerPaciente, obtenerReceta, type Receta } from "@/lib/datos/pacientes";
import { fecha, graduacion } from "@/lib/formato";
import { hoyISO } from "@/lib/validacion/comun";
import { OJOS } from "@/lib/validacion/receta";
import { crearReceta } from "../../../acciones";
import { FormularioReceta } from "./formulario-receta";

export const metadata: Metadata = { title: "Nueva receta" };

type Props = PageProps<"/panel/pacientes/[id]/recetas/nueva">;

export default function PaginaNuevaReceta({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Cargando alto="h-96" />}>
      <Contenido params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Valores de una receta como texto, para precargar el formulario al corregirla. */
function aTexto(r: Receta): Record<string, string> {
  const valores: Record<string, string> = { reemplaza_a: r.id, profesional: r.profesional ?? "" };
  for (const o of OJOS) {
    for (const c of ["esfera", "cilindro", "adicion"] as const) {
      const n = r[`${o}_${c}`];
      valores[`${o}_${c}`] = n == null ? "" : graduacion(n);
    }
    for (const c of ["eje", "dnp", "altura", "prisma"] as const) {
      const n = r[`${o}_${c}`];
      valores[`${o}_${c}`] = n == null ? "" : String(n);
    }
    valores[`${o}_base_prisma`] = r[`${o}_base_prisma`] ?? "";
  }
  return valores;
}

async function Contenido({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const paciente = await obtenerPaciente(id);
  const original = typeof sp.reemplaza === "string" ? await obtenerReceta(sp.reemplaza, id) : null;
  const corrige = original && !original.anulada_en ? original : null;

  return (
    <>
      <Encabezado
        titulo={corrige ? "Corregir receta" : "Nueva receta"}
        descripcion={
          corrige
            ? `Se creará una receta nueva que reemplaza a la del ${fecha(corrige.fecha_examen)}. La original queda en el historial.`
            : `${paciente.apellidos}, ${paciente.nombres}`
        }
        volver={{ href: `/panel/pacientes/${id}`, texto: `${paciente.apellidos}, ${paciente.nombres}` }}
      />
      <Tarjeta>
        {paciente.archivado_en ? (
          <p className="text-sm text-slate-600">El paciente está archivado. Restáuralo para registrar recetas.</p>
        ) : (
          <FormularioReceta accion={crearReceta.bind(null, id)} inicial={corrige ? aTexto(corrige) : {}} hoy={hoyISO()} cancelar={`/panel/pacientes/${id}`} />
        )}
      </Tarjeta>
    </>
  );
}
