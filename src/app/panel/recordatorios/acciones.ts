"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/estado-formulario";
import { mensajeDb } from "@/lib/errores-db";
import { tienePermiso } from "@/lib/permisos";
import { obtenerSuscripcion } from "@/lib/datos/suscripcion";
import { exigirOptica, exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/** Registra el envío manual (wa.me): cierra el ciclo. La base exige consentimiento y acceso a la sede. */
export async function registrarEnvioManual(pacienteId: string): Promise<{ error?: string }> {
  await exigirOptica();
  if (!z.uuid().safeParse(pacienteId).success) return { error: "Paciente inválido." };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_recordatorio_manual", { p_paciente: pacienteId });
  if (error) return { error: mensajeDb(error) };
  revalidatePath("/panel/recordatorios");
  return {};
}

const esquemaConfig = z.object({
  recordatorio_meses: z.preprocess((v) => Number(v), z.number("Escribe los meses").int("Solo meses enteros").min(1, "Mínimo 1 mes").max(36, "Máximo 36 meses")),
  recordatorios_automaticos: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/** Intervalo (propietario y administrador) y envío automático (propietario, plan Profesional). */
export async function guardarConfiguracion(_previo: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const optica = await exigirPermiso("configurarRecordatorios");
  const valores = Object.fromEntries([...datos.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const r = esquemaConfig.safeParse(valores);
  if (!r.success) return { campos: z.flattenError(r.error).fieldErrors, valores };

  const cambios: { recordatorio_meses: number; recordatorios_automaticos?: boolean } = { recordatorio_meses: r.data.recordatorio_meses };
  // Solo el propietario toca el interruptor; la base lo vuelve a comprobar junto con el plan.
  if (tienePermiso(optica.rol, "activarRecordatoriosAutomaticos")) {
    // La base también lo rechaza (f_optica_recordatorios); aquí se avisa antes.
    if (r.data.recordatorios_automaticos && !(await obtenerSuscripcion()).incluye.recordatorios) {
      return { error: "El envío automático de recordatorios requiere el plan Profesional.", valores };
    }
    cambios.recordatorios_automaticos = r.data.recordatorios_automaticos;
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("opticas").update(cambios).eq("id", optica.id);
  if (error) return { error: mensajeDb(error), valores };
  revalidatePath("/panel/recordatorios");
  return { listo: true, aviso: "Configuración guardada.", valores };
}
