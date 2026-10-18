"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { exigirSuperadmin } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaCambioPlan, esquemaExtension, esquemaNuevaOptica, esquemaPagoSuscripcion } from "@/lib/validacion/suscripcion";

/*
 * Acciones de la plataforma. La autorización real está en las funciones superadmin_* de la base
 * (exigir_superadmin); aquí solo se valida el formulario y se llama con la sesión del usuario.
 */

const idValido = (id: string) => z.uuid().safeParse(id).success;

export async function crearOptica(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirSuperadmin();
  const valores = valoresDe(datos);
  const r = esquemaNuevaOptica.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("superadmin_crear_optica", {
    p_nombre: r.data.nombre,
    p_email_propietario: r.data.email,
    p_plan: r.data.plan,
    p_vence_el: r.data.vence_el,
    p_max_sedes: r.data.max_sedes,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/superadmin");
  redirect(`/superadmin/opticas/${data}`);
}

export async function cambiarPlan(opticaId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirSuperadmin();
  if (!idValido(opticaId)) return { error: "Óptica inválida." };
  const valores = valoresDe(datos);
  const r = esquemaCambioPlan.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("superadmin_cambiar_plan", {
    p_optica: opticaId,
    p_plan: r.data.plan,
    p_max_usuarios: r.data.max_usuarios,
    p_max_sedes: r.data.max_sedes,
    p_whatsapp_mensual: r.data.whatsapp_mensual,
    p_nota: r.data.nota,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/superadmin", "layout");
  return { listo: true, aviso: "Plan actualizado." };
}

export async function extenderVencimiento(opticaId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirSuperadmin();
  if (!idValido(opticaId)) return { error: "Óptica inválida." };
  const valores = valoresDe(datos);
  const r = esquemaExtension.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("superadmin_extender", { p_optica: opticaId, p_vence_el: r.data.vence_el, p_nota: r.data.nota });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/superadmin", "layout");
  return { listo: true, aviso: "Vencimiento actualizado." };
}

export async function registrarPagoSuscripcion(opticaId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirSuperadmin();
  if (!idValido(opticaId)) return { error: "Óptica inválida." };
  const valores = valoresDe(datos);
  const r = esquemaPagoSuscripcion.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("superadmin_registrar_pago", {
    p_optica: opticaId,
    p_monto: r.data.monto,
    p_fecha: r.data.fecha,
    p_medio: r.data.medio,
    p_periodo_desde: r.data.periodo_desde,
    p_periodo_hasta: r.data.periodo_hasta,
    p_nota: r.data.nota,
    p_extender: r.data.extender,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/superadmin", "layout");
  return { listo: true, aviso: "Pago registrado." };
}
