import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoSuscripcion, Plan } from "@/lib/suscripcion";

/*
 * Datos del panel de la plataforma. Solo suscripción: la base no deja al superadmin leer
 * pacientes, recetas ni pedidos (RLS por membresía) y superadmin_* exigen el rol.
 */

export type OpticaPlataforma = {
  id: string;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  plan: Plan;
  estado: EstadoSuscripcion;
  vence_el: string | null;
  dias_para_vencer: number | null;
  max_usuarios: number | null;
  usuarios_activos: number;
  max_sedes: number | null;
  sedes_activas: number;
  whatsapp_mensual: number;
  propietario: string | null;
  creada_en: string;
  ultimo_pago: string | null;
  ultimo_monto: number | null;
};

export const listarOpticasPlataforma = cache(async (): Promise<OpticaPlataforma[]> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("superadmin_opticas");
  if (error) throw new Error(`No se pudieron leer las ópticas: ${error.message}`);
  return data as OpticaPlataforma[];
});

export type EventoSuscripcion = {
  id: number;
  tipo: "alta" | "cambio_plan" | "vencimiento" | "pago";
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  nota: string | null;
  creado_en: string;
};

/** Historial de cambios de plan, vencimientos y pagos (RLS: superadmin o propietario). */
export async function listarEventosSuscripcion(opticaId: string): Promise<EventoSuscripcion[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("suscripcion_eventos")
    .select("id, tipo, antes, despues, nota, creado_en")
    .eq("optica_id", opticaId)
    .order("creado_en", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return data as EventoSuscripcion[];
}
