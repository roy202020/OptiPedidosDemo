import type { OrdenResumen } from "@/lib/datos/ordenes";
import { ACTIVOS, PENDIENTES_DE_LLEGAR } from "@/lib/ordenes/estados";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyISO } from "@/lib/validacion/comun";

/** Primer día del mes actual en formato AAAA-MM-DD (UTC, como current_date en la base). */
export const inicioDeMes = (hoy = new Date()) => `${hoy.toISOString().slice(0, 7)}-01`;

const COLUMNAS =
  "id, numero, estado, prioridad, tipo_trabajo, fecha_entrega_prometida, creado_en, paciente:pacientes!inner(id, nombres, apellidos, telefono), laboratorio:laboratorios(id, nombre)";

/** Indicadores operativos del panel, calculados con datos reales de la óptica actual. */
export async function resumenPanel() {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();
  const contar = { count: "exact" as const, head: true };
  const ordenes = () => supabase.from("ordenes").select("id", contar).eq("optica_id", optica.id);
  const lista = () => supabase.from("ordenes").select(COLUMNAS).eq("optica_id", optica.id);

  const [activas, atrasadas, listas, pacientes, recientes, seguimiento, paraEntregar] = await Promise.all([
    ordenes().in("estado", ACTIVOS),
    ordenes().in("estado", PENDIENTES_DE_LLEGAR).lt("fecha_entrega_prometida", hoy),
    ordenes().eq("estado", "recibida_optica"),
    supabase.from("pacientes").select("id", contar).eq("optica_id", optica.id).is("archivado_en", null),
    lista().order("creado_en", { ascending: false }).limit(6),
    // Trabajos en el laboratorio, los de fecha prometida más cercana (o vencida) primero.
    lista().in("estado", ["enviada", "recibida_lab", "en_proceso", "lista"]).order("fecha_entrega_prometida").limit(6),
    lista().eq("estado", "recibida_optica").order("actualizado_en").limit(6),
  ]);

  const error = [activas, atrasadas, listas, pacientes, recientes, seguimiento, paraEntregar].find((r) => r.error)?.error;
  if (error) throw new Error(`No se pudo leer el resumen: ${error.message}`);

  return {
    ordenesActivas: activas.count ?? 0,
    atrasadas: atrasadas.count ?? 0,
    listas: listas.count ?? 0,
    pacientesActivos: pacientes.count ?? 0,
    recientes: recientes.data as unknown as OrdenResumen[],
    seguimiento: seguimiento.data as unknown as OrdenResumen[],
    paraEntregar: paraEntregar.data as unknown as OrdenResumen[],
  };
}
