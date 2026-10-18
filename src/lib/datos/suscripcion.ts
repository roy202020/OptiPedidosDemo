import { cache } from "react";
import { exigirOptica } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { estadoSuscripcion, type EstadoSuscripcion, type FuncionPlan, type Plan } from "@/lib/suscripcion";
import { hoyLimaISO } from "@/lib/validacion/comun";

export type Suscripcion = {
  plan: Plan;
  nombrePlan: string;
  estado: EstadoSuscripcion;
  vence_el: string | null;
  max_usuarios: number | null;
  max_sedes: number | null;
  whatsapp_mensual: number;
  incluye: Record<FuncionPlan, boolean>;
  /** Suspendida: solo lectura (la base rechaza cualquier registro). */
  soloLectura: boolean;
};

/** Plan, límites y estado de la óptica actual. */
export const obtenerSuscripcion = cache(async (): Promise<Suscripcion> => {
  const optica = await exigirOptica();
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("opticas")
    .select("plan, vence_el, max_usuarios, max_sedes, whatsapp_mensual, planes(nombre, incluye_metas, incluye_whatsapp_api, incluye_recordatorios)")
    .eq("id", optica.id)
    .single();
  if (error) throw new Error(`No se pudo leer la suscripción: ${error.message}`);

  const p = data.planes as unknown as {
    nombre: string;
    incluye_metas: boolean;
    incluye_whatsapp_api: boolean;
    incluye_recordatorios: boolean;
  };
  const estado = estadoSuscripcion(data.vence_el, hoyLimaISO());
  return {
    plan: data.plan as Plan,
    nombrePlan: p.nombre,
    estado,
    vence_el: data.vence_el,
    max_usuarios: data.max_usuarios,
    max_sedes: data.max_sedes,
    whatsapp_mensual: data.whatsapp_mensual,
    incluye: { metas: p.incluye_metas, whatsapp_api: p.incluye_whatsapp_api, recordatorios: p.incluye_recordatorios },
    soloLectura: estado === "suspendida",
  };
});

export type PagoSuscripcion = {
  id: string;
  monto: number;
  fecha: string;
  medio: "yape" | "transferencia";
  periodo_desde: string;
  periodo_hasta: string;
  nota: string | null;
};

/** Pagos de la suscripción de una óptica (RLS: superadmin o propietario). */
export async function listarPagosSuscripcion(opticaId: string): Promise<PagoSuscripcion[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("suscripcion_pagos")
    .select("id, monto, fecha, medio, periodo_desde, periodo_hasta, nota")
    .eq("optica_id", opticaId)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
  return data as PagoSuscripcion[];
}
