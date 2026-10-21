"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { archivoDe, subirFoto } from "@/lib/datos/archivos-laboratorio";
import { mensajeDb } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { exigirPermiso, sedeParaRegistrar } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { valoresDe } from "@/lib/validacion/comun";
import { esquemaAnulacion, esquemaEgreso } from "@/lib/validacion/cuentas-laboratorio";

/** Registra un egreso de la sede elegida. Propietario o administrador (la base lo vuelve a comprobar). */
export async function registrarEgreso(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("gestionarCobros");
  const valores = valoresDe(datos);
  const { sede, error: errorSede } = await sedeParaRegistrar();
  if (!sede) return { error: errorSede, valores };
  const r = esquemaEgreso.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  let ruta: string | null = null;
  const archivo = archivoDe(datos);
  if (archivo) {
    const foto = await subirFoto(archivo, { opticaId: optica.id, sedeId: sede.id, tipo: "egresos" });
    if (foto.error) return { error: foto.error, valores };
    ruta = foto.ruta ?? null;
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_egreso", {
    p_sede: sede.id,
    p_fecha: r.data.fecha,
    p_monto: r.data.monto,
    p_categoria: r.data.categoria,
    p_concepto: r.data.concepto,
    p_medio: r.data.medio,
    p_numero_comprobante: r.data.numero_comprobante,
    p_foto: ruta,
  });
  if (error) return { error: mensajeDb(error), valores };

  revalidatePath("/panel", "layout");
  return { listo: true, aviso: "Egreso registrado." };
}

export async function anularEgreso(egresoId: string, _previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  await exigirPermiso("gestionarCobros");
  if (!z.uuid().safeParse(egresoId).success) return { error: "Egreso inválido." };
  const r = esquemaAnulacion.safeParse(valoresDe(datos));
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_egreso", { p_egreso: egresoId, p_motivo: r.data.motivo });
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel", "layout");
  return { listo: true };
}
