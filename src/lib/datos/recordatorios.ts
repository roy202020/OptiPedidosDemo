import type { FilaRecordatorio } from "@/lib/recordatorios";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/** Pacientes por recordar este mes (la base aplica permisos por óptica y sede). */
export async function pacientesPorRecordar(sede: string | null): Promise<FilaRecordatorio[]> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("pacientes_por_recordar", { p_optica: optica.id, p_sede: sede });
  if (error) throw new Error(`No se pudo leer la lista de recordatorios: ${error.message}`);
  return data as FilaRecordatorio[];
}

export type ConfigRecordatorios = {
  nombre: string;
  recordatorio_meses: number;
  plan: "basico" | "profesional";
  tope_mensajes_mes: number;
  recordatorios_automaticos: boolean;
  usados: number;
};

export async function configuracionRecordatorios(): Promise<ConfigRecordatorios> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [o, usados] = await Promise.all([
    supabase.from("opticas").select("nombre, recordatorio_meses, plan, tope_mensajes_mes, recordatorios_automaticos").eq("id", optica.id).single(),
    supabase.rpc("mensajes_del_mes", { p_optica: optica.id }),
  ]);
  const error = o.error ?? usados.error;
  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
  return { ...(o.data as Omit<ConfigRecordatorios, "usados">), usados: Number(usados.data ?? 0) };
}
