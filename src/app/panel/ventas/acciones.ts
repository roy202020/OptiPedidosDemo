"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaMeta } from "@/lib/validacion/orden";

/** Mes actual en hora de Lima (AAAA-MM). */
const mesActual = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date());

/**
 * Crea o actualiza la meta de un mes de una sede. Solo meses actuales o futuros: las metas de
 * meses cerrados se conservan como historial.
 */
export async function guardarMeta(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("configurarMetas");
  // La base también lo rechaza (trigger t_01_plan); aquí se avisa antes.
  if (!(await obtenerSuscripcion()).incluye.metas) return { error: "Disponible en plan Profesional: metas de ventas." };
  const valores = valoresDe(datos);
  const sedeId = String(datos.get("sede_id") ?? "");
  if (!z.uuid().safeParse(sedeId).success) return { error: "Elige en el selector de arriba la sede de la meta.", valores };
  const r = esquemaMeta.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };
  if (r.data.periodo < mesActual()) {
    return { campos: { periodo: ["Las metas de meses cerrados no se modifican"] }, valores };
  }

  const periodo = `${r.data.periodo}-01`;
  const supabase = await crearClienteServidor();
  const { data: existente, error: errorLectura } = await supabase
    .from("metas_ventas")
    .select("id")
    .eq("optica_id", optica.id)
    .eq("sede_id", sedeId)
    .eq("periodo", periodo)
    .maybeSingle();
  if (errorLectura) return { error: mensajeDb(errorLectura), valores };

  const { error } = existente
    ? await supabase.from("metas_ventas").update({ importe_objetivo: r.data.importe_objetivo }).eq("id", existente.id)
    : await supabase.from("metas_ventas").insert({ optica_id: optica.id, sede_id: sedeId, periodo, importe_objetivo: r.data.importe_objetivo });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel", "layout");
  return { listo: true, aviso: existente ? "Meta actualizada." : "Meta registrada." };
}
