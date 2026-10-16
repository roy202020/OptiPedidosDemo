"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaAsignacion, esquemaSede } from "@/lib/validacion/administracion";
import { valoresDe } from "@/lib/validacion/comun";

const idValido = (id: string) => z.uuid().safeParse(id).success;
const UNICO_SEDE = { sedes_nombre_unico: "Ya hay una sede con ese nombre." };

/** Nueva sede: solo el propietario (RLS sedes_insert). */
export async function crearSede(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarSedes");
  const valores = valoresDe(datos);
  const r = esquemaSede.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("sedes").insert({ ...r.data, optica_id: optica.id });
  if (error) return { error: mensajeDb(error, UNICO_SEDE), valores };

  revalidatePath("/panel", "layout");
  return { listo: true, aviso: `Sede ${r.data.nombre} creada. Asígnale usuarios abajo.` };
}

/** Datos de contacto y WhatsApp: propietario, o administrador de esa sede (RLS sedes_update). */
export async function actualizarSede(id: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("administrarOptica");
  if (!idValido(id)) return { error: "Sede inválida." };
  const valores = valoresDe(datos);
  const r = esquemaSede.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("sedes").update(r.data).eq("id", id).eq("optica_id", optica.id).select("id");
  if (error) return { error: mensajeDb(error, UNICO_SEDE), valores };
  if (!data.length) return { error: "No puedes editar esa sede.", valores };

  revalidatePath("/panel", "layout");
  return { listo: true, aviso: "Datos de la sede guardados.", valores };
}

/** Activa o desactiva una sede (no se borran). Solo el propietario; la base conserva una activa. */
export async function cambiarEstadoSede(id: string, activa: boolean, _previo: EstadoFormulario, _datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarSedes");
  if (!idValido(id)) return { error: "Sede inválida." };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("sedes").update({ activa }).eq("id", id).eq("optica_id", optica.id).select("id");
  if (error) return { error: mensajeDb(error) };
  if (!data.length) return { error: "No se encontró la sede." };
  revalidatePath("/panel", "layout");
  return { listo: true };
}

/**
 * Sedes de un usuario: deja asignadas exactamente las casillas marcadas. Solo el propietario
 * (RLS miembro_sedes_insert/delete); la base impide asignar sedes de otra óptica.
 */
export async function asignarSedes(usuarioId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarSedes");
  if (!idValido(usuarioId)) return { error: "Miembro inválido." };
  const r = esquemaAsignacion.safeParse(datos.getAll("sede"));
  if (!r.success) return { error: "Alguna sede marcada no es válida." };
  const marcadas = new Set(r.data);

  const supabase = await crearClienteServidor();
  const { data: actuales, error: errorLectura } = await supabase
    .from("miembro_sedes")
    .select("sede_id")
    .eq("optica_id", optica.id)
    .eq("usuario_id", usuarioId);
  if (errorLectura) return { error: mensajeDb(errorLectura) };

  const tenia = new Set(actuales.map((a) => a.sede_id as string));
  const agregar = [...marcadas].filter((s) => !tenia.has(s));
  const quitar = [...tenia].filter((s) => !marcadas.has(s));

  if (agregar.length) {
    const { error } = await supabase
      .from("miembro_sedes")
      .insert(agregar.map((sede_id) => ({ optica_id: optica.id, usuario_id: usuarioId, sede_id })));
    if (error) return { error: mensajeDb(error) };
  }
  if (quitar.length) {
    const { error } = await supabase.from("miembro_sedes").delete().eq("usuario_id", usuarioId).in("sede_id", quitar);
    if (error) return { error: mensajeDb(error) };
  }

  revalidatePath("/panel/administracion/sedes");
  return { listo: true, aviso: marcadas.size ? "Sedes guardadas." : "Sin sedes: esta persona no verá pedidos, caja ni inventario." };
}
