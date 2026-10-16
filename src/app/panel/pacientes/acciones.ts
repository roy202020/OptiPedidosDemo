"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaPaciente } from "@/lib/validacion/paciente";
import { esquemaAnulacion, esquemaReceta } from "@/lib/validacion/receta";

const UNICOS_PACIENTE = {
  pacientes_optica_id_tipo_documento_numero_documento_key: "Ya hay un paciente con ese documento en tu óptica.",
};

const idValido = (id: string) => z.uuid().safeParse(id).success;

// ---------------------------------------------------------------- pacientes

export async function crearPaciente(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  const valores = valoresDe(datos);
  const r = esquemaPaciente.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("pacientes")
    .insert({ ...r.data, optica_id: optica.id })
    .select("id")
    .single();
  if (error) return { error: mensajeDb(error, UNICOS_PACIENTE), valores };

  redirect(`/panel/pacientes/${data.id}`);
}

export async function actualizarPaciente(
  id: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(id)) return { error: "Paciente inválido." };
  const valores = valoresDe(datos);
  const r = esquemaPaciente.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("pacientes").update(r.data).eq("id", id).eq("optica_id", optica.id);
  if (error) return { error: mensajeDb(error, UNICOS_PACIENTE), valores };

  revalidatePath("/panel/pacientes", "layout");
  redirect(`/panel/pacientes/${id}`);
}

/** Archiva o restaura. No se borran pacientes: su historial clínico se conserva. */
export async function cambiarArchivo(id: string, archivar: boolean) {
  const optica = await exigirOptica();
  if (!idValido(id)) return;
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("pacientes")
    .update({ archivado_en: archivar ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("optica_id", optica.id);
  if (error) throw new Error(mensajeDb(error));
  revalidatePath("/panel/pacientes", "layout");
}

// ---------------------------------------------------------------- recetas

export async function crearReceta(
  pacienteId: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(pacienteId)) return { error: "Paciente inválido." };
  const valores = valoresDe(datos);
  const r = esquemaReceta.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { data: paciente } = await supabase
    .from("pacientes")
    .select("archivado_en")
    .eq("id", pacienteId)
    .eq("optica_id", optica.id)
    .maybeSingle();
  if (!paciente) return { error: "Paciente no encontrado.", valores };
  if (paciente.archivado_en) return { error: "El paciente está archivado. Restáuralo para registrar recetas.", valores };

  // La receta corregida debe ser de este mismo paciente y seguir válida.
  if (r.data.reemplaza_a) {
    const { data: original } = await supabase
      .from("recetas")
      .select("id")
      .eq("id", r.data.reemplaza_a)
      .eq("paciente_id", pacienteId)
      .is("anulada_en", null)
      .maybeSingle();
    if (!original) return { error: "La receta que intentas corregir no es válida.", valores };
  }

  const { error } = await supabase
    .from("recetas")
    .insert({ ...r.data, optica_id: optica.id, paciente_id: pacienteId });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/pacientes", "layout");
  redirect(`/panel/pacientes/${pacienteId}`);
}

export async function anularReceta(
  recetaId: string,
  pacienteId: string,
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const optica = await exigirOptica();
  if (!idValido(recetaId)) return { error: "Receta inválida." };
  const valores = valoresDe(datos);
  const r = esquemaAnulacion.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("recetas")
    .update({ anulada_en: new Date().toISOString(), motivo_anulacion: r.data.motivo })
    .eq("id", recetaId)
    .eq("optica_id", optica.id)
    .is("anulada_en", null);
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath(`/panel/pacientes/${pacienteId}`);
  return { aviso: "Receta anulada." };
}
