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
  recordatorios_automaticos: boolean;
  /** El plan incluye envíos automáticos por la API de WhatsApp (avisos y recordatorios). */
  incluye_whatsapp_api: boolean;
  incluye_recordatorios: boolean;
  /** Tope de mensajes automáticos por sede al mes (plan Profesional: 300). */
  whatsapp_mensual: number;
  /** Mensajes automáticos de este mes en cada sede visible. */
  uso: { sede_id: string; sede: string; usados: number }[];
};

export async function configuracionRecordatorios(sedes: { id: string; nombre: string }[]): Promise<ConfigRecordatorios> {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const [o, ...usados] = await Promise.all([
    supabase
      .from("opticas")
      .select("nombre, recordatorio_meses, plan, whatsapp_mensual, recordatorios_automaticos, planes(incluye_whatsapp_api, incluye_recordatorios)")
      .eq("id", optica.id)
      .single(),
    ...sedes.map((s) => supabase.rpc("mensajes_del_mes_sede", { p_sede: s.id })),
  ]);
  const error = o.error ?? usados.find((u) => u.error)?.error;
  if (error) throw new Error(`No se pudo leer la configuración: ${error.message}`);
  const { planes, ...datos } = o.data as unknown as Omit<ConfigRecordatorios, "uso" | "incluye_whatsapp_api" | "incluye_recordatorios"> & {
    planes: { incluye_whatsapp_api: boolean; incluye_recordatorios: boolean };
  };
  return {
    ...datos,
    ...planes,
    uso: sedes.map((s, i) => ({ sede_id: s.id, sede: s.nombre, usados: Number(usados[i].data ?? 0) })),
  };
}
