"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaLaboratorio } from "@/lib/validacion/orden";

const idValido = (id: string) => z.uuid().safeParse(id).success;

export async function crearLaboratorio(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  const r = esquemaLaboratorio.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("laboratorios")
    .insert({ ...r.data, optica_id: optica.id })
    .select("id")
    .single();
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/laboratorios");
  redirect(`/panel/laboratorios/${data.id}`);
}

export async function actualizarLaboratorio(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Laboratorio inválido." };
  const valores = valoresDe(datos);
  const r = esquemaLaboratorio.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("laboratorios").update(r.data).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/laboratorios", "layout");
  redirect(`/panel/laboratorios/${id}`);
}

/** Activa o desactiva. Un laboratorio inactivo no se ofrece en órdenes nuevas; sus órdenes se conservan. */
export async function cambiarActivo(id: string, activo: boolean, _previo: EstadoFormulario, _datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Laboratorio inválido." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("laboratorios").update({ activo }).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel/laboratorios", "layout");
  return { listo: true };
}
