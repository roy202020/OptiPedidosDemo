import { notFound } from "next/navigation";
import { z } from "zod";
import { ACTIVOS, estaAtrasada, type EstadoInterno } from "@/lib/ordenes/estados";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { hoyISO } from "@/lib/validacion/comun";

export type Laboratorio = {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  /** Días de crédito (0 = contado). */
  dias_credito: number;
  creado_en: string;
};

export type CargaLaboratorio = { pendientes: number; atrasadas: number; listas: number; proximaEntrega: string | null };

const cargaVacia = (): CargaLaboratorio => ({ pendientes: 0, atrasadas: 0, listas: 0, proximaEntrega: null });

/** Laboratorios de la óptica con su carga de trabajo actual (órdenes no entregadas ni anuladas). */
export async function listarLaboratorios({ soloActivos = false } = {}) {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();

  let consulta = supabase.from("laboratorios").select("*").eq("optica_id", optica.id).order("activo", { ascending: false }).order("nombre");
  if (soloActivos) consulta = consulta.eq("activo", true);

  const [labs, ordenes] = await Promise.all([
    consulta,
    supabase
      .from("ordenes")
      .select("laboratorio_id, estado, fecha_entrega_prometida")
      .eq("optica_id", optica.id)
      .in("estado", ACTIVOS),
  ]);
  const error = labs.error ?? ordenes.error;
  if (error) throw new Error(`No se pudieron leer los laboratorios: ${error.message}`);

  const hoy = hoyISO();
  const carga = new Map<string, CargaLaboratorio>();
  for (const o of ordenes.data as { laboratorio_id: string; estado: EstadoInterno; fecha_entrega_prometida: string | null }[]) {
    const c = carga.get(o.laboratorio_id) ?? cargaVacia();
    if (o.estado === "recibida_optica") c.listas++;
    else {
      c.pendientes++;
      if (estaAtrasada(o.estado, o.fecha_entrega_prometida, hoy)) c.atrasadas++;
      if (o.fecha_entrega_prometida && (!c.proximaEntrega || o.fecha_entrega_prometida < c.proximaEntrega)) {
        c.proximaEntrega = o.fecha_entrega_prometida;
      }
    }
    carga.set(o.laboratorio_id, c);
  }

  return (labs.data as Laboratorio[]).map((l) => ({ ...l, carga: carga.get(l.id) ?? cargaVacia() }));
}

export async function obtenerLaboratorio(id: string): Promise<Laboratorio> {
  if (!z.uuid().safeParse(id).success) notFound();
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("laboratorios").select("*").eq("optica_id", optica.id).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el laboratorio: ${error.message}`);
  if (!data) notFound();
  return data as Laboratorio;
}
