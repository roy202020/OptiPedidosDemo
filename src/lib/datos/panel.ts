import type { OrdenResumen } from "@/lib/datos/ordenes";
import { ACTIVOS, PENDIENTES_DE_LLEGAR } from "@/lib/ordenes/estados";
import { exigirOptica, sedeFiltro } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyISO } from "@/lib/validacion/comun";

/** Primer día del mes actual en formato AAAA-MM-DD (UTC, como current_date en la base). */
export const inicioDeMes = (hoy = new Date()) => `${hoy.toISOString().slice(0, 7)}-01`;

const COLUMNAS =
  "id, numero, estado, prioridad, tipo_trabajo, fecha_entrega_prometida, creado_en, paciente:pacientes!inner(id, nombres, apellidos, telefono), laboratorio:laboratorios(id, nombre), sede:sedes(id, nombre)";

/** Indicadores operativos del panel: pedidos de la sede elegida (o de todas las del usuario); pacientes de toda la óptica. */
export async function resumenPanel() {
  const [optica, sede] = await Promise.all([exigirOptica(), sedeFiltro()]);
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();
  const contar = { count: "exact" as const, head: true };
  const ordenes = () => {
    const q = supabase.from("ordenes").select("id", contar).eq("optica_id", optica.id);
    return sede ? q.eq("sede_id", sede) : q;
  };
  const lista = () => {
    const q = supabase.from("ordenes").select(COLUMNAS).eq("optica_id", optica.id);
    return sede ? q.eq("sede_id", sede) : q;
  };

  const EN_LABORATORIO = ["enviada", "recibida_lab", "en_proceso", "lista"] as const;
  const [activas, atrasadas, listas, enLaboratorio, pacientes, recientes, seguimiento, paraEntregar] = await Promise.all([
    ordenes().in("estado", ACTIVOS),
    ordenes().in("estado", PENDIENTES_DE_LLEGAR).lt("fecha_entrega_prometida", hoy),
    ordenes().eq("estado", "recibida_optica"),
    ordenes().in("estado", EN_LABORATORIO),
    supabase.from("pacientes").select("id", contar).eq("optica_id", optica.id).is("archivado_en", null),
    lista().order("creado_en", { ascending: false }).limit(8),
    // Trabajos en el laboratorio, los de fecha prometida más cercana (o vencida) primero.
    lista().in("estado", EN_LABORATORIO).order("fecha_entrega_prometida").limit(6),
    lista().eq("estado", "recibida_optica").order("actualizado_en").limit(6),
  ]);

  const error = [activas, atrasadas, listas, enLaboratorio, pacientes, recientes, seguimiento, paraEntregar].find((r) => r.error)?.error;
  if (error) throw new Error(`No se pudo leer el resumen: ${error.message}`);

  return {
    ordenesActivas: activas.count ?? 0,
    atrasadas: atrasadas.count ?? 0,
    listas: listas.count ?? 0,
    enLaboratorio: enLaboratorio.count ?? 0,
    pacientesActivos: pacientes.count ?? 0,
    recientes: recientes.data as unknown as OrdenResumen[],
    seguimiento: seguimiento.data as unknown as OrdenResumen[],
    paraEntregar: paraEntregar.data as unknown as OrdenResumen[],
  };
}
