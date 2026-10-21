"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajeDb } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { exigirOptica, exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaAperturaCaja, esquemaCierreCaja } from "@/lib/validacion/cuentas-laboratorio";

/** Abre la caja de la sede elegida (cualquier miembro de la sede; la base lo vuelve a comprobar). */
export async function abrirCaja(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirOptica();
  const valores = valoresDe(datos);
  const { sede, error: errorSede } = await sedeParaRegistrar();
  if (!sede) return { error: errorSede, valores };
  const r = esquemaAperturaCaja.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("abrir_caja", { p_sede: sede.id, p_monto_inicial: r.data.monto_inicial });
  if (error) return { error: mensajeDb(error, { cajas_una_abierta: "Ya hay una caja abierta en esta sede." }), valores };
  revalidatePath("/panel", "layout");
  return { listo: true, aviso: "Caja abierta." };
}

export async function cerrarCaja(cajaId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirPermiso("gestionarCobros");
  if (!z.uuid().safeParse(cajaId).success) return { error: "Caja inválida." };
  const valores = valoresDe(datos);
  const r = esquemaCierreCaja.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cerrar_caja", {
    p_caja: cajaId,
    p_monto_contado: r.data.monto_contado,
    p_observaciones: r.data.observaciones,
  });
  if (error) return { error: mensajeDb(error), valores };
  revalidatePath("/panel/caja");
  return { listo: true };
}
