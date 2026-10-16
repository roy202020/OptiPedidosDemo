"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaNuevoMiembro, esquemaOptica, esquemaRol } from "@/lib/validacion/administracion";
import { valoresDe } from "@/lib/validacion/comun";

/** Datos de la óptica: propietario y administrador (RLS opticas_update). */
export async function actualizarOptica(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("administrarOptica");
  const valores = valoresDe(datos);
  const r = esquemaOptica.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("opticas").update(r.data).eq("id", optica.id);
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel", "layout");
  return { listo: true, aviso: "Datos de la óptica guardados.", valores };
}

/** Agrega por correo a alguien que ya tiene cuenta. Solo el propietario. */
export async function agregarMiembro(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarMiembros");
  const valores = valoresDe(datos);
  const r = esquemaNuevoMiembro.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("agregar_miembro", { p_optica: optica.id, p_email: r.data.email, p_rol: r.data.rol });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel/administracion");
  return { listo: true, aviso: `${r.data.email} ya puede ingresar a la óptica.` };
}

/** Cambia el rol o activa/desactiva un miembro. Solo el propietario (RLS miembros_update). */
export async function cambiarMiembro(
  usuarioId: string,
  cambio: { rol?: string; activo?: boolean },
  _previo: EstadoFormulario,
  datos: FormData,
): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarMiembros");
  if (!z.uuid().safeParse(usuarioId).success) return { error: "Miembro inválido." };

  const actualizacion: { rol?: string; activo?: boolean } = {};
  const rol = cambio.rol ?? datos.get("rol");
  if (rol != null) {
    const r = esquemaRol.safeParse(rol);
    if (!r.success) return { error: "Rol inválido." };
    actualizacion.rol = r.data;
  }
  if (typeof cambio.activo === "boolean") actualizacion.activo = cambio.activo;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("miembros")
    .update(actualizacion)
    .eq("optica_id", optica.id)
    .eq("usuario_id", usuarioId)
    .select("usuario_id");
  if (error) return { error: mensajeDb(error) };
  if (!data.length) return { error: "No se encontró al miembro." };

  revalidatePath("/panel", "layout");
  return { listo: true };
}
